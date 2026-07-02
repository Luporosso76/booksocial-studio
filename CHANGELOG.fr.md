# Changelog

Toutes les modifications notables apportées à ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
et ce projet respecte le [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2026-07-02

### Ajouté
- **Présence temporelle par personnage** : chaque personnage est classé comme présent, uniquement-flashback, uniquement-rêve ou passé+rêve, modifiable dans la fiche personnage avec une substitution manuelle qui survit aux régénérations de la bible visuelle.
- **Appartenance aux scènes par type, sélectionnable** : la fiche personnage affiche trois groupes de chapitres sélectionnables — Présent, Flashback et Rêve — et l'enregistrement écrit la modification directement dans les fiches de scène du chapitre.
- **Soi passé/onirique dans les tenues de contexte** : les contextes de tenue de souvenir et de rêve portent désormais l'âge absolu et l'apparence visible du personnage pour cette scène.

### Modifié
- **Nouveau moteur de rendu flashback** : l'âge et l'apparence d'une scène proviennent du contexte de tenue correspondant du personnage et de sa présence temporelle ; les substitutions manuelles d'âge par scène ont été supprimées.
- **Extraction de scènes avec ancre temporelle** : le synopsis du livre ancre le présent narratif, de sorte qu'une scène qui lui est antérieure est classée comme flashback même si elle est narrée comme une action ordinaire ; les personnages principaux d'une scène sont limités à son moment principal.
- **La sélection d'images en deux passes respecte la nature du moment choisi** (présent/flashback/rêve), corrigeant les scènes-souvenir auparavant rendues comme présentes.

### Corrigé
- Les personnages n'apparaissant que dans le flashback ou le rêve d'un chapitre comptent désormais pour ce chapitre, de sorte que les lots d'images ciblés sur le personnage couvrent ces scènes.
- Le panneau de progression de la bible visuelle peut être fermé ; les noms des étapes sont robustes aux clés inconnues.

### Migrations
- Ajout des colonnes `temporal_presence` et `temporal_presence_locked` sur `book_character`.

## [0.6.0] - 2026-07-01

### Ajouté
- **Fournisseur d'images Gemini (Nano Banana)** : un nouveau fournisseur d'images `gemini` utilisant l'API Google `:generateContent`, avec une clé API dédiée, la liste des modèles récupérée en direct depuis le fournisseur et un style d'image par fournisseur.
- **Prompts d'image adaptés au modèle** : l'IA de texte rédige désormais le prompt d'image spécifiquement pour le modèle cible — un prompt structuré en sections pour Gemini, un unique paragraphe compact et positif pour le moteur local Z-Image, ou le paragraphe par défaut — améliorant le rendu sur chaque moteur.
- **Générateur d'image libre** : points d'accès de génération d'images indépendants du livre (générer / état / fichier / annuler).
- **Listes de modèles en direct** : pour les fournisseurs d'images Gemini et OpenAI, la liste des modèles est récupérée depuis l'API du fournisseur (avec un repli minimal hors ligne) au lieu d'une liste codée en dur.
- **Style d'image par fournisseur** : medium/intensité/vivacité (et pour le local steps/cfg) sont configurés par fournisseur, avec des styles principal et de repli indépendants.
- **Couverture d'apparence multilingue** : la déduplication des traits canoniques du personnage fonctionne désormais pour les livres en italien, anglais, français, espagnol et allemand.

### Modifié
- **Code de prompt indépendant du livre** : tout contenu visuel spécifique à un livre ou à un domaine a été retiré du code source ; les directives visuelles, l'apparence des personnages, les vêtements et l'équipement résident désormais uniquement dans la base de données et sont la seule source utilisée pour construire les prompts d'image. Le seed codé en dur des directives visuelles et l'ancien système `VISUAL_DOMAINS` ont été supprimés.
- **Fournisseur d'images `google` → `gemini`** : l'ancien moteur Imagen (`:predict`) et le champ mort `googleImageModel` ont été supprimés.
- **Prompts Z-Image** : compacts, uniquement positifs (pour éviter les artefacts de négation à faible guidance) et avec le sujet, la pose et l'équipement en tête, pour un meilleur rendu local.
- **Traduction des prompts** : les prompts d'image sont désormais traduits en anglais en détectant automatiquement la langue source (toute langue → anglais).

### Corrigé
- **Profil de prompt Gemini** routé par famille de modèle (flash/pro) au lieu d'une correspondance de version exacte.
- **Timeout** sur la requête de liste des modèles Gemini.
- **Repli visible** (plus silencieux) lorsque la traduction du prompt d'image n'est pas disponible.
- Robustesse mineure : analyse numérique de `dashboardHidden` ; purge de la table des tâches du générateur libre.

## [0.5.5] - 2026-06-28

### Ajouté
- **Chemin relatif strict à l'écriture** : lorsqu'un chemin de fichier est enregistré en base, il est désormais stocké strictement relatif au répertoire de données via `toDataRelativeStrict()`, rejetant tout chemin en dehors (complète `resolveInsideDataDir` côté lecture).
- **Validation du contenu audio** : les fichiers audio téléversés sont désormais vérifiés par magic bytes (OGG, FLAC, WAV, MP3/ID3, MP4/M4A, AAC), comme pour les images — une extension/MIME audio dont le contenu n'est pas audio est rejetée.
- **Tests backend étendus** : registre des fournisseurs du moteur texte (pris en charge vs non), auth/session (connexion, blocage, invalidation des sessions), migrations BD (création, idempotence, version du schéma), plus les cas path-strict et audio.

### Modifié
- **Config des fournisseurs alignée** : `server/.env.example` ne liste plus de fournisseurs API texte non pris en charge (OpenAI/Anthropic/Google/OpenAI-compatible) pour le moteur texte — uniquement CLI (opencode/Codex/Claude/agy) + Ollama — et utilise `CONTENT_PROVIDER=none` par défaut. Les clés OpenAI/Google ne sont documentées que sous les fournisseurs d'images.
- **Défaut Docker aligné** : `docker-compose.yml` utilise désormais `CONTENT_PROVIDER=none` par défaut (au lieu de `opencode`), en cohérence avec le README et le runtime.
- **Docs de production avec le runtime compilé** : les instructions manuelles de production (dans les 5 langues) compilent et exécutent désormais `node dist/index.js` (`npm run build` + `npm run start:prod`) au lieu de `npm start` (tsx), comme l'image Docker.

## [0.5.4] - 2026-06-28

### Ajouté
- **Tenues dédiées aux flashbacks et aux rêves** : les personnages reçoivent désormais des tenues canoniques distinctes pour les scènes de souvenir/flashback et de rêve, cohérentes d'un rendu à l'autre.
- **Tenues ciblées par personnage** : les tenues ne sont générées que pour les décors des chapitres où le personnage apparaît réellement, et non pour tout le livre.
- **Validation des téléversements** : les fichiers de livres, d'images et d'audio sont vérifiés (taille, extension, type MIME et, pour les images, magic bytes) ; les limites sont configurables par variables d'environnement.
- **Sécurité des chemins** : les fichiers servis depuis un chemin de la base de données sont résolus strictement à l'intérieur du répertoire de données, bloquant les chemins absolus ou la traversée `../`.
- **Renforcement de la connexion** : limitation du débit avec blocage temporaire après échecs répétés, durée de session configurable et invalidation de toutes les sessions au changement de mot de passe.
- **Limitation générale du débit de l'API** par client.
- **Vérification de la configuration au démarrage** : erreur claire si le répertoire de données n'est pas accessible en écriture, avertissements si ffmpeg est absent ou si aucun fournisseur de texte n'est configuré.
- **Runtime Docker compilé** : le conteneur exécute désormais le JavaScript compilé (`node dist/index.js`) au lieu des sources TypeScript.
- **Documentation** : modes d'utilisation pris en charge (local / LAN / public) et conseils sur la clé secrète et les sauvegardes.

### Modifié
- **Fournisseurs d'IA de texte** : seuls les CLI sur abonnement (opencode, Codex, Claude, agy) et Ollama local sont pris en charge. Les fournisseurs d'API de texte non pris en charge (OpenAI/Anthropic/Google) ont été retirés de la configuration, de l'interface des réglages et de la documentation ; en sélectionner un obsolète échoue désormais avec une erreur claire au lieu de ne rien faire silencieusement.
- **Cookie de session** : l'attribut `Secure` n'est défini que lorsque la connexion est réellement en HTTPS, afin que la connexion fonctionne en HTTP en local/développement.
- **Clé de chiffrement** : un avertissement est journalisé lorsque la clé est stockée dans le répertoire de données ; il est recommandé de définir `BOOKSOCIAL_SECRET_KEY` en dehors du volume de données.
- **Routes du backend** réorganisées en modules par domaine (aucun changement d'endpoint ni de comportement).

### Corrigé
- Les sessions de connexion ne sont plus perdues en HTTP à cause de l'attribut `Secure` du cookie.

## [0.5.3] - 2026-06-28

### Ajouté
- **Style d'image par fournisseur** : choisissez le style visuel des images générées (roman graphique, pictural, photoréaliste, aquarelle, concept art et plus) avec une intensité de stylisation et une vivacité des couleurs réglables, définies indépendamment pour chaque fournisseur d'images — et séparément pour le fournisseur principal et son fournisseur de secours, afin que chacun rende dans son propre style.

### Modifié
- **Les prompts d'image conservent toute la direction artistique** : le générateur de prompt transcrit désormais intégralement les règles visuelles du livre (équipement, posture, technique) au lieu de les résumer.
- **Physique par scène** : les règles de réalisme d'un chapitre ne s'appliquent désormais qu'aux objets réellement présents dans la scène, afin que les règles concernant des objets absents ne s'infiltrent plus dans l'image.
- Conseils vestimentaires du prompt consolidés pour la cohérence.

### Corrigé
- **Champ du jeton Facebook** : le navigateur ne remplit plus automatiquement le mot de passe de connexion admin dans le champ du jeton d'accès Facebook de la page Connexion.

## [0.5.2] - 2026-06-28

### Modifié
- **Génération d'images — utilisation plus intelligente de la bible visuelle** : l'invite de la scène est désormais construite en DEUX étapes. D'abord, le modèle choisit quel unique moment du chapitre illustrer, en nommant le sujet et seulement les personnages et objets réellement présents dans ce moment. Ensuite, l'invite finale de l'image est rédigée en utilisant UNIQUEMENT le canon de cette scène. Auparavant, chaque personnage, objet et directive de tout le chapitre était déversé dans une seule invite, si bien que des personnes et des objets sans rapport se glissaient dans l'image, les personnages étaient dupliqués ou fondus, et les détails clés étaient dilués. Le flux en deux étapes garde chaque scène nette : les bonnes personnes, le bon équipement, la bonne pose — et des images distinctes au fil d'un chapitre.
- **Les poses sportives et d'action** sont désormais rendues avec leur pleine posture dynamique au lieu d'être forcées à la verticale.

## [0.4.0] - 2026-06-26

### Ajouté
- **Authentification** : une connexion intégrée protège l'application. Au premier lancement, les identifiants sont `admin` / `12345678` et un changement de mot de passe est requis ; le mot de passe est stocké haché. Déconnexion depuis la barre latérale. (Remplace l'ancienne HTTP Basic Auth optionnelle.)
- **HTTPS** : le serveur peut servir en HTTPS. Montez votre certificat dans Docker (`TLS_CERT_PATH`/`TLS_KEY_PATH`), ou un certificat auto-signé est généré ; sinon il bascule en HTTP. Voir le README.
- **Mise en page mobile** : toute l'interface est désormais responsive — barre latérale repliable avec menu hamburger et écrans adaptés aux téléphones.
- **Générer des images de rêve/flashback** : le générateur peut viser le rêve ou le flashback d'un chapitre, ou choisir au hasard entre présent/rêve/flashback, et non plus seulement la scène présente.
- **Âge par personnage dans le flashback** : dans un flashback, vous pouvez définir l'âge exact de chaque personnage pour cette scène, afin que des personnages d'âges différents soient rendus correctement.

- **Âge et origine ethnique des personnages** : désormais des champs dédiés et modifiables (plus dilués dans la description physique). Ils sont indiqués explicitement dans chaque prompt d'image, pour que l'âge apparent et l'origine restent cohérents sur toutes les illustrations.
- **Pièce signature** : un vêtement ou accessoire qu'un personnage porte toujours (p. ex. un chapeau) se définit une fois et apparaît dans chaque scène, par-dessus la tenue de la scène.
- **Moments de scène (rêve / flashback)** : chaque fiche de chapitre enregistre la nature de la scène principale (normale, rêve ou flashback) ainsi que les rêves ou flashbacks secondaires, modifiables dans des onglets dédiés. Les scènes de rêve ont un rendu onirique ; les flashbacks rajeunissent les personnages.
- **Utilisation des images** : chaque image indique combien de fois elle a été utilisée et dans quoi (reels, stories, posts), avec un filtre utilisées / inutilisées.
- **Utilisation de la musique** : les pistes affichent le même badge d'utilisation (reels / stories) avec filtre.
- **Sous-onglets d'images par format et par chapitre** : la bibliothèque se filtre par format et, dans un format, par chapitre, avec des compteurs — et vous pouvez générer des images pour ce seul chapitre.
- **Nettoyage automatique des médias publiés** : les vidéos de reels/stories/posts sont supprimées 24 heures après publication sur Facebook et Instagram, pour libérer de l'espace. Les fichiers rendus sont désormais dans un sous-dossier `media/renders/`.

### Modifié
- **Génération d'images flashback** : la case flashback du panneau de génération est désormais un simple on/off — le rendu utilise les âges par personnage de la fiche de chapitre ; le champ manuel « années de moins » a été supprimé.

- **Cohérence des personnages renforcée dans les prompts** : âge, origine, carrure et cheveux toujours indiqués ; deux personnages ou plus restent distincts et ne sont jamais intervertis ; poses naturelles et droites ; un personnage demandé apparaît toujours.

### Corrigé
- **Extraction de la fiche de chapitre** : un chapitre contenant à la fois une scène réelle et un rêve/flashback conserve désormais les DEUX (la scène éveillée comme principale, plus le rêve/flashback comme moment distinct) au lieu de réduire tout le chapitre au rêve ; les longs chapitres en plusieurs sections ne perdent plus un rêve/flashback contenu dans sa propre section.

- **Plus de sujets hors de propos** : ce qui n'apparaît que dans un rêve, un souvenir ou une figure de style (et les homonymes comme la manœuvre « tortue » du surf) ne se glisse plus dans la scène réelle du chapitre.

## [0.3.1] - 2026-06-24

### Ajouté

- **Annuler les éléments en file individuellement** : vous pouvez désormais annuler un seul lot en attente
  dans la file de génération d'images, en plus de « Tout annuler ».

### Modifié

- **Génération d'images sérialisée** : les générations de livres différents et les régénérations sont
  désormais mises en file et exécutées une à la fois au lieu d'être parallèles ; l'indicateur d'activité
  distingue « en cours » de « en file ».

### Corrigé

- **Panneau d'activité au premier plan** : le menu d'activité de l'en-tête s'affiche désormais au-dessus de
  la grille d'images lors du défilement.

## [0.3.0] - 2026-06-24

### Ajouté

- **Fiches marketing de chapitre** : une compréhension narrative persistante de chaque chapitre (résumé
  sans spoiler, cœur émotionnel, question au lecteur, citations sûres et angles de post notés) qui sert
  de base à la génération des posts, construite une fois par chapitre et réutilisée.
- **Classeur d'idées avec rotation des angles** : les posts puisent dans les angles pré-validés du
  chapitre et les font tourner, de sorte qu'un chapitre réutilisé donne un angle différent à chaque fois.
- **Juge de qualité** : une passe finale qui rejette les posts génériques (ceux qui conviendraient à
  n'importe quel livre) et les régénère une fois avec une indication ciblée.
- **Éditeur de présence des personnages par chapitre** : définissez manuellement dans quels chapitres un personnage apparaît.
- **Images reproductibles** : la graine (seed) de génération est enregistrée avec chaque image générée.

### Modifié

- **Posts plus ancrés** : une checklist interne oblige chaque post à utiliser un détail concret du
  chapitre, avec de vraies citations sans spoiler et une formulation plus anti-générique et anti-IA.
- **Les tenues et objets de scène suivent la direction artistique du livre** : les vêtements de
  pratique/cérémonie/époque et les objets clés décrits dans les directives visuelles sont désormais
  respectés dans le canon et les fiches de scène des chapitres.
- **Les quotas du planificateur correspondent au total de la période choisie** (semaine/mois/
  personnalisé), sans mise à l'échelle cachée ; le planificateur garantit désormais que chaque contenu
  demandé est placé, même avec peu de créneaux.
- **Panneau d'images de scène redessiné** : sections Chapitres/Personnages repliables et mise en page plus compacte.

- Le juge de qualité évalue aussi les posts par rapport à la fiche marketing du chapitre, et pas seulement à l'extrait, évitant les rejets injustes.
- Les citations de la fiche marketing sont vérifiées sur le texte réel du chapitre ; celles inventées ou paraphrasées sont écartées.

### Corrigé

- Réimporter un livre dont le texte a changé invalide désormais ses fiches marketing de chapitre, afin que les posts s'appuient sur le nouveau texte.
- La génération de posts est bloquée lorsque la fiche du livre n'est pas à jour par rapport au texte importé, afin que les posts ne reposent jamais sur une fiche obsolète.
- La modification des hashtags d'un brouillon est désormais enregistrée correctement.
- Les posts, reels et stories sans visuel restent des brouillons au lieu d'échouer à la publication.

## [0.2.0] - 2026-06-23

### Ajouté

- **Instructions de prompt supplémentaires modifiables** (Paramètres) : texte libre ajouté aux prompts de texte et d'image, à la fois globaux et par livre, en plus du noyau conçu (les règles de base ne sont jamais remplacées).
- **Tableau de bord** : un **calendrier** hebdomadaire + mensuel de contenu planifié avec des couleurs par livre, des KPI compacts par page (Facebook + Instagram), et une carte d'activité en arrière-plan avec progression et minuteurs en direct.
- **Fournisseurs d'IA orientés CLI** : génération de texte et d'images via des CLI sur abonnement (opencode, Codex, Gemini) aux côtés des clés API, avec un fournisseur/modèle de secours dédié et un panneau de paramètres d'IA à quatre onglets.
- **Onglets de format d'image** (vertical 9:16 / carré / horizontal) avec le décompte dans la bibliothèque d'images d'un livre.
- Action de **ré-indexation NLP rapide** : ré-extraire les citations réelles sans relancer l'analyse complète.
- Champ **moment clé** sur les fiches de scène par chapitre, utilisé pour ancrer le sujet de l'image.
- Interface utilisateur et documentation en **cinq langues** (IT/EN/FR/ES/DE).

### Modifié

- **Moins de répétitions** : les posts, reels et stories sélectionnent désormais les citations, images, musiques et chapitres les moins récemment utilisés au fil des exécutions, de sorte que les plans hebdomadaires consécutifs et les régénérations parcourent l'ensemble du matériel au lieu de le répéter.
- **Prompts IA réécrits en anglais**, tandis que le résultat généré reste toujours dans la langue du livre.
- **Canon visuel plus précis** : l'apparence et les tenues des personnages sont basées sur de réels passages du livre, avec un ancrage par ethnie/pays/époque et des mots-clés de vêtements tirés du vocabulaire réel du livre.
- Une passe supplémentaire d'**humanisation anti-IA** sur les posts générés, appliquée dans la langue de sortie.

### Corrigé

- Supprimer un brouillon libère désormais immédiatement ses citations, images, musiques et chapitres pour réutilisation.
- Les posts Facebook programmés nativement sont réconciliés en "publiés" après leur heure programmée (plus aucune entrée bloquée comme "programmée dans le passé").
- Les posts publiés peuvent être masqués du tableau de bord sans les supprimer.

## [0.1.0] - 2026-06-20

Première version publique, auto-hébergeable.

### Ajouté

- Image **Docker** à conteneur unique (backend + frontend compilé) et configuration `docker compose`.
- **Analyse de livre & bible visuelle** : import d'un livre Markdown, extraction du profil et des personnages, et construction d'un canon par livre (apparence, tenues, accessoires, personnages secondaires, fiches de scène par chapitre).
- **Génération de contenu** vers un planning hebdomadaire : posts, Reels et Stories avec citations, hashtags et liens ; la logique de recherche d'idées et d'humanisation est intégrée dans les prompts, afin de fonctionner sur n'importe quel fournisseur.
- **Planification & publication** sur **Facebook** (planification native pour les posts ; un planificateur interne pour les Reels/Stories) et **Instagram** (Reels/Stories vers des comptes Instagram Business liés).
- **Gestion Facebook & Instagram** : posts, commentaires, paramètres de page et statistiques de compte, avec un onglet Facebook/Instagram affiché lorsqu'une Page possède un compte Instagram lié.
- **Fournisseurs d'IA modulaires** : clés API (OpenAI, Anthropic, Google, tout point d'accès compatible OpenAI, Ollama local) ou CLI d'abonnement (opencode, Codex, Gemini) avec un flux Authenticate ; moteurs d'images modulaires (`sd-cli` local, OpenAI, Google, Stability, Black Forest Labs/FLUX, Replicate, fal.ai) avec une solution de repli par upload uniquement.
- Écran **Settings** ; secrets conservés chiffrés au repos dans `secrets.enc` (AES-256-GCM).
- **i18n (IT/EN)** pour l'UI web, avec détection et changement de langue.
- **Basic Auth optionnelle** pour protéger l'application lors de l'auto-hébergement.
- **Documentation** : manuel d'utilisation, configuration, fournisseurs d'IA, Instagram, architecture et contribution.

[0.2.0]: https://github.com/Luporosso76/booksocial-studio/releases/tag/v0.2.0
[0.1.0]: https://github.com/Luporosso76/booksocial-studio/releases/tag/v0.1.0
