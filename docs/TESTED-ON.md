# Tested on our hardware

## Overview

This is the reference machine and configuration the maintainers used to develop and test BookSocial Studio. Your mileage will vary, especially for local image generation.

## Machine specs

| Component | Tested configuration |
| --- | --- |
| OS | Ubuntu 26.04 LTS |
| Kernel | Linux 7.0 |
| CPU | AMD Ryzen 7 6800H, 8 cores / 16 threads |
| RAM | 26 GiB |
| GPU | Integrated AMD Radeon 680M, RDNA2 "Rembrandt" iGPU |
| GPU driver/API | Vulkan via RADV |
| Discrete GPU | None |
| Runtime | Node.js, service runs on v24, builds on v22 |
| Database | SQLite, single file |

Installation steps are documented separately in [SETUP.md](./SETUP.md).

## Local image generation

### Setup summary

Book scene images were generated on-device with `sd-cli` from `stable-diffusion.cpp`, running Z-Image-Turbo on the integrated AMD Radeon 680M iGPU via Vulkan.

The tested split was:

| Component | Device |
| --- | --- |
| Text encoder | CPU |
| VAE | CPU |
| Diffusion | Integrated GPU via `vulkan0` |

The default backend setting was:

```bash
SDCPP_BACKEND="te=cpu,vae=cpu,diffusion=vulkan0"
```

Generation runs serially: one image at a time on a single iGPU.

The tested sampling configuration was:

| Setting | Value |
| --- | --- |
| Steps | 8 |
| CFG scale | 1.0 |
| Sampler | Euler |
| Flash attention | Enabled |
| Offload to CPU | Enabled, to fit iGPU memory |

### Model files

| Purpose | File |
| --- | --- |
| Diffusion model | `z_image_turbo-Q8_0.gguf` |
| Text-encoder LLM | `qwen_3_4b-Q8_0.gguf` |
| VAE | `ae_bf16.safetensors` |

### Environment variables

| Variable | Purpose |
| --- | --- |
| `SDCPP_DIR` | Point to a custom `stable-diffusion.cpp` directory |
| `SDCPP_CLI` | Point to a custom `sd-cli` binary |
| `SDCPP_BACKEND` | Change the backend split |
| `SDCPP_ZIMAGE_DIR` | Point to the Z-Image model directory |
| `SDCPP_ZIMAGE_MODEL` | Point to the diffusion model file |
| `SDCPP_ZIMAGE_LLM` | Point to the text-encoder LLM file |
| `SDCPP_ZIMAGE_VAE` | Point to the VAE file |
| `SDCPP_TIMEOUT_MS` | Image generation timeout; default is 15 minutes |
| `IMAGEGEN_ENABLED` | Set to `false` to force upload-only mode |

### Performance

On this integrated GPU, a 1024x1024 image takes about 11 minutes to generate.

This is slow because the machine has no discrete GPU. A dedicated GPU would be far faster, and cloud image providers are near-instant by comparison.

### How to swap the model or engine

The local image engine implementation is in:

```text
server/src/media/imageEngine.ts
```

Look for:

```text
LocalSdCliImageEngine
```

The generic provider how-to lives in [PROVIDERS.md](./PROVIDERS.md).

## AI text provider

During testing, the maintainers used `opencode`, the subscription CLI, as the AI text provider.

The post-generation logic is embedded directly in the prompts: BookSocial Studio asks the provider to find the single strongest standalone idea in a chapter, then humanize it. Because that logic is inline, it works with any provider without installing extra skills.

## What we exercised end-to-end

The following flows were exercised end-to-end on the reference machine:

| Area | Exercised flow |
| --- | --- |
| Book import | Imported the bundled sample book and the maintainers' own books |
| Visual bible | Ran the full visual bible analysis: character appearance, chapter scene cards, outfits, props, minor characters, and character presence |
| Local images | Generated batches of graphic-novel scene images locally |
| Social accounts | Connected two Facebook Pages and their linked Instagram Business accounts |
| Publishing | Scheduled and published Reels and Stories to Facebook and Instagram live |

## Takeaways for your own hardware

Use a discrete GPU or a cloud image provider if you want fast image generation.

BookSocial Studio also runs fine with no local GPU in upload-only mode. Set:

```bash
IMAGEGEN_ENABLED=false
```

Everything except local image generation is light. The main hardware-sensitive workload is generating images locally on-device.
