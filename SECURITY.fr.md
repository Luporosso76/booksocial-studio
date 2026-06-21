# Politique de sécurité

## Signaler une vulnérabilité

Veuillez **ne pas ouvrir de tickets (issues) publics** pour les vulnérabilités, fuites de tokens, exposition d'identifiants ou tout ce qui pourrait compromettre les données des utilisateurs.

Signalez-les en privé via GitHub : ouvrez l'onglet **Security → Report a vulnerability** (« Private vulnerability reporting ») du dépôt. Cela permet de garder le signalement confidentiel jusqu'à ce qu'un correctif soit disponible.

Veuillez inclure :

- la version ou le commit affecté ;
- les étapes pour reproduire ;
- l'impact ;
- si un secret, un token ou des identifiants pourraient être impliqués.

N'incluez **pas** de véritables clés API, de tokens Facebook/Instagram, de fichiers `.env` ou le contenu du magasin de secrets chiffré dans votre signalement.

## Versions prises en charge

Seule la dernière version sur la branche `main` est actuellement prise en charge.

## Secrets

BookSocial Studio stocke les secrets locaux de manière **chiffrée** dans le répertoire de données configuré. Les utilisateurs sont responsables de la protection de leur `.env`, de leur répertoire de données, de leurs sauvegardes et de leur environnement de déploiement. En cas d'exécution en dehors de `localhost` (par ex. sur un VPS), activez toujours l'authentification et placez l'application derrière un reverse proxy HTTPS.
