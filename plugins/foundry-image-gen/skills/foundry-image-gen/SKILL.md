---
name: foundry-image-gen
description: 'Generate images with GPT-Image-2 in Azure AI Foundry via the generate_image tool. Triggers: generate image, create image, make an image, draw, illustrate, diagram, visual, mockup, logo, concept art.'
license: MIT
allowed-tools: generate_image
---

# Foundry Image Generation

This plugin provides the `generate_image` tool backed by GPT-Image-2 deployed in Azure AI Foundry.

## Prerequisites

- Azure CLI authenticated (`az login`) with access to the target AI Services account
- A GPT-Image-2 model deployed in Azure AI Foundry (GlobalStandard SKU)

## Configuration

The extension connects to a hardcoded endpoint. To use your own deployment, edit the constants at the top of the extension entry point (`extension.mjs` inside the installed plugin's `.github/extensions/foundry-image-gen/` directory):

- `ENDPOINT` — your Azure AI Services endpoint URL
- `DEPLOYMENT` — your model deployment name (default: `gpt-image-2`)

## Usage

The `generate_image` tool accepts:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `prompt` | Yes | Detailed description of the image to generate |
| `size` | No | `1024x1024` (default), `1536x1024`, `1024x1536`, or `auto` |
| `quality` | No | `low`, `medium`, or `high` (default) |
| `filename` | No | Output filename without extension (default: `generated-image`) |

Images are saved as PNG to the session's `files/` directory, or to a temp directory (`$TEMP/foundry-images`) when no session workspace is available.

## Rate Limits

GPT-Image-2 GlobalStandard deployments have low default quotas (2 RPM). If you hit 429 errors, request a quota increase via the Azure portal.
