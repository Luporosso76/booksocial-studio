# Política de seguridad

## Informar sobre una vulnerabilidad

Por favor, **no abras issues públicos** para vulnerabilidades, filtraciones de tokens, exposición de credenciales o cualquier cosa que pueda comprometer los datos de los usuarios.

Informa de forma privada a través de GitHub: abre la sección **Security → Report a vulnerability** ("Private vulnerability reporting") del repositorio. Esto mantiene el informe confidencial hasta que haya una solución disponible.

Por favor, incluye:

- versión afectada o commit;
- pasos para reproducirlo;
- impacto;
- si algún secreto, token o credencial puede estar involucrado.

**No** incluyas API keys reales, tokens de Facebook/Instagram, archivos `.env` ni el contenido del almacén de secretos encriptados en tu informe.

## Versiones soportadas

Actualmente solo está soportada la última versión en la rama `main`.

## Secretos

BookSocial Studio almacena los secretos locales **encriptados** en el directorio de datos configurado. Los usuarios son responsables de proteger su `.env`, directorio de datos, backups y entorno de despliegue. Cuando se ejecute fuera de `localhost` (por ejemplo, en un VPS), habilita siempre la autenticación y coloca la aplicación detrás de un proxy inverso HTTPS.
