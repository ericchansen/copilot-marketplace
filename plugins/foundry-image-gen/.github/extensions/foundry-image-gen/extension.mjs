// Extension: foundry-image-gen
// Provides a generate_image tool backed by GPT-Image-2 in Azure AI Foundry.

import { joinSession } from "@github/copilot-sdk/extension";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

// ── Config (edit these if your deployment changes) ──────────────────────────
const ENDPOINT = "https://foundry-eg6typ.cognitiveservices.azure.com";
const DEPLOYMENT = "gpt-image-2";
const API_VERSION = "2025-04-01-preview";

// ── Helpers ─────────────────────────────────────────────────────────────────
function getEntraToken() {
    return execSync(
        "az account get-access-token --resource https://cognitiveservices.azure.com --query accessToken -o tsv",
        { encoding: "utf-8", timeout: 30_000 }
    ).trim();
}

async function callImageApi(token, prompt, size, quality) {
    const url = `${ENDPOINT}/openai/deployments/${DEPLOYMENT}/images/generations?api-version=${API_VERSION}`;
    const body = JSON.stringify({ prompt, n: 1, size, quality, output_format: "png" });
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

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

// ── Session ─────────────────────────────────────────────────────────────────
const session = await joinSession({
    tools: [
        {
            name: "generate_image",
            description:
                "Generate an image using GPT-Image-2 in Azure AI Foundry. " +
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
                    filename: { type: "string", description: "Output filename without extension" },
                },
                required: ["prompt"],
            },
            handler: async (args) => {
                const prompt = args.prompt;
                const size = args.size || "1024x1024";
                const quality = args.quality || "high";
                const filename = args.filename || "generated-image";

                await session.log(`Generating image...`, { ephemeral: true });

                let token;
                try {
                    token = getEntraToken();
                } catch (e) {
                    return { textResultForLlm: `Auth failed — ensure Azure CLI is installed and run 'az login'. ${e.message}`, resultType: "failure" };
                }

                let result;
                try {
                    result = await callImageApi(token, prompt, size, quality);
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
                return `Image saved to: ${outPath}\nPrompt: ${prompt}\nSize: ${size} | Quality: ${quality}`;
            },
        },
    ],
});
