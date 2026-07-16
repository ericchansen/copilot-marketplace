---
name: foundry-image-gen
description: 'Generate or edit images with GPT-Image-2 in Azure AI Foundry via the generate_image tool. Triggers: generate image, edit image, reference image, create image, make an image, draw, illustrate, diagram, visual, mockup, logo, concept art.'
license: MIT
allowed-tools: generate_image, Bash, PowerShell
---

# Foundry Image Generation

This plugin provides the `generate_image` tool for text-to-image generation and reference-image edits backed by GPT-Image-2 deployed in Azure AI Foundry.

## Prerequisites

- Azure CLI installed and authenticated (`az login`)
- **Cognitive Services OpenAI User** role on the target Azure OpenAI account (the normal RBAC role for token-based inference)
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

## Operating Playbook

Before generating, show the user the prompt, reference strategy, and variant count unless they explicitly delegate independent iteration.

- For a simple scene or up to five references, generate in one pass.
- For more than five identities or an exact roster, make clean labeled reference sheets in groups of five or fewer, generate panels, visually review every panel, retry only failed panels, then integrate with up to four accepted panels plus one master roster or layout board.
- Keep prompts compact and positive. Express identity through accessories, markings, proportions, and expression.
- Use `input_fidelity: high` to preserve identity, layout, or accepted panels. Use `low` if references overcopy logos, photographic framing, or overly human anatomy.
- When randomness matters, generate up to three separately named variants. Make calls sequentially and allow for the 2 RPM quota.

### Recovery

- Missing subjects or generic characters: simplify the composition, strengthen distinct identity cues, or split into reviewed panels.
- Over-copied references: lower input fidelity and restate the desired composition positively.
- Bad text: shorten it, use a clean layout reference, or regenerate only the failed panel.
- Moderation block: simplify neutral wording; never attempt to bypass safety controls.
- 429 response: wait for the built-in retry or quota window before another sequential call.
- Special conceptual characters: define a concrete silhouette, material, scale, placement, and expression instead of relying on an abstract label.

### Visual Quality Gate

Open or render every candidate. Check subject count and order, spelling, anatomy, identity cues, special characters, unwanted source text or logos, and requested dimensions. An HTTP success or saved file is not completion.

Run the focused reference-image regression check with:

```shell
node plugins/foundry-image-gen/.github/extensions/foundry-image-gen/extension.mjs --self-test
```

## Rate Limits

GPT-Image-2 GlobalStandard deployments have low default quotas (2 RPM). If you hit 429 errors, request a quota increase via the Azure portal.
