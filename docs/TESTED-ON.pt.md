# Testado no nosso hardware

## Visão geral

Esta é a máquina e configuração de referência que os mantenedores usaram para desenvolver e testar o BookSocial Studio. Os seus resultados podem variar, especialmente na geração local de imagens.

## Especificações da máquina

| Componente | Configuração testada |
| --- | --- |
| SO | Ubuntu 26.04 LTS |
| Kernel | Linux 7.0 |
| CPU | AMD Ryzen 7 6800H, 8 núcleos / 16 threads |
| RAM | 26 GiB |
| GPU | Integrada AMD Radeon 680M, RDNA2 "Rembrandt" iGPU |
| Driver/API da GPU | Vulkan via RADV |
| GPU dedicada | Nenhuma |
| Runtime | Node.js, serviço roda na v24, builds na v22 |
| Banco de dados | SQLite, arquivo único |

Os passos de instalação estão documentados separadamente em [SETUP.md](./SETUP.md).

## Geração local de imagens

### Resumo da configuração

As imagens das cenas do livro foram geradas no próprio dispositivo com `sd-cli` do `stable-diffusion.cpp`, executando Z-Image-Turbo na iGPU integrada AMD Radeon 680M via Vulkan.

A divisão testada foi:

| Componente | Dispositivo |
| --- | --- |
| Codificador de texto | CPU |
| VAE | CPU |
| Difusão | GPU Integrada via `vulkan0` |

A configuração padrão de backend foi:

```bash
SDCPP_BACKEND="te=cpu,vae=cpu,diffusion=vulkan0"
```

A geração ocorre em série: uma imagem por vez em uma única iGPU.

A configuração de amostragem testada foi:

| Configuração | Valor |
| --- | --- |
| Passos | 8 |
| Escala CFG | 1.0 |
| Amostrador | Euler |
| Flash attention | Ativado |
| Descarregar para CPU | Ativado, para caber na memória da iGPU |

### Arquivos de modelo

| Propósito | Arquivo |
| --- | --- |
| Modelo de difusão | `z_image_turbo-Q8_0.gguf` |
| LLM codificador de texto | `qwen_3_4b-Q8_0.gguf` |
| VAE | `ae_bf16.safetensors` |

### Variáveis de ambiente

| Variável | Propósito |
| --- | --- |
| `SDCPP_DIR` | Aponta para um diretório `stable-diffusion.cpp` personalizado |
| `SDCPP_CLI` | Aponta para um binário `sd-cli` personalizado |
| `SDCPP_BACKEND` | Altera a divisão do backend |
| `SDCPP_ZIMAGE_DIR` | Aponta para o diretório do modelo Z-Image |
| `SDCPP_ZIMAGE_MODEL` | Aponta para o arquivo do modelo de difusão |
| `SDCPP_ZIMAGE_LLM` | Aponta para o arquivo LLM codificador de texto |
| `SDCPP_ZIMAGE_VAE` | Aponta para o arquivo VAE |
| `SDCPP_TIMEOUT_MS` | Tempo limite para geração de imagens; o padrão são 15 minutos |
| `IMAGEGEN_ENABLED` | Defina como `false` para forçar o modo apenas de upload |

### Desempenho

Nesta GPU integrada, uma imagem de 1024x1024 leva cerca de 11 minutos para ser gerada.

Isso é lento porque a máquina não possui uma GPU dedicada. Uma GPU dedicada seria muito mais rápida, e os provedores de imagens em nuvem são quase instantâneos em comparação.

### Como trocar o modelo ou motor

A implementação do motor local de imagens está em:

```text
server/src/media/imageEngine.ts
```

Procure por:

```text
LocalSdCliImageEngine
```

O guia de provedores genéricos encontra-se em [PROVIDERS.md](./PROVIDERS.md).

## Provedor de texto de IA

Durante os testes, os mantenedores usaram o `opencode`, a CLI de assinatura, como provedor de texto de IA.

A lógica de pós-geração está embutida diretamente nos prompts: o BookSocial Studio pede ao provedor para encontrar a ideia independente mais forte em um capítulo e, em seguida, humanizá-la. Como essa lógica é inline, ela funciona com qualquer provedor sem a instalação de skills extras.

## O que exercitamos de ponta a ponta

Os seguintes fluxos foram exercitados de ponta a ponta na máquina de referência:

| Área | Fluxo exercitado |
| --- | --- |
| Importação de livro | Importado o livro de amostra incluído e os próprios livros dos mantenedores |
| Bíblia visual | Executada a análise completa da bíblia visual: aparência dos personagens, cartões de cena dos capítulos, trajes, adereços, personagens menores e presença de personagens |
| Imagens locais | Gerados lotes de imagens de cenas no estilo graphic novel localmente |
| Contas sociais | Conectadas duas Páginas do Facebook e as suas contas do Instagram Business vinculadas |
| Publicação | Agendados e publicados Reels e Stories no Facebook e Instagram ao vivo |

## Conclusões para o seu próprio hardware

Use uma GPU dedicada ou um provedor de imagens em nuvem se quiser uma geração rápida de imagens.

O BookSocial Studio também funciona bem sem GPU local no modo apenas de upload. Defina:

```bash
IMAGEGEN_ENABLED=false
```

Tudo, exceto a geração local de imagens, é leve. A principal carga de trabalho sensível ao hardware é a geração de imagens localmente no dispositivo.