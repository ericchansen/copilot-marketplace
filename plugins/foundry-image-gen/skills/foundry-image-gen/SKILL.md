---
name: foundry-image-gen
description: 'Generate or edit images with GPT-Image-2, GPT-Image-2.5 Sunburst/Flare, FLUX.2-flex, or MAI-Image-2.5-Pro/2.6 in Microsoft Foundry. Use generate_image for a simple image; comparisons, resumable batches, review, and offline export are optional. Triggers: generate image, edit image, reference image, draw, illustrate, diagram, infographic, poster, mockup, logo, concept art, compare image models.'
license: MIT
allowed-tools: generate_image, foundry_image_status, image_workflow, Bash, PowerShell
---

# Foundry Image Generation

**Start simple:** call `generate_image` with a prompt and one chosen model. An explicit `model` wins over `FOUNDRY_IMAGE_MODEL`; otherwise the default remains `gpt-image-2`. One call requests one image. Do not discover deployments, run smoke tests, write a recipe, or create a gallery for an ordinary configured image request.

Supporting a model is not permission to use it. Use exactly the models and variants requested. A single model can produce one image or several content/design combinations; a comparison is never mandatory.

## Generate or edit

Show the exact prompt, selected model, reference roles, and image count before generation unless the user delegated iteration. Stay within the approved scope.

- **Creative exploration:** separate required content from visual design. Keep exact copy and factual associations while exploring composition, palette, materials, or metaphor. Posters do not need a layout master or a label on every illustrative object.
- **Focused refinement:** identify what may change and what must remain. Fixing copy does not automatically lock layout. Preserve layout only when requested or already accepted.
- **Precise reproduction:** use an approved layout/copy reference when geometry, topology, or identity must match. For factual diagrams, read [diagram prompting](references/diagram-prompting.md) and use the [brief template](references/diagram-brief-template.md) when helpful.

Put concise integrated copy in quotes. Assign reference roles explicitly, in input order; `reference_roles` can record those roles alongside `reference_images`. Keep references inside the workspace: do not relax traversal or symlink checks. Stage an external file only with explicit authorization.

The optional image controls are `model`, `size`, `quality`, `reference_images`, `reference_roles`, `input_fidelity`, `guidance`, `steps`, `auto_aspect_ratio`, `web_grounding`, and `filename`. Unsupported combinations fail before inference. See [model capabilities and setup](references/models-and-setup.md) for exact controls, limits, deployment mappings, and documented compatibility changes.

## Inspect, then accept

Open or render the actual output. A saved PNG is **generated**, not publication-approved. Check missing/extra claims, exact copy, metric-label associations, reference adherence, unwanted changes, legibility, and cropping. Use available OCR/copy comparison when helpful, but do not require an OCR service, another model call, or a subagent for a casual image.

Use `unreviewed`, `approved`, `revise`, or `rejected`; optional `image_workflow` review notes record copy and visual findings without changing the PNG. A deterministic text overlay is a separately requested fidelity fallback, not the default pipeline. Preserve raw comparison outputs; artistic correction is new work.

## Optional workflows and recovery

Only for requested batches, comparisons, resumption, or delivery, read [optional workflows](references/workflows.md). The agent writes the recipe; the user should not have to author JSON. Recipes contain explicit jobs and build each prompt from only its selected content pack and design. Matched prompts share content, references, and supported settings; disclose provider-specific differences.

Images and provenance are saved immediately in unique run directories. Resume skips verified outputs and recovers saved receipts. Transient HTTP retries are bounded, respect `Retry-After`, and preserve inputs. Ambiguous transport failures are not automatically resubmitted. Never switch models, remove references, change resolution, or rewrite a prompt under the label "retry"; those are replanning. Do not bypass or repeatedly retry safety blocks.

If setup is needed, use the read-only `foundry_image_status` tool for the explicitly selected account, resource group, and optional subscription. It distinguishes catalog availability, deployment state, adapter support, and untested inference. It does not sign in, switch accounts, install anything, create resources, change permissions, or set persistent environment variables.

For requested delivery, `image_workflow` can export static HTML and a ZIP with relative image assets and opening instructions. It works for one model or several and needs no server. A local preview is not a shareable web URL; uploading, posting, hosting, and access changes require a separate request.

## Offline checks

From `plugins/foundry-image-gen/.github/extensions/foundry-image-gen`:

```shell
node --test
node extension.mjs --self-test
```

Provider evidence and API samples: [Microsoft GPT images](https://learn.microsoft.com/azure/foundry/openai/how-to/dall-e), [Microsoft MAI images](https://learn.microsoft.com/azure/foundry/foundry-models/how-to/use-foundry-models-mai-image), [Microsoft FLUX](https://learn.microsoft.com/azure/foundry/foundry-models/how-to/use-foundry-models-flux), and [OpenAI image prompting](https://developers.openai.com/api/docs/guides/image-prompting).
