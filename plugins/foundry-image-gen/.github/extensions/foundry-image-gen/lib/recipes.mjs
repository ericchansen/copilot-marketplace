import { getRequestedSettings, normalizeModel } from "./providers.mjs";

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && Boolean(value.trim());

function onlyKeys(value, keys, label) {
    if (!object(value)) throw new Error(`${label} must be an object`);
    for (const key of Object.keys(value)) {
        if (!keys.includes(key)) throw new Error(`Unsupported ${label} field: ${key}`);
    }
}

export function recipeJobs(recipe) {
    onlyKeys(recipe, ["version", "content", "designs", "jobs"], "recipe");
    if (recipe.version !== 1 || !Array.isArray(recipe.jobs) || !recipe.jobs.length) {
        throw new Error("Recipe version 1 requires a non-empty explicit jobs list; no models are selected automatically");
    }
    if (!object(recipe.content) || !object(recipe.designs)) throw new Error("Recipe needs content and designs objects");
    const ids = new Set();
    return recipe.jobs.map((job) => {
        onlyKeys(job, ["id", "content", "design", "model", "settings", "references"], "job");
        if (!text(job.id) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(job.id) || ids.has(job.id.toLowerCase())) {
            throw new Error("Job IDs must be unique (case-insensitive), 1-64 letters/digits/underscores/hyphens, starting with a letter or digit");
        }
        ids.add(job.id.toLowerCase());
        if (!text(job.model)) throw new Error(`Job ${job.id} needs one explicit model`);
        normalizeModel(job.model);
        const content = Object.hasOwn(recipe.content, job.content) && recipe.content[job.content];
        const design = Object.hasOwn(recipe.designs, job.design) && recipe.designs[job.design];
        onlyKeys(content, ["brief", "copy", "sources", "associations"], "content pack");
        if (!text(content.brief) || !text(design)) throw new Error(`Job ${job.id} needs a selected content brief and design string`);
        for (const key of ["copy", "sources", "associations"]) {
            if (content[key] !== undefined && (!Array.isArray(content[key]) || content[key].some((item) => !text(item)))) {
                throw new Error(`${key} must be a list of non-empty strings in the selected content pack`);
            }
        }
        const settings = job.settings ?? {};
        if (!object(settings) || Object.keys(settings).length !== Object.keys(getRequestedSettings(settings)).length) {
            throw new Error("Job settings may contain image controls only, not prompts, models, references, or filenames");
        }
        const references = job.references ?? [];
        if (!Array.isArray(references) || references.some((ref) => !object(ref) || !text(ref.path) || !text(ref.role))) {
            throw new Error("Each recipe reference needs a path and an explicit role, in input order");
        }
        for (const ref of references) onlyKeys(ref, ["path", "role"], "reference");
        const sections = [
            `CONTENT\n${content.brief}`,
            content.copy?.length ? `EXACT COPY\n${content.copy.map((line) => JSON.stringify(line)).join("\n")}` : "",
            content.sources?.length ? `SOURCES (context, not extra printed copy)\n${content.sources.join("\n")}` : "",
            content.associations?.length ? `REQUIRED ASSOCIATIONS\n${content.associations.join("\n")}` : "",
            `VISUAL DESIGN\n${design}`,
            references.length ? `REFERENCE ROLES\n${references.map((ref, index) => `Image ${index + 1}: ${ref.role}`).join("\n")}` : "",
        ];
        return {
            id: job.id,
            args: {
                ...settings, prompt: sections.filter(Boolean).join("\n\n"), model: job.model,
                ...(references.length ? {
                    reference_images: references.map((ref) => ref.path),
                    reference_roles: references.map((ref) => ref.role),
                } : {}),
            },
        };
    });
}
