# Manuel d'utilisation de BookSocial Studio

## Aperçu

BookSocial Studio transforme un livre en contenu social anti-divulgâchis pour les pages Facebook et les comptes professionnels Instagram associés. Il vous aide à importer et analyser des manuscrits, générer des brouillons et des visuels, programmer des publications, publier du contenu, gérer les commentaires et consulter les statistiques.

L'application est locale avant tout (local-first). Vos données résident dans une base de données SQLite locale et des fichiers locaux. Les secrets tels que les jetons Facebook et les clés API de l'IA sont stockés de manière chiffrée dans `secrets.enc` à l'intérieur du dossier de données, et non dans la base de données.

L'interface est bilingue, italien et anglais. Les principaux éléments de navigation sont : **Books**, **Planner**, **Scheduled**, **Insights**, **Connection**, **Page management** et **Settings**.

Pour l'installation et la première configuration, voir [SETUP.md](./SETUP.md). Pour les détails sur les fournisseurs d'IA, voir [PROVIDERS.md](./PROVIDERS.md). Pour la configuration et le comportement spécifiques à Instagram, voir [INSTAGRAM.md](./INSTAGRAM.md). Pour les notes sur la machine locale testée et la génération d'images, voir [TESTED-ON.md](./TESTED-ON.md).

## Concepts fondamentaux

| Concept | Signification |
| --- | --- |
| Livres | Manuscrits Markdown importés. L'application analyse chaque livre pour en tirer un profil, des personnages, des chapitres et une bible visuelle. |
| Pages | Pages Facebook connectées. Une Page peut également avoir un compte professionnel Instagram associé. |
| Brouillons | Contenu social généré qui n'a pas encore été programmé ou publié. |
| Publications programmées | Contenu en file d'attente pour une publication future. Certains éléments sont programmés de manière native sur Facebook, tandis que d'autres sont gérés par le planificateur interne de l'application. |
| Fournisseur de texte | Le fournisseur d'IA utilisé pour la rédaction de publications, l'analyse de livres, les profils, les personnages, les hashtags et d'autres tâches textuelles. |
| Fournisseur d'images | Le fournisseur ou moteur local utilisé pour générer des images de scènes et des visuels. |
| Bible visuelle | Un ensemble de références visuelles structurées pour le livre, incluant l'apparence des personnages, les fiches de scènes, les tenues, les accessoires, les détails du monde, les personnages mineurs et la présence des personnages par chapitre. |

### Modèle de publication

| Type de contenu | Comment il est programmé | Ce qui doit être en cours d'exécution au moment de la publication |
| --- | --- | --- |
| Publications natives Facebook | Programmées sur Facebook | Facebook les publie même si BookSocial Studio est éteint. |
| Reels et Stories Facebook | Planificateur interne | Le serveur BookSocial Studio doit être en cours d'exécution. |
| Éléments Instagram | Planificateur interne | Le serveur BookSocial Studio doit être en cours d'exécution. |

Instagram n'a pas de programmation native dans cette application. Chaque élément Instagram programmé est une tâche locale distincte liée à son jumeau Facebook.

## Table des matières

- [Livres](#livres)
- [Analyse du livre et bible visuelle](#analyse-du-livre-et-bible-visuelle)
- [Détail du livre](#détail-du-livre)
- [Connexion](#connexion)
- [Gestion de la page](#gestion-de-la-page)
- [Planificateur](#planificateur)
- [Programmé](#programmé)
- [Statistiques](#statistiques)
- [Paramètres : IA](#paramètres--ia)
- [Configuration de l'API Graph : Meta](#configuration-de-lapi-graph--meta)
- [Flux de travail courants](#flux-de-travail-courants)
- [Notes importantes](#notes-importantes)

## Livres

L'écran **Livres** (Books) est votre bibliothèque. Il liste les livres importés sous forme de cartes et vous offre le point d'entrée pour importer, ouvrir, essayer un échantillon ou supprimer des livres.

### Ce qu'il fait

Chaque carte de livre affiche le titre du livre, l'auteur, un badge de langue et le nombre de hashtags de base. Si la bibliothèque est vide, l'écran propose deux points de départ : importer un livre ou essayer le livre d'exemple inclus, **The Keeper of the Tides**.

### Ce que vous pouvez faire

| Action | Comment ça marche |
| --- | --- |
| Importer un livre | Importez un fichier Markdown avec l'extension `.md`. |
| Définir des métadonnées facultatives | Lors de l'importation, vous pouvez définir l'auteur et la langue. |
| Ouvrir un livre | Ouvrez la carte du livre pour gérer le profil, les chapitres, les personnages, les liens, les images et la musique. |
| Essayer le livre d'exemple | Importez le livre d'exemple inclus, **The Keeper of the Tides**. |
| Supprimer un livre | Retirez un livre de la bibliothèque. |

### Notes

- Seuls les fichiers Markdown avec l'extension `.md` peuvent être importés.
- Le livre apparaît immédiatement après l'importation.
- L'analyse par l'IA s'exécute en arrière-plan après l'importation.
- L'analyse nécessite un fournisseur de texte configuré. Si aucun fournisseur de texte n'est configuré, l'analyse échoue avec une erreur claire.
- La progression est interrogée par l'application et une notification (toast) confirme son achèvement.

## Analyse du livre et bible visuelle

Une fois qu'un livre est importé, BookSocial Studio l'analyse et construit une structure anti-divulgâchis utilisée pour la génération de publications et la cohérence des images.

### Ce qu'il fait

L'analyse extrait les chapitres, crée un profil généré par l'IA avec un synopsis, des genres et un ton, et identifie les personnages. La bible visuelle est un pipeline en arrière-plan, reprenable et au mieux (best-effort). Si une étape échoue, les autres étapes peuvent toujours s'exécuter.

Les étapes canoniques de la bible visuelle sont :

| Ordre | Étape | Objectif |
| --- | --- | --- |
| 1 | Apparence des personnages | Crée une description physique stable par personnage pour des images cohérentes. |
| 2 | Fiches de scènes par chapitre | Crée le lieu, l'environnement, les objets principaux et secondaires, les personnages présents et les règles de physique ou de réalisme pour chaque chapitre. Celles-ci pilotent les requêtes (prompts) d'images. |
| 3 | Tenues | Crée des vêtements canoniques par personnage, avec des variantes selon les décors récurrents. |
| 4 | Accessoires et univers | Extrait les véhicules et objets récurrents, ainsi que le côté de conduite (gauche ou droite), déduit du livre. |
| 5 | Personnages mineurs | Scanne les figures incidentes par chapitre et leur attribue des apparences fixes. Cette étape est lente. |
| 6 | Présence des personnages | Enregistre dans quels chapitres chaque personnage apparaît. Ceci est utilisé pour filtrer la génération d'images par personnage. |

### Ce que vous pouvez faire

| Action | Où | Résultat |
| --- | --- | --- |
| Suivre la progression de l'importation | Fenêtre modale d'importation | Affiche les trois étapes d'importation : Lecture, Analyse, Sauvegarde. |
| Examiner l'état de la bible visuelle | Panneau de la bible visuelle de l'écran du livre | Affiche chaque étape comme en attente, en cours, terminée ou échouée, avec un compteur terminé/total. |
| Construire toute la bible visuelle | Panneau de la bible visuelle | Exécute toutes les étapes de la bible visuelle. |
| Exécuter une seule étape | Panneau de la bible visuelle | N'exécute que l'étape sélectionnée de la bible visuelle. |

### Notes

- La bible visuelle est construite en arrière-plan.
- Le processus est reprenable et s'exécute au mieux (best-effort).
- Un échec dans une étape de la bible visuelle ne bloque pas les autres.
- L'étape de présence des personnages est utilisée ultérieurement lors du choix des personnages pour la génération d'images.

## Détail du livre

L'écran de détail du livre est l'endroit où vous gérez les données opérationnelles d'un livre. Il comporte six onglets : **Profil** (Profile), **Chapitres** (Chapters), **Personnages** (Characters), **Liens** (Links), **Images**, et **Musique** (Music).

### Ce qu'il fait

Cet écran vous permet de modifier les données du livre qui contrôlent la génération de contenu : titre, auteur, hashtags, directives visuelles, Pages associées, chapitres, personnages, liens du livre, images générées et données du livre liées à la musique.

### Ce que vous pouvez faire

| Onglet | Actions |
| --- | --- |
| Profil | Renommer le titre et l'auteur ; modifier les hashtags de base ; configurer les directives visuelles ; modifier les accessoires et l'univers ; passer en revue les personnages mineurs ; associer le livre aux Pages connectées. |
| Chapitres | Inclure ou exclure des chapitres ; modifier les fiches de scènes ; régénérer les fiches de scènes ; enregistrer les modifications des fiches de scènes. |
| Personnages | Ajouter, modifier et supprimer des personnages ; générer des apparences ; générer des tenues ; modifier la présence dans les chapitres. |
| Liens | Ajouter, modifier et supprimer des liens de livres. |
| Images | Générer des images de scènes ; voir les images dans une visionneuse (lightbox) ; régénérer des images ; uploader des images manuellement ; régénérer des images sélectionnées par lots. |
| Musique | Accéder à l'onglet Musique du livre. |

### Onglet Profil

L'onglet **Profil** contrôle les paramètres au niveau du livre qui s'appliquent à l'ensemble du contenu généré.

| Champ ou zone | Signification | Modifiable |
| --- | --- | --- |
| Titre | Titre du livre. | Oui |
| Auteur | Auteur du livre. | Oui |
| Profil généré par l'IA | Synopsis, genres et ton. | Non |
| Badge anti-divulgâchis | Indique que le comportement anti-divulgâchis est actif. | Non |
| Hashtags de base | Hashtags appliqués à chaque publication pour le livre. | Oui |
| Domaines visuels | Boutons de directives visuelles prédéfinies par livre. | Oui |
| Directions artistiques en texte libre | Instructions visuelles supplémentaires, traduites automatiquement en anglais pour les requêtes d'images. | Oui |
| Accessoires et univers | Pays, côté de conduite et liste d'objets récurrents. | Oui |
| Personnages mineurs | Liste des figures incidentes de la bible visuelle. | Oui |
| Pages associées | Pages connectées liées à ce livre. | Oui |

La génération cible toujours une Page associée, alors liez le livre aux Pages que vous souhaitez utiliser pour la génération de contenu.

### Onglet Chapitres

L'onglet **Chapitres** contrôle la disponibilité au niveau du chapitre et les données des requêtes d'images.

| Action | Résultat |
| --- | --- |
| Inclure un chapitre | Permet d'utiliser le chapitre dans les lots d'images. |
| Exclure un chapitre | Ignore le chapitre dans les lots d'images. |
| Modifier une fiche de scène | Modifie le lieu, l'environnement, les objets, les personnages, ou les règles de physique. |
| Régénérer une fiche de scène | Recrée la fiche de scène du chapitre. |
| Enregistrer une fiche de scène | Stocke vos modifications. |

### Onglet Personnages

L'onglet **Personnages** contrôle les informations sur la distribution et la cohérence visuelle.

| Champ ou action | Objectif |
| --- | --- |
| Nom | Nom du personnage. |
| Rôle | Rôle dans le livre. |
| Métier | Métier du personnage. |
| Personnage | Description du personnage. |
| Apparence physique | Apparence stable utilisée pour la cohérence des images. |
| Notes | Notes supplémentaires sur le personnage. |
| Tenues par contexte | Définitions de vêtements pour des décors récurrents. |
| Générer les apparences | Crée ou rafraîchit les descriptions de l'apparence des personnages. |
| Générer les tenues | Crée ou rafraîchit les définitions de tenues. |
| Présence | Liste modifiable des chapitres où le personnage apparaît ; activez/désactivez par chapitre. Détermine quels personnages sont sélectionnables lors de la génération d'images. |

### Onglet Liens

L'onglet **Liens** stocke les liens du livre qui peuvent être utilisés par canal et par politique.

| Champ | Signification |
| --- | --- |
| Type de canal | Le canal auquel le lien est destiné. |
| Politique d'utilisation | Comment le lien doit être utilisé. |
| URL | La cible du lien. |
| Libellé | Libellé du lien lisible par l'homme. |
| Indicateur par défaut | Marque un lien comme étant celui par défaut. |

### Onglet Images

L'onglet **Images** gère les images de scènes générées et importées.

| Action | Détails |
| --- | --- |
| Générer des images de scènes | Choisissez le nombre par chapitre, le format (ratio), les chapitres, les personnages facultatifs et les paramètres facultatifs de flashback. |
| Laisser les chapitres vides | Utilise une répartition automatique anti-divulgâchis. |
| Mettre en avant des personnages | Choisissez facultativement les personnages à inclure. |
| Utiliser le flashback | Demandez facultativement un âge plus jeune et des tenues d'époque pour ce lot. |
| Suivre la génération | Observez le compteur en direct et le chronomètre par image. |
| Mettre d'autres lots en file d'attente | Ajoutez des lots de génération supplémentaires. |
| Annuler la génération | Arrêtez un lot en cours ou en file d'attente. |
| Ouvrir la visionneuse | Affichez l'image en taille réelle et ses métadonnées. |
| Régénérer | Régénérez l'image sélectionnée. |
| Régénérer avec des modifications | Ajoutez des instructions supplémentaires ou des paramètres de flashback. |
| Régénérer depuis le chapitre | Choisissez des personnages parmi la distribution du chapitre. |
| Régénérer par lots | Régénérez parmi les images sélectionnées. |
| Uploader manuellement | Ajoutez votre propre image à la bibliothèque. |

La visionneuse d'images affiche les métadonnées : chapitre(s) source(s), personnages, requête (prompt), horodatage et note de catalogue.

### Notes

- La génération d'images de scènes s'exécute en série : une image à la fois sur un seul GPU.
- La publication d'un brouillon peut dépendre d'un visuel prêt. Les brouillons dont le visuel est encore en cours de rendu ne peuvent pas être publiés tant qu'ils ne sont pas prêts.
- Les hashtags de base s'appliquent à chaque publication pour le livre.
- Les directives visuelles sont traduites automatiquement en anglais pour les requêtes d'images.

## Connexion

L'écran **Connexion** connecte BookSocial Studio aux Pages Facebook en utilisant un jeton de Page d'utilisateur système Meta (Meta System User Page token).

### Ce qu'il fait

Il stocke les jetons de Page chiffrés dans `secrets.enc` et vous permet de choisir quelles Pages l'application doit gérer. Les jetons ne sont jamais stockés dans la base de données.

### Ce que vous pouvez faire

| Action | Résultat |
| --- | --- |
| Coller un jeton d'accès de Page | Démarre le flux de connexion. |
| Connecter | L'application liste les Pages gérées par ce jeton. |
| Sélectionner des Pages | Choisit quelles Pages BookSocial Studio doit gérer. |
| Enregistrer | Stocke les connexions aux Pages sélectionnées. |
| Examiner les Pages connectées | Chaque Page enregistrée affiche un badge **Connecté** (Connected). |
| Retirer une Page | Retire une Page enregistrée de l'application. |
| Tout déconnecter | Efface les jetons du stockage chiffré. |

### Notes

- Lors de l'enregistrement, l'application détecte automatiquement le compte professionnel Instagram lié à chaque Page via `instagram_business_account`.
- Si le compte Instagram n'est pas trouvé immédiatement, il est résolu de manière asynchrone plus tard.
- L'onglet Instagram dans la gestion de la page n'apparaît que lorsqu'une Page possède un compte professionnel Instagram associé.
- Pour les détails de configuration d'Instagram, voir [INSTAGRAM.md](./INSTAGRAM.md).

## Gestion de la page

L'écran **Gestion de la page** est l'endroit où vous manipulez les Pages connectées après leur configuration. Il comporte des onglets de plateforme en haut.

### Ce qu'il fait

L'écran vous permet de gérer le contenu Facebook publié, les commentaires, le contenu programmé nativement sur Facebook, les paramètres de la Page, les commentaires des médias Instagram, les tâches programmées en interne pour Instagram et les informations du compte Instagram.

L'onglet de plateforme **Facebook** est toujours disponible. L'onglet de plateforme **Instagram** n'apparaît que si la Page sélectionnée possède un compte professionnel Instagram associé.

### Ce que vous pouvez faire

| Plateforme | Espace | Actions |
| --- | --- | --- |
| Facebook | Publications & commentaires | Examiner les publications publiées, modifier le texte, épingler ou désépingler, voir et gérer les commentaires, supprimer les publications. |
| Facebook | Tiroir de création de publication | Publier maintenant ou programmer une publication native Facebook avec du texte, un lien facultatif et une date facultative. |
| Facebook | Programmées sur Facebook | Voir le contenu programmé de manière native sur Facebook. |
| Facebook | Paramètres de la Page | Modifier la section À propos ou la description, le site web, le contact et l'image de couverture, puis enregistrer sur Facebook. |
| Instagram | Publications & commentaires | Examiner les Reels, Publications et Stories publiés avec le nombre de J'aime et de commentaires ; gérer les commentaires. |
| Instagram | Programmées | Examiner les tâches Instagram internes en attente liées aux Reels ou Stories Facebook programmés. |
| Instagram | Compte | Voir les informations du profil. |

### Facebook : Publications & Commentaires

Le sous-onglet **Publications & commentaires** liste les publications Facebook publiées avec une vignette, une date, un extrait et des badges tels que **épinglé** (pinned) ou **non publié** (not published).

| Action | Résultat |
| --- | --- |
| Modifier le texte | Met à jour le texte de la publication. |
| Épingler ou désépingler | Modifie l'état épinglé de la publication. |
| Voir les commentaires | Ouvre la gestion des commentaires pour la publication. |
| Répondre | Ajoute une réponse imbriquée à un commentaire. |
| Masquer ou afficher | Modifie la visibilité du commentaire. |
| Aimer | Aime un commentaire. |
| Supprimer un commentaire | Supprime un commentaire. |
| Supprimer la publication | Supprime la publication. |

Le tiroir **Créer une publication** (Create post) inclut un aperçu en direct de style Facebook et nécessite une confirmation explicite. Si la date est vide, la publication est publiée immédiatement. Si une date est fournie, elle est programmée nativement sur Facebook.

### Facebook : Programmées sur Facebook

Ce sous-onglet affiche le contenu programmé de manière native sur Facebook.

### Facebook : Paramètres de la Page

Ce sous-onglet vous permet de modifier les champs de la Page et de les enregistrer sur Facebook.

| Champ | Résultat |
| --- | --- |
| À propos ou description | Met à jour le champ texte de la Page. |
| Site web | Met à jour le site web de la Page. |
| Contact | Met à jour les informations de contact de la Page. |
| Image de couverture | Met à jour l'image de couverture de la Page. |

### Instagram : Publications & Commentaires

Le sous-onglet des médias Instagram affiche les Reels, Publications et Stories publiés avec le nombre de J'aime et de commentaires.

| Action | Résultat |
| --- | --- |
| Développer un élément multimédia | Ouvre ses commentaires. |
| Répondre | Ajoute une réponse imbriquée à un commentaire. |
| Masquer le commentaire | Masque un commentaire. |
| Supprimer le commentaire | Supprime un commentaire. |

### Instagram : Programmées

Ce sous-onglet affiche les tâches Instagram internes en attente. Ce sont les tâches jumelles des Reels ou Stories Facebook programmés.

### Instagram : Compte

Ce sous-onglet affiche les informations du profil Instagram.

| Champ | Modifiable dans BookSocial Studio |
| --- | --- |
| Nom d'utilisateur | Non |
| Bio | Non |
| Nombre d'abonnés | Non |
| Nombre d'abonnements | Non |
| Nombre de médias | Non |
| Photo | Non |

### Notes

- Le contenu Facebook programmé affiché sous **Programmées sur Facebook** est en lecture seule ici et doit être géré sur Facebook.
- Les champs du profil Instagram sont en lecture seule via l'API. Modifiez-les dans l'application Instagram.
- Le panneau Instagram n'apparaît que lorsque la Page sélectionnée a un compte professionnel Instagram lié.

## Planificateur

L'écran **Planificateur** (Planner) crée une semaine typique, un mois ou une période personnalisée de contenu social pour une Page et un Livre sélectionnés.

### Ce qu'il fait

Il utilise des quotas, des fenêtres de temps, le livre sélectionné et la Page sélectionnée pour générer des brouillons de manière asynchrone. L'application choisit les jours, les heures, les formats, évite les doublons et effectue le rendu des visuels en arrière-plan.

### Ce que vous pouvez faire

| Action | Détails |
| --- | --- |
| Choisir une Page | Sélectionnez la Page connectée pour laquelle générer. |
| Choisir un Livre | Sélectionnez le livre associé à partir duquel générer. |
| Définir les quotas | Choisissez combien de publications, reels et stories générer sur la période choisie (total, pas par semaine). |
| Définir des fenêtres de temps | Ajoutez une heure ou une plage horaire par jour de la semaine. |
| Retirer des fenêtres de temps | Retirez des fenêtres individuellement. |
| Choisir une période | Sélectionnez une semaine, un mois ou une plage de dates personnalisée. |
| Générer | Démarrez une tâche de serveur asynchrone qui crée des brouillons et rend des visuels. |
| Suivre la progression | Suivez la progression en direct sous la forme `N/M`. |
| Annuler | Arrêtez la tâche de génération. Les brouillons créés sont conservés. |

### Périodes

| Période | Durée |
| --- | --- |
| Semaine | 7 jours ; par défaut. |
| Mois | 28 jours. |
| Plage personnalisée | Plage de dates sélectionnée par l'utilisateur. |

### Fenêtres de temps

| Type de fenêtre | Comportement |
| --- | --- |
| Heure unique | Publie dans les 30 minutes environ. |
| Plage horaire | Le moteur choisit une heure dans cette plage. |
| Pas de fenêtres | Les valeurs par défaut s'appliquent. |

### Liste des brouillons générés

Chaque carte de brouillon généré indique le type, l'angle, le format, le statut, l'heure programmée et un aperçu de style Facebook. L'aperçu inclut une décomposition des hashtags : de base, spécifiques et finaux.

| Action de brouillon | Résultat |
| --- | --- |
| Modifier | Modifiez le texte, les hashtags et la date/heure. |
| Régénérer | Crée de nouveaux textes et hashtags, et refait le rendu du visuel. L'application interroge jusqu'à ce qu'il soit prêt. |
| Supprimer | Supprime le brouillon. |
| Publier maintenant | Publie immédiatement après confirmation explicite. |
| Programmer la publication | Convertit tous les brouillons datés dans le futur en éléments programmés après confirmation. |

### Notes

- Les Reels et Stories sont des vidéos verticales au format 9:16.
- Les publications (Posts) sont du contenu texte/photo.
- Les brouillons dont le visuel est encore en cours de rendu affichent un espace réservé (placeholder).
- **Publier maintenant** (Publish now) est désactivé tant que le visuel d'un brouillon n'est pas prêt.
- Lors de la programmation par lots, les publications Facebook sont programmées nativement sur Facebook et peuvent être publiées même si l'application est éteinte.
- Les Reels et Stories sont programmés via le planificateur interne, le serveur doit donc être allumé à l'heure programmée.

## Programmé

L'écran **Programmé** (Scheduled) affiche la file d'attente de publication interne.

### Ce qu'il fait

Il liste les Reels et les Stories que le serveur BookSocial Studio publiera automatiquement à leurs heures programmées.

### Ce que vous pouvez faire

| Action | Disponibilité | Résultat |
| --- | --- | --- |
| Publier maintenant | Par élément, avec confirmation | Publie immédiatement l'élément en file d'attente. |
| Retirer | Par élément, s'il n'est pas encore publié | Retire l'élément de la file d'attente interne. |
| Publier aussi sur Instagram | Reels et Stories Facebook uniquement, vidéo 9:16 | Crée une tâche Instagram jumelle à la même heure et liée à l'élément Facebook. |
| Retirer le jumeau Instagram | Éléments avec une tâche Instagram jumelle | Supprime la tâche Instagram associée. |

### Notes

- Une bannière bien visible avertit que le serveur doit être en cours d'exécution à l'heure programmée.
- Si le serveur n'est pas en cours d'exécution, les Reels, Stories et tâches Instagram ne seront pas diffusés.
- Les publications natives Facebook ne sont pas gérées par cette file d'attente et sont publiées de manière indépendante sur Facebook.
- Lorsqu'un élément Facebook avec un jumeau Instagram est publié, le serveur le publie également sur Instagram avec la même légende.

## Statistiques

L'écran **Statistiques** (Insights) vous aide à examiner les performances de la Page et du compte.

### Ce qu'il fait

Vous choisissez une Page et une période, puis vous examinez les statistiques Facebook et, s'il est lié, les statistiques Instagram.

### Ce que vous pouvez faire

| Action | Détails |
| --- | --- |
| Choisir une Page | Utilisez les onglets de Pages. |
| Choisir une période | Choisissez le jour, la semaine ou le mois. |
| Voir les statistiques Facebook | Disponible pour les Pages Facebook connectées. |
| Voir les statistiques Instagram | Disponible lorsque la Page possède un compte professionnel Instagram lié. |
| Comparer des Pages | Disponible lorsque deux ou plusieurs Pages sont connectées. |

### Statistiques Facebook

| Zone | Ce qu'elle affiche |
| --- | --- |
| Tuiles KPI | Abonnés, J'aime/fans, couverture (reach), engagement. |
| Graphique de tendance des abonnés | Gains en vert, pertes en rouge et total net. |
| Meilleures publications | Top 10 par engagement, avec vues, couverture, réactions, commentaires, partages et un lien vers Facebook. |
| Graphique linéaire d'historique | Couverture et abonnés au fil du temps. |
| Graphique sparkline de couverture | Tendance de la couverture. |
| Données démographiques | Principaux pays, villes et genre-âge. |
| Tableau de comparaison des Pages | Comparaison entre les Pages lorsque deux ou plusieurs Pages sont connectées. |

### Statistiques Instagram

| Zone | Ce qu'elle affiche |
| --- | --- |
| KPI du compte | Abonnés, abonnements et nombre de médias. |
| Statistiques du compte pour la période | Couverture, vues du profil et nombre d'abonnés. |

### Notes

- Dans le tableau de comparaison des Pages, chaque cellule se charge indépendamment.
- Si une Page ne parvient pas à se charger dans le tableau de comparaison, la cellule de cette Page affiche `—`.
- Certaines métriques Instagram peuvent être indisponibles selon le compte ou la version de l'API. L'application se dégrade gracieusement.

## Paramètres : IA

L'écran **Paramètres** (Settings) configure le fournisseur de texte IA, le fournisseur d'images, le mode d'image et le contrôle qualité (QA) des images facultatif.

### Ce qu'il fait

BookSocial Studio utilise un fournisseur de texte enfichable pour l'analyse et la rédaction, et un fournisseur d'images enfichable pour les visuels de scène. Vous configurez les deux ici.

### Ce que vous pouvez faire

| Action | Résultat |
| --- | --- |
| Configurer le fournisseur de texte | Active l'analyse du livre, la rédaction des publications, la génération de hashtags et les tâches textuelles associées. |
| Configurer le fournisseur d'images | Active les images de scènes générées et les visuels de brouillons générés. |
| Tester la connexion de texte | Renvoie un succès avec un échantillon ou une erreur claire. |
| Tester la connexion d'image | Renvoie un succès avec un échantillon ou une erreur claire. |
| Choisir le mode d'image | Sélectionnez Bibliothèque (Library) ou Direct. |
| Activer la QA (qualité) des images | Valide les images générées et régénère les images échouées avec un délai exponentiel (backoff). |

### Fournisseurs de texte

Il existe deux familles de fournisseurs de texte.

| Famille | Fournisseurs | Authentification et configuration |
| --- | --- | --- |
| Abonnement via CLI | opencode, codex (ChatGPT), gemini (Google) | Aucune clé API n'est stockée dans l'application. Le panneau affiche l'état d'installation de la CLI, un bouton **Authentifier** (Authenticate) qui lance la connexion CLI et un bouton **Vérifier** (Verify) qui revérifie l'état. Il y a un champ facultatif pour le nom du modèle pour la CLI. |
| Clé API | Points de terminaison OpenAI et compatibles OpenAI, Anthropic, Google, Ollama | Saisissez la clé API, définissez éventuellement une URL de base et choisissez le modèle dans une liste chargée via **Charger les modèles** (Load models), avec une solution de secours manuelle. Ollama est local et n'utilise pas de clé. |

Pour les fournisseurs de clé API, les clés sont stockées de manière chiffrée dans `secrets.enc`. Une clé saisie une fois pour un fournisseur est réutilisée, par exemple pour les images du même fournisseur, et est affichée comme étant déjà définie.

Lorsqu'un nom de modèle spécifique est nécessaire, saisissez le modèle que vous avez choisi / le nom du modèle de votre fournisseur.

### Fournisseurs d'images

| Option de fournisseur | Signification |
| --- | --- |
| local | Utilise un moteur sur l'appareil. Voir [TESTED-ON.md](./TESTED-ON.md). |
| auto | Utilise le mode local si disponible, sinon aucun. |
| none | Désactive les images générées ; utilisez uniquement l'upload. |
| OpenAI | Fournisseur d'images dans le cloud ; réutilise la clé de texte partagée. |
| Google | Fournisseur d'images dans le cloud ; réutilise la clé de texte partagée. |
| Stability | Fournisseur d'images dans le cloud avec sa propre clé. |
| Black Forest Labs (FLUX) | Fournisseur d'images dans le cloud avec sa propre clé. |
| Replicate | Fournisseur d'images dans le cloud avec sa propre clé. |
| fal.ai | Fournisseur d'images dans le cloud avec sa propre clé. |

Le champ du modèle d'image est du texte libre. Saisissez le modèle que vous avez choisi / le nom du modèle de votre fournisseur. Aucun modèle d'image n'est prédéfini.

### Mode d'image

| Mode | Comportement |
| --- | --- |
| Bibliothèque | Les images générées vont dans une bibliothèque réutilisable, et vous choisissez des images par brouillon. |
| Direct | Le visuel est rendu directement sur les brouillons pendant la génération de la semaine. Cela nécessite un moteur d'image fonctionnel. |

### Contrôle qualité (QA) des images

Lorsque le contrôle qualité (QA) des images est activé, chaque image générée est validée et régénérée si elle échoue à la vérification. Les tentatives utilisent un délai exponentiel (backoff).

### Notes

- Anthropic est disponible en tant que fournisseur de clé API (sans connexion par abonnement).
- L'authentification par abonnement CLI réside dans la CLI elle-même ; aucun jeton d'abonnement n'est stocké dans BookSocial Studio.
- Pour la configuration spécifique au fournisseur, voir [PROVIDERS.md](./PROVIDERS.md).

## Configuration de l'API Graph : Meta

La configuration de Meta est requise avant que BookSocial Studio ne puisse gérer des Pages Facebook ou des comptes professionnels Instagram associés.

### Ce qu'il fait

La configuration de Meta donne à l'application l'accès aux Pages, aux publications, aux commentaires, aux statistiques et à la publication Instagram lorsque cela est disponible.

### Ce que vous pouvez faire

| Espace | Prérequis |
| --- | --- |
| Facebook | Créez une application Meta avec Facebook Login. |
| Facebook | Créez un jeton de Page d'utilisateur système (System User Page token) avec les permissions de lire et de gérer la Page, les publications, les commentaires et les statistiques. |
| Facebook | Collez le jeton de la Page dans l'écran **Connexion**. |
| Instagram | Ajoutez le produit **API Instagram avec Facebook Login**. |
| Instagram | Incluez `instagram_basic` et `instagram_content_publish`. |
| Instagram | Liez le compte professionnel Instagram à la Page Facebook. |
| Instagram | Attribuez le compte professionnel Instagram à l'utilisateur système. |
| Instagram | Assurez-vous que le jeton de Page comporte les portées (scopes) Instagram. |

Les autorisations Facebook incluent des exemples tels que `pages_read_engagement`, `pages_manage_posts`, `pages_manage_metadata`, `pages_manage_engagement/comments`, et `pages_read_user_content`.

### Notes

- Le mappage Instagram correspond à une Page Facebook pour un compte professionnel Instagram.
- Les notes détaillées sur Instagram se trouvent dans [INSTAGRAM.md](./INSTAGRAM.md).

## Flux de travail courants

### 1. Importer et analyser un livre

1. Ouvrez **Livres**.
2. Choisissez **Importer un livre** (Import a book).
3. Sélectionnez un fichier Markdown `.md`.
4. Définissez facultativement l'auteur et la langue.
5. Confirmez l'importation.
6. Patientez pendant que l'application lit, analyse et enregistre le livre.
7. Ouvrez le livre lorsque la notification de fin apparaît.
8. Examinez le profil, les chapitres, les personnages et l'état de la bible visuelle.

### 2. Configurer l'IA avant d'importer

1. Ouvrez les **Paramètres**.
2. Choisissez un fournisseur de texte.
3. Authentifiez-vous via un fournisseur CLI ou saisissez une clé API, selon la famille de fournisseurs.
4. Si vous utilisez un fournisseur de clé API, utilisez **Charger les modèles** (Load models) ou saisissez manuellement le modèle que vous avez choisi / le nom de modèle de votre fournisseur.
5. Exécutez l'action de **Test** pour le texte.
6. Choisissez un fournisseur d'images si vous souhaitez générer des images.
7. Saisissez le modèle d'image que vous avez choisi / le nom du modèle de votre fournisseur si nécessaire.
8. Exécutez l'action de **Test** pour l'image.
9. Choisissez le mode d'image **Bibliothèque** ou **Direct**.

### 3. Connecter une Page Facebook

1. Ouvrez **Connexion**.
2. Collez un jeton d'accès de Page d'utilisateur système Meta.
3. Sélectionnez **Connecter**.
4. Examinez les Pages gérées par le jeton.
5. Sélectionnez les Pages que vous souhaitez que BookSocial Studio gère.
6. Sélectionnez **Enregistrer**.
7. Confirmez que les Pages enregistrées affichent le badge **Connecté**.
8. Si la Page possède un compte professionnel Instagram associé, attendez la détection automatique ou la résolution asynchrone.

### 4. Associer un livre à une Page

1. Ouvrez **Livres**.
2. Ouvrez le livre.
3. Allez dans l'onglet **Profil**.
4. Trouvez les **Pages associées**.
5. Cochez les Pages connectées qui doivent être autorisées pour la génération.
6. Enregistrez les paramètres correspondants du livre.

### 5. Construire ou réparer la bible visuelle

1. Ouvrez **Livres**.
2. Ouvrez le livre.
3. Développez le panneau **Bible visuelle**.
4. Examinez l'état de chaque étape et le compteur terminé/total.
5. Sélectionnez **Construire la bible visuelle** pour exécuter toutes les étapes.
6. Ou exécutez une seule étape si une seule zone nécessite du travail.
7. Examinez les étapes échouées sans supposer que l'ensemble du pipeline a échoué, car les étapes s'exécutent au mieux et de manière indépendante.

### 6. Générer des images de scènes

1. Ouvrez le livre.
2. Allez dans l'onglet **Images**.
3. Choisissez le nombre par chapitre.
4. Choisissez le ratio d'aspect.
5. Sélectionnez les chapitres, ou laissez les chapitres vides pour une répartition automatique anti-divulgâchis.
6. Choisissez facultativement les personnages à mettre en avant.
7. Activez facultativement un flashback avec un âge plus jeune et des tenues d'époque pour ce lot.
8. Démarrez la génération.
9. Observez le compteur en direct et le chronomètre par image.
10. Ouvrez les images générées dans la visionneuse pour examiner le rendu en taille réelle et les métadonnées.

### 7. Planifier une semaine de contenu

1. Ouvrez le **Planificateur**.
2. Choisissez une Page.
3. Choisissez un livre associé à cette Page.
4. Définissez les quotas (total pour la période choisie) pour les publications, les reels et les stories.
5. Ajoutez des fenêtres de temps pour les jours de la semaine ou laissez-les vides pour utiliser les valeurs par défaut.
6. Choisissez **semaine** (week) comme période.
7. Sélectionnez **Générer**.
8. Suivez la progression en direct sous la forme `N/M`.
9. Examinez chaque carte de brouillon généré.
10. Modifiez, régénérez, supprimez ou publiez les brouillons selon vos besoins.

### 8. Programmer les futurs brouillons

1. Générez des brouillons dans le **Planificateur**.
2. Examinez les brouillons et apportez des modifications.
3. Assurez-vous que les visuels sont prêts pour les brouillons qui en nécessitent.
4. Sélectionnez **Programmer la publication** (Schedule publishing).
5. Lisez la confirmation expliquant la différence entre la programmation native de Facebook et le planificateur interne.
6. Confirmez.
7. N'oubliez pas que les publications Facebook sont programmées de manière native sur Facebook, tandis que les Reels et Stories nécessitent que le serveur BookSocial Studio soit actif au moment de la publication.

### 9. Publier un brouillon immédiatement

1. Ouvrez le **Planificateur**.
2. Trouvez la carte du brouillon.
3. Confirmez que le visuel requis est prêt.
4. Sélectionnez **Publier maintenant** (Publish now).
5. Confirmez explicitement.

### 10. Ajouter la publication Instagram à un Reel ou une Story programmé(e)

1. Ouvrez **Programmé**.
2. Trouvez un Reel ou une Story Facebook au format vidéo 9:16.
3. Activez **Publier aussi sur Instagram**.
4. Confirmez qu'une tâche Instagram jumelle est créée avec la même heure.
5. Maintenez le serveur en cours d'exécution à l'heure programmée.
6. Supprimez le jumeau si vous ne souhaitez plus que l'élément Instagram soit publié.

### 11. Gérer les commentaires Facebook

1. Ouvrez la **Gestion de la page**.
2. Sélectionnez la Page.
3. Ouvrez l'onglet **Facebook**.
4. Ouvrez **Publications & commentaires**.
5. Choisissez une publication.
6. Voir les commentaires.
7. Répondez, masquez ou affichez, aimez, ou supprimez les commentaires selon les besoins.

### 12. Examiner les performances

1. Ouvrez **Statistiques**.
2. Choisissez une Page.
3. Choisissez le jour, la semaine ou le mois.
4. Examinez les tuiles KPI Facebook, les graphiques, les meilleures publications, les données démographiques et l'historique.
5. Si Instagram est lié, ouvrez l'onglet Instagram.
6. Examinez les KPI du compte et les statistiques du compte disponibles.
7. Si deux ou plusieurs Pages sont connectées, examinez le tableau de comparaison des Pages.

## Notes importantes

### Sécurité

- Les jetons Facebook et les clés API de l'IA sont stockés chiffrés (AES-256-GCM) dans `secrets.enc`, jamais dans la base de données.
- L'authentification par abonnement CLI réside dans la CLI elle-même. Aucun jeton d'abonnement n'est stocké dans BookSocial Studio.
- Utilisez l'écran **Connexion** pour déconnecter les Pages ou effacer les jetons de Page stockés.

### Limites de Meta

- Les champs du profil Instagram sont en lecture seule via l'API. Modifiez-les dans l'application Instagram.
- Instagram n'a pas de programmation native dans cette application, la publication sur Instagram utilise donc des tâches internes.
- Certaines métriques Instagram sont incohérentes d'une version d'API à l'autre et peuvent être indisponibles.
- Le mappage Instagram correspond à une Page Facebook pour un compte professionnel Instagram.

### Performances

- L'analyse de livres et la génération de la semaine sont asynchrones et affichent la progression en direct.
- La génération locale d'images est la partie la plus lourde.
- La génération locale d'images s'exécute en série, une image à la fois sur l'appareil.
- Voir [TESTED-ON.md](./TESTED-ON.md) pour la machine testée et les notes sur la génération d'images en local.

### Le serveur doit rester allumé

- Le planificateur interne doit être en cours d'exécution à l'heure programmée pour les Reels, les Stories et les éléments Instagram.
- Si le serveur est éteint à l'heure programmée, ces éléments programmés en interne ne seront pas diffusés.
- Les publications natives Facebook se publient indépendamment car elles sont programmées sur Facebook.
