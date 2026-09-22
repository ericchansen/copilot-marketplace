import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, relative } from "node:path";
import { getEntraToken, validateSubscription } from "./azure.mjs";
import { validateImageInputs } from "./input-validation.mjs";
import {
    buildProviderRequest, executeProviderRequest, extractImage, getConfig,
    getEffectiveSettings, getModelConfig, getRequestedSettings,
} from "./providers.mjs";
import { downloadImage, withDeployment } from "./transport.mjs";
import { atomicJson, containedPath, createOutputDir, hash, pngDimensions, readJson, withRunLock } from "./files.mjs";

export const REVIEW_STATES = ["unreviewed", "approved", "revise", "rejected"];
const validId = (id) => typeof id === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id);
const receiptName = (id) => `job-${id}.received.json`;

function prepareJobs(jobs, workspace, config) {
    if (!Array.isArray(jobs) || !jobs.length) throw new Error("At least one explicit image job is required");
    validateSubscription(config.subscription);
    const ids = new Set();
    return jobs.map(({ id, args }) => {
        if (!validId(id) || ids.has(id.toLowerCase())) throw new Error("Image job IDs must be unique safe names");
        ids.add(id.toLowerCase());
        const { model, references } = validateImageInputs(args, workspace, config);
        const normalized = { ...args, model };
        if (args.reference_images) {
            normalized.reference_images = args.reference_images.map((path) => relative(workspace, containedPath(workspace, path)));
        }
        const { capabilities, endpoint, deployment, version } = getModelConfig(model, config);
        const referenceHashes = references.map((image, index) => ({
            index: index + 1, sha256: hash(image.data), role: args.reference_roles?.[index] ?? "unspecified",
        }));
        const identity = {
            model, deployment, deploymentVersion: version, family: capabilities.family, endpointHash: hash(endpoint),
            apiVersion: capabilities.family === "openai" ? config.openaiApiVersion || "preview" :
                capabilities.family === "bfl" ? config.fluxApiVersion || "preview" : "v1",
        };
        const effectiveSettings = getEffectiveSettings(normalized, references, model);
        const requestedSettings = getRequestedSettings(normalized);
        return {
            references,
            record: {
                id, args: normalized, ...identity, modelVersion: version,
                inputHash: hash({ ...identity, prompt: args.prompt, referenceHashes, requestedSettings, effectiveSettings }),
                promptHash: hash(args.prompt), referenceHashes, requestedSettings, effectiveSettings,
                state: "pending", attempts: [], review: { status: "unreviewed", copyNotes: "", visualNotes: "" },
            },
        };
    });
}

function numericUsage(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    return Object.fromEntries(Object.entries(value)
        .filter(([key]) => /^[a-zA-Z0-9_]+$/.test(key))
        .map(([key, child]) => [key, numericUsage(child)]).filter(([, child]) => child !== undefined));
}

function resultMetadata(result, record) {
    const version = result?.model_version ?? result?.modelVersion;
    return {
        modelVersion: typeof version === "string" ? version : record.modelVersion,
        usage: numericUsage(result?.usage) ?? null,
        responseQuality: typeof result?.quality === "string" ? result.quality : null,
        elapsedMs: record.attempts.reduce((sum, attempt) => sum + (attempt.elapsedMs ?? 0), 0),
    };
}

function finishReceipt(runDir, record) {
    const receipt = readJson(runDir, receiptName(record.id));
    if (receipt.inputHash !== record.inputHash || typeof receipt.b64 !== "string") {
        throw new Error("Saved receipt does not match this job; no inference was repeated");
    }
    const bytes = Buffer.from(receipt.b64, "base64");
    const dimensions = pngDimensions(bytes);
    const sha256 = hash(bytes);
    if (record.output && record.output.sha256 !== sha256) {
        throw new Error("Saved receipt PNG does not match the completed output; no image was replaced");
    }
    let image = record.output?.file ?? `job-${record.id}.png`;
    if (existsSync(join(runDir, image))) {
        const existing = readFileSync(containedPath(runDir, image));
        if (hash(existing) !== sha256) image = `job-${record.id}-${randomUUID().slice(0, 8)}.png`;
    }
    if (!existsSync(join(runDir, image))) writeFileSync(join(runDir, image), bytes, { flag: "wx", flush: true });
    Object.assign(record, {
        modelVersion: receipt.metadata.modelVersion, usage: receipt.metadata.usage,
        responseQuality: receipt.metadata.responseQuality, elapsedMs: receipt.metadata.elapsedMs,
        state: "generated", output: { file: image, sha256, ...dimensions }, error: null,
    });
}

export function verifyOutput(runDir, record) {
    if (!record.output || typeof record.output.file !== "string") throw new Error(`Job ${record.id} has no saved image`);
    const bytes = readFileSync(containedPath(runDir, record.output.file));
    const dimensions = pngDimensions(bytes);
    if (hash(bytes) !== record.output.sha256 ||
        dimensions.width !== record.output.width || dimensions.height !== record.output.height) {
        throw new Error(`Job ${record.id} image does not match its saved hash/dimensions`);
    }
    return bytes;
}

export function loadRun(workspace, run) {
    const runDir = containedPath(workspace, run);
    const journal = readJson(runDir, "journal.json");
    if (journal.version !== 1 || !Array.isArray(journal.jobs) || !journal.jobs.length ||
        journal.jobs.some((job) => !validId(job.id) || !job.args || !Array.isArray(job.attempts) ||
            !REVIEW_STATES.includes(job.review?.status) ||
            (job.notBefore !== undefined && (!Number.isFinite(job.notBefore) || job.notBefore < 0)) ||
            (job.output && !/^[a-zA-Z0-9_-]+\.png$/.test(job.output.file)))) {
        throw new Error("Invalid image run journal");
    }
    return { runDir, journal };
}

function summary(runDir, journal) {
    return {
        run: runDir,
        jobs: journal.jobs.map((job) => ({
            id: job.id, state: job.state, model: job.model, deployment: job.deployment,
            image: job.output ? join(runDir, job.output.file) : null,
            requestedSettings: job.requestedSettings, effectiveSettings: job.effectiveSettings,
            dimensions: job.output ? { width: job.output.width, height: job.output.height } : null,
            attempts: job.attempts.length,
            possibleDuplicateBilling: job.attempts.some((attempt) => attempt.possibleDuplicateBilling),
            review: job.review, error: job.error ?? null,
        })),
    };
}

function markReceiptlessAmbiguous(record, reason) {
    record.state = "ambiguous";
    const attempt = record.attempts.at(-1);
    if (attempt) Object.assign(attempt, { outcome: "ambiguous", possibleDuplicateBilling: true });
    record.error = `${reason} Possible duplicate billing. No automatic paid retry. Explicitly authorize a replacement job if recovery is unavailable.`;
}

async function executeRun(runDir, prepared, config, options) {
    return withRunLock(runDir, async () => {
        const diagnostics = [];
        const { journal } = loadRun(runDir, ".");
        if (journal.jobs.length !== prepared.length || journal.jobs.some((job, index) =>
            job.id !== prepared[index].record.id || job.inputHash !== prepared[index].record.inputHash)) {
            throw new Error("Run inputs changed before execution; no inference was submitted");
        }
        const save = () => atomicJson(join(runDir, "journal.json"), journal);
        for (let index = 0; index < journal.jobs.length; index++) {
            const record = journal.jobs[index];
            if (record.state === "generated") {
                try {
                    verifyOutput(runDir, record);
                    continue;
                } catch (error) {
                    record.error = error.message;
                    record.state = "output-error";
                }
            }
            if (existsSync(join(runDir, receiptName(record.id)))) {
                try {
                    finishReceipt(runDir, record);
                } catch (error) {
                    record.state = "output-error";
                    record.error = error.message;
                }
                save();
                continue;
            }
            if (["requesting", "received"].includes(record.state) ||
                (record.state === "output-error" && record.attempts.at(-1)?.outcome === "received")) {
                markReceiptlessAmbiguous(record, "Previous execution stopped after submission without a saved receipt.");
            }
            if (!["pending", "retrying", "deferred"].includes(record.state)) { save(); continue; }
            try {
                const token = await (options.tokenProvider ?? getEntraToken)(config.subscription);
                const request = buildProviderRequest(record.args, prepared[index].references, token, config);
                request.notBefore = Math.max(0, ...journal.jobs.filter((job) =>
                    job.deployment === record.deployment && job.endpointHash === record.endpointHash
                ).flatMap((job) => [
                    job.notBefore ?? 0,
                    ...job.attempts.filter((attempt) => attempt.retryAfterMs > 0).map((attempt) => Date.parse(attempt.retryAt)),
                ]));
                await withDeployment(request, () => executeProviderRequest(request, options.fetchImpl, {
                    ...options,
                    attempts: record.attempts,
                    onAttempt: () => {
                        const last = record.attempts.at(-1);
                        if (last.outcome === "requesting") record.state = "requesting";
                        else if (["ambiguous", "blocked"].includes(last.outcome)) record.state = last.outcome;
                        else if (last.outcome === "http-error") record.state = last.retryable ? "retrying" : "failed";
                        save();
                    },
                    onResult: async (result) => {
                        record.state = "received";
                        save();
                        const image = extractImage(result);
                        if (!image) throw new Error("Provider returned no image data");
                        const b64 = image.b64 ?? (await downloadImage(image.url, options)).toString("base64");
                        atomicJson(join(runDir, receiptName(record.id)), {
                            inputHash: record.inputHash, b64, metadata: resultMetadata(result, record),
                        });
                        finishReceipt(runDir, record);
                        save();
                    },
                }), options);
            } catch (error) {
                const previous = record.state;
                if (error.state === "deferred") record.notBefore = error.notBefore;
                record.state = error.state ?? (previous === "received" ? "output-error" : "failed");
                // HTTP bodies can echo secrets or signed URLs. Persist and surface only classifications.
                record.error = error.state
                    ? `${error.state}: ${record.attempts.at(-1)?.status ?? "not-submitted"}. ${error.state === "ambiguous" ? "Possible duplicate billing; not retried." :
                        error.state === "deferred" ? "Retry-After exceeds the wait budget; resume later." : "Inspect provider diagnostics; unchanged inputs were retained."}`
                    : error.message;
                if (previous === "received" && !existsSync(join(runDir, receiptName(record.id)))) {
                    markReceiptlessAmbiguous(record, `No receipt was saved: ${record.error}.`);
                }
                diagnostics.push({ id: record.id, message: record.error });
                save();
                if (options.onError) await options.onError({ id: record.id, message: record.error });
            }
        }
        return { ...summary(runDir, journal), ...(diagnostics.length ? { diagnostics } : {}) };
    });
}

export async function startRun(jobs, workspace, config = getConfig(), options = {}) {
    const prepared = prepareJobs(jobs, workspace, config);
    const runDir = createOutputDir(options.outputWorkspace ?? workspace, jobs.length === 1 ? jobs[0].args.filename ?? "generated-image" : "image-run");
    const journal = { version: 1, createdAt: new Date().toISOString(), jobs: prepared.map((job) => job.record) };
    atomicJson(join(runDir, "journal.json"), journal);
    return executeRun(runDir, prepared, config, options);
}

export async function resumeRun(run, workspace, config = getConfig(), options = {}) {
    const { runDir, journal } = loadRun(options.outputWorkspace ?? workspace, run);
    const prepared = prepareJobs(journal.jobs, workspace, config);
    for (let index = 0; index < journal.jobs.length; index++) {
        if (journal.jobs[index].inputHash !== prepared[index].record.inputHash) {
            throw new Error(`Job ${journal.jobs[index].id} inputs, references, or deployment configuration changed. Replan explicitly; resume submits nothing.`);
        }
    }
    return executeRun(runDir, prepared, config, options);
}

export async function reviewRun(run, workspace, id, status, { copyNotes = "", visualNotes = "" } = {}) {
    if (!REVIEW_STATES.includes(status) || typeof copyNotes !== "string" || typeof visualNotes !== "string") {
        throw new Error("Review needs unreviewed/approved/revise/rejected and string copy/visual notes");
    }
    const { runDir } = loadRun(workspace, run);
    return withRunLock(runDir, async () => {
        const { journal } = loadRun(runDir, ".");
        const job = journal.jobs.find((item) => item.id === id);
        if (!job || job.state !== "generated") throw new Error("Review requires a generated job ID");
        verifyOutput(runDir, job);
        job.review = { status, copyNotes, visualNotes };
        atomicJson(join(runDir, "journal.json"), journal);
        return summary(runDir, journal);
    });
}
