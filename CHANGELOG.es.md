# Changelog

Todos los cambios notables de este proyecto están documentados en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
y este proyecto se adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-07-01

### Añadido
- **Proveedor de imágenes Gemini (Nano Banana)**: un nuevo proveedor de imágenes `gemini` que usa la API de Google `:generateContent`, con clave API dedicada, lista de modelos obtenida en vivo del proveedor y estilo de imagen por proveedor.
- **Prompts de imagen adaptados al modelo**: la IA de texto ahora escribe el prompt de imagen específicamente para el modelo de destino — un prompt estructurado por secciones para Gemini, un único párrafo compacto y positivo para el motor local Z-Image, o el párrafo predeterminado — mejorando la fidelidad en cada motor.
- **Generador de imagen libre**: endpoints de generación de imágenes independientes del libro (generar / estado / archivo / cancelar).
- **Listas de modelos en vivo**: para los proveedores de imágenes Gemini y OpenAI la lista de modelos se obtiene de la API del proveedor (con un respaldo mínimo sin conexión) en lugar de una lista codificada.
- **Estilo de imagen por proveedor**: medium/intensidad/viveza (y para el local steps/cfg) se configuran por proveedor, con estilos principal y de respaldo independientes.
- **Cobertura de apariencia multilingüe**: la deduplicación de los rasgos canónicos del personaje ahora funciona para libros en italiano, inglés, francés, español y alemán.

### Cambiado
- **Código de prompt independiente del libro**: todo contenido visual específico de un libro o dominio se ha eliminado del código fuente; las directivas visuales, la apariencia de los personajes, la ropa y el equipamiento residen ahora solo en la base de datos y son la única fuente usada para construir los prompts de imagen. Se eliminaron el seed codificado de las directivas visuales y el antiguo sistema `VISUAL_DOMAINS`.
- **Proveedor de imágenes `google` → `gemini`**: se eliminaron el antiguo motor Imagen (`:predict`) y el campo muerto `googleImageModel`.
- **Prompts Z-Image**: compactos, solo positivos (para evitar artefactos de negación con guidance baja) y con el sujeto, la pose y el equipamiento al inicio, para un mejor renderizado local.
- **Traducción de prompts**: los prompts de imagen ahora se traducen al inglés detectando automáticamente el idioma de origen (cualquier idioma → inglés).

### Corregido
- **Perfil de prompt Gemini** enrutado por familia de modelo (flash/pro) en lugar de una coincidencia de versión exacta.
- **Timeout** en la petición de la lista de modelos Gemini.
- **Respaldo visible** (ya no silencioso) cuando la traducción del prompt de imagen no está disponible.
- Robustez menor: análisis numérico de `dashboardHidden`; purga del mapa de trabajos del generador libre.

## [0.5.5] - 2026-06-28

### Añadido
- **Ruta relativa estricta al escribir**: cuando una ruta de archivo se guarda en la base de datos, ahora se almacena estrictamente relativa al directorio de datos mediante `toDataRelativeStrict()`, rechazando cualquier ruta fuera de él (complementa `resolveInsideDataDir` en lectura).
- **Validación de contenido de audio**: los audios subidos se comprueban ahora por magic bytes (OGG, FLAC, WAV, MP3/ID3, MP4/M4A, AAC), igual que las imágenes — una extensión/MIME de audio con contenido no-audio se rechaza.
- **Pruebas de backend ampliadas**: registro de proveedores del motor de texto (soportados vs no), auth/sesión (login, bloqueo, invalidación de sesiones), migraciones de BD (creación, idempotencia, versión de esquema), más los casos path-strict y audio.

### Cambiado
- **Config de proveedores alineada**: `server/.env.example` ya no lista proveedores de API de texto no soportados (OpenAI/Anthropic/Google/OpenAI-compatible) para el motor de texto — solo CLI (opencode/Codex/Claude/agy) + Ollama — y usa `CONTENT_PROVIDER=none` por defecto. Las claves de OpenAI/Google se documentan solo en los proveedores de imágenes.
- **Default de Docker alineado**: `docker-compose.yml` ahora usa `CONTENT_PROVIDER=none` por defecto (antes `opencode`), coherente con el README y el runtime.
- **Docs de producción con el runtime compilado**: las instrucciones manuales de producción (en los 5 idiomas) ahora compilan y ejecutan `node dist/index.js` (`npm run build` + `npm run start:prod`) en lugar de `npm start` (tsx), igual que la imagen Docker.

## [0.5.4] - 2026-06-28

### Añadido
- **Atuendos dedicados para flashbacks y sueños**: los personajes reciben ahora atuendos canónicos distintos para las escenas de recuerdo/flashback y de sueño, coherentes entre representaciones.
- **Atuendos por personaje acotados**: los atuendos se generan solo para los escenarios de los capítulos en los que el personaje aparece realmente, no para todo el libro.
- **Validación de subidas**: los archivos de libros, imágenes y audio se comprueban por tamaño, extensión, tipo MIME y (para imágenes) magic bytes; los límites son configurables mediante variables de entorno.
- **Seguridad de rutas**: los archivos servidos desde una ruta de la base de datos se resuelven estrictamente dentro del directorio de datos, bloqueando rutas absolutas o recorridos `../`.
- **Inicio de sesión reforzado**: límite de tasa con bloqueo temporal tras intentos repetidos, duración de sesión configurable e invalidación de todas las sesiones al cambiar la contraseña.
- **Límite de tasa general de la API** por cliente.
- **Comprobación de la configuración al arrancar**: error claro si el directorio de datos no admite escritura, advertencias si falta ffmpeg o si no hay proveedor de texto configurado.
- **Runtime de Docker compilado**: el contenedor ejecuta ahora el JavaScript compilado (`node dist/index.js`) en lugar de las fuentes TypeScript.
- **Documentación**: modos de uso admitidos (local / LAN / público) y orientación sobre la clave secreta y las copias de seguridad.

### Cambiado
- **Proveedores de IA de texto**: solo se admiten los CLI por suscripción (opencode, Codex, Claude, agy) y Ollama local. Los proveedores de API de texto no admitidos (OpenAI/Anthropic/Google) se eliminaron de la configuración, la interfaz de ajustes y la documentación; seleccionar uno obsoleto ahora falla con un error claro en lugar de no hacer nada en silencio.
- **Cookie de sesión**: el atributo `Secure` se establece solo cuando la conexión es realmente HTTPS, de modo que el inicio de sesión funciona por HTTP en local/desarrollo.
- **Clave de cifrado**: se registra una advertencia cuando la clave se almacena dentro del directorio de datos; se recomienda definir `BOOKSOCIAL_SECRET_KEY` fuera del volumen de datos.
- **Rutas del backend** reorganizadas en módulos por dominio (sin cambios de endpoint ni de comportamiento).

### Corregido
- Las sesiones de inicio de sesión ya no se pierden por HTTP debido al atributo `Secure` de la cookie.

## [0.5.3] - 2026-06-28

### Añadido
- **Estilo de imagen por proveedor**: elige el estilo visual de las imágenes generadas (novela gráfica, pictórico, fotorrealista, acuarela, concept art y más) con intensidad de estilización y viveza de color ajustables, configurables de forma independiente para cada proveedor de imágenes — y por separado para el proveedor principal y su proveedor de reserva, de modo que cada uno renderice con su propio estilo.

### Cambiado
- **Los prompts de imagen conservan toda la dirección artística**: el generador de prompts ahora transcribe por completo las reglas visuales del libro (equipo, postura, técnica) en lugar de resumirlas.
- **Física por escena**: las reglas de realismo de un capítulo ahora se aplican solo a los objetos realmente presentes en la escena, de modo que las reglas sobre objetos ausentes ya no se filtran en la imagen.
- Indicaciones de vestuario del prompt consolidadas para mayor coherencia.

### Corregido
- **Campo del token de Facebook**: el navegador ya no rellena automáticamente la contraseña de inicio de sesión del admin en el campo del token de acceso de Facebook en la página de Conexión.

## [0.5.2] - 2026-06-28

### Cambiado
- **Generación de imágenes — uso más inteligente de la biblia visual**: el prompt de la escena ahora se construye en DOS pasos. Primero, el modelo elige qué único momento del capítulo ilustrar, nombrando el sujeto y solo los personajes y objetos realmente presentes en ese momento. Luego el prompt final de la imagen se escribe usando SOLO el canon de esa escena. Antes, cada personaje, objeto y directriz de todo el capítulo se vertía en un único prompt, de modo que personas y objetos ajenos se colaban en la imagen, los personajes se duplicaban o se fundían y los detalles clave se diluían. El flujo en dos pasos mantiene cada escena enfocada: las personas correctas, el equipo correcto, la pose correcta — e imágenes distintas a lo largo de un capítulo.
- **Las poses deportivas y de acción** ahora se representan con su postura dinámica completa en lugar de forzarlas a estar erguidas.

## [0.4.0] - 2026-06-26

### Añadido
- **Autenticación**: un inicio de sesión integrado protege la app. En el primer arranque las credenciales son `admin` / `12345678` y se exige cambiar la contraseña; la contraseña se guarda con hash. Cierra sesión desde la barra lateral. (Sustituye la antigua HTTP Basic Auth opcional.)
- **HTTPS**: el servidor puede servir por HTTPS. Monta tu certificado en Docker (`TLS_CERT_PATH`/`TLS_KEY_PATH`), o se genera uno autofirmado; si no, recurre a HTTP. Consulta el README.
- **Diseño móvil**: toda la interfaz es ahora adaptable — barra lateral plegable con menú de hamburguesa y pantallas adaptadas a móviles.
- **Generar imágenes de sueño/flashback**: el generador puede apuntar al sueño o al flashback de un capítulo, o elegir al azar entre presente/sueño/flashback, no solo la escena presente.
- **Edad por personaje en el flashback**: en un flashback puedes fijar la edad exacta de cada personaje para esa escena, para que personajes con edades distintas se rendericen correctamente.

- **Edad y etnia de los personajes**: ahora campos dedicados y editables (ya no diluidos en la descripción física). Se indican explícitamente en cada prompt de imagen, para que la edad aparente y la etnia se mantengan coherentes en todas las ilustraciones.
- **Prenda distintiva**: una prenda o accesorio que un personaje lleva siempre (p. ej. un sombrero) se define una vez y se representa en cada escena, sobre el atuendo de la escena.
- **Momentos de escena (sueño / flashback)**: cada ficha de capítulo registra la naturaleza de la escena principal (normal, sueño o flashback) más los sueños o flashbacks secundarios, editables en pestañas dedicadas. Las escenas de sueño tienen un aspecto onírico; los flashbacks rejuvenecen a los personajes.
- **Uso de imágenes**: cada imagen muestra cuántas veces se ha usado y en qué (reels, historias, posts), con un filtro de usadas / sin usar.
- **Uso de música**: las pistas muestran la misma insignia de uso (reels / historias) con filtro usadas / sin usar.
- **Subpestañas de imágenes por formato y capítulo**: la biblioteca se filtra por formato y, dentro de un formato, por capítulo, con recuentos — y puedes generar imágenes solo para ese capítulo.
- **Limpieza automática de medios publicados**: los vídeos de reels/historias/posts se eliminan 24 horas después de publicarse en Facebook e Instagram, para liberar espacio. Los archivos renderizados están ahora en una subcarpeta `media/renders/`.

### Cambiado
- **Generación de imágenes flashback**: el interruptor de flashback en el panel de generación ahora es un simple on/off — renderiza usando las edades por personaje de la ficha de capítulo; se eliminó el campo manual "años más joven".

- **Mayor coherencia de los personajes en los prompts de imagen**: edad, etnia, complexión y cabello se indican siempre; cuando dos o más personajes comparten encuadre se mantienen distintos y nunca se intercambian; las poses son naturales y erguidas; un personaje solicitado aparece siempre.

### Corregido
- **Extracción de la ficha del capítulo**: un capítulo que contiene tanto una escena real como un sueño/flashback ahora conserva AMBOS (la escena de vigilia como principal, más el sueño/flashback como momento aparte) en vez de reducir todo el capítulo al sueño; los capítulos largos de varias secciones ya no pierden un sueño/flashback contenido en su propia sección.

- **Sin sujetos fuera de lugar**: lo que aparece solo en un sueño, un recuerdo o una expresión (y homónimos como la maniobra "tortuga" del surf) ya no se cuela en la escena real del capítulo.

## [0.3.1] - 2026-06-24

### Añadido

- **Cancelar elementos en cola individualmente**: ahora puedes cancelar un solo lote en espera en la cola
  de generación de imágenes, además de «Cancelar todo».

### Cambiado

- **Generación de imágenes serializada**: las generaciones de libros distintos y las regeneraciones ahora
  se ponen en cola y se ejecutan de una en una en lugar de en paralelo; el indicador de actividad
  distingue «en curso» de «en cola».

### Corregido

- **Panel de actividad al frente**: el menú de actividad de la cabecera ahora aparece por encima de la
  cuadrícula de imágenes al desplazarse.

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
