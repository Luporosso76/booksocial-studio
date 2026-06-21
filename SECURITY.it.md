# Policy di Sicurezza

## Segnalare una Vulnerabilità

Si prega di **non aprire issue pubbliche** per vulnerabilità, leak di token, esposizione di credenziali o qualsiasi cosa possa compromettere i dati degli utenti.

Segnala privatamente tramite GitHub: apri **Security → Report a vulnerability** ("Private vulnerability reporting") nel repository. Questo mantiene la segnalazione confidenziale fino alla disponibilità di un fix.

Includi:

- versione o commit interessato;
- passaggi per la riproduzione;
- impatto;
- eventuale coinvolgimento di secret, token o credenziali.

**Non** includere vere chiavi API, token di Facebook/Instagram, file `.env` o il contenuto del secrets store crittografato nella segnalazione.

## Versioni Supportate

Attualmente è supportata solo l'ultima versione sul branch `main`.

## Secret

BookSocial Studio memorizza i secret locali in modo **crittografato** nella data directory configurata. Gli utenti sono responsabili della protezione del proprio `.env`, della data directory, dei backup e dell'ambiente di deployment. Quando eseguito al di fuori di `localhost` (es. su una VPS), abilita sempre l'autenticazione e posiziona l'app dietro un reverse proxy HTTPS.
