# BookSocial Studio

**[English](README.md) · [Italiano](README.it.md) · [Français](README.fr.md) · [Español](README.es.md) · [Deutsch](README.de.md)**

![CI](https://github.com/Luporosso76/booksocial-studio/actions/workflows/ci.yml/badge.svg)
![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue)
![Node](https://img.shields.io/badge/node-22%20%7C%2024-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)

Convierte un libro (Markdown) en **contenido para redes sociales** listo para publicar — posts, reels y stories conscientes de spoilers con texto real, imágenes generadas por IA y música — y prográmalos/publícalos en Facebook e Instagram.

Se ejecuta **de forma local y auto-hospedada**: tus datos permanecen en tu máquina en una base de datos SQLite integrada. Los proveedores de IA son conectables (API key o CLI por suscripción) y la interfaz es bilingüe (italiano/inglés).

## Capturas de pantalla

> La interfaz es bilingüe (italiano/inglés); las capturas están en inglés.

<table>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/dashboard.png" alt="Panel — KPIs, calendario y estado de publicaciones"><br/><sub><b>Panel — KPIs, calendario y estado de publicaciones</b></sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/books.png" alt="Biblioteca — tus libros importados"><br/><sub><b>Biblioteca — tus libros importados</b></sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/book_profile.png" alt="Perfil del libro — análisis IA"><br/><sub><b>Perfil del libro — análisis IA</b></sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/book_chapters.png" alt="Capítulos y fichas de escena"><br/><sub><b>Capítulos y fichas de escena</b></sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/book_characters.png" alt="Personajes y biblia visual"><br/><sub><b>Personajes y biblia visual</b></sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/book_image.png" alt="Imágenes de escena IA"><br/><sub><b>Imágenes de escena IA</b></sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/book_music.png" alt="Biblioteca musical"><br/><sub><b>Biblioteca musical</b></sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/planner.png" alt="Planificador semanal"><br/><sub><b>Planificador semanal</b></sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/page_management.png" alt="Gestión de página (Facebook/Instagram)"><br/><sub><b>Gestión de página (Facebook/Instagram)</b></sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/settings_text_ai.png" alt="Ajustes — IA de texto"><br/><sub><b>Ajustes — IA de texto</b></sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/settings_image_ai.png" alt="Ajustes — IA de imágenes"><br/><sub><b>Ajustes — IA de imágenes</b></sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/settings_content_images.png" alt="Ajustes — Imágenes de contenido"><br/><sub><b>Ajustes — Imágenes de contenido</b></sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/settings_quality_images.png" alt="Ajustes — Control de calidad de imágenes"><br/><sub><b>Ajustes — Control de calidad de imágenes</b></sub></td>
  </tr>
</table>

## Documentación

- 📘 **[Manual de usuario](docs/MANUAL.md)** — guía operativa completa para cada pantalla (carga de libros, planificación, publicación, ajustes).
- 🚀 **[Guía de configuración](docs/SETUP.md)** — instalación, selección de un proveedor de IA, conexión con Facebook (para no desarrolladores).
- 🔌 **[Proveedores de IA](docs/PROVIDERS.md)** — configura y amplía los motores de texto e imagen.
- 📸 **[Integración con Instagram](docs/INSTAGRAM.md)** — publica Reels/Stories, pestañas de Facebook/Instagram, estadísticas de la cuenta.
- 🏗️ **[Arquitectura](docs/ARCHITECTURE.md)** — módulos, flujo de importación → publicación, puntos de extensión.
- 🖥️ **[Probado en nuestro hardware](docs/TESTED-ON.md)** — la máquina/configuración exacta que usamos y su rendimiento realista.
- 🤝 **[Contribución](CONTRIBUTING.md)** — configuración de desarrollo, estilo de código, cómo añadir un proveedor, PRs.

El manual de usuario también está disponible en italiano, español, francés, portugués y alemán
(`docs/MANUAL.it.md`, `.es.md`, `.fr.md`, `.pt.md`, `.de.md`). El inglés es la versión autorizada.

**Pruébalo:** importa el ejemplo incluido `samples/the-keeper-of-tides.md`.

## Características

- 📖 **Análisis del libro**: importa un libro `.md` → sinopsis, géneros, tono, personajes (consciente de spoilers).
- 🎨 **Biblia visual** por libro: apariencia canónica de los personajes, atuendos por contexto, objetos recurrentes (con lado de conducción), personajes secundarios y tarjetas de escena por capítulo — para imágenes consistentes.
- 🖼️ **Imágenes de escena por IA** (opcional, GPU local) + una biblioteca de carga; regeneración por imagen y control de calidad.
- ✍️ **Generación de contenido** para un plan semanal: posts / reels / stories con citas, hashtags y enlaces de venta. La lógica de "encuentra la idea, luego humanízala" está integrada en los prompts, por lo que funciona en **cualquier** proveedor.
- 📅 **Programación y publicación** en Facebook (programación nativa para posts; programador interno para reels/stories).
- 📸 **Instagram**: publica Reels/Stories en cuentas vinculadas de Instagram Business, gestiona medios y comentarios, y lee las estadísticas de la cuenta. Consulta [`docs/INSTAGRAM.md`](docs/INSTAGRAM.md).
- 🎬 Renderizado de video para Reel/story (ffmpeg) con música, efecto Ken-Burns y desvanecimientos de texto.

## Stack

- **Backend**: Node + TypeScript + [Hono](https://hono.dev), **SQLite** integrado (`better-sqlite3`).
- **Frontend**: React + Vite + Tailwind.
- **Media**: Satori/resvg (tarjetas de texto), ffmpeg (video). Generación de imágenes a través de un CLI de difusión local (opcional).

## Requisitos previos

- **Node.js 22 o 24** (probado en ambos en CI; `.nvmrc` fija 24). Los módulos nativos (`better-sqlite3`) se compilan para tu versión de Node — si cambias de versión de Node, ejecuta `npm rebuild better-sqlite3`.
- Un **motor de texto de IA** — elige cualquiera: un **API key** (OpenAI, Anthropic, Google, o cualquier endpoint compatible con OpenAI como OpenRouter/Groq, además de **Ollama** local), o un **CLI por suscripción** en el que inicies sesión con un botón **Authenticate** (`opencode`, Codex/ChatGPT, Gemini). Consulta [`docs/PROVIDERS.md`](docs/PROVIDERS.md).
- Una **app de Meta (Facebook) Business + Página** para publicar: pegas un **System User token** en la pantalla de Conexión (se mantiene cifrado en `secrets.enc`). Consulta [`docs/SETUP.md`](docs/SETUP.md).
- *Opcional*: un **motor de imagen** para las imágenes de escena por IA — `sd-cli` local (GPU), o un proveedor en la nube (OpenAI, Google Imagen, Stability, Black Forest Labs/FLUX, Replicate, fal.ai). Sin uno, la aplicación se ejecuta en modo **solo carga** (**upload-only**) (tú proporcionas las imágenes). Consulta [`docs/PROVIDERS.md`](docs/PROVIDERS.md).

## Inicio rápido (Docker)

```bash
git clone https://github.com/Luporosso76/booksocial-studio.git
cd booksocial-studio
cp server/.env.example server/.env   # edit as needed
docker compose up -d --build
# → http://localhost:8771   (data persists in ./data)
```

> La generación de imágenes (GPU local) **no** está disponible dentro del contenedor — Docker se ejecuta en modo de solo carga (upload-only).

## Inicio rápido (manual / desarrollo)

```bash
# backend
cd server && npm ci && npm run dev      # tsx watch on :8770

# frontend (separate terminal)
cd web && npm ci && npm run dev         # Vite dev server, proxied to the API
```

Producción (un solo proceso sirviendo el frontend compilado):

```bash
cd web && npm ci && npm run build       # outputs web/dist
cd ../server && npm ci && npm start     # serves API + ../web/dist on :8770
```

## Nota de seguridad para servidores remotos

BookSocial Studio está diseñado como una aplicación **local-first, de un solo usuario** y se enlaza a `127.0.0.1` de forma predeterminada. El Docker Compose incluido establece `HOST=0.0.0.0` y mapea un puerto por conveniencia — si lo ejecutas en un VPS o lo expones fuera de localhost, **habilita `AUTH_USER` y `AUTH_PASS`** y colócalo detrás de un proxy inverso con HTTPS. No expongas la aplicación públicamente sin autenticación: puede acceder a los datos del proyecto local, las claves de proveedores de IA y los tokens de publicación en redes sociales.

## Configuración

Toda la configuración se realiza a través de variables de entorno — consulta [`server/.env.example`](server/.env.example). Puntos destacados:

| Variable | Propósito | Predeterminado |
|---|---|---|
| `PORT` / `HOST` | Enlace de la API/servidor | `8770` / `127.0.0.1` |
| `BOOKSOCIAL_DATA_DIR` | carpeta de datos (DB + media + música + libros) | `./data` (dentro del proyecto) |
| `CONTENT_PROVIDER` | motor de texto de IA (o `none`, luego se configura en Settings) | `none` |
| `FB_API_VERSION` | Versión de la Graph API de Meta | `v21.0` |

> **¿Dónde está la carpeta de datos?** Por defecto se encuentra en `./data` dentro de la carpeta del proyecto (es ignorada por git, así que nunca se hace commit) — un solo lugar para la base de datos, media, música y libros. Establece `BOOKSOCIAL_DATA_DIR` para ponerla en cualquier otro lugar (se recomienda una ruta absoluta para producción). La configuración de Docker incluida usa `BOOKSOCIAL_DATA_DIR=/data` mapeado a `./data`, por lo que coincide con el valor predeterminado.

Elige tu proveedor de texto y modelo en **Settings → AI**, o establécelos a través de las variables de entorno `*_MODEL` correspondientes — consulta [`server/.env.example`](server/.env.example) y [`docs/PROVIDERS.md`](docs/PROVIDERS.md).

## Datos y almacenamiento

Todo reside bajo el **directorio de datos** (`BOOKSOCIAL_DATA_DIR`), independientemente de dónde esté instalada la aplicación:

```
<data>/booksocial.sqlite   # the database (SQLite)
<data>/books/              # imported .md books
<data>/media/              # uploaded & generated images/video
<data>/music/              # per-book music tracks
```

Para hacer una copia de seguridad = copia la carpeta de datos. Mover la aplicación = mover la carpeta. Los **Secretos** (tokens de Facebook, API keys de IA) se almacenan de forma **cifrada** aquí en `secrets.enc`; los inicios de sesión de CLI por suscripción residen en el CLI.

## Limitaciones

- **Generación de imágenes** se ejecuta localmente en una GPU por defecto (`sd-cli`); hay backends en la nube (OpenAI, Google Imagen, Stability, Black Forest Labs/FLUX, Replicate, fal.ai) disponibles, y sin ninguno de ellos la aplicación se degrada a **solo carga** (upload-only). La generación local es lenta sin una GPU discreta — consulta [`docs/TESTED-ON.md`](docs/TESTED-ON.md).
- **Un solo usuario, local-first** (sin multi-tenancy). Autenticación HTTP Básica opcional a través de `AUTH_USER`/`AUTH_PASS`; se enlaza a `127.0.0.1` por defecto.
- Las API keys de proveedores de IA y la conexión con Meta se configuran en **Settings** (se mantienen cifradas en `secrets.enc`) o a través de `.env`.
- No se incluye música — proporciona tu propio audio libre de derechos para reels y stories.

## Descargo de responsabilidad

Eres responsable de los libros que importas (utiliza contenido propio o sobre el que tengas derecho de uso) y de cumplir con los Términos de la Plataforma de Meta y las políticas de publicación automatizada. Este proyecto se proporciona tal cual (as-is).

## Licencia

**Licencia PolyForm Noncommercial 1.0.0** — de uso, modificación, ejecución y uso compartido libre para cualquier propósito **no comercial** (personal, investigación, educación, organizaciones sin fines de lucro, instituciones públicas). **El uso comercial no está permitido.** Consulta [`LICENSE`](LICENSE).

Esta es una licencia de *código fuente disponible* (source-available), no una licencia de "código abierto" (open source) según OSI (las licencias open-source no pueden restringir el uso comercial). Para licencias comerciales, contacta al autor.

---

*`server/nlp/` es una pasada previa opcional de NLP en Python (ejecuta `server/nlp/setup.sh` para crear su venv).*
