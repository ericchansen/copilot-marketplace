import assert from "node:assert/strict";
import test from "node:test";
import { buildProviderRequest, executeProviderRequest } from "../lib/providers.mjs";
import { downloadImage, retryAfterMs, withDeployment } from "../lib/transport.mjs";
import { config, imageResponse, offlineOptions, png } from "./helpers.mjs";

const request = () => buildProviderRequest({ prompt: "A public garden" }, [], "fixture-auth-token", config);

test("bounded transient retries honor Retry-After and preserve the request", async () => {
    const req = request();
    const waits = [];
    const attempts = [];
    const bodies = [];
    const received = [];
    let count = 0;
    const result = await executeProviderRequest(req, async (_url, init) => {
        count++;
        bodies.push(init.body);
        return count === 1 ? new Response("busy", { status: 429, headers: { "retry-after": "2", "apim-request-id": "throttled" } }) :
            count === 2 ? new Response("temporary", { status: 503 }) : imageResponse();
    }, { sleepImpl: async (ms) => waits.push(ms), attempts, onResult: (value) => received.push(value) });
    assert.equal(count, 3);
    assert.deepEqual(waits, [2000, 2000]);
    assert.ok(bodies.every((body) => body === req.init.body));
    assert.equal(attempts[0].requestId, "throttled");
    assert.equal(attempts[1].possibleDuplicateBilling, true);
    assert.equal(attempts[2].outcome, "received");
    assert.equal(received[0], result);
});

test("invalid parameters, safety blocks, and oversized Retry-After do not loop", async () => {
    for (const [status, body, retryAfter] of [[400, "invalid", "1"], [429, "content_filter", "1"], [429, "busy", "600"]]) {
        let calls = 0;
        await assert.rejects(executeProviderRequest(request(), async () => {
            calls++;
            return new Response(body, { status, headers: { "retry-after": retryAfter } });
        }, { sleepImpl: () => assert.fail("must not wait/retry") }));
        assert.equal(calls, 1);
    }
    let calls = 0;
    await assert.rejects(executeProviderRequest(request(), async () => {
        calls++;
        return new Response("busy", { status: 503 });
    }, { sleepImpl: async () => {} }), (error) => error.attempts.length === 3);
    assert.equal(calls, 3);
});

test("transport and truncated response failures are ambiguous, not automatic paid retries", async () => {
    for (const fetchImpl of [
        async () => { throw new Error("connection reset"); },
        async () => ({ ok: true, status: 200, json: async () => { throw new Error("truncated JSON"); } }),
    ]) {
        const attempts = [];
        await assert.rejects(executeProviderRequest(request(), fetchImpl, { attempts }),
            (error) => error.state === "ambiguous" && /may have billed/.test(error.message));
        assert.equal(attempts.length, 1);
        assert.equal(attempts[0].possibleDuplicateBilling, true);
    }
});

test("Retry-After dates and resumed attempts preserve wait and total budget", async () => {
    const now = Date.parse("2026-09-01T00:00:00Z");
    assert.equal(retryAfterMs("Tue, 01 Sep 2026 00:00:03 GMT", now), 3000);
    assert.equal(retryAfterMs("invalid", now), null);
    const attempts = [
        { number: 1, outcome: "http-error", retryable: true, retryAt: new Date(now + 4000).toISOString() },
        { number: 2, outcome: "http-error", retryable: true, retryAt: new Date(now + 4000).toISOString() },
    ];
    const waits = [];
    await executeProviderRequest(request(), async () => imageResponse(), {
        attempts, now: () => now, sleepImpl: async (ms) => waits.push(ms),
    });
    assert.deepEqual(waits, [4000]);
    assert.equal(attempts.length, 3);
    await assert.rejects(executeProviderRequest(request(), () => assert.fail(), { attempts }), /not eligible/);
});

test("persisted invalid or blocked attempts cannot become retries after interruption", async () => {
    for (const prior of [
        { number: 1, outcome: "http-error", status: 400, retryable: false },
        { number: 1, outcome: "blocked", status: 400, retryable: false },
        { number: 1, outcome: "ambiguous", possibleDuplicateBilling: true },
    ]) {
        await assert.rejects(executeProviderRequest(request(), () => assert.fail("no paid request"), { attempts: [prior] }), /not eligible/);
    }
});

test("requests sharing a deployment serialize without holding other deployments", async () => {
    const req = request();
    const events = [];
    let release;
    const first = withDeployment(req, async () => {
        events.push("first-start");
        await new Promise((resolve) => { release = resolve; });
        events.push("first-end");
    });
    const second = withDeployment(req, async () => { events.push("second"); });
    await withDeployment({ ...req, deployment: "independent" }, async () => { events.push("independent"); });
    assert.deepEqual(events, ["first-start", "independent"]);
    release();
    await Promise.all([first, second]);
    assert.deepEqual(events, ["first-start", "independent", "first-end", "second"]);
});

test("deferring another call preserves the shared deployment cooldown", async () => {
    const clock = Date.parse("2030-01-01T00:00:00Z");
    const first = { ...request(), deployment: "shared-cooldown" };
    const options = { now: () => clock, sleepImpl: () => assert.fail("wait exceeds budget") };
    await assert.rejects(withDeployment(first, () => executeProviderRequest(first,
        async () => new Response("busy", { status: 429, headers: { "retry-after": "600" } }), options
    ), options), (error) => error.state === "deferred");
    for (let index = 0; index < 3; index++) {
        await assert.rejects(withDeployment({ ...request(), deployment: first.deployment },
            () => assert.fail("cooldown must prevent submission"), options),
        (error) => error.state === "deferred" && error.notBefore === clock + 600_000);
    }
});

test("image retrieval retries only GET and never sends inference credentials", async () => {
    let calls = 0;
    const bytes = png();
    const options = offlineOptions({
        fetchImpl: async (_url, init) => {
            calls++;
            assert.equal(init.headers, undefined);
            assert.equal(init.method, undefined);
            return calls === 1 ? new Response("", { status: 503 }) : new Response(bytes);
        },
    });
    assert.deepEqual(await downloadImage("https://assets.example.test/image.png?sig=fixture", options), bytes);
    assert.equal(calls, 2);
    await assert.rejects(downloadImage("http://assets.example.test/image.png", options), /HTTPS/);
});
