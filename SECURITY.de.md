# Sicherheitsrichtlinie

## Melden einer Schwachstelle

Bitte **erstellen Sie keine öffentlichen Issues** für Schwachstellen, Token-Leaks, die Offenlegung von Anmeldeinformationen oder alles, was Benutzerdaten gefährden könnte.

Melden Sie diese privat über GitHub: Öffnen Sie im Repository **Security → Report a vulnerability** ("Private vulnerability reporting"). Dadurch bleibt der Bericht vertraulich, bis ein Fix verfügbar ist.

Bitte fügen Sie Folgendes bei:

- betroffene Version oder Commit;
- Schritte zur Reproduktion;
- Auswirkungen;
- ob ein Secret, Token oder Anmeldeinformationen involviert sein könnten.

Fügen Sie in Ihrem Bericht **keine** echten API-Schlüssel, Facebook/Instagram-Tokens, `.env`-Dateien oder den Inhalt des verschlüsselten Secrets-Speichers bei.

## Unterstützte Versionen

Derzeit wird nur die neueste Version auf dem `main`-Branch unterstützt.

## Secrets

BookSocial Studio speichert lokale Secrets **verschlüsselt** im konfigurierten Datenverzeichnis. Benutzer sind für den Schutz ihrer `.env`, des Datenverzeichnisses, der Backups und der Deployment-Umgebung verantwortlich. Bei einer Ausführung außerhalb von `localhost` (z. B. auf einem VPS) aktivieren Sie immer die Authentifizierung und platzieren Sie die App hinter einem HTTPS-Reverse-Proxy.
