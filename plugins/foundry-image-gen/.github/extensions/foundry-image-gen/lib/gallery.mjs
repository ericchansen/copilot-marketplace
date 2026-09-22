import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createOutputDir, withRunLock } from "./files.mjs";
import { loadRun, verifyOutput } from "./workflow.mjs";
import { writeZip } from "./zip.mjs";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const json = (value) => escape(JSON.stringify(value, null, 2));

const filterScript = `
const model = document.querySelector('#model');
const review = document.querySelector('#review');
const jobs = [...document.querySelectorAll('article')];
function filter() {
  let visible = 0;
  for (const job of jobs) {
    job.hidden = Boolean((model.value && job.dataset.model !== model.value) ||
      (review.value && job.dataset.review !== review.value));
    if (!job.hidden) visible++;
  }
  document.querySelector('#count').textContent = visible + ' of ' + jobs.length + ' jobs';
  document.querySelector('#empty').hidden = visible !== 0;
}
model.disabled = review.disabled = false;
model.addEventListener('change', filter);
review.addEventListener('change', filter);
filter();`;

function portableJob(job, asset) {
    return {
        id: job.id, state: job.state, asset, model: job.model, deployment: job.deployment,
        modelVersion: job.modelVersion, family: job.family, prompt: job.args.prompt,
        promptHash: job.promptHash, referenceHashes: job.referenceHashes,
        requestedSettings: job.requestedSettings, effectiveSettings: job.effectiveSettings,
        actual: job.output ? { width: job.output.width, height: job.output.height, sha256: job.output.sha256 } : null,
        responseQuality: job.responseQuality ?? null, elapsedMs: job.elapsedMs ?? null,
        usage: job.usage ?? null, review: job.review,
        error: job.state === "generated" ? null : `No image (${job.state}). Details remain in the local run journal.`,
    };
}

export function renderGallery(jobs) {
    const serialized = JSON.stringify(jobs);
    if (/\b[A-Za-z]:[\\/]|file:\/\/|\\\\[^\\\s]+\\|\/(?:Users|home|tmp|mnt)\/|\bBearer\s+\S+|\b(?:ghp_|github_pat_|sk-)[a-zA-Z0-9_-]{16,}/.test(serialized)) {
        throw new Error("Export contains credential-like text or machine-specific paths. Review the selected prompts and notes before delivery.");
    }
    const scriptHash = createHash("sha256").update(filterScript).digest("base64");
    const models = [...new Set(jobs.map((job) => job.model))];
    const reviews = [...new Set(jobs.map((job) => job.review.status))];
    const promptCounts = new Map();
    for (const { promptHash } of jobs) {
        promptCounts.set(promptHash, (promptCounts.get(promptHash) ?? 0) + 1);
    }
    const options = (values) => values.map((value) => `<option value="${escape(value)}">${escape(value)}</option>`).join("");
    const cards = jobs.map((job) => {
        const matches = promptCounts.get(job.promptHash);
        return `<article data-model="${escape(job.model)}" data-review="${escape(job.review.status)}">
<h2>${escape(job.id)}</h2>
<p class="meta">${escape(job.model)} &middot; ${escape(job.review.status)}${job.state !== "generated" ? ` &middot; ${escape(job.state)}` : ""}</p>
${job.asset ? `<a class="image" href="${escape(job.asset)}" target="_blank" rel="noopener"><img src="${escape(job.asset)}" alt="${escape(job.id)} - ${escape(job.model)}" width="${job.actual.width}" height="${job.actual.height}"></a>
<a href="${escape(job.asset)}" target="_blank" rel="noopener">${job.actual.width} x ${job.actual.height} PNG - open native size</a>` : `<p class="failure">${escape(job.error || `No image: ${job.state}`)}</p>`}
${job.review.copyNotes ? `<p><strong>Copy:</strong> ${escape(job.review.copyNotes)}</p>` : ""}
${job.review.visualNotes ? `<p><strong>Visual:</strong> ${escape(job.review.visualNotes)}</p>` : ""}
<details><summary>Prompt and provenance${matches > 1 ? ` - matched in ${matches} jobs` : ""}</summary>
<h3>Exact prompt</h3><pre class="prompt">${escape(job.prompt)}</pre>
<h3>Requested settings</h3><pre>${json(job.requestedSettings)}</pre>
<h3>Effective settings (sent or documented implicit behavior)</h3><pre>${json(job.effectiveSettings)}</pre>
<h3>Provenance</h3><pre>${json({
            model: job.model, deployment: job.deployment, version: job.modelVersion ?? "unknown",
            family: job.family, promptHash: job.promptHash, references: job.referenceHashes,
            actual: job.actual, responseQuality: job.responseQuality, elapsedMs: job.elapsedMs, usage: job.usage,
        })}</pre>
</details></article>`;
    }).join("\n");
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' file: data:; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}'; base-uri 'none'; form-action 'none'">
<title>Image review</title>
<style>
:root{color-scheme:light dark;--bg:#f6f7f9;--fg:#182331;--muted:#475569;--link:#0756a3}
*{box-sizing:border-box}body{margin:0;padding:1.25rem;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
header{display:flex;align-items:center;flex-wrap:wrap;gap:.75rem 1.25rem}h1{font-size:1.35rem;margin:0 auto 0 0}
h2{font-size:1.05rem;margin:0;overflow-wrap:anywhere}h3{font-size:.95rem;margin:1rem 0 .35rem}
label{display:flex;align-items:center;gap:.4rem}select{font:inherit;padding:.25rem;max-width:100%}
main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr));gap:1.5rem;margin-top:1rem;align-items:start}
article{min-width:0}.meta,#count,.notice{color:var(--muted)}p{margin:.35rem 0 .75rem}.notice{max-width:85ch}
a{color:var(--link)}a:hover{text-decoration-thickness:2px}.image{display:block;margin:.5rem 0}
img{display:block;width:100%;height:auto;max-height:70vh;object-fit:contain;object-position:left;background:#e9edf2}
details{margin-top:.75rem}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.85rem}
.prompt{font:inherit;max-width:75ch}strong{font-weight:650}:focus-visible{outline:2px solid var(--link);outline-offset:3px}
[hidden]{display:none!important}.failure{font-weight:600}
@media(prefers-color-scheme:dark){:root{--bg:#141a22;--fg:#edf2f7;--muted:#bac6d6;--link:#8cc5ff}img{background:#222c38}}
@media(max-width:36rem){body{padding:.75rem}header{gap:.5rem}h1{width:100%}label{flex-wrap:wrap}main{gap:1.25rem}}
</style></head><body>
<header><h1>Image review</h1>
<label>Model <select id="model" disabled><option value="">All selected models</option>${options(models)}</select></label>
<label>Review <select id="review" disabled><option value="">All review states</option>${options(reviews)}</select></label>
<span id="count" role="status">${jobs.length} jobs</span></header>
<p class="notice">Generated is not publication-approved. Raw outputs are unchanged. Matched prompts do not imply identical provider controls; compare requested, effective, and actual settings.</p>
<noscript><p>All jobs are visible. Enable JavaScript only if you want local filters.</p></noscript>
<p id="empty" hidden>No jobs match these filters.</p><main>${cards}</main>
<script>${filterScript}</script></body></html>\n`;
}

export async function exportRun(run, workspace) {
    const { runDir } = loadRun(workspace, run);
    return withRunLock(runDir, async () => {
        const { journal } = loadRun(runDir, ".");
        const jobs = journal.jobs.map((job, index) => portableJob(job, job.state === "generated" ? `assets/image-${index + 1}.png` : null));
        const html = renderGallery(jobs);
        const images = journal.jobs.map((job) => job.state === "generated" ? verifyOutput(runDir, job) : null);
        const directory = createOutputDir(workspace, "image-gallery");
        mkdirSync(join(directory, "assets"));
        const entries = [];
        jobs.forEach((job, index) => {
            if (!job.asset) return;
            const path = join(directory, "assets", `image-${index + 1}.png`);
            writeFileSync(path, images[index], { flag: "wx" });
            entries.push({ name: job.asset, path });
        });
        const index = join(directory, "index.html");
        writeFileSync(index, html, { flag: "wx" });
        const instructions = join(directory, "OPEN.txt");
        writeFileSync(instructions,
            "Extract the entire ZIP, then open index.html in a browser. Keep assets beside it.\n" +
            "Works offline; no server, account, installation, or external dependencies are required.\n" +
            "Image links open the original PNG at native size. Filters operate locally; review notes are a saved snapshot.\n" +
            "Generated does not mean approved. Prompts and notes are included: review them before sharing.\n" +
            "This is a portable file package, not a hosted web URL. Uploading or changing access requires a separate request.\n",
            { flag: "wx" });
        entries.push({ name: "index.html", path: index }, { name: "OPEN.txt", path: instructions });
        const zip = `${directory}.zip`;
        writeZip(zip, entries);
        return { gallery: index, zip, note: "Offline files only; not uploaded or hosted. Review the included prompts and notes before sharing." };
    });
}
