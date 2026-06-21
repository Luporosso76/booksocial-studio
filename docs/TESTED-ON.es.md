# Probado en nuestro hardware

## Resumen

Esta es la máquina y configuración de referencia que los mantenedores usaron para desarrollar y probar BookSocial Studio. Tus resultados pueden variar, especialmente para la generación local de imágenes.

## Especificaciones de la máquina

| Componente | Configuración probada |
| --- | --- |
| OS | Ubuntu 26.04 LTS |
| Kernel | Linux 7.0 |
| CPU | AMD Ryzen 7 6800H, 8 núcleos / 16 hilos |
| RAM | 26 GiB |
| GPU | AMD Radeon 680M integrada, iGPU RDNA2 "Rembrandt" |
| Controlador de GPU/API | Vulkan a través de RADV |
| GPU dedicada | Ninguna |
| Entorno de ejecución | Node.js, el servicio se ejecuta en v24, se compila en v22 |
| Base de datos | SQLite, un solo archivo |

Los pasos de instalación están documentados por separado en [SETUP.md](./SETUP.md).

## Generación local de imágenes

### Resumen de configuración

Las imágenes de las escenas de los libros se generaron en el dispositivo con `sd-cli` de `stable-diffusion.cpp`, ejecutando Z-Image-Turbo en la iGPU integrada AMD Radeon 680M a través de Vulkan.

La división probada fue:

| Componente | Dispositivo |
| --- | --- |
| Codificador de texto | CPU |
| VAE | CPU |
| Difusión | GPU integrada a través de `vulkan0` |

La configuración predeterminada del backend fue:

```bash
SDCPP_BACKEND="te=cpu,vae=cpu,diffusion=vulkan0"
```

La generación se ejecuta en serie: una imagen a la vez en una sola iGPU.

La configuración de muestreo probada fue:

| Ajuste | Valor |
| --- | --- |
| Pasos | 8 |
| Escala CFG | 1.0 |
| Muestreador | Euler |
| Atención rápida | Activado |
| Descarga a la CPU | Activado, para caber en la memoria de la iGPU |

### Archivos de modelo

| Propósito | Archivo |
| --- | --- |
| Modelo de difusión | `z_image_turbo-Q8_0.gguf` |
| LLM codificador de texto | `qwen_3_4b-Q8_0.gguf` |
| VAE | `ae_bf16.safetensors` |

### Variables de entorno

| Variable | Propósito |
| --- | --- |
| `SDCPP_DIR` | Apuntar a un directorio personalizado de `stable-diffusion.cpp` |
| `SDCPP_CLI` | Apuntar a un binario personalizado de `sd-cli` |
| `SDCPP_BACKEND` | Cambiar la división del backend |
| `SDCPP_ZIMAGE_DIR` | Apuntar al directorio del modelo Z-Image |
| `SDCPP_ZIMAGE_MODEL` | Apuntar al archivo del modelo de difusión |
| `SDCPP_ZIMAGE_LLM` | Apuntar al archivo del LLM codificador de texto |
| `SDCPP_ZIMAGE_VAE` | Apuntar al archivo VAE |
| `SDCPP_TIMEOUT_MS` | Tiempo de espera de generación de imágenes; el valor predeterminado es de 15 minutos |
| `IMAGEGEN_ENABLED` | Establecer en `false` para forzar el modo de solo subida |

### Rendimiento

En esta GPU integrada, generar una imagen de 1024x1024 toma unos 11 minutos.

Esto es lento porque la máquina no tiene una GPU dedicada. Una GPU dedicada sería mucho más rápida, y los proveedores de imágenes en la nube son casi instantáneos en comparación.

### Cómo cambiar el modelo o motor

La implementación del motor de imágenes local está en:

```text
server/src/media/imageEngine.ts
```

Busca:

```text
LocalSdCliImageEngine
```

La guía práctica para proveedores genéricos se encuentra en [PROVIDERS.md](./PROVIDERS.md).

## Proveedor de texto de IA

Durante las pruebas, los mantenedores usaron `opencode`, la CLI de suscripción, como el proveedor de texto de IA.

La lógica posterior a la generación está integrada directamente en los prompts: BookSocial Studio pide al proveedor que encuentre la idea independiente más fuerte de un capítulo y luego la humanice. Como esa lógica está en línea, funciona con cualquier proveedor sin tener que instalar habilidades adicionales.

## Qué probamos de principio a fin

Los siguientes flujos se probaron de principio a fin en la máquina de referencia:

| Área | Flujo probado |
| --- | --- |
| Importación de libros | Se importó el libro de muestra incluido y los libros propios de los mantenedores |
| Biblia visual | Se ejecutó el análisis completo de la biblia visual: apariencia de los personajes, tarjetas de escena del capítulo, atuendos, utilería, personajes secundarios y presencia de personajes |
| Imágenes locales | Se generaron lotes de imágenes de escenas de novelas gráficas localmente |
| Cuentas sociales | Se conectaron dos páginas de Facebook y sus cuentas de Instagram Business enlazadas |
| Publicación | Se programaron y publicaron Reels y Stories en Facebook e Instagram en vivo |

## Conclusiones para tu propio hardware

Usa una GPU dedicada o un proveedor de imágenes en la nube si quieres una generación de imágenes rápida.

BookSocial Studio también funciona bien sin GPU local en el modo de solo subida. Configura:

```bash
IMAGEGEN_ENABLED=false
```

Todo, excepto la generación local de imágenes, es liviano. La carga de trabajo principal sensible al hardware es generar imágenes localmente en el dispositivo.