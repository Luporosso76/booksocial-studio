# Guía de configuración

Esta es una guía paso a paso para instalar **BookSocial Studio** y convertir tu primer libro en contenido para redes sociales. No requiere experiencia previa en desarrollo — copia los comandos tal como están escritos.

BookSocial Studio se ejecuta **localmente en tu propia máquina**. Tus libros, imágenes y tokens permanecen en tu computadora en una base de datos SQLite local.

> Las capturas de pantalla en esta guía son marcadores de posición etiquetados como **TODO screenshot** — se agregarán más adelante.

---

## 1. Requisitos previos

Necesitas **uno** de los siguientes:

- **Docker** (recomendado para el inicio más fácil) — [instalar Docker](https://docs.docker.com/get-docker/), o
- **Node.js 22 o 24** para una instalación manual (probado en ambos en CI; `.nvmrc` fija la 24).

Para publicar en Facebook también necesitarás (más adelante, opcional al principio):

- Una **página de Facebook** y una cuenta de **Meta Business**.
- Tu propia **app de Meta** (creación gratuita en [developers.facebook.com](https://developers.facebook.com)).

Puedes explorar toda la aplicación (importar un libro, generar contenido, renderizar videos) **sin** Facebook.

---

## 2. Inicio rápido

### Opción A — Docker (recomendado)

```bash
git clone <your-fork-url> booksocial-studio
cd booksocial-studio
cp server/.env.example server/.env   # edit later if needed
docker compose up -d --build
```

Luego abre **http://localhost:8771**. Tus datos persisten en la carpeta `./data` junto al proyecto.

> Nota: la **generación de imágenes** por IA local (GPU) no está disponible dentro de Docker. En el contenedor, la aplicación se ejecuta en modo de **solo subida** para las imágenes, o puedes conectarla a un proveedor de imágenes en la nube (ver paso 4).

![Inicio de BookSocial Studio](docs/img/home.png)
*TODO screenshot*

### Opción B — Manual (Node)

```bash
git clone <your-fork-url> booksocial-studio
cd booksocial-studio
cp server/.env.example server/.env   # edit later if needed

# Build the frontend once
cd web && npm ci && npm run build

# Build and start the server (serves the API + the built frontend on :8770)
cd ../server && npm ci && npm run build && npm run start:prod
```

Abre **http://localhost:8770**.

> Si cambias la versión de Node, el módulo nativo de la base de datos podría necesitar ser recompilado:
> `cd server && npm rebuild better-sqlite3`.

Para el desarrollo activo (hot reload) ejecuta `npm run dev` en `server/` y `web/` en su lugar — consulta [`CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## 3. Elegir y configurar un proveedor de texto de IA

BookSocial Studio utiliza un **motor de texto** de IA para analizar tu libro y escribir las publicaciones. Eliges un proveedor configurando `CONTENT_PROVIDER` en `server/.env`. El valor predeterminado es `none`. El motor de texto se ejecuta mediante una herramienta **CLI** con suscripción en la que inicias sesión, o un servidor **Ollama** local — no hay modo de API HTTP por token para texto. Referencia completa: [`docs/PROVIDERS.md`](PROVIDERS.md).

### Usar una suscripción existente (CLI)

Si ya pagas por ChatGPT, Claude o un plan de Gemini, la aplicación puede manejar la herramienta CLI correspondiente (`opencode`, `codex`, `claude`, `agy`) que gestiona la autenticación con tu cuenta — configura `CONTENT_PROVIDER` en consecuencia, o inicia sesión desde **Settings → AI** en la aplicación con el botón **Authenticate**. Consulta [`docs/PROVIDERS.md`](PROVIDERS.md).

```bash
CONTENT_PROVIDER=codex   # o opencode | claude | agy
```

### Empezar con Ollama (local y gratuito, sin clave)

Instala [Ollama](https://ollama.com), descarga un modelo (`ollama pull llama3.1`), luego:

```bash
CONTENT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.1
```

> También puedes elegir el proveedor más adelante desde la pantalla **Settings → AI** de la aplicación.

Reinicia el servidor después de editar `server/.env`.

---

## 4. Imágenes: con o sin GPU

Las imágenes de escenas generadas por IA son **opcionales**. El motor de imágenes se selecciona mediante `IMAGE_PROVIDER`:

- **¿Sin GPU?** Usa un proveedor en la nube — `IMAGE_PROVIDER=openai` o `IMAGE_PROVIDER=google` (estos usan `OPENAI_API_KEY` / `GOOGLE_API_KEY`, la clave de tu cuenta de OpenAI / Google para imágenes).
- **¿Ningún proveedor de imágenes?** Déjalo en el valor por defecto `auto` (o configura `none`). La aplicación se ejecuta en modo de **solo subida**: tú proporcionas las imágenes, y todo lo demás (texto, programación, publicación) funciona.
- **¿Tienes una GPU local?** Configura `IMAGE_PROVIDER=local` (stable-diffusion.cpp / Z-Image). Esto **no** está disponible dentro de Docker — usa una instalación manual.

Detalles y cambio de modelos: [`docs/PROVIDERS.md`](PROVIDERS.md).

---

## 5. Conectar Facebook (opcional)

Publicar en una página de Facebook requiere **tu propia app de Meta** y un **token de acceso de página**. La aplicación nunca solicita tu contraseña de Facebook — pegas un token que generas tú mismo.

Necesitarás una **página de Facebook** y una cuenta de **Meta Business**.

### 5.1 Crear una app de Meta

1. Ve a [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App**.
2. Elige una app de tipo **Business** y vincúlala a tu portafolio empresarial.

### 5.2 Crear un token de usuario del sistema en Business Suite

1. Abre **Meta Business Suite** → **Settings** → **Business settings** → **Users → System users**.
2. Crea (o selecciona) un **System User** y haz clic en **Add assets** → asigna tu **Página** con control total.
3. Haz clic en **Generate new token**, selecciona tu app y concede los permisos de página a continuación.
4. Copia el token generado (una cadena larga). El token de un **System User** es de larga duración — mantenlo privado.

Permisos típicos a conceder:

- `pages_show_list` — lista las páginas que administras.
- `pages_read_engagement` — lee el contenido/interacción de la página.
- `pages_manage_posts` — crea y publica contenido en la página.

> La aplicación también lee/actualiza algunos metadatos de la página, lo que puede requerir `pages_manage_metadata`. Si una acción de la página falla con un error de permisos, añade el alcance faltante y regenera el token.

### 5.3 Pegar el token en la aplicación

1. En BookSocial Studio, abre la pantalla **Connection**.
2. Pega el token de tu usuario del sistema en el campo del token y confirma.
3. La aplicación llama a Facebook para listar las páginas que administras y te permite conectar una.

Tu token se guarda **encriptado en reposo** en `secrets.enc` dentro de la carpeta de datos — nunca se hace commit ni se envía a ningún lado excepto a la API Graph de Facebook.

![Pantalla de conexión](docs/img/connection.png)
*TODO screenshot*

> Eres responsable de cumplir con los Términos de la Plataforma de Meta y las políticas de publicación automatizada.

---

## 6. Pruébalo ahora — importa el libro de muestra

Una novela de muestra lista para usar viene con el repositorio: [`samples/the-keeper-of-tides.md`](../samples/the-keeper-of-tides.md).

1. Abre la pantalla **Books** y elige **Import book**.
2. Selecciona `samples/the-keeper-of-tides.md` (un archivo Markdown).
3. Deja que se ejecute el análisis — obtendrás una sinopsis, personajes y una biblia visual.
4. Abre el **Planner** para crear un plan semanal de publicaciones, reels y stories.

![Importar libro](docs/img/import.png)
*TODO screenshot*

Este es un texto original y ficticio proporcionado para que puedas probar la aplicación sin usar tus propios libros.

---

## 7. Dónde residen tus datos y cómo hacer copias de seguridad

Todo se almacena bajo el **directorio de datos** (`BOOKSOCIAL_DATA_DIR`, por defecto `./data` dentro de la carpeta del proyecto, ignorado por git; Docker mapea el mismo `./data`):

```
<data>/booksocial.sqlite   # the database
<data>/books/              # imported .md books
<data>/media/              # uploaded & generated images / video
<data>/music/              # per-book music tracks
```

Los secretos (tokens de Facebook, claves de API de IA) se mantienen **encriptados** en `secrets.enc` dentro de la carpeta de datos (AES-256-GCM). La clave de encriptación es `BOOKSOCIAL_SECRET_KEY` si está configurada, de lo contrario es una `secret.key` generada automáticamente (modo 0600) en la misma carpeta.

**Copia de seguridad = copiar la carpeta de datos.** Para mover la aplicación a otra máquina, copia esta carpeta. Para empezar de cero, detén la aplicación y elimina (o renombra) la carpeta.

---

## Solución de problemas

- **El servidor no se inicia / error del proveedor de texto** — asegúrate de que `CONTENT_PROVIDER` sea uno de `opencode`, `codex`, `claude`, `agy` u `ollama`, y de que la CLI correspondiente esté instalada y autenticada (o cambia a `ollama`). Reinicia tras editar.
- **Errores de `better-sqlite3` después de cambiar de Node** — ejecuta `cd server && npm rebuild better-sqlite3`.
- **No se generan imágenes** — esto es lo esperado en Docker / sin una GPU. Usa un proveedor de imágenes en la nube o sube tus propias imágenes. Consulta [`docs/PROVIDERS.md`](PROVIDERS.md).
- **Falla la conexión de Facebook** — vuelve a comprobar los permisos del token (sección 5.2) y que el System User tenga la página asignada.

Siguiente: [`docs/PROVIDERS.md`](PROVIDERS.md) · [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) · [`CONTRIBUTING.md`](../CONTRIBUTING.md)
