// Extension: foundry-image-gen
// Provides a generate_image tool backed by GPT-Image-2 in Azure AI Foundry.

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, truncateSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename, isAbsolute, relative, resolve } from "node:path";

// ── Config ──────────────────────────────────────────────────────────────────
// Override per machine via env vars; defaults target Eric's Foundry resource.
// SUBSCRIPTION pins the token to the resource's tenant regardless of the user's
// default az context (wrong tenant → "500: Unable to get resource information").
// Trim env values so a stray trailing newline/space (common on copy-paste) doesn't
// break the URL or the subscription GUID guard.
const envOr = (name, fallback) => process.env[name]?.trim() || fallback;
const ENDPOINT = envOr("FOUNDRY_IMAGE_ENDPOINT", "https://foundry-eg6typ.openai.azure.com");
const DEPLOYMENT = envOr("FOUNDRY_IMAGE_DEPLOYMENT", "gpt-image-2");
const API_VERSION = envOr("FOUNDRY_IMAGE_API_VERSION", "preview");
const SUBSCRIPTION = envOr("FOUNDRY_IMAGE_SUBSCRIPTION", "9450bd3b-96c5-48b2-bfdf-3374304efbd7");

// ── Helpers ─────────────────────────────────────────────────────────────────
function getEntraToken() {
    // ponytail: SUBSCRIPTION is interpolated into a shell command, so restrict it
    // to a GUID (the only shape the token-pin needs) to block shell injection.
    if (SUBSCRIPTION && !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(SUBSCRIPTION)) {
        throw new Error(`Invalid FOUNDRY_IMAGE_SUBSCRIPTION (expected a GUID): ${SUBSCRIPTION}`);
    }
    const sub = SUBSCRIPTION ? `--subscription ${SUBSCRIPTION} ` : "";
    return execSync(
        `az account get-access-token ${sub}--resource https://cognitiveservices.azure.com --query accessToken -o tsv`,
        { encoding: "utf-8", timeout: 30_000 }
    ).trim();
}

function validateReferenceImages(paths, baseDir = process.cwd()) {
    if (paths === undefined) return [];
    if (!Array.isArray(paths) || paths.length < 1 || paths.length > 5) {
        throw new Error("reference_images must contain 1 to 5 local paths");
    }

    return paths.map((path) => {
        if (typeof path !== "string" || !path.trim()) throw new Error("Each reference image path must be a non-empty string");
        const cleanPath = path.trim();
        const fullPath = resolve(baseDir, cleanPath);
        const fromBase = relative(baseDir, fullPath);
        if (!isAbsolute(cleanPath) && (/^\.\.(?:[\\/]|$)/.test(fromBase) || isAbsolute(fromBase))) {
            throw new Error(`Relative reference image path escapes the workspace: ${cleanPath}`);
        }
        if (!existsSync(fullPath)) throw new Error(`Reference image not found: ${cleanPath}`);
        const file = statSync(fullPath);
        if (!file.isFile()) throw new Error(`Reference image not found: ${cleanPath}`);
        if (file.size >= 50 * 1024 * 1024) throw new Error(`Reference image must be under 50 MB: ${cleanPath}`);

        const data = readFileSync(fullPath);
        const png = data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        const jpeg = data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
        if (!png && !jpeg) throw new Error(`Reference image must be PNG or JPEG: ${cleanPath}`);
        return { data, name: basename(fullPath), type: png ? "image/png" : "image/jpeg" };
    });
}

function buildEditBody(prompt, size, quality, references, inputFidelity) {
    const body = new FormData();
    body.append("model", DEPLOYMENT);
    body.append("prompt", prompt);
    body.append("n", "1");
    body.append("size", size);
    body.append("quality", quality);
    body.append("output_format", "png");
    body.append("input_fidelity", inputFidelity);
    for (const image of references) body.append("image[]", new Blob([image.data], { type: image.type }), image.name);
    return body;
}

const imageApiUrl = (operation) =>
    `${ENDPOINT.replace(/\/+$/, "")}/openai/v1/images/${operation}?api-version=${encodeURIComponent(API_VERSION)}`;

async function callImageApi(token, prompt, size, quality, references, inputFidelity) {
    const operation = references.length ? "edits" : "generations";
    const url = imageApiUrl(operation);
    const body = references.length
        ? buildEditBody(prompt, size, quality, references, inputFidelity)
        : JSON.stringify({ model: DEPLOYMENT, prompt, n: 1, size, quality, output_format: "png" });
    const headers = { Authorization: `Bearer ${token}` };
    if (!references.length) headers["Content-Type"] = "application/json";

    const res = await fetch(url, { method: "POST", headers, body });

    if (res.status === 429) {
        // Single retry after 30s; upgrade to exponential backoff if quota exceeds 10 RPM
        await new Promise((r) => setTimeout(r, 30_000));
        const retry = await fetch(url, { method: "POST", headers, body });
        if (!retry.ok) throw new Error(`API ${retry.status}: ${await retry.text()}`);
        return retry.json();
    }
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return res.json();
}

function runSelfTest() {
    const dir = mkdtempSync(join(tmpdir(), "foundry-image-gen-"));
    try {
        const png = join(dir, "reference.png");
        const jpg = join(dir, "style.jpg");
        const oversized = join(dir, "oversized.png");
        writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        writeFileSync(jpg, Buffer.from([0xff, 0xd8, 0xff]));
        writeFileSync(oversized, "");
        truncateSync(oversized, 50 * 1024 * 1024 + 1);
        const references = validateReferenceImages([`  ${png}  `, "style.jpg"], dir);
        const body = buildEditBody("test", "1024x1024", "high", references, "high");
        assert.equal(body.getAll("image[]").length, 2);
        assert.equal(body.get("input_fidelity"), "high");
        assert.match(imageApiUrl("edits"), /\/openai\/v1\/images\/edits\?api-version=/);
        assert.throws(() => validateReferenceImages([]), /1 to 5/);
        assert.throws(() => validateReferenceImages([join(dir, "missing.png")]), /not found/);
        assert.throws(() => validateReferenceImages([oversized]), /under 50 MB/);
        assert.throws(() => validateReferenceImages(["../reference.png"], join(dir, "workspace")), /escapes the workspace/);
        console.log("foundry-image-gen reference image check passed");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

if (process.argv.includes("--self-test")) {
    runSelfTest();
    process.exit(0);
}

// ── Session ─────────────────────────────────────────────────────────────────
const { joinSession } = await import("@github/copilot-sdk/extension");
const session = await joinSession({
    tools: [
        {
            name: "generate_image",
            description:
                "Generate or edit an image using GPT-Image-2 in Azure AI Foundry. " +
                "Returns the file path of the saved PNG. " +
                "Good for diagrams, illustrations, slide visuals, concept art, logos, and mockups.",
            parameters: {
                type: "object",
                properties: {
                    prompt: { type: "string", description: "Detailed description of the image to generate" },
                    size: {
                        type: "string",
                        description: "Image dimensions",
                        enum: ["1024x1024", "1536x1024", "1024x1536", "auto"],
                    },
                    quality: {
                        type: "string",
                        description: "Image quality",
                        enum: ["low", "medium", "high"],
                    },
                    reference_images: {
                        type: "array",
                        description: "One to five local PNG or JPEG paths to use as edit references",
                        items: { type: "string" },
                        minItems: 1,
                        maxItems: 5,
                    },
                    input_fidelity: {
                        type: "string",
                        description: "Reference-image fidelity for edits (defaults to high)",
                        enum: ["low", "high"],
                    },
                    filename: { type: "string", description: "Output filename without extension" },
                },
                required: ["prompt"],
            },
            handler: async (args) => {
                const prompt = args.prompt;
                const size = args.size || "1024x1024";
                const quality = args.quality || "high";
                const filename = args.filename || "generated-image";
                const inputFidelity = args.input_fidelity || "high";

                let references;
                try {
                    references = validateReferenceImages(args.reference_images, session.workspacePath || process.cwd());
                } catch (e) {
                    return { textResultForLlm: `Invalid reference images: ${e.message}`, resultType: "failure" };
                }

                await session.log(`${references.length ? "Editing" : "Generating"} image...`, { ephemeral: true });

                let token;
                try {
                    token = getEntraToken();
                } catch (e) {
                    return { textResultForLlm: `Auth failed — ensure Azure CLI is installed and run 'az login'. ${e.message}`, resultType: "failure" };
                }

                let result;
                try {
                    result = await callImageApi(token, prompt, size, quality, references, inputFidelity);
                } catch (e) {
                    return { textResultForLlm: `Image generation failed: ${e.message}`, resultType: "failure" };
                }

                const imageData = result.data?.[0];
                if (!imageData?.b64_json && !imageData?.url) {
                    return { textResultForLlm: "API returned no image data.", resultType: "failure" };
                }

                // Save to session workspace or temp
                const outDir = session.workspacePath
                    ? join(session.workspacePath, "files")
                    : join(process.env.TEMP || "/tmp", "foundry-images");
                if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

                // Sanitize filename to prevent path traversal
                const safeName = basename(filename).replace(/[^a-zA-Z0-9_-]/g, "_") || "generated-image";
                const outPath = join(outDir, `${safeName}.png`);
                if (imageData.b64_json) {
                    writeFileSync(outPath, Buffer.from(imageData.b64_json, "base64"));
                } else {
                    const dlRes = await fetch(imageData.url);
                    if (!dlRes.ok) throw new Error(`Image download failed: ${dlRes.status}`);
                    writeFileSync(outPath, Buffer.from(await dlRes.arrayBuffer()));
                }

                await session.log(`Image saved: ${outPath}`);
                const editDetails = references.length ? ` | References: ${references.length} | Fidelity: ${inputFidelity}` : "";
                return `Image saved to: ${outPath}\nPrompt: ${prompt}\nSize: ${size} | Quality: ${quality}${editDetails}`;
            },
        },
    ],
});
