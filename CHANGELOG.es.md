# Changelog

Todos los cambios notables de este proyecto están documentados en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
y este proyecto se adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-20

Primera versión pública, autoalojable.

### Añadido

- Imagen **Docker** de contenedor único (backend + frontend compilado) y configuración de `docker compose`.
- **Análisis de libros y biblia visual**: importa un libro en Markdown, extrae el perfil y los personajes, y construye un canon por libro (apariencia, vestuarios, accesorios, personajes secundarios, tarjetas de escenas por capítulo).
- **Generación de contenido** para un plan semanal: posts, reels y stories con citas, hashtags y enlaces; la lógica de búsqueda de ideas y humanización está integrada en los prompts, por lo que funciona en cualquier proveedor.
- **Programación y publicación** en **Facebook** (programación nativa para posts; un programador interno para reels/stories) e **Instagram** (Reels/Stories para cuentas vinculadas de Instagram Business).
- **Gestión de Facebook e Instagram**: posts, comentarios, configuración de la página y estadísticas de la cuenta, con una pestaña de Facebook/Instagram que se muestra cuando una Página tiene una cuenta de Instagram vinculada.
- **Proveedores de IA conectables**: claves de API (OpenAI, Anthropic, Google, cualquier endpoint compatible con OpenAI, Ollama local) o CLIs de suscripción (opencode, Codex, Gemini) con un flujo Authenticate; motores de imágenes conectables (local `sd-cli`, OpenAI, Google, Stability, Black Forest Labs/FLUX, Replicate, fal.ai) con un respaldo de solo subida.
- Pantalla de **Configuración**; los secretos se mantienen cifrados en reposo en `secrets.enc` (AES-256-GCM).
- **i18n (IT/EN)** para la interfaz web (UI), con detección y cambio de idioma.
- **Basic Auth opcional** para proteger la aplicación cuando es autoalojada.
- **Documentación**: manual de usuario, configuración, proveedores de IA, Instagram, arquitectura y contribución.

[0.1.0]: https://github.com/Luporosso76/booksocial-studio/releases/tag/v0.1.0
