# Models and setup

The [capability table in `models.mjs`](../../../.github/extensions/foundry-image-gen/lib/models.mjs) is the adapter allowlist. Canonical model IDs select validation and the API family; deployment names select existing resource deployments. Catalog entries never become adapters automatically.

## Capabilities

| Canonical `model` | API family | Adapter reference limit | Controls |
| --- | --- | --- | --- |
| `gpt-image-2` | OpenAI images | 16 | `quality`: low, medium, high; implicit high input fidelity |
| `gpt-image-2.5-sunburst` | OpenAI images | 16 | `quality`: low, medium, high, xhigh, max, auto; no `input_fidelity` |
| `gpt-image-2.5-flare` | OpenAI images | 16 | Same documented quality choices; `input_fidelity` is unverified and not exposed by this adapter |
| `FLUX.2-flex` | BFL provider | 10 | `guidance`: 1.5-10; `steps`: 1-50 |
| `MAI-Image-2.5-Pro` | MAI images | 5 | No quality/fidelity/guidance/steps switch |
| `MAI-Image-2.6` | MAI images | 5 | `auto_aspect_ratio` and `web_grounding`, both explicitly false by default; no quality switch |

References are ordered PNG/JPEG files under 50 MB, contained in the workspace after real-path resolution. GPT-Image-2.5's 16-reference limit is the local adapter ceiling, not a separately verified model-specific service limit. Service-side validation still applies.

- **GPT:** `auto` or `WIDTHxHEIGHT`; edges divisible by 16, longest edge <=3,840, aspect ratio <=3:1, total pixels 655,360-8,294,400. For GPT-Image-2.5, outputs above 3,686,400 pixels are documented as experimental. The plugin preserves its `1024x1024`, `quality=high`, PNG, one-image defaults; it does not choose xhigh/max automatically.
- **FLUX:** `auto` or dimensions with each edge >=64 and <=4,194,304 total pixels. Omitted guidance/steps use documented provider defaults of 4.5/50.
- **MAI generation:** each edge >=768; maximum 1,048,576 pixels for 2.5-Pro or 2,359,296 for 2.6. For example, 1536x1152 is valid for 2.6, not 2.5-Pro. With `auto_aspect_ratio=true`, requested dimensions remain recorded but actual shape is model-directed.
- **MAI edits:** dimensions are provider-determined; passing `size` fails early. All references are sent as repeated multipart `image` fields, not only the first image. The 2.6 booleans apply to generation and edits. Web search requires explicit `web_grounding=true`.

Sources: [Microsoft GPT capabilities](https://learn.microsoft.com/azure/foundry/openai/how-to/dall-e#models-and-capabilities), [OpenAI size guidance](https://developers.openai.com/api/docs/guides/image-prompting), [FLUX parameters](https://learn.microsoft.com/azure/foundry/foundry-models/how-to/use-foundry-models-flux), and [MAI parameters and limits](https://learn.microsoft.com/azure/foundry/foundry-models/how-to/use-foundry-models-mai-image#request-parameters).

## Fidelity compatibility

Do not inherit an older GPT edit serializer's fidelity default. Sunburst has rejected `input_fidelity` with `invalid_input_fidelity_model` in prior live evidence. No model-specific public confirmation of Flare fidelity controls was found in the sources above; Flare therefore omits the field and rejects explicit use rather than guessing.

The [OpenAI prompting guide's GPT Image 2 reference](https://developers.openai.com/api/docs/guides/image-prompting) also says to omit `input_fidelity`: image inputs are always processed at high fidelity. The plugin consequently accepts legacy GPT-Image-2 `input_fidelity=high` as an implicit setting without transmitting it, and rejects `low`. This is a documented compatibility correction, not a model or layout change.

Offline mocks cover serialization and rejection paths. They are not live inference certification. Prior Sunburst/MAI-2.6 evidence does not establish that every quality, reference count, region, or Flare setting has been live-tested.

## Configuration and precedence

`generate_image.model` takes precedence over `FOUNDRY_IMAGE_MODEL`, then `gpt-image-2`. An explicit recipe job must name one model. Empty/omitted model lists never mean "all".

| Environment variable | Meaning | Default |
| --- | --- | --- |
| `FOUNDRY_IMAGE_ENDPOINT` | GPT account API base | Required for GPT |
| `FOUNDRY_IMAGE_SERVICES_ENDPOINT` | BFL/MAI account API base | Required for FLUX/MAI |
| `FOUNDRY_IMAGE_MODEL` | Preferred canonical model | `gpt-image-2` |
| `FOUNDRY_IMAGE_DEPLOYMENT` | GPT-Image-2 deployment only | `gpt-image-2` |
| `FOUNDRY_IMAGE_SUNBURST_DEPLOYMENT` | Sunburst deployment | `gpt-image-2.5-sunburst` |
| `FOUNDRY_IMAGE_FLARE_DEPLOYMENT` | Flare deployment | `gpt-image-2.5-flare` |
| `FOUNDRY_IMAGE_FLUX_DEPLOYMENT` | FLUX deployment | `FLUX.2-flex` |
| `FOUNDRY_IMAGE_MAI_DEPLOYMENT` | MAI-2.5-Pro deployment only | `MAI-Image-2.5-Pro` |
| `FOUNDRY_IMAGE_MAI26_DEPLOYMENT` | MAI-2.6 deployment | `MAI-Image-2.6` |
| `FOUNDRY_IMAGE_API_VERSION` | GPT API version | `preview` |
| `FOUNDRY_IMAGE_FLUX_API_VERSION` | BFL API version | `preview` |
| `FOUNDRY_IMAGE_SUBSCRIPTION` | Optional subscription GUID for CLI token acquisition | Current CLI subscription |

The old GPT and MAI deployment variables do not redirect the new adapters to legacy models. No credential/profile file is required or written. Endpoints must use HTTPS except for localhost testing, with no embedded credentials, query, or fragment.

The [provider serializer](../../../.github/extensions/foundry-image-gen/lib/providers.mjs) uses deployment names in the request `model` field:

- GPT: `/openai/v1/images/generations` or `/edits`, with `api-version=preview` by default. See the [Microsoft v1 API reference and Entra CLI example](https://learn.microsoft.com/azure/foundry/openai/reference-preview-latest#create-image-edit).
- FLUX: `/providers/blackforestlabs/v1/flux-2-flex?api-version=preview`. See the [Microsoft BFL sample](https://learn.microsoft.com/azure/foundry/foundry-models/how-to/use-foundry-models-flux#flux2-flex).
- MAI: `/mai/v1/images/generations` or `/edits`. See the [Microsoft JSON and repeated-image multipart samples](https://learn.microsoft.com/azure/foundry/foundry-models/how-to/use-foundry-models-mai-image#run-an-image-to-image-edit).

## Read-only setup check

Call `foundry_image_status` with `account`, `resource_group`, and optionally `subscription`. Select the intended account first; do not enumerate unrelated subscriptions. The tool reuses the Azure CLI sign-in and only calls [account show](https://learn.microsoft.com/cli/azure/cognitiveservices/account#az-cognitiveservices-account-show), [deployment list](https://learn.microsoft.com/cli/azure/cognitiveservices/account/deployment#az-cognitiveservices-account-deployment-list), and [account list-models](https://learn.microsoft.com/cli/azure/cognitiveservices/account#az-cognitiveservices-account-list-models).

`resource_group` follows the [Azure resource-group naming rules](https://learn.microsoft.com/azure/azure-resource-manager/management/resource-name-rules#microsoftresources): 1-90 Unicode letters or decimal digits, underscores, hyphens, periods, or parentheses, with no final period. Pass the literal name, such as `sample(group)`; the tool preserves it as one CLI argument.

The result reports returned account endpoints, configured endpoints, each deployment's canonical model/version/state, adapter support, and catalog availability. It suggests a mapping only when already configured or unambiguous. Missing/different endpoints and absent deployments are diagnostics, not a reason to invent a hostname, switch accounts, or create resources. Returned `/models` or `/openai` suffixes are removed to obtain the account API base.

The [status helper](../../../.github/extensions/foundry-image-gen/lib/azure.mjs) omits unsafe or malformed endpoint values, including credentials, query strings, and fragments, and reports a credential-free diagnostic. This does not change configuration or prevent generation with an unrelated, valid selected model.

Every discovered deployment is marked `inference: not-tested`. A successful ARM read does not prove inference permission, regional access, quota, or a successful image call. Known versions from the last status read are recorded only for matching configured endpoints/deployments; otherwise versions remain unknown unless the inference response supplies one. Cached metadata matching does not validate unselected adapters; generation still validates each selected job's configuration before authentication or inference.

If authentication is missing, report it and have the user sign in with [Azure CLI](https://learn.microsoft.com/cli/azure/authenticate-azure-cli-interactively). Review the appropriate inference role and selected account separately; this tool never changes permissions. Apply any chosen endpoint/deployment configuration explicitly to the agent process, not persistent machine/user environment variables. Normal configured generation does not repeat discovery or make a paid setup call.
