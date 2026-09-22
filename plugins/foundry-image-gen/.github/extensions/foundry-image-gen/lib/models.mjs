export const MODEL_IDS = Object.freeze({
    GPT: "gpt-image-2",
    SUNBURST: "gpt-image-2.5-sunburst",
    FLARE: "gpt-image-2.5-flare",
    FLUX: "FLUX.2-flex",
    MAI: "MAI-Image-2.5-Pro",
    MAI26: "MAI-Image-2.6",
});

const gpt = {
    family: "openai",
    referenceLimit: 16,
    dimensions: { multiple: 16, maxEdge: 3840, maxRatio: 3, minPixels: 655_360, maxPixels: 8_294_400 },
    quality: ["low", "medium", "high"],
    inputFidelity: [],
    source: "https://learn.microsoft.com/azure/foundry/openai/how-to/dall-e",
};
const mai = {
    family: "mai",
    referenceLimit: 5,
    dimensions: { minEdge: 768, maxPixels: 1_048_576 },
    quality: [],
    inputFidelity: [],
    source: "https://learn.microsoft.com/azure/foundry/foundry-models/how-to/use-foundry-models-mai-image",
};

// This allowlist describes adapters, not everything available in the Foundry catalog.
export const MODELS = Object.freeze({
    [MODEL_IDS.GPT]: {
        ...gpt,
        deploymentKey: "gptDeployment",
        deploymentEnv: "FOUNDRY_IMAGE_DEPLOYMENT",
        inputFidelity: ["high"],
        fidelityNote: "Always high; omit input_fidelity on the wire.",
    },
    [MODEL_IDS.SUNBURST]: {
        ...gpt,
        deploymentKey: "sunburstDeployment",
        deploymentEnv: "FOUNDRY_IMAGE_SUNBURST_DEPLOYMENT",
        quality: [...gpt.quality, "xhigh", "max", "auto"],
        fidelityNote: "input_fidelity is rejected by the service; never inject a legacy edit default.",
    },
    [MODEL_IDS.FLARE]: {
        ...gpt,
        deploymentKey: "flareDeployment",
        deploymentEnv: "FOUNDRY_IMAGE_FLARE_DEPLOYMENT",
        quality: [...gpt.quality, "xhigh", "max", "auto"],
        fidelityNote: "Model-specific input_fidelity support is unverified; this adapter does not send it.",
    },
    [MODEL_IDS.FLUX]: {
        family: "bfl",
        deploymentKey: "fluxDeployment",
        deploymentEnv: "FOUNDRY_IMAGE_FLUX_DEPLOYMENT",
        referenceLimit: 10,
        dimensions: { minEdge: 64, maxPixels: 4_194_304 },
        defaults: { guidance: 4.5, steps: 50 },
        quality: [],
        inputFidelity: [],
        source: "https://learn.microsoft.com/azure/foundry/foundry-models/how-to/use-foundry-models-flux",
    },
    [MODEL_IDS.MAI]: {
        ...mai,
        deploymentKey: "maiDeployment",
        deploymentEnv: "FOUNDRY_IMAGE_MAI_DEPLOYMENT",
        minIntervalMs: 30_000,
    },
    [MODEL_IDS.MAI26]: {
        ...mai,
        deploymentKey: "mai26Deployment",
        deploymentEnv: "FOUNDRY_IMAGE_MAI26_DEPLOYMENT",
        dimensions: { minEdge: 768, maxPixels: 2_359_296 },
        maiControls: true,
        minIntervalMs: 10_000,
    },
});

export const REFERENCE_LIMITS = Object.freeze(
    Object.fromEntries(Object.entries(MODELS).map(([id, model]) => [id, model.referenceLimit]))
);

export function normalizeModel(model, defaultModel = MODEL_IDS.GPT) {
    const selected = model === undefined ? defaultModel : model;
    if (!Object.hasOwn(MODELS, selected)) throw new Error(`Unsupported model: ${selected}`);
    return selected;
}

export const IMAGE_PARAMETERS = {
    type: "object",
    additionalProperties: false,
    properties: {
        prompt: { type: "string", description: "Exact image prompt" },
        model: {
            type: "string",
            enum: Object.keys(MODELS),
            description: "One model only; uses FOUNDRY_IMAGE_MODEL or gpt-image-2 when omitted",
        },
        size: { type: "string", description: 'WIDTHxHEIGHT or "auto"; validated per model and operation' },
        quality: {
            type: "string",
            enum: [...new Set(Object.values(MODELS).flatMap((model) => model.quality))],
            description: "GPT only; xhigh, max and auto require GPT-Image-2.5",
        },
        reference_images: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: Math.max(...Object.values(REFERENCE_LIMITS)),
            description: "Local PNG/JPEG paths inside the workspace, in reference order",
        },
        reference_roles: {
            type: "array",
            items: { type: "string", minLength: 1 },
            description: "One role per reference, in the same order (copy, style, identity, accepted result)",
        },
        input_fidelity: {
            type: "string",
            enum: [...new Set(Object.values(MODELS).flatMap((model) => model.inputFidelity))],
            description: "Legacy input: only GPT-Image-2 accepts high (implicit, not sent); other uses fail",
        },
        guidance: { type: "number", minimum: 1.5, maximum: 10, description: "FLUX.2-flex only" },
        steps: { type: "integer", minimum: 1, maximum: 50, description: "FLUX.2-flex only" },
        auto_aspect_ratio: { type: "boolean", description: "MAI-Image-2.6 only; defaults to false" },
        web_grounding: { type: "boolean", description: "MAI-Image-2.6 only; defaults to false (no web search)" },
        filename: { type: "string", description: "Output name; a unique run directory prevents overwrites" },
    },
    required: ["prompt"],
};
