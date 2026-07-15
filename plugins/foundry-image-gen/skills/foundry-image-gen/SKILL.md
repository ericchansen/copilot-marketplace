---
name: foundry-image-gen
description: 'Generate or edit images with GPT-Image-2 in Azure AI Foundry via the generate_image tool. Triggers: generate image, edit image, reference image, create image, make an image, draw, illustrate, diagram, visual, mockup, logo, concept art.'
license: MIT
allowed-tools: generate_image
---

# Foundry Image Generation

This plugin provides the `generate_image` tool for text generation and reference-image edits backed by GPT-Image-2 deployed in Azure AI Foundry.

## Prerequisites

- Azure CLI installed and authenticated (`az login`)
- **Cognitive Services User** role on the target AI Services account (RBAC — needed for token-based auth)
- A GPT-Image-2 model deployed in Azure AI Foundry (GlobalStandard SKU)

> The extension pins its Entra token to the resource's subscription (`FOUNDRY_IMAGE_SUBSCRIPTION`), so it works even when your default `az` context is a different subscription/tenant. Without this, a wrong-tenant token returns `500: Unable to get resource information`.

## Configuration

Defaults target the maintainer's Foundry resource. To point at your own deployment, set any of these env vars (each falls back to the built-in default) — no code edits or per-machine file changes needed:

| Env var | Default | Description |
|---------|---------|-------------|
| `FOUNDRY_IMAGE_ENDPOINT` | `https://foundry-eg6typ.openai.azure.com` | Azure OpenAI account endpoint URL |
| `FOUNDRY_IMAGE_DEPLOYMENT` | `gpt-image-2` | Model deployment name |
| `FOUNDRY_IMAGE_API_VERSION` | `preview` | Images API version |
| `FOUNDRY_IMAGE_SUBSCRIPTION` | maintainer's sub ID | Subscription **GUID** that owns the resource (pins the token tenant) |

## Usage

The `generate_image` tool accepts:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `prompt` | Yes | Detailed description of the image to generate |
| `size` | No | `1024x1024` (default), `1536x1024`, `1024x1536`, or `auto` |
| `quality` | No | `low`, `medium`, or `high` (default) |
| `reference_images` | No | Array of 1-5 local PNG/JPEG paths under 50 MB each. When present, the tool uses the image edits API |
| `input_fidelity` | No | `low` or `high`; defaults to `high` for reference-image edits |
| `filename` | No | Output filename without extension (default: `generated-image`) |

Images are saved as PNG to the session's `files/` directory, or to a temp directory (`$TEMP/foundry-images`) when no session workspace is available.

Run the focused reference-image regression check with:

```shell
node plugins/foundry-image-gen/.github/extensions/foundry-image-gen/extension.mjs --self-test
```

## Rate Limits

GPT-Image-2 GlobalStandard deployments have low default quotas (2 RPM). If you hit 429 errors, request a quota increase via the Azure portal.
