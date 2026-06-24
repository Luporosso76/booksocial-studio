# Changelog

Todos los cambios notables de este proyecto están documentados en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
y este proyecto se adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-06-24

### Añadido

- **Fichas de marketing por capítulo**: una comprensión narrativa persistente de cada capítulo (resumen
  sin spoilers, núcleo emocional, pregunta al lector, citas seguras y ángulos de post puntuados) que
  fundamenta la generación de posts, creada una vez por capítulo y reutilizada.
- **Clasificador de ideas con rotación de ángulos**: los posts usan los ángulos previamente validados del
  capítulo y los rotan, de modo que un capítulo reutilizado da un ángulo distinto cada vez.
- **Juez de calidad**: una pasada final que descarta los posts genéricos (los que servirían para
  cualquier libro) y los regenera una vez con una indicación específica.
- **Editor de presencia de personajes por capítulo**: define manualmente en qué capítulos aparece un personaje.
- **Imágenes reproducibles**: la semilla (seed) de generación se guarda con cada imagen generada.

### Cambiado

- **Posts más fundamentados**: una checklist interna obliga a cada post a usar un detalle concreto del
  capítulo, con citas reales sin spoilers y un lenguaje más anti-genérico y anti-IA.
- **La ropa y los objetos de escena siguen la dirección artística del libro**: la ropa de
  práctica/ceremonia/época y los objetos clave descritos en las directrices visuales ahora se respetan en
  el canon y en las fichas de escena de los capítulos.
- **Las cuotas del planificador son el total del período elegido** (semana/mes/personalizado), sin
  escalado oculto; el planificador ahora garantiza que cada contenido solicitado se coloque, incluso con pocos horarios.
- **Panel de imágenes de escena rediseñado**: secciones de Capítulos/Personajes plegables y diseño más compacto.

- El juez de calidad evalúa los posts también frente a la ficha de marketing del capítulo, no solo frente al extracto, evitando rechazos injustos.
- Las citas de la ficha de marketing se verifican contra el texto real del capítulo; las inventadas o parafraseadas se descartan.

### Corregido

- Reimportar un libro con texto modificado ahora invalida sus fichas de marketing por capítulo, de modo que los posts se basan en el nuevo texto.
- La generación de posts se bloquea cuando la ficha del libro no está actualizada respecto al texto importado, para que los posts nunca se basen en una ficha obsoleta.
- La edición de los hashtags de un borrador ahora se guarda correctamente.
- Los posts, reels e historias sin visual permanecen como borradores en lugar de fallar al publicar.

## [0.2.0] - 2026-06-23

### Añadido

- **Instrucciones de prompt adicionales editables** (Ajustes): texto libre añadido a los prompts de texto e imagen,
  tanto globales como por libro, además del núcleo diseñado (las reglas del núcleo nunca se sobrescriben).
- **Dashboard**: un **calendario** semanal + mensual de contenido programado con colores por libro, KPI compactos
  por página (Facebook + Instagram) y una tarjeta de actividad en segundo plano con progreso y temporizadores en vivo.
- **Proveedores de IA centrados en CLI**: generación de texto e imagen a través de CLI de suscripción (opencode, Codex,
  Gemini) junto con claves API, con un proveedor/modelo de respaldo dedicado y un panel de ajustes de IA de cuatro pestañas.
- **Pestañas de formato de imagen** (vertical 9:16 / cuadrado / horizontal) con recuentos en la biblioteca de imágenes de un libro.
- Acción **Fast NLP re-index**: volver a extraer citas reales sin volver a ejecutar el análisis completo.
- Campo **Key moment** en las tarjetas de escena por capítulo, utilizado para anclar el sujeto de la imagen.
- Interfaz de usuario y documentación en **cinco idiomas** (IT/EN/FR/ES/DE).

### Cambiado

- **Menos repetición**: las publicaciones, reels y stories ahora eligen las citas, imágenes, música
  y capítulos menos utilizados recientemente entre ejecuciones, por lo que los planes semanales consecutivos y las
  regeneraciones recorren todo el material en lugar de repetirlo.
- **Prompts de IA reescritos en inglés**, mientras que el resultado generado siempre permanece en el idioma del libro.
- **Canon visual más preciso**: la apariencia y la vestimenta de los personajes se basan en pasajes reales del libro,
  con anclaje de etnia/país/época y palabras clave de ropa tomadas del vocabulario real del libro.
- Un paso adicional de **humanización anti-IA** en las publicaciones generadas, aplicado en el idioma de salida.

### Corregido

- Eliminar un borrador ahora libera sus citas, imágenes, música y capítulo para su reutilización inmediata.
- Las publicaciones de Facebook programadas de forma nativa se concilian como "publicadas" después de su hora programada (no más
  entradas atascadas como "programadas en el pasado").
- Las publicaciones publicadas se pueden ocultar del dashboard sin eliminarlas.

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

[0.2.0]: https://github.com/Luporosso76/booksocial-studio/releases/tag/v0.2.0
[0.1.0]: https://github.com/Luporosso76/booksocial-studio/releases/tag/v0.1.0
