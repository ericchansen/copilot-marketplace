import { IMAGE_PARAMETERS, MODEL_IDS, MODELS, REFERENCE_LIMITS, normalizeModel } from "./models.mjs";

export { IMAGE_PARAMETERS, MODEL_IDS, MODELS, REFERENCE_LIMITS, normalizeModel };
export { executeProviderRequest } from "./transport.mjs";

const envValue = (env, name, fallback = "") => env[name]?.trim() || fallback;
const trimEndpoint = (value) => value.replace(/\/+$/, "");

export function getConfig(env = process.env) {
    return {
        openaiEndpoint: envValue(env, "FOUNDRY_IMAGE_ENDPOINT"),
        servicesEndpoint: envValue(env, "FOUNDRY_IMAGE_SERVICES_ENDPOINT"),
        ...Object.fromEntries(Object.entries(MODELS).map(([id, model]) => [
            model.deploymentKey, envValue(env, model.deploymentEnv, id),
        ])),
        defaultModel: envValue(env, "FOUNDRY_IMAGE_MODEL", MODEL_IDS.GPT),
        openaiApiVersion: envValue(env, "FOUNDRY_IMAGE_API_VERSION", "preview"),
        fluxApiVersion: envValue(env, "FOUNDRY_IMAGE_FLUX_API_VERSION", "preview"),
        subscription: envValue(env, "FOUNDRY_IMAGE_SUBSCRIPTION"),
    };
}

export function requireEndpoint(value, name) {
    if (!value) throw new Error(`${name} is required for the selected model`);
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`${name} must be an absolute HTTP(S) URL`);
    }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new Error(`${name} must be an HTTP(S) endpoint without credentials, query, or fragment`);
    }
    if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
        throw new Error(`${name} must use HTTPS outside localhost`);
    }
    return trimEndpoint(value);
}

export function getModelConfig(model, config = getConfig()) {
    const selected = normalizeModel(model, config.defaultModel);
    const capabilities = MODELS[selected];
    const openai = capabilities.family === "openai";
    const endpoint = requireEndpoint(
        openai ? config.openaiEndpoint : config.servicesEndpoint,
        openai ? "FOUNDRY_IMAGE_ENDPOINT" : "FOUNDRY_IMAGE_SERVICES_ENDPOINT"
    );
    const deployment = config[capabilities.deploymentKey] ?? selected;
    if (typeof deployment !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(deployment)) {
        throw new Error("Deployment must be a name using letters, digits, underscores, periods, or hyphens");
    }
    return { capabilities, endpoint, deployment, version: config.deploymentVersions?.[selected] ?? null };
}

function parseDimensions(size, model) {
    if (size === "auto") return null;
    const match = typeof size === "string" && /^(\d+)x(\d+)$/.exec(size);
    if (!match) throw new Error(`Invalid size for ${model}: ${size}`);
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
        throw new Error(`Invalid size for ${model}: ${size}`);
    }
    return { width, height };
}

function validateNumber(value, name, { integer = false, min, max }) {
    if (value === undefined) return;
    if (typeof value !== "number" || !Number.isFinite(value) || (integer && !Number.isInteger(value))) {
        throw new Error(`${name} must be ${integer ? "an integer" : "a number"}`);
    }
    if (value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}`);
}

export function validateReferenceCount(model, references) {
    const limit = MODELS[normalizeModel(model)].referenceLimit;
    if (references.length > limit) {
        throw new Error(`${model} supports at most ${limit} reference images in this adapter`);
    }
}

export function validateImageRequest(args, references, config = getConfig()) {
    if (!args || typeof args.prompt !== "string" || !args.prompt.trim()) {
        throw new Error("prompt must be a non-empty string");
    }
    for (const key of Object.keys(args)) {
        if (!Object.hasOwn(IMAGE_PARAMETERS.properties, key)) throw new Error(`Unsupported image parameter: ${key}`);
    }
    const model = normalizeModel(args.model, config.defaultModel);
    const { capabilities: cap } = getModelConfig(model, config);
    validateReferenceCount(model, references);
    if (args.filename !== undefined && (typeof args.filename !== "string" || !args.filename.trim())) {
        throw new Error("filename must be a non-empty string");
    }
    if (args.reference_roles !== undefined && (!Array.isArray(args.reference_roles) ||
        args.reference_roles.length !== references.length ||
        args.reference_roles.some((role) => typeof role !== "string" || !role.trim()))) {
        throw new Error("reference_roles must give one non-empty role for each reference image, in order");
    }
    if (args.quality !== undefined && !cap.quality.includes(args.quality)) {
        throw new Error(`${model} does not support quality ${args.quality}; allowed: ${cap.quality.join(", ") || "none"}`);
    }
    if (args.input_fidelity !== undefined) {
        if (!references.length) throw new Error("input_fidelity requires at least one reference image");
        if (!cap.inputFidelity.includes(args.input_fidelity)) {
            throw new Error(`${model} does not support input_fidelity ${args.input_fidelity}. ${cap.fidelityNote || ""}`.trim());
        }
    }
    if (cap.family !== "bfl" && (args.guidance !== undefined || args.steps !== undefined)) {
        throw new Error(`${model} does not support guidance or steps`);
    }
    validateNumber(args.guidance, "guidance", { min: 1.5, max: 10 });
    validateNumber(args.steps, "steps", { integer: true, min: 1, max: 50 });
    for (const key of ["auto_aspect_ratio", "web_grounding"]) {
        if (args[key] !== undefined && (!cap.maiControls || typeof args[key] !== "boolean")) {
            throw new Error(`${key} must be a boolean and is supported only by MAI-Image-2.6`);
        }
    }
    if (cap.family === "mai" && references.length) {
        if (args.size !== undefined) throw new Error(`${model} edits do not support output dimensions`);
        return model;
    }
    const dimensions = parseDimensions(args.size ?? "1024x1024", model);
    if (!dimensions) {
        if (cap.family === "mai") throw new Error(`${model} does not support size "auto"; use auto_aspect_ratio on MAI-Image-2.6`);
        return model;
    }
    const { width, height } = dimensions;
    const limits = cap.dimensions;
    if (limits.multiple && (width % limits.multiple !== 0 || height % limits.multiple !== 0)) {
        throw new Error(`${model} width and height must be multiples of ${limits.multiple}`);
    }
    if (limits.minEdge && Math.min(width, height) < limits.minEdge) {
        throw new Error(`${model} width and height must each be at least ${limits.minEdge}`);
    }
    if (limits.maxEdge && Math.max(width, height) > limits.maxEdge) {
        throw new Error(`${model} longest edge must not exceed ${limits.maxEdge.toLocaleString("en-US")} pixels`);
    }
    if (limits.maxRatio && Math.max(width, height) / Math.min(width, height) > limits.maxRatio) {
        throw new Error(`${model} aspect ratio must not exceed ${limits.maxRatio}:1`);
    }
    if (width * height < (limits.minPixels ?? 1) || width * height > limits.maxPixels) {
        throw new Error(`${model} output must contain ${limits.minPixels ?? 1} to ${limits.maxPixels} pixels`);
    }
    return model;
}

export function getRequestedSettings(args) {
    return Object.fromEntries(Object.entries(args).filter(([key]) =>
        !["prompt", "model", "reference_images", "reference_roles", "filename"].includes(key)));
}

export function getEffectiveSettings(args, references, model = normalizeModel(args.model)) {
    const cap = MODELS[model];
    const editing = references.length > 0;
    const settings = {
        operation: editing ? "edit" : "generate",
        size: cap.family === "mai" && (editing || args.auto_aspect_ratio) ? "provider-determined" : args.size ?? "1024x1024",
        outputFormat: "png",
        referenceCount: references.length,
    };
    if (cap.family === "openai") {
        settings.quality = args.quality ?? "high";
        if (editing && model === MODEL_IDS.GPT) settings.inputFidelity = "high (implicit)";
    } else if (cap.family === "bfl") {
        settings.guidance = args.guidance ?? cap.defaults.guidance;
        settings.steps = args.steps ?? cap.defaults.steps;
    } else if (cap.maiControls) {
        settings.autoAspectRatio = args.auto_aspect_ratio ?? false;
        settings.webGrounding = args.web_grounding ?? false;
        if (!editing) settings.requestedDimensions = args.size ?? "1024x1024";
    }
    return settings;
}

export function formatEffectiveSettings(settings) {
    return Object.entries(settings).map(([name, value]) => `${name}: ${value}`).join(", ");
}

export function buildProviderRequest(args, references, token, config = getConfig()) {
    const model = validateImageRequest(args, references, config);
    const { capabilities: cap, endpoint, deployment, version } = getModelConfig(model, config);
    const effectiveSettings = getEffectiveSettings(args, references, model);
    const headers = { Authorization: `Bearer ${token}` };
    const operation = references.length ? "edits" : "generations";
    let url;
    const fields = { model: deployment, prompt: args.prompt };
    let body;
    if (cap.family === "openai") {
        url = `${endpoint}/openai/v1/images/${operation}?api-version=${encodeURIComponent(config.openaiApiVersion || "preview")}`;
        Object.assign(fields, { n: 1, size: args.size ?? "1024x1024", quality: effectiveSettings.quality, output_format: "png" });
    } else if (cap.family === "bfl") {
        url = `${endpoint}/providers/blackforestlabs/v1/flux-2-flex?api-version=${encodeURIComponent(config.fluxApiVersion || "preview")}`;
        Object.assign(fields, { output_format: "png", ...parseDimensions(args.size ?? "1024x1024", model) });
        if (args.guidance !== undefined) fields.guidance = args.guidance;
        if (args.steps !== undefined) fields.steps = args.steps;
        references.forEach((image, index) => {
            fields[index === 0 ? "input_image" : `input_image_${index + 1}`] = image.data.toString("base64");
        });
    } else {
        url = `${endpoint}/mai/v1/images/${operation}`;
        if (!references.length) Object.assign(fields, parseDimensions(args.size ?? "1024x1024", model));
        if (cap.maiControls) Object.assign(fields, {
            auto_aspect_ratio: effectiveSettings.autoAspectRatio,
            web_grounding: effectiveSettings.webGrounding,
        });
    }
    if (references.length && cap.family !== "bfl") {
        body = new FormData();
        for (const [key, value] of Object.entries(fields)) body.append(key, String(value));
        for (const image of references) {
            body.append(cap.family === "openai" ? "image[]" : "image", new Blob([image.data], { type: image.type }), image.name);
        }
    } else {
        body = JSON.stringify(fields);
        headers["Content-Type"] = "application/json";
    }
    return {
        model, deployment, version, family: cap.family, effectiveSettings,
        requestedSettings: getRequestedSettings(args),
        url, init: { method: "POST", headers, body },
    };
}

export function extractImage(result) {
    const first = result?.data?.[0];
    if (first?.b64_json) return { b64: first.b64_json };
    if (first?.url) return { url: first.url };
    if (typeof result?.result?.sample === "string") return { url: result.result.sample };
    if (typeof result?.sample === "string") return { url: result.sample };
    return null;
}
