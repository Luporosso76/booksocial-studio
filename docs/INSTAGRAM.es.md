# Integración con Instagram

Este documento describe el soporte de Instagram construido sobre la integración con Facebook: publicación de Reels/Stories, y las pestañas de Facebook/Instagram con administración y estadísticas (insights) por cuenta. Las rutas de archivo a continuación se refieren a la estructura de la aplicación (`server/src/...`, `web/src/...`).

## Visión general

Instagram se modela como un **objetivo de publicación secundario asociado a una página de Facebook**. Cada página de Facebook conectada puede tener una cuenta de Instagram Business vinculada (`instagram_business_account`); cuando está presente, su id se almacena en caché en la página y desbloquea las funciones de Instagram.

Se añadieron dos capacidades:

1. **Publicación** de Reels y Stories (video 9:16) en Instagram.
2. **Administración e insights**: una pestaña de Facebook/Instagram tanto en la pantalla de *Administración de página* como en la de *Insights*, mostrando contenido multimedia de IG, comentarios y métricas de la cuenta.

## Modelo de publicación

Instagram **no tiene una API de programación nativa**. Para mantener la paridad con la programación nativa de Facebook, cada elemento de Instagram es un **trabajo local separado**: una fila `scheduled_post` con `platform = 'instagram'`, vinculada a su gemelo de Facebook (`linked_post_id`) y compartiendo la misma hora programada. El `publishScheduler` interno lo publica a su hora programada (el servidor debe estar en ejecución).

- Solo los **Reels y Stories con un video 9:16 renderizado** son elegibles.
- El subtítulo refleja el texto visual del elemento de Facebook (las Stories lo ignoran).
- La creación del trabajo es **idempotente** (`idempotency_key = ig:<fbPostId>`), por lo que alternar "Publish also on Instagram" dos veces no crea duplicados.

### Flujo de subida reanudable (Instagram Graph API)

La publicación de un video utiliza el protocolo de subida reanudable de Instagram, validado en vivo:

1. `POST /<igUserId>/media?upload_type=resumable&media_type=REELS|STORIES&caption=<enc>`
   → `{ id: containerId }`
2. `POST https://rupload.facebook.com/ig-api-upload/<ver>/<containerId>` con encabezados `Authorization: OAuth <pageToken>`, `offset: "0"`, `file_size: "<bytes>"`, `Content-Type: application/octet-stream`, body = bytes del video → `{ success: true }`
3. Sondear `GET /<containerId>?fields=status_code` hasta `FINISHED` (`ERROR`/`EXPIRED` → fallo)
4. `POST /<igUserId>/media_publish?creation_id=<containerId>` → `{ id: igMediaId }`

El token es siempre el **Page token** (almacenado de forma encriptada en `secrets.enc` bajo la clave `fb.page.<pageId>`), el cual debe incluir los scopes de Instagram. Nunca se registra en los logs.

## Pestañas de administración e insights

Tanto `web/src/screens/GestionePaginaScreen.tsx` (administración de página) como `web/src/screens/InsightsScreen.tsx` (insights) obtuvieron una pestaña de plataforma **Facebook / Instagram** de nivel superior. La pestaña de Instagram se muestra **solo cuando la página seleccionada tiene una cuenta de Instagram vinculada** (`igUserId != null`).

El panel de Instagram (`web/src/components/InstagramPanel.tsx`) tiene tres sub-pestañas:

- **Posts & comments** — contenido multimedia publicado de IG (Reels/Posts/Stories) con recuentos de likes y comentarios; expande un elemento para leer sus comentarios y **responder / ocultar / eliminar** (las respuestas están anidadas).
- **Scheduled** — trabajos de Instagram pendientes (las filas `scheduled_post` con `platform = 'instagram'` vinculadas a elementos programados de Facebook).
- **Account** — información del perfil (nombre de usuario, biografía, seguidores/seguidos/recuento de publicaciones, foto de perfil) e insights de la cuenta.

En la pantalla de Insights, la pestaña de Instagram expone los totales de la cuenta de IG además de los insights de la cuenta por métrica.

## El perfil de la cuenta es de solo lectura

La Instagram Graph API expone el nodo IG User como **solo lectura**: `biography`, `name`, `username`, `website` y `profile_picture_url` pueden ser **leídos** pero **no hay un endpoint de actualización**. A diferencia de las páginas de Facebook (editables a través de `pages_manage_metadata`), los campos del perfil de Instagram solo se pueden cambiar desde la aplicación de Instagram. Por lo tanto, la pestaña Account es informativa por diseño.

## Insights de la cuenta (degradación elegante)

Los insights de la cuenta se obtienen **por métrica**, porque las métricas de Instagram son inconsistentes entre versiones:

- Cada métrica se intenta primero con `metric_type=total_value`, y luego recurre como alternativa al formato heredado de series temporales; si ambos fallan, la métrica se reporta como `null` con un error, **sin** hacer fallar las otras métricas.
- Métricas predeterminadas: `reach`, `profile_views`, `follower_count`.
- Notas (API v21): `reach` soporta tanto `total_value` como series temporales; las series temporales de `profile_views` están obsoletas (solo `total_value` es significativo); `follower_count` **no** es una métrica `total_value` (el fallback de series temporales es la ruta correcta) y es omitida por Instagram para cuentas con < 100 seguidores. `impressions` está obsoleta.

El período de la UI se asigna a los períodos de insights de la cuenta de Instagram: `month → days_28`, `week → week`, de lo contrario `day`.

## Resolución y almacenamiento en caché del id de la cuenta de Instagram

`igUserId` se resuelve mediante `GET /<pageId>?fields=instagram_business_account{id}` y se almacena en caché en la fila de la página (`facebook_page.ig_user_id`). Se rellena:

- **en el momento de la conexión** (best-effort) al guardar una página, y
- **de forma diferida** en `GET /pages` para cualquier página donde todavía sea null (los fallos se ignoran para que la lista de páginas nunca se rompa).

El helper compartido `resolveIgContext(pageId)` devuelve el Page token + `igUserId` para las rutas de IG, resolviendo y guardando en caché el id a petición, y devuelve un claro 503 cuando la página no tiene una cuenta de Instagram vinculada.

## Endpoints REST añadidos

Todos los endpoints reflejan a sus equivalentes de Facebook y viven bajo la página:

| Método y ruta | Propósito |
| --- | --- |
| `GET /posts/:id/instagram` *(POST)* | Crear el trabajo gemelo en IG de un Reel/Story de Facebook |
| `DELETE /posts/:id/instagram` | Eliminar el trabajo gemelo de IG (si aún no se ha publicado) |
| `GET /pages/:id/ig/account` | Información del perfil de la cuenta de IG Business |
| `GET /pages/:id/ig/insights?period=day` | Insights de la cuenta de IG (degradación por métrica) |
| `GET /pages/:id/ig/media?limit=25` | Contenido multimedia publicado en IG |
| `GET /pages/:id/ig/media/:mediaId/comments` | Comentarios (con respuestas anidadas) de un contenido multimedia |
| `POST /pages/:id/ig/comments/:commentId/reply` | Responder a un comentario |
| `POST /pages/:id/ig/comments/:commentId/hide` | Ocultar/mostrar un comentario (`hide=true|false`) |
| `DELETE /pages/:id/ig/comments/:commentId` | Eliminar un comentario |

`GET /pages` expone el `igUserId` por página (utilizado por la UI para decidir si mostrar la pestaña de Instagram).

## Configuración de la aplicación Meta

Para utilizar estas funciones, la aplicación Meta necesita el producto **"Instagram API with Facebook Login"** y los permisos `instagram_basic` + `instagram_content_publish`. Cada cuenta de Instagram Business debe asignarse al usuario del sistema, y el Page token debe regenerarse con los scopes de Instagram. El mapeo 1 a 1 es **una página de Facebook ↔ una cuenta de Instagram Business**.
