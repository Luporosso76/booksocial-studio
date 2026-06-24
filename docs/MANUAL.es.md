# Manual de Usuario de BookSocial Studio

## Visión General

BookSocial Studio convierte un libro en contenido social consciente de spoilers para Páginas de Facebook y cuentas de Instagram Business vinculadas. Te ayuda a importar y analizar manuscritos, generar borradores y contenido visual, programar publicaciones, publicar contenido, gestionar comentarios y revisar estadísticas.

La aplicación es de funcionamiento local (local-first). Tus datos viven en una base de datos SQLite local y archivos locales. Los secretos como los tokens de Facebook y las claves API de IA se almacenan encriptados en `secrets.enc` dentro de la carpeta de datos, no en la base de datos.

La interfaz es bilingüe, italiano e inglés. Los elementos principales de navegación son: **Books**, **Planner**, **Scheduled**, **Insights**, **Connection**, **Page management**, y **Settings**.

Para la instalación y primera configuración, consulta [SETUP.md](./SETUP.md). Para detalles de proveedores de IA, consulta [PROVIDERS.md](./PROVIDERS.md). Para la configuración y comportamiento específico de Instagram, consulta [INSTAGRAM.md](./INSTAGRAM.md). Para la máquina local probada y notas de generación de imágenes, consulta [TESTED-ON.md](./TESTED-ON.md).

## Conceptos Principales

| Concepto | Significado |
| --- | --- |
| Books | Manuscritos importados en Markdown. La aplicación analiza cada libro en un perfil, personajes, capítulos y una biblia visual. |
| Pages | Páginas de Facebook conectadas. Una Página también puede tener una cuenta de Instagram Business vinculada. |
| Drafts | Contenido social generado que aún no ha sido programado ni publicado. |
| Scheduled posts | Contenido en cola para publicación futura. Algunos elementos se programan de forma nativa en Facebook, mientras que otros son manejados por el programador interno de la aplicación. |
| Text provider | El proveedor de IA utilizado para escribir publicaciones, análisis de libros, perfiles, personajes, hashtags y otras tareas de texto. |
| Image provider | El proveedor o motor local utilizado para generar imágenes de escenas y contenido visual. |
| Visual bible | Un conjunto de referencias visuales estructuradas para el libro, incluyendo la apariencia de los personajes, tarjetas de escena, atuendos, utilería, detalles del mundo, personajes secundarios y presencia de personajes por capítulo. |

### Modelo de Publicación

| Tipo de contenido | Cómo se programa | Qué debe estar ejecutándose al momento de publicar |
| --- | --- | --- |
| Publicaciones nativas de Facebook | Programado en Facebook | Facebook las publica incluso si BookSocial Studio está apagado. |
| Reels y Stories de Facebook | Programador interno | El servidor de BookSocial Studio debe estar ejecutándose. |
| Elementos de Instagram | Programador interno | El servidor de BookSocial Studio debe estar ejecutándose. |

Instagram no tiene programación nativa en esta aplicación. Cada elemento programado de Instagram es un trabajo local separado vinculado a su gemelo de Facebook.

## Tabla de Contenidos

- [Books](#books)
- [Análisis del Libro y la Biblia Visual](#book-analysis-and-the-visual-bible)
- [Detalle del Libro](#book-detail)
- [Conexión](#connection)
- [Gestión de Páginas](#page-management)
- [Planificador](#planner)
- [Programado](#scheduled)
- [Estadísticas](#insights)
- [Configuración: IA](#settings-ai)
- [Configuración de la Graph API: Meta](#graph-api-setup-meta)
- [Flujos de Trabajo Comunes](#common-workflows)
- [Notas Importantes](#important-notes)

## Books

La pantalla de **Books** es tu biblioteca. Enumera los libros importados como tarjetas y te da el punto de entrada para importar, abrir, probar o eliminar libros.

### Qué hace

Cada tarjeta de libro muestra el título del libro, autor, insignia de idioma y recuento de hashtags base. Si la biblioteca está vacía, la pantalla ofrece dos puntos de partida: importar un libro o probar el libro de muestra incluido, **The Keeper of the Tides**.

### Qué puedes hacer

| Acción | Cómo funciona |
| --- | --- |
| Importar un libro | Importar un archivo Markdown con la extensión `.md`. |
| Establecer metadatos opcionales | Durante la importación, puedes establecer el autor y el idioma. |
| Abrir un libro | Abrir la tarjeta del libro para gestionar el perfil, capítulos, personajes, enlaces, imágenes y música. |
| Probar el libro de muestra | Importar el libro de muestra incluido, **The Keeper of the Tides**. |
| Eliminar un libro | Eliminar un libro de la biblioteca. |

### Notas

- Solo se pueden importar archivos Markdown con la extensión `.md`.
- El libro aparece inmediatamente después de la importación.
- El análisis de IA se ejecuta en segundo plano después de la importación.
- El análisis requiere un proveedor de texto configurado. Si no hay un proveedor de texto configurado, el análisis falla con un error claro.
- El progreso es consultado por la aplicación, y una notificación emergente confirma la finalización.

## Análisis del Libro y la Biblia Visual

Después de importar un libro, BookSocial Studio lo analiza y construye una estructura consciente de spoilers utilizada para la generación de publicaciones y consistencia de imágenes.

### Qué hace

El análisis extrae capítulos, crea un perfil generado por IA con sinopsis, géneros y tono, e identifica personajes. La biblia visual es un flujo de trabajo en segundo plano, reanudable y de mejor esfuerzo. Si un paso falla, los otros pasos aún pueden ejecutarse.

Los pasos canónicos de la biblia visual son:

| Orden | Paso | Propósito |
| --- | --- | --- |
| 1 | Apariencia del personaje | Crea una descripción física estable por personaje para imágenes consistentes. |
| 2 | Tarjetas de escena del capítulo | Crea por capítulo la ubicación, entorno, objetos principales y secundarios, personajes presentes y reglas de física o realismo. Estas impulsan los prompts de imágenes. |
| 3 | Atuendos | Crea ropa canónica por personaje, con variantes por escenario recurrente. |
| 4 | Utilería y mundo | Extrae vehículos y objetos recurrentes, además del lado de conducción, izquierdo o derecho, inferido del libro. |
| 5 | Personajes secundarios | Escanea figuras incidentales por capítulo y asigna apariencias fijas. Este paso es lento. |
| 6 | Presencia de personajes | Registra en qué capítulos aparece cada personaje. Esto se usa para filtrar la generación de imágenes por personaje. |

### Qué puedes hacer

| Acción | Dónde | Resultado |
| --- | --- | --- |
| Seguir el progreso de importación | Modal de importación | Muestra los tres pasos de importación: Leer, Analizar, Guardar. |
| Revisar el estado de la biblia visual | Panel de biblia visual en la pantalla del libro | Muestra cada paso como pendiente, en ejecución, completado o fallido, con un contador de completado/total. |
| Construir toda la biblia visual | Panel de biblia visual | Ejecuta todos los pasos de la biblia visual. |
| Ejecutar un paso | Panel de biblia visual | Ejecuta solo el paso seleccionado de la biblia visual. |

### Notas

- La biblia visual se construye en segundo plano.
- El proceso es reanudable y de mejor esfuerzo.
- Una falla en un paso de la biblia visual no bloquea a los demás.
- El paso de presencia de personajes se utiliza más tarde al elegir personajes para la generación de imágenes.

## Detalle del Libro

La pantalla de detalle del libro es donde gestionas los datos operativos para un libro. Tiene seis pestañas: **Profile**, **Chapters**, **Characters**, **Links**, **Images** y **Music**.

### Qué hace

Esta pantalla te permite editar los datos del libro que controlan la generación de contenido: título, autor, hashtags, directivas visuales, Páginas asociadas, capítulos, personajes, enlaces del libro, imágenes generadas y datos del libro relacionados con la música.

### Qué puedes hacer

| Pestaña | Acciones |
| --- | --- |
| Profile | Renombrar título y autor; editar hashtags base; configurar directivas visuales; editar utilería y mundo; revisar personajes secundarios; asociar el libro con Páginas conectadas. |
| Chapters | Incluir o excluir capítulos; editar tarjetas de escena; regenerar tarjetas de escena; guardar cambios en la tarjeta de escena. |
| Characters | Agregar, editar y eliminar personajes; generar apariencias; generar atuendos; revisar presencia en capítulos de solo lectura. |
| Links | Agregar, editar y eliminar enlaces del libro. |
| Images | Generar imágenes de escena; ver imágenes en una caja de luz; regenerar imágenes; subir imágenes manualmente; regenerar imágenes seleccionadas en lote. |
| Music | Acceder a la pestaña de Música del libro. |

### Pestaña Profile

La pestaña **Profile** controla la configuración a nivel de libro que se aplica en todo el contenido generado.

| Campo o área | Qué significa | Editable |
| --- | --- | --- |
| Título | Título del libro. | Sí |
| Autor | Autor del libro. | Sí |
| Perfil generado por IA | Sinopsis, géneros y tono. | No |
| Insignia anti-spoiler | Indica que el comportamiento anti-spoiler está activo. | No |
| Hashtags base | Hashtags aplicados a cada publicación para el libro. | Sí |
| Dominios visuales | Alternancias de directivas visuales predefinidas por libro. | Sí |
| Instrucciones de arte en texto libre | Instrucciones visuales adicionales, traducidas automáticamente al inglés para prompts de imágenes. | Sí |
| Utilería y mundo | País, lado de conducción y lista de objetos recurrentes. | Sí |
| Personajes secundarios | Lista de figuras incidentales de la biblia visual. | Sí |
| Páginas asociadas | Páginas conectadas vinculadas a este libro. | Sí |

La generación siempre se dirige a una Página asociada, así que vincula el libro a las Páginas que deseas usar para la generación de contenido.

### Pestaña Chapters

La pestaña **Chapters** controla la disponibilidad a nivel de capítulo y los datos para prompts de imágenes.

| Acción | Resultado |
| --- | --- |
| Incluir un capítulo | Permite que el capítulo se use en lotes de imágenes. |
| Excluir un capítulo | Omite el capítulo en lotes de imágenes. |
| Editar una tarjeta de escena | Cambia la ubicación, entorno, objetos, personajes o reglas de física. |
| Regenerar una tarjeta de escena | Recrea la tarjeta de escena del capítulo. |
| Guardar una tarjeta de escena | Almacena tus ediciones. |

### Pestaña Characters

La pestaña **Characters** controla la información del elenco y la consistencia visual.

| Campo o acción | Propósito |
| --- | --- |
| Nombre | Nombre del personaje. |
| Rol | Rol en el libro. |
| Trabajo | Trabajo del personaje. |
| Personaje | Descripción del personaje. |
| Apariencia física | Apariencia estable utilizada para consistencia de imágenes. |
| Notas | Notas adicionales del personaje. |
| Atuendos por contexto | Definiciones de ropa para escenarios recurrentes. |
| Generar apariencias | Crea o actualiza las descripciones de apariencia de los personajes. |
| Generar atuendos | Crea o actualiza definiciones de atuendos. |
| Presencia | Lista de solo lectura de los capítulos donde aparece el personaje. |

### Pestaña Links

La pestaña **Links** almacena los enlaces del libro que pueden ser utilizados por canal y política.

| Campo | Significado |
| --- | --- |
| Tipo de canal | El canal para el que está destinado el enlace. |
| Política de uso | Cómo debe usarse el enlace. |
| URL | El destino del enlace. |
| Etiqueta | Etiqueta de enlace legible por humanos. |
| Indicador predeterminado | Marca un enlace como el predeterminado. |

### Pestaña Images

La pestaña **Images** gestiona las imágenes de escena generadas y subidas.

| Acción | Detalles |
| --- | --- |
| Generar imágenes de escena | Elige la cantidad por capítulo, relación de aspecto, capítulos, personajes opcionales y configuraciones opcionales de flashback. |
| Dejar capítulos vacíos | Usa una dispersión automática anti-spoiler. |
| Destacar personajes | Elige opcionalmente personajes para incluir. |
| Usar flashback | Solicita opcionalmente una edad más joven y atuendos de época para ese lote. |
| Seguir generación | Mira el contador en vivo y el temporizador por imagen. |
| Poner en cola más lotes | Agrega lotes de generación adicionales. |
| Cancelar generación | Detiene un lote en ejecución o en cola. |
| Abrir caja de luz | Ver imagen a tamaño completo y metadatos. |
| Regenerar | Regenera la imagen seleccionada. |
| Regenerar con cambios | Agrega instrucciones adicionales o configuraciones de flashback. |
| Regenerar desde capítulo | Elige personajes del elenco del capítulo. |
| Regenerar en lote | Regenera en todas las imágenes seleccionadas. |
| Subir manualmente | Agrega tu propia imagen a la biblioteca. |

La caja de luz de la imagen muestra los metadatos: capítulo o capítulos de origen, personajes, prompt, marca de tiempo y nota de catálogo.

### Notas

- La generación de imágenes de escena se ejecuta secuencialmente: una imagen a la vez en una sola GPU.
- La publicación de borradores puede depender de un contenido visual listo. Los borradores con contenido visual aún renderizándose no se pueden publicar hasta que estén listos.
- Los hashtags base se aplican a cada publicación del libro.
- Las directivas visuales se traducen automáticamente al inglés para los prompts de imágenes.

## Conexión

La pantalla de **Connection** conecta BookSocial Studio a Páginas de Facebook mediante el uso de un token de Página de Usuario de Sistema de Meta.

### Qué hace

Almacena los tokens de Página encriptados en `secrets.enc` y te permite elegir qué Páginas debe gestionar la aplicación. Los tokens nunca se almacenan en la base de datos.

### Qué puedes hacer

| Acción | Resultado |
| --- | --- |
| Pegar un token de acceso de Página | Inicia el flujo de conexión. |
| Conectar | La aplicación enumera las Páginas gestionadas por ese token. |
| Seleccionar Páginas | Elige qué Páginas debe gestionar BookSocial Studio. |
| Guardar | Almacena las conexiones de Página seleccionadas. |
| Revisar Páginas conectadas | Cada Página guardada muestra una insignia de **Conectado**. |
| Eliminar una Página | Elimina una Página guardada de la aplicación. |
| Desconectar todo | Borra los tokens del almacenamiento encriptado. |

### Notas

- Al guardar, la aplicación detecta automáticamente la cuenta de Instagram Business vinculada a cada Página a través de `instagram_business_account`.
- Si la cuenta de Instagram no se encuentra inmediatamente, se resuelve de forma diferida más adelante.
- La pestaña de Instagram en la gestión de Páginas aparece solo cuando una Página tiene una cuenta de Instagram Business vinculada.
- Para detalles de configuración de Instagram, consulta [INSTAGRAM.md](./INSTAGRAM.md).

## Gestión de Páginas

La pantalla **Page management** es donde operas las Páginas conectadas después de la configuración. Tiene pestañas de plataforma en la parte superior.

### Qué hace

La pantalla te permite gestionar contenido publicado de Facebook, comentarios, contenido programado nativamente en Facebook, configuraciones de Página, comentarios de medios de Instagram, trabajos programados internos de Instagram e información de la cuenta de Instagram.

La pestaña de la plataforma **Facebook** siempre está disponible. La pestaña de la plataforma **Instagram** aparece solo si la Página seleccionada tiene una cuenta de Instagram Business vinculada.

### Qué puedes hacer

| Plataforma | Área | Acciones |
| --- | --- | --- |
| Facebook | Publicaciones y comentarios | Revisar publicaciones publicadas, editar texto, fijar o desfijar, ver y gestionar comentarios, eliminar publicaciones. |
| Facebook | Cajón de crear publicación | Publicar ahora o programar una publicación nativa de Facebook con texto, enlace opcional y fecha opcional. |
| Facebook | Programado en Facebook | Ver contenido programado nativamente en Facebook. |
| Facebook | Configuración de Página | Editar información, descripción, sitio web, contacto e imagen de portada, y luego guardar en Facebook. |
| Instagram | Publicaciones y comentarios | Revisar Reels, Posts y Stories publicados con recuentos de me gusta y comentarios; gestionar comentarios. |
| Instagram | Programado | Revisar trabajos internos de Instagram pendientes vinculados a Reels o Stories de Facebook programados. |
| Instagram | Cuenta | Ver información del perfil. |

### Facebook: Publicaciones y Comentarios

La subpestaña **Posts & comments** enumera las publicaciones de Facebook publicadas con miniatura, fecha, extracto e insignias como **fijado** o **no publicado**.

| Acción | Resultado |
| --- | --- |
| Editar texto | Actualiza el texto de la publicación. |
| Fijar o desfijar | Cambia si la publicación está fijada. |
| Ver comentarios | Abre la gestión de comentarios para la publicación. |
| Responder | Agrega una respuesta de comentario anidada. |
| Ocultar o mostrar | Cambia la visibilidad del comentario. |
| Me gusta | Da me gusta a un comentario. |
| Eliminar comentario | Elimina un comentario. |
| Eliminar publicación | Elimina la publicación. |

El cajón **Create post** incluye una vista previa en vivo estilo Facebook y requiere confirmación explícita. Si la fecha está vacía, la publicación se publica inmediatamente. Si se proporciona una fecha, se programa nativamente en Facebook.

### Facebook: Programado en Facebook

Esta subpestaña muestra contenido programado nativamente en Facebook.

### Facebook: Configuración de Página

Esta subpestaña te permite editar campos de la Página y guardarlos en Facebook.

| Campo | Resultado |
| --- | --- |
| Información o descripción | Actualiza el campo de texto de la Página. |
| Sitio web | Actualiza el sitio web de la Página. |
| Contacto | Actualiza la información de contacto de la Página. |
| Imagen de portada | Actualiza la imagen de portada de la Página. |

### Instagram: Publicaciones y Comentarios

La subpestaña de medios de Instagram muestra Reels, Posts y Stories publicados con recuentos de me gusta y comentarios.

| Acción | Resultado |
| --- | --- |
| Expandir un elemento multimedia | Abre sus comentarios. |
| Responder | Agrega una respuesta de comentario anidada. |
| Ocultar comentario | Oculta un comentario. |
| Eliminar comentario | Elimina un comentario. |

### Instagram: Programado

Esta subpestaña muestra trabajos internos de Instagram pendientes. Estos son los trabajos gemelos de los Reels o Stories de Facebook programados.

### Instagram: Cuenta

Esta subpestaña muestra la información del perfil de Instagram.

| Campo | Editable en BookSocial Studio |
| --- | --- |
| Nombre de usuario | No |
| Biografía | No |
| Recuento de seguidores | No |
| Recuento de seguidos | No |
| Recuento de medios | No |
| Foto | No |

### Notas

- El contenido programado de Facebook que se muestra en **Programado en Facebook** es de solo lectura aquí y debe gestionarse en Facebook.
- Los campos del perfil de Instagram son de solo lectura a través de la API. Cámbialos en la aplicación de Instagram.
- El panel de Instagram aparece solo cuando la Página seleccionada tiene una cuenta de Instagram Business vinculada.

## Planificador

La pantalla **Planner** crea una semana típica, mes o período personalizado de contenido social para una Página y Libro seleccionados.

### Qué hace

Usa cuotas, ventanas de tiempo, el libro seleccionado y la Página seleccionada para generar borradores de forma asíncrona. La aplicación elige días, horas, formatos, evita duplicados y renderiza el contenido visual en segundo plano.

### Qué puedes hacer

| Acción | Detalles |
| --- | --- |
| Elegir una Página | Seleccionar la Página conectada para la que generar. |
| Elegir un Libro | Seleccionar el libro asociado desde el cual generar. |
| Establecer cuotas | Elegir cuántas publicaciones, reels y stories generar en el período elegido (total, no por semana). |
| Establecer ventanas de tiempo | Agregar una hora o un rango de horas por día de la semana. |
| Eliminar ventanas de tiempo | Eliminar ventanas individualmente. |
| Elegir un período | Seleccionar semana, mes o rango de fechas personalizado. |
| Generar | Iniciar un trabajo de servidor asíncrono que crea borradores y renderiza contenido visual. |
| Seguir progreso | Seguir el progreso en vivo como `N/M`. |
| Cancelar | Detener el trabajo de generación. Los borradores creados permanecen. |

### Períodos

| Período | Longitud |
| --- | --- |
| Semana | 7 días; predeterminado. |
| Mes | 28 días. |
| Rango personalizado | Rango de fechas seleccionado por el usuario. |

### Ventanas de Tiempo

| Tipo de ventana | Comportamiento |
| --- | --- |
| Hora única | Publicar dentro de aproximadamente 30 minutos. |
| Rango de tiempo | El motor elige una hora dentro del rango. |
| Sin ventanas | Se aplican los valores predeterminados. |

### Lista de Borradores Generados

Cada tarjeta de borrador generado muestra el tipo, ángulo, formato, estado, hora programada y una vista previa estilo Facebook. La vista previa incluye un desglose de hashtags: base, específicos y finales.

| Acción de borrador | Resultado |
| --- | --- |
| Editar | Cambiar texto, hashtags y fecha/hora. |
| Regenerar | Crea nuevo texto y hashtags, y re-renderiza el contenido visual. La aplicación consulta hasta que esté listo. |
| Eliminar | Elimina el borrador. |
| Publicar ahora | Publica inmediatamente después de la confirmación explícita. |
| Programar publicación | Convierte todos los borradores fechados en el futuro en elementos programados después de la confirmación. |

### Notas

- Reels y Stories son videos verticales en 9:16.
- Las publicaciones son contenido de texto/foto.
- Los borradores cuyo contenido visual aún se está renderizando muestran un marcador de posición.
- **Publish now** está deshabilitado hasta que el contenido visual de un borrador esté listo.
- Al programar en lote, las publicaciones de Facebook se programan de forma nativa en Facebook y pueden publicarse incluso si la aplicación está apagada.
- Reels y Stories se programan a través del programador interno, por lo que el servidor debe estar encendido a la hora programada.
## Scheduled

La pantalla **Scheduled** muestra la cola de publicación interna.

### What it does

Enumera los Reels y Stories que el servidor de BookSocial Studio publicará automáticamente en sus horarios programados.

### What you can do

| Action | Availability | Result |
| --- | --- | --- |
| Publish now | Per item, with confirmation | Publishes the queued item immediately. |
| Remove | Per item, if not yet published | Removes the item from the internal queue. |
| Publish also on Instagram | Facebook Reels and Stories only, 9:16 video | Creates a twin Instagram job with the same time and linked Facebook item. |
| Remove Instagram twin | Items with a twin Instagram job | Removes the linked Instagram job. |

### Notes

- Un banner prominente advierte que el servidor debe estar ejecutándose a la hora programada.
- Si el servidor no se está ejecutando, los Reels, Stories y trabajos de Instagram no se publicarán.
- Las publicaciones nativas de Facebook no son manejadas por esta cola y se publican de forma independiente en Facebook.
- Cuando se publica un elemento de Facebook con un gemelo de Instagram, el servidor también lo publica en Instagram con el mismo texto.

## Insights

La pantalla **Insights** te ayuda a revisar el rendimiento de la Página y la cuenta.

### What it does

Eliges una Página y un período, luego revisas las estadísticas de Facebook y, si están vinculadas, las de Instagram.

### What you can do

| Action | Details |
| --- | --- |
| Pick a Page | Use Page tabs. |
| Pick a period | Choose day, week, or month. |
| View Facebook insights | Available for connected Facebook Pages. |
| View Instagram insights | Available when the Page has a linked Instagram Business account. |
| Compare Pages | Available when two or more Pages are connected. |

### Facebook Insights

| Area | What it shows |
| --- | --- |
| KPI tiles | Followers, likes/fans, reach, engagement. |
| Follower trend chart | Gains in green, losses in red, and net total. |
| Top posts | Top 10 by engagement, with views, reach, reactions, comments, shares, and a link to Facebook. |
| History line chart | Reach and followers over time. |
| Coverage sparkline | Coverage trend. |
| Demographics | Top countries, cities, and gender-age. |
| Page comparison table | Comparison across Pages when two or more Pages are connected. |

### Instagram Insights

| Area | What it shows |
| --- | --- |
| Account KPIs | Followers, following, and media count. |
| Account insights for the period | Reach, profile views, and follower count. |

### Notes

- En la tabla de comparación de Páginas, cada celda se carga de forma independiente.
- Si una Página no se carga en la tabla de comparación, la celda de esa Página muestra `-`.
- Algunas métricas de Instagram pueden no estar disponibles según la cuenta o la versión de la API. La aplicación se degrada elegantemente.

## Settings: AI

La pantalla **Settings** configura el proveedor de texto de IA, el proveedor de imágenes, el modo de imagen y el control de calidad (QA) de imagen opcional.

### What it does

BookSocial Studio utiliza un proveedor de texto conectable para el análisis y la escritura, y un proveedor de imágenes conectable para las imágenes de las escenas. Configuras ambos aquí.

### What you can do

| Action | Result |
| --- | --- |
| Configure text provider | Enables book analysis, post writing, hashtag generation, and related text tasks. |
| Configure image provider | Enables generated scene images and generated draft visuals. |
| Test text connection | Returns success with a sample or a clear error. |
| Test image connection | Returns success with a sample or a clear error. |
| Choose image mode | Select Library or Direct. |
| Enable image QA | Validates generated images and regenerates failed images with backoff. |

### Text Providers

Hay dos familias de proveedores de texto.

| Family | Providers | Authentication and configuration |
| --- | --- | --- |
| Subscription via CLI | opencode, codex (ChatGPT), gemini (Google) | No API key is stored in the app. The panel shows CLI install status, an **Authenticate** button that launches the CLI login, and a **Verify** button that re-checks status. There is an optional model-name field for the CLI. |
| API key | OpenAI and OpenAI-compatible endpoints, Anthropic, Google, Ollama | Enter the API key, optionally set a base URL, and pick the model from a list loaded through **Load models**, with manual fallback. Ollama is local and uses no key. |

Para los proveedores de clave API, las claves se almacenan encriptadas en `secrets.enc`. Una clave introducida una vez para un proveedor se reutiliza, por ejemplo para imágenes del mismo proveedor, y se muestra como ya configurada.

Cuando se necesita un nombre de modelo específico, introduce el modelo que elegiste / el nombre de modelo de tu proveedor.

### Image Providers

| Provider option | Meaning |
| --- | --- |
| local | Uses an on-device engine. See [TESTED-ON.md](./TESTED-ON.md). |
| auto | Uses local if available, otherwise none. |
| none | Disables generated images; use upload-only. |
| OpenAI | Cloud image provider; reuses the shared text key. |
| Google | Cloud image provider; reuses the shared text key. |
| Stability | Cloud image provider with its own key. |
| Black Forest Labs (FLUX) | Cloud image provider with its own key. |
| Replicate | Cloud image provider with its own key. |
| fal.ai | Cloud image provider with its own key. |

El campo del modelo de imagen es de texto libre. Introduce el modelo que elegiste / el nombre de modelo de tu proveedor. No hay ningún modelo de imagen preestablecido.

### Image Mode

| Mode | Behavior |
| --- | --- |
| Library | Generated images go to a reusable library, and you pick images per draft. |
| Direct | The visual is rendered straight onto drafts during week generation. This needs a working image engine. |

### Image QA

Cuando el QA de imagen está habilitado, cada imagen generada se valida y se regenera si no supera la comprobación. Los reintentos utilizan retroceso (backoff).

### Notes

- Anthropic está disponible como proveedor de clave API (sin inicio de sesión por suscripción).
- La autenticación de la CLI de suscripción reside en la propia CLI; no se almacena ningún token de suscripción en BookSocial Studio.
- Para la configuración específica del proveedor, consulta [PROVIDERS.md](./PROVIDERS.md).

## Graph API Setup: Meta

La configuración de Meta es necesaria antes de que BookSocial Studio pueda gestionar Páginas de Facebook o cuentas de Instagram Business vinculadas.

### What it does

La configuración de Meta da a la aplicación acceso a Páginas, publicaciones, comentarios, estadísticas y publicación en Instagram donde esté disponible.

### What you can do

| Area | Requirement |
| --- | --- |
| Facebook | Create a Meta app with Facebook Login. |
| Facebook | Create a System User Page token with permissions to read and manage the Page, posts, comments, and insights. |
| Facebook | Paste the Page token in the **Connection** screen. |
| Instagram | Add the **Instagram API with Facebook Login** product. |
| Instagram | Include `instagram_basic` and `instagram_content_publish`. |
| Instagram | Link the Instagram Business account to the Facebook Page. |
| Instagram | Assign the Instagram Business account to the System User. |
| Instagram | Make sure the Page token carries the Instagram scopes. |

Los permisos de Facebook incluyen ejemplos como `pages_read_engagement`, `pages_manage_posts`, `pages_manage_metadata`, `pages_manage_engagement/comments` y `pages_read_user_content`.

### Notes

- El mapeo de Instagram es una Página de Facebook a una cuenta de Instagram Business.
- Las notas detalladas de Instagram están en [INSTAGRAM.md](./INSTAGRAM.md).

## Common Workflows

### 1. Import and Analyze a Book

1. Abre **Books**.
2. Elige **Import a book**.
3. Selecciona un archivo Markdown `.md`.
4. Opcionalmente, establece el autor y el idioma.
5. Confirma la importación.
6. Espera mientras la aplicación lee, analiza y guarda el libro.
7. Abre el libro cuando aparezca la notificación de finalización.
8. Revisa el perfil, los capítulos, los personajes y el estado de la biblia visual.

### 2. Configure AI Before Importing

1. Abre **Settings**.
2. Elige un proveedor de texto.
3. Autentícate a través de un proveedor CLI o introduce una clave API, según la familia del proveedor.
4. Si usas un proveedor de clave API, usa **Load models** o introduce manualmente el modelo que elegiste / el nombre de modelo de tu proveedor.
5. Ejecuta la acción **Test** de texto.
6. Elige un proveedor de imágenes si deseas imágenes generadas.
7. Introduce el modelo de imagen que elegiste / el nombre de modelo de tu proveedor si es necesario.
8. Ejecuta la acción **Test** de imagen.
9. Elige el modo de imagen **Library** o **Direct**.

### 3. Connect a Facebook Page

1. Abre **Connection**.
2. Pega un token de acceso a la Página del Usuario del Sistema de Meta.
3. Selecciona **Connect**.
4. Revisa las Páginas gestionadas por el token.
5. Selecciona las Páginas que deseas que BookSocial Studio gestione.
6. Selecciona **Save**.
7. Confirma que las Páginas guardadas muestran la insignia **Connected**.
8. Si la Página tiene una cuenta de Instagram Business vinculada, espera la detección automática o la resolución perezosa (lazy resolution).

### 4. Associate a Book with a Page

1. Abre **Books**.
2. Abre el libro.
3. Ve a la pestaña **Profile**.
4. Busca **Associated pages**.
5. Marca las Páginas conectadas que deben estar permitidas para la generación.
6. Guarda la configuración del libro correspondiente.

### 5. Build or Repair the Visual Bible

1. Abre **Books**.
2. Abre el libro.
3. Expande el panel **Visual bible**.
4. Revisa el estado de cada paso y el contador de finalizado/total.
5. Selecciona **Build visual bible** para ejecutar todos los pasos.
6. O ejecuta un solo paso si solo un área necesita trabajo.
7. Revisa los pasos fallidos sin asumir que toda la tubería falló, porque los pasos se hacen con el mejor esfuerzo y son independientes.

### 6. Generate Scene Images

1. Abre el libro.
2. Ve a la pestaña **Images**.
3. Elige el recuento por capítulo.
4. Elige la relación de aspecto.
5. Selecciona los capítulos, o deja los capítulos vacíos para una distribución automática anti-spoiler.
6. Opcionalmente elige los personajes a destacar.
7. Opcionalmente habilita un flashback con una edad más joven y atuendos de época para el lote.
8. Inicia la generación.
9. Observa el contador en vivo y el temporizador por imagen.
10. Abre las imágenes generadas en el lightbox para revisar la salida a tamaño completo y los metadatos.

### 7. Plan a Week of Content

1. Abre **Planner**.
2. Elige una Página.
3. Elige un Libro asociado a esa Página.
4. Establece las cuotas (total para el período elegido) para publicaciones, reels y stories.
5. Añade ventanas de tiempo para los días de semana o déjalas vacías para usar los valores predeterminados.
6. Elige **week** como período.
7. Selecciona **Generate**.
8. Observa el progreso en vivo `N/M`.
9. Revisa cada tarjeta de borrador generada.
10. Edita, regenera, elimina o publica los borradores según sea necesario.

### 8. Schedule Future Drafts

1. Genera borradores en **Planner**.
2. Revisa los borradores y haz ediciones.
3. Asegúrate de que los elementos visuales estén listos para los borradores que requieren elementos visuales.
4. Selecciona **Schedule publishing**.
5. Lee la confirmación que explica la diferencia entre la programación nativa de Facebook y el programador interno.
6. Confirma.
7. Recuerda que las publicaciones de Facebook se programan de forma nativa en Facebook, mientras que los Reels y Stories requieren que el servidor de BookSocial Studio esté en el momento de la publicación.

### 9. Publish a Draft Immediately

1. Abre **Planner**.
2. Encuentra la tarjeta del borrador.
3. Confirma que cualquier elemento visual requerido esté listo.
4. Selecciona **Publish now**.
5. Confirma explícitamente.

### 10. Add Instagram Publishing to a Scheduled Reel or Story

1. Abre **Scheduled**.
2. Encuentra un Reel o Story de Facebook en formato de video 9:16.
3. Habilita **Publish also on Instagram**.
4. Confirma que se crea un trabajo gemelo de Instagram con la misma hora.
5. Mantén el servidor ejecutándose a la hora programada.
6. Elimina el gemelo si ya no deseas que se publique el elemento de Instagram.

### 11. Manage Facebook Comments

1. Abre **Page management**.
2. Selecciona la Página.
3. Abre la pestaña **Facebook**.
4. Abre **Posts & comments**.
5. Elige una publicación.
6. Ver los comentarios.
7. Responde, oculta o muestra, da me gusta o elimina comentarios según sea necesario.

### 12. Review Performance

1. Abre **Insights**.
2. Elige una Página.
3. Elige día, semana o mes.
4. Revisa los mosaicos de KPI de Facebook, gráficos, publicaciones principales, datos demográficos e historial.
5. Si Instagram está vinculado, abre la pestaña de Instagram.
6. Revisa los KPI de la cuenta y las estadísticas de la cuenta disponibles.
7. Si dos o más Páginas están conectadas, revisa la tabla de comparación de Páginas.

## Notas importantes

### Security

- Los tokens de Facebook y las claves API de IA se almacenan encriptados (AES-256-GCM) en `secrets.enc`, nunca en la base de datos.
- La autenticación de la CLI de suscripción reside en la propia CLI. No se almacena ningún token de suscripción en BookSocial Studio.
- Usa la pantalla **Connection** para desconectar Páginas o borrar los tokens de Página almacenados.

### Meta Limits

- Los campos de perfil de Instagram son de solo lectura a través de la API. Cámbialos en la aplicación de Instagram.
- Instagram no tiene programación nativa en esta aplicación, por lo que la publicación de Instagram utiliza trabajos internos.
- Algunas métricas de Instagram son inconsistentes en las distintas versiones de la API y pueden no estar disponibles.
- El mapeo de Instagram es una Página de Facebook a una cuenta de Instagram Business.

### Performance

- El análisis de libros y la generación de semanas son asíncronos y muestran el progreso en vivo.
- La generación de imágenes locales es la parte pesada.
- La generación de imágenes locales se ejecuta en serie, una imagen a la vez en el dispositivo.
- Consulta [TESTED-ON.md](./TESTED-ON.md) para ver la máquina probada y las notas de generación de imágenes locales.

### Server Must Stay On

- El programador interno debe estar ejecutándose a la hora programada para Reels, Stories y elementos de Instagram.
- Si el servidor está apagado a la hora programada, esos elementos programados internamente no se publicarán.
- Las publicaciones nativas de Facebook se publican de forma independiente porque se programan en Facebook.
