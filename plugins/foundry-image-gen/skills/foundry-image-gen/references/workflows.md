# Optional recipes, recovery, review, and delivery

Use this path only when the user requests several images, a comparison, resumable work, or an export. For one ordinary image, use `generate_image` directly. The implementation is the local [workflow helper](../../../.github/extensions/foundry-image-gen/lib/workflow.mjs), not a service or background daemon.

## Agent-written recipe

The agent writes a workspace-local JSON file after establishing the requested scope. Each job names exactly one supported model, one content pack, and one visual design. Repeating a model across jobs is valid. There is no Cartesian product, implicit model list, or expansion of an empty selection.

```json
{
  "version": 1,
  "content": {
    "garden": {
      "brief": "A welcoming community garden poster.",
      "copy": ["Grow together"],
      "sources": [],
      "associations": ["The words are an invitation, not a measured outcome."]
    }
  },
  "designs": {
    "paper": "Layered paper plants, deep green and warm yellow, one open composition.",
    "ink": "Expressive ink drawing, generous lettering, a different composition."
  },
  "jobs": [
    {"id": "paper", "content": "garden", "design": "paper", "model": "gpt-image-2", "settings": {"size": "1536x1024"}},
    {"id": "ink", "content": "garden", "design": "ink", "model": "gpt-image-2", "settings": {"size": "1536x1024"}}
  ]
}
```

Call `image_workflow` with `action: "run"` and `recipe: "<workspace-relative JSON path>"`. The [recipe helper](../../../.github/extensions/foundry-image-gen/lib/recipes.mjs) validates the complete run before authentication or inference. Unsupported fields fail rather than being silently ignored.

For a comparison, add only the requested model jobs, selecting the same content/design. Do not add content from other packs, even inside "do not include" instructions. Keep supported shared settings and reference order matched. MAI has no quality switch and edit dimensions differ; use per-job settings and disclose these differences rather than inventing an equivalent quality level. Same quality labels are not equal measured output quality; see [OpenAI comparison guidance](https://developers.openai.com/api/docs/guides/image-prompting).

An edit job can add `"references": [{"path": "files/reference.png", "role": "Exact copy only; layout may change"}]`. Role text is included in the prompt, and ordered content hashes are recorded. References remain under workspace containment and symlink rules. Preserve sources and required associations in the selected content pack; visual design belongs in the selected design, not a global copy-bearing prompt prefix.

## Saved state and resumption

Both tools save collision-safe run directories under session `files/` (or the temporary `foundry-images` workspace without a session). The [storage helper](../../../.github/extensions/foundry-image-gen/lib/files.mjs) reserves a new directory rather than overwriting `generated-image.png`. Each run contains:

- `journal.json`: exact selected prompts, canonical model/deployment/family, configured deployment-version snapshot and returned model version when known, prompt/reference/input hashes, requested/effective settings, actual PNG dimensions/hash, attempts/request IDs, inference elapsed time, available numeric usage, and review notes.
- `job-<id>.received.json`: credential-free PNG receipt plus response metadata, saved before advancing to the next job. Receipts are retained for recovery and are not included in exports.
- `job-<id>.png`: the raw result. Recovery uses a new filename if a different file occupies that path.

Treat local prompts, references, and journals as potentially sensitive; keep runs in the session workspace, not source control. No access token, authorization header, signed download URL, or configured endpoint is written to the journal. Endpoint identity is hashed for resume checks.

The [workflow helper](../../../.github/extensions/foundry-image-gen/lib/workflow.mjs) also returns and logs the sanitized job error rather than a raw HTTP failure body. HTTP status and provider request IDs, when supplied, remain in the journal for diagnosis.

Call `image_workflow` with `action: "resume"` and `run: "<run directory>"`. It verifies input identity and PNG checksums/dimensions, skips verified generated jobs, recovers saved receipts, and runs only remaining pending/deferred work. Changed prompts, references, settings, or deployment configuration require explicit replanning; they do not reuse the old journal as a retry.

The [resume identity](../../../.github/extensions/foundry-image-gen/lib/workflow.mjs) includes the selected deployment-version snapshot (`null` when unknown), separately from the model version returned by inference. A changed cached version requires replanning even if the deployment name is unchanged. This checks known metadata only; it does not add discovery or lock the live Azure deployment version.

The [transport helper](../../../.github/extensions/foundry-image-gen/lib/transport.mjs) allows at most three inference attempts per job across resumptions. HTTP 429/500/502/503/504 can retry unchanged inputs; delays honor `Retry-After` (seconds or HTTP dates), otherwise bounded backoff. A wait beyond two minutes defers the affected deployment for a later resume rather than ignoring the limit or blocking unrelated jobs. MAI requests also use conservative spacing based on the lowest documented nonzero [MAI quota tier](https://learn.microsoft.com/azure/foundry/foundry-models/how-to/use-foundry-models-mai-image#api-quotas-and-limits).

Requests to a deployment are serialized within one extension process; recipe jobs execute sequentially. The [workflow helper](../../../.github/extensions/foundry-image-gen/lib/workflow.mjs) saves a deferred-until timestamp even when another run's cooldown prevents the first attempt, so resuming that journal after a restart still honors the observed deadline. This is not a cross-process quota coordinator. Do not start independent processes against the same deployment to evade limits. A run lock prevents overlapping operations on the same journal. After an interrupted process, first confirm it has stopped, remove only that run's stale `.lock`, then resume.

Transport interruption after submission is **ambiguous**: the service may have billed it. Do not automatically repeat it. The [workflow helper](../../../.github/extensions/foundry-image-gen/lib/workflow.mjs) also applies this state when a successful response has no image or its download fails before a receipt is saved. On resume, receipt-less `requesting`/`received` jobs and older post-response `output-error` records receive the same billing-risk and explicit-replacement guidance. Resume can recover a persisted receipt; otherwise replacement requires explicit authorization. HTTP 5xx retries record possible duplicate billing and disclose it in the tool result. Invalid requests and safety blocks do not retry. A blocked/failed job remains visible and does not discard completed images or cancel unrelated jobs.

For URL-based outputs, the tool retries only the image download without forwarding inference credentials. It does not persist signed URLs. If a process stops before download bytes or a receipt are saved, it cannot recover the URL and will not silently regenerate the image. Exhausted request budgets also require an explicitly authorized replacement job.

## Review without rewriting raw outputs

After inspecting an image, call `image_workflow` with `action: "review"`, `run`, `job_id`, and `review_status` (`unreviewed`, `approved`, `revise`, or `rejected`). Optional `copy_notes` and `visual_notes` distinguish copy accuracy from artistic direction. Use available OCR to support exact-copy checks, then inspect associations and missing/extra claims yourself. OCR success alone is not publication approval.

Approval is an acceptance decision, not an automatic consequence of generation. Notes never edit the image. If a creative correction or deterministic text overlay is requested, retain the raw result and create separately scoped output.

## Optional offline export

Call `image_workflow` with `action: "export"` and `run` only for requested comparison review or delivery. The [exporter](../../../.github/extensions/foundry-image-gen/lib/gallery.mjs) creates a new static HTML gallery and a ZIP containing `index.html`, relative `assets/` PNGs, and `OPEN.txt`. It supports arbitrary explicit job counts, including one model with multiple images, and shows partial failures.

The [ZIP writer](../../../.github/extensions/foundry-image-gen/lib/zip.mjs) requests owner-only POSIX permissions (`0o600`) for the archive; it does not configure Windows ACLs.

Extract the entire ZIP, then open `index.html` directly. Images link to native-size PNGs; model/review filters work locally; exact prompts, prompt matches, requested/effective/actual settings, and saved review notes are inspectable. No external assets, server, package install, or network access are required.

Exports omit local paths, endpoints, receipts, and auth data. Credential-like or machine-specific path text in prompts/notes blocks export for review rather than silently rewriting exact prompts. Inspect all included content before sharing. The gallery is a snapshot: update review notes in the journal and export again to reflect changes. A local file link is not hosting; uploading, Teams posting, access changes, or deployment requires a separate request.
