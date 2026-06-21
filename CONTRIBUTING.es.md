# Contribuir a BookSocial Studio

Gracias por tu interés en mejorar BookSocial Studio. Este es un proyecto **local-first, source-available** y las contribuciones son bienvenidas: correcciones de errores, nuevos proveedores de IA y documentación.

> **Nota sobre la licencia:** el proyecto se publica bajo la **PolyForm Noncommercial License 1.0.0** (ver [`LICENSE`](LICENSE)). Es *source-available*, no una licencia "open source" de la OSI: puedes usarlo, modificarlo y compartirlo para cualquier propósito **no comercial**, pero **el uso comercial no está permitido**. Al contribuir, aceptas que tus contribuciones se proporcionan bajo estos mismos términos.

---

## Estructura del repositorio

```
server/          Backend: Node + TypeScript + Hono, embedded SQLite (better-sqlite3)
  src/content/   Text engine (analysis, canon, post generation) — ContentEngine + createEngine()
  src/media/     Image engine + rendering (Satori/resvg, ffmpeg/Remotion) — ImageEngine + createImageEngine()
  src/scheduler/ Background publish scheduler
  src/services/  Higher-level orchestration (week planning, publishing, page connect)
  src/db/        SQLite schema, pool, repositories
  src/secrets/   Encrypted file store for tokens/keys (secrets.enc)
  src/facebook/  Facebook Graph API client
web/             Frontend: React + Vite + Tailwind
  src/screens/   Top-level screens (Books, Planner, Scheduled, Insights, Connection, Page management, Settings…)
docs/            Documentation (MANUAL, SETUP, PROVIDERS, INSTAGRAM, ARCHITECTURE)
samples/         Sample book to try the app
```

Consulta [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) para ver cómo encajan estas partes.

---

## Ejecución en desarrollo

Requisito previo: **Node.js 22 o 24** (ver `.nvmrc`).

```bash
# Backend (hot reload, tsx watch on :8770)
cd server && npm ci && npm run dev

# Frontend (Vite dev server, separate terminal)
cd web && npm ci && npm run dev
```

Copia `server/.env.example` a `server/.env` y configura al menos un proveedor de texto — consulta [`docs/SETUP.md`](docs/SETUP.md) y [`docs/PROVIDERS.md`](docs/PROVIDERS.md).

---

## Estilo de código y validaciones

- **TypeScript en todas partes.** Sigue los patrones existentes; mantén los cambios pequeños y enfocados.
- **Mantén los tipos sin errores (green).** Antes de abrir un PR:

```bash
# Backend
cd server && npm run typecheck   # tsc --noEmit, must be clean

# Frontend
cd web && npm run build          # tsc -b && vite build, must succeed
```

- Respeta las convenciones existentes de nombres, manejo de errores (los motores de texto lanzan `ContentError`; los motores de imagen devuelven `null` en caso de fallo) y convenciones de importación en el archivo que estás editando.
- No hagas commit de secretos, de la carpeta de datos ni de los archivos de compilación (`web/dist`, `node_modules`).

---

## Añadir un nuevo proveedor de IA

Los motores de texto y de imagen son los dos puntos de extensión del proyecto, cada uno con una pequeña interfaz y un registro central basado en `switch`. Añadir un proveedor significa implementar la interfaz y añadir un `case`: no hay cambios en el código que los llama.

- **Proveedor de texto:** implementa `ContentEngine` y regístralo en `createEngine()` (`server/src/content/engine.ts`).
- **Proveedor de imagen:** implementa `ImageEngine` y regístralo en `createImageEngine()` (`server/src/media/imageEngine.ts`).

Añade cualquier nueva configuración a `server/src/config.ts` (leída desde env) y documenta las variables de entorno en `server/.env.example`. Guía completa con código de ejemplo: **[`docs/PROVIDERS.md`](docs/PROVIDERS.md) → "Añadir un nuevo proveedor en código".**

---

## Proponer cambios (Pull Requests)

1. Haz un fork y crea una rama temática (`fix/...`, `feat/...`, `docs/...`).
2. Realiza tu cambio con el diff viable más pequeño.
3. Ejecuta las validaciones mencionadas arriba (typecheck, web build) y verifica localmente.
4. Abre un PR usando la [plantilla de PR](.github/PULL_REQUEST_TEMPLATE.md); enlaza el issue relacionado y describe cómo lo probaste.

Para errores (bugs) e ideas, abre un issue primero usando las plantillas de [reporte de bug](.github/ISSUE_TEMPLATE/bug_report.md) o [solicitud de funcionalidad](.github/ISSUE_TEMPLATE/feature_request.md).

---

## Reportar problemas de seguridad o tokens

Si un cambio podría filtrar tokens o claves, **no** incluyas secretos reales en el issue. Describe el problema y los pasos para reproducirlo utilizando marcadores de posición (placeholders).
