# Intégration Instagram

Ce document décrit le support d'Instagram construit par-dessus l'intégration Facebook : la publication de Reels/Stories, et les onglets Facebook/Instagram avec la gestion et les insights par compte. Les chemins de fichiers ci-dessous font référence à la structure de l'application (`server/src/...`, `web/src/...`).

## Aperçu

Instagram est modélisé comme une **cible de publication secondaire rattachée à une Page Facebook**. Chaque Page Facebook connectée peut avoir un compte Instagram Business lié (`instagram_business_account`) ; lorsqu'il est présent, son id est mis en cache sur la page et débloque les fonctionnalités Instagram.

Deux fonctionnalités ont été ajoutées :

1. **Publication** de Reels et de Stories (vidéo 9:16) sur Instagram.
2. **Gestion & insights** : un onglet Facebook/Instagram à la fois sur les écrans de *Gestion de la page* et d'*Insights*, affichant les médias IG, les commentaires et les métriques du compte.

## Modèle de publication

Instagram n'a **aucune API de planification native**. Pour conserver la parité avec la planification native de Facebook, chaque élément Instagram est un **job local séparé** : une ligne `scheduled_post` avec `platform = 'instagram'`, liée à son jumeau Facebook (`linked_post_id`) et partageant la même heure planifiée. Le `publishScheduler` interne le publie à l'heure prévue (le serveur doit être en cours d'exécution).

- Seuls les **Reels et Stories avec une vidéo 9:16 rendue** sont éligibles.
- La légende reflète la légende visuelle de l'élément Facebook (les Stories l'ignorent).
- La création du job est **idempotente** (`idempotency_key = ig:<fbPostId>`), donc basculer "Publier également sur Instagram" deux fois ne crée pas de doublons.

### Flux de téléversement reprenable (Instagram Graph API)

La publication d'une vidéo utilise le protocole de téléversement reprenable d'Instagram (resumable upload), validé en direct :

1. `POST /<igUserId>/media?upload_type=resumable&media_type=REELS|STORIES&caption=<enc>`
   → `{ id: containerId }`
2. `POST https://rupload.facebook.com/ig-api-upload/<ver>/<containerId>` avec
   les en-têtes `Authorization: OAuth <pageToken>`, `offset: "0"`,
   `file_size: "<bytes>"`, `Content-Type: application/octet-stream`, body = bytes de la vidéo
   → `{ success: true }`
3. Interroger `GET /<containerId>?fields=status_code` jusqu'à `FINISHED`
   (`ERROR`/`EXPIRED` → échec)
4. `POST /<igUserId>/media_publish?creation_id=<containerId>` → `{ id: igMediaId }`

Le jeton est toujours le **jeton de Page** (stocké chiffré dans `secrets.enc` sous la clé
`fb.page.<pageId>`), qui doit porter les scopes Instagram. Il n'est jamais consigné dans les logs.

## Onglets de gestion & insights

À la fois `web/src/screens/GestionePaginaScreen.tsx` (gestion de la page) et
`web/src/screens/InsightsScreen.tsx` (insights) ont gagné un onglet de plateforme
**Facebook / Instagram** de premier niveau. L'onglet Instagram est affiché **uniquement lorsque la
page sélectionnée possède un compte Instagram lié** (`igUserId != null`).

Le panneau Instagram (`web/src/components/InstagramPanel.tsx`) comporte trois
sous-onglets :

- **Posts & commentaires** — médias IG publiés (Reels/Posts/Stories) avec le nombre de likes et de
  commentaires ; développez un média pour lire ses commentaires et y **répondre / masquer /
  supprimer** (les réponses sont imbriquées).
- **Planifié** — jobs Instagram en attente (les lignes `scheduled_post` avec `platform = 'instagram'`
  liées aux éléments Facebook planifiés).
- **Compte** — informations du profil (nom d'utilisateur, bio, nombre d'abonnés/abonnements/médias,
  photo de profil) et insights du compte.

Sur l'écran des Insights, l'onglet Instagram fait remonter les totaux du compte IG ainsi que
les insights du compte par métrique.

## Le profil du compte est en lecture seule

L'API Graph d'Instagram expose le nœud IG User en **lecture seule** : `biography`,
`name`, `username`, `website` et `profile_picture_url` peuvent être **lus** mais il n'y a
**aucun endpoint de mise à jour**. Contrairement aux Pages Facebook (modifiables via
`pages_manage_metadata`), les champs du profil Instagram ne peuvent être modifiés que depuis
l'application Instagram. L'onglet Compte est donc purement informatif par conception.

## Insights du compte (dégradation gracieuse)

Les insights du compte sont récupérés **par métrique**, car les métriques d'Instagram sont
incohérentes d'une version à l'autre :

- Chaque métrique est d'abord essayée avec `metric_type=total_value`, puis se rabat sur la
  forme historique de séries temporelles (time-series) ; si les deux échouent, la métrique est
  rapportée comme `null` avec une erreur, **sans** faire échouer les autres métriques.
- Métriques par défaut : `reach`, `profile_views`, `follower_count`.
- Notes (API v21) : `reach` prend en charge à la fois `total_value` et les séries temporelles ;
  la série temporelle de `profile_views` est dépréciée (seul `total_value` est pertinent) ;
  `follower_count` n'est **pas** une métrique `total_value` (le fallback en série temporelle est
  la voie correcte) et est omise par Instagram pour les comptes ayant < 100
  abonnés. `impressions` est déprécié.

La période dans l'UI correspond aux périodes des insights de compte Instagram : `month → days_28`,
`week → week`, sinon `day`.

## Résolution et mise en cache de l'id du compte Instagram

`igUserId` est résolu via `GET /<pageId>?fields=instagram_business_account{id}`
et mis en cache sur la ligne de la page (`facebook_page.ig_user_id`). Il est peuplé :

- **au moment de la connexion** (best-effort) lors de la sauvegarde d'une page, et
- **de manière paresseuse** (lazily) sur `GET /pages` pour toute page où il est encore null (les échecs sont
  ignorés afin que la liste des pages ne se casse jamais).

Le helper partagé `resolveIgContext(pageId)` renvoie le jeton de page + `igUserId`
pour les routes IG, en résolvant et en mettant en cache l'id à la demande, et renvoie une erreur
503 explicite lorsque la page n'a pas de compte Instagram lié.

## Endpoints REST ajoutés

Tous les endpoints reflètent leurs homologues Facebook et se trouvent sous la page :

| Method & path | Objectif |
| --- | --- |
| `GET /posts/:id/instagram` *(POST)* | Créer le job IG jumeau d'un Reel/Story Facebook |
| `DELETE /posts/:id/instagram` | Supprimer le job IG jumeau (si non encore publié) |
| `GET /pages/:id/ig/account` | Infos du profil du compte IG Business |
| `GET /pages/:id/ig/insights?period=day` | Insights du compte IG (dégradation par métrique) |
| `GET /pages/:id/ig/media?limit=25` | Médias IG publiés |
| `GET /pages/:id/ig/media/:mediaId/comments` | Commentaires (avec réponses imbriquées) d'un média |
| `POST /pages/:id/ig/comments/:commentId/reply` | Répondre à un commentaire |
| `POST /pages/:id/ig/comments/:commentId/hide` | Masquer/afficher un commentaire (`hide=true|false`) |
| `DELETE /pages/:id/ig/comments/:commentId` | Supprimer un commentaire |

`GET /pages` expose `igUserId` par page (utilisé par l'interface utilisateur pour décider
s'il faut afficher l'onglet Instagram).

## Configuration de l'application Meta

Pour utiliser ces fonctionnalités, l'application Meta nécessite le produit **"Instagram API with Facebook
Login"** et les permissions `instagram_basic` + `instagram_content_publish`. Chaque compte Instagram Business
doit être assigné au system user, et le jeton de Page doit être régénéré avec les scopes Instagram. La
correspondance 1 à 1 est **une Page Facebook ↔ un compte Instagram Business**.
