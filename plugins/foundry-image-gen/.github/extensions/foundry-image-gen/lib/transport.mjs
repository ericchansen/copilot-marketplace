import { setTimeout as sleep } from "node:timers/promises";
import { MODELS } from "./models.mjs";

export const MAX_ATTEMPTS = 3;
const MAX_WAIT_MS = 120_000;
const deployments = new Map();

export function retryAfterMs(value, now = Date.now()) {
    if (!value) return null;
    if (/^\d+(\.\d+)?$/.test(value)) return Math.ceil(Number(value) * 1000);
    const date = Date.parse(value);
    return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

function failure(message, state, attempts, notBefore) {
    return Object.assign(new Error(message), { state, attempts, notBefore });
}

// Also serializes independent tool calls to the same deployment in this extension.
export async function withDeployment(request, action, { sleepImpl = sleep, now = Date.now } = {}) {
    const key = `${new URL(request.url).origin}/${request.deployment}`;
    const previous = deployments.get(key) ?? { done: Promise.resolve(), next: 0 };
    let release;
    const current = { done: new Promise((resolve) => { release = resolve; }), next: previous.next };
    deployments.set(key, current);
    await previous.done;
    try {
        request.notBefore = Math.max(previous.next, request.notBefore ?? 0);
        const wait = Math.max(0, request.notBefore - now());
        if (wait > MAX_WAIT_MS) throw failure("Deployment is still in its Retry-After window. This job is deferred without submission; resume later.", "deferred", [], request.notBefore);
        if (wait) await sleepImpl(wait);
        return await action();
    } finally {
        current.next = Math.max(now() + (MODELS[request.model].minIntervalMs ?? 0), request.notBefore ?? 0);
        release();
    }
}

export async function executeProviderRequest(request, fetchImpl = fetch, {
    sleepImpl = sleep, now = Date.now,
    attempts = [], onAttempt = () => {}, onResult = () => {},
} = {}) {
    const previous = attempts.at(-1);
    if (previous && (previous.outcome !== "http-error" || !previous.retryable)) {
        throw failure("The prior attempt is not eligible for an automatic paid retry.", previous.outcome === "ambiguous" ? "ambiguous" : "failed", attempts);
    }
    if (previous?.outcome === "http-error" && previous.retryAt && attempts.length < MAX_ATTEMPTS) {
        const wait = Math.max(0, Date.parse(previous.retryAt) - now());
        if (wait > MAX_WAIT_MS) throw failure("Retry-After exceeds this run's wait budget; resume later. No request was sent early.", "deferred", attempts, Date.parse(previous.retryAt));
        if (wait) await sleepImpl(wait);
    }
    for (let number = attempts.length + 1; number <= MAX_ATTEMPTS; number++) {
        const attempt = { number, startedAt: new Date(now()).toISOString(), outcome: "requesting" };
        attempts.push(attempt);
        await onAttempt(attempt);
        let response;
        let result;
        try {
            response = await fetchImpl(request.url, { ...request.init, signal: AbortSignal.timeout(300_000), redirect: "error" });
            attempt.status = response.status;
            attempt.requestId = response.headers?.get("apim-request-id") ??
                response.headers?.get("x-request-id") ?? response.headers?.get("request-id") ?? null;
            if (response.ok) result = await response.json();
            else result = await response.text();
        } catch {
            Object.assign(attempt, {
                outcome: "ambiguous", possibleDuplicateBilling: true,
                elapsedMs: now() - Date.parse(attempt.startedAt),
            });
            await onAttempt(attempt);
            throw failure("Transport interrupted after submission; the provider may have billed it. No automatic paid retry. Resume can recover a saved receipt; otherwise explicitly authorize a replacement job.", "ambiguous", attempts);
        }
        attempt.elapsedMs = now() - Date.parse(attempt.startedAt);
        if (response.ok) {
            attempt.outcome = "received";
            await onResult(result, attempts);
            await onAttempt(attempt);
            return result;
        }
        const retryable = [429, 500, 502, 503, 504].includes(response.status);
        const blocked = /content[_ -]?filter|responsible[_ -]?ai|safety|moderation/i.test(result);
        Object.assign(attempt, {
            outcome: blocked ? "blocked" : "http-error",
            possibleDuplicateBilling: response.status >= 500,
            retryable: retryable && !blocked && number < MAX_ATTEMPTS,
        });
        attempt.retryAfterMs = retryAfterMs(response.headers?.get("retry-after"), now());
        const wait = attempt.retryAfterMs ?? 1000 * 2 ** (number - 1);
        attempt.retryAt = new Date(now() + wait).toISOString();
        if (retryable && attempt.retryAfterMs !== null) request.notBefore = now() + wait;
        await onAttempt(attempt);
        if (blocked || !retryable || number === MAX_ATTEMPTS || wait > MAX_WAIT_MS) {
            const token = request.init.headers.Authorization?.slice("Bearer ".length);
            const detail = token ? String(result).split(token).join("[redacted]") : String(result);
            const state = blocked ? "blocked" : retryable && number < MAX_ATTEMPTS && wait > MAX_WAIT_MS ? "deferred" : "failed";
            throw failure(detail || `HTTP ${response.status}`, state, attempts, request.notBefore);
        }
        await sleepImpl(wait);
    }
    throw failure("This job's bounded request budget is exhausted; it was not submitted again.", "failed", attempts);
}

export async function downloadImage(url, { fetchImpl = fetch, sleepImpl = sleep } = {}) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Image download requires an HTTPS URL without user credentials");
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let response;
        try {
            // Never forward the inference token to an image URL.
            response = await fetchImpl(url, { signal: AbortSignal.timeout(60_000), redirect: "error" });
            if (response.ok) return Buffer.from(await response.arrayBuffer());
        } catch {
            if (attempt === MAX_ATTEMPTS) throw new Error("Image download interrupted; inference will not be repeated");
            response = undefined;
        }
        const wait = retryAfterMs(response?.headers?.get("retry-after")) ?? 1000 * 2 ** (attempt - 1);
        if ((response && ![429, 500, 502, 503, 504].includes(response.status)) || attempt === MAX_ATTEMPTS || wait > MAX_WAIT_MS) {
            throw new Error(`Image download failed (${response?.status ?? "transport"}); inference will not be repeated`);
        }
        await sleepImpl(wait);
    }
}
