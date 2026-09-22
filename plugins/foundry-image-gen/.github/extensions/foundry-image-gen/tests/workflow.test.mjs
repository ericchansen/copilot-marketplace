import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { atomicJson, hash, pngDimensions, readJson } from "../lib/files.mjs";
import { recipeJobs } from "../lib/recipes.mjs";
import { MODEL_IDS } from "../lib/providers.mjs";
import { loadRun, resumeRun, reviewRun, startRun } from "../lib/workflow.mjs";
import { config, imageResponse, offlineOptions, png } from "./helpers.mjs";

function workspace(t) {
    const root = mkdtempSync(join(tmpdir(), "foundry-run-test-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    return root;
}
const job = (id, args = {}) => ({ id, args: { prompt: "A public garden", ...args } });

test("content packs never contaminate other prompts, including exclusions", () => {
    const recipe = {
        version: 1,
        content: {
            route: { brief: "Trail map", copy: ["Distance: 42 km"], associations: ["42 km belongs to trail distance"], sources: ["https://example.com/trail"] },
            market: { brief: "Market poster", copy: ["8 stalls", "3 gardens", "1 stage"] },
        },
        designs: { paper: "Layered paper with open composition", ink: "Black ink on white; invent a new layout" },
        jobs: [
            { id: "route-a", content: "route", design: "paper", model: MODEL_IDS.SUNBURST },
            { id: "route-b", content: "route", design: "paper", model: MODEL_IDS.MAI26 },
            { id: "route-c", content: "route", design: "ink", model: MODEL_IDS.SUNBURST },
        ],
    };
    const jobs = recipeJobs(recipe);
    assert.equal(jobs.length, 3);
    assert.equal(jobs[0].args.prompt, jobs[1].args.prompt);
    assert.ok(jobs.every((item) => !/8 stalls|3 gardens|1 stage|Market poster/.test(item.args.prompt)));
    assert.ok(jobs.every((item) => item.args.prompt.includes("42 km belongs to trail distance")));
    assert.ok(!jobs[2].args.prompt.includes("Layered paper"));
    assert.equal(recipeJobs({ ...recipe, jobs: [recipe.jobs[0]] }).length, 1);
    assert.throws(() => recipeJobs({ ...recipe, jobs: [] }), /non-empty explicit jobs/);
    assert.throws(() => recipeJobs({ ...recipe, jobs: [{ ...recipe.jobs[0], model: undefined }] }), /explicit model/);
    assert.throws(() => recipeJobs({ ...recipe, jobs: [{ ...recipe.jobs[0], settings: { prompt: "injected" } }] }), /controls only/);
    assert.throws(() => recipeJobs({ ...recipe, jobs: [recipe.jobs[0], { ...recipe.jobs[0], id: "ROUTE-A" }] }), /unique/);
});

test("prompt-only generation makes one inference request and never overwrites", async (t) => {
    const root = workspace(t);
    let calls = 0;
    const options = offlineOptions({ fetchImpl: async (_url, init) => {
        calls++;
        const body = JSON.parse(init.body);
        assert.equal(body.model, MODEL_IDS.GPT);
        assert.equal(body.n, 1);
        return imageResponse();
    } });
    const first = await startRun([job("image")], root, config, options);
    assert.equal(calls, 1);
    const original = readFileSync(first.jobs[0].image);
    const second = await startRun([job("image")], root, config, options);
    assert.equal(calls, 2);
    assert.notEqual(first.run, second.run);
    assert.deepEqual(readFileSync(first.jobs[0].image), original);
    assert.equal(first.jobs[0].review.status, "unreviewed");
    assert.deepEqual(first.jobs[0].dimensions, { width: 3, height: 2 });
    assert.ok(!existsSync(join(first.run, "index.html")));
    const { journal } = loadRun(root, first.run);
    const saved = journal.jobs[0];
    assert.equal(saved.modelVersion, "fixture-version");
    assert.equal(saved.promptHash, hash("A public garden"));
    assert.equal(saved.attempts[0].requestId, "fixture-request");
    assert.deepEqual(saved.requestedSettings, {});
    assert.equal(saved.effectiveSettings.quality, "high");
    assert.equal(saved.usage.total_tokens, 42);
    for (const file of readdirSync(first.run)) {
        assert.ok(!readFileSync(join(first.run, file)).includes(Buffer.from("fixture-auth-token")));
        assert.ok(!readFileSync(join(first.run, file)).includes(Buffer.from("Authorization")));
    }
});

test("validates every job before auth, output directories, or inference", async (t) => {
    const root = workspace(t);
    await assert.rejects(startRun([job("valid"), job("invalid", { model: MODEL_IDS.MAI26, quality: "high" })], root, config,
        { tokenProvider: () => assert.fail("no auth"), fetchImpl: () => assert.fail("no inference") }), /does not support quality/);
    assert.deepEqual(readdirSync(root), []);
});

test("reference roles and hashes preserve order, and changed inputs stop resume", async (t) => {
    const root = workspace(t);
    writeFileSync(join(root, "copy.png"), png(4, 3));
    writeFileSync(join(root, "style.png"), png(3, 4));
    const result = await startRun([job("edit", {
        model: MODEL_IDS.SUNBURST, reference_images: ["copy.png", "style.png"], reference_roles: ["exact copy only", "palette only"],
    })], root, config, offlineOptions());
    const saved = loadRun(root, result.run).journal.jobs[0];
    assert.deepEqual(saved.referenceHashes.map((ref) => ref.role), ["exact copy only", "palette only"]);
    assert.deepEqual(saved.referenceHashes.map((ref) => ref.sha256), [hash(png(4, 3)), hash(png(3, 4))]);
    await resumeRun(result.run, root, config, offlineOptions({ fetchImpl: () => assert.fail("verified images skip") }));
    writeFileSync(join(root, "copy.png"), png(6, 5));
    await assert.rejects(resumeRun(result.run, root, config, offlineOptions({ fetchImpl: () => assert.fail() })), /changed/);
});

test("a changed selected deployment version stops resume before authentication or inference", async (t) => {
    const root = workspace(t);
    const clock = Date.parse("2030-01-01T00:00:00Z");
    const initial = { ...config, gptDeployment: "versioned-fixture", deploymentVersions: { [MODEL_IDS.GPT]: "version-1" } };
    const result = await startRun([job("image")], root, initial, offlineOptions({
        now: () => clock,
        fetchImpl: async () => new Response("busy", { status: 429, headers: { "retry-after": "600" } }),
    }));
    assert.equal(result.jobs[0].state, "deferred");
    const original = readFileSync(join(result.run, "journal.json"));
    let authCalls = 0;
    let inferenceCalls = 0;
    const options = offlineOptions({
        now: () => clock + 601_000,
        tokenProvider: () => { authCalls++; return "fixture-auth-token"; },
        fetchImpl: async () => { inferenceCalls++; return imageResponse(); },
    });
    await assert.rejects(resumeRun(result.run, root, {
        ...initial, deploymentVersions: { [MODEL_IDS.GPT]: "version-2" },
    }, options), /configuration changed.*Replan explicitly/);
    assert.equal(authCalls, 0);
    assert.equal(inferenceCalls, 0);
    assert.deepEqual(readFileSync(join(result.run, "journal.json")), original);
    const resumed = await resumeRun(result.run, root, {
        ...initial, deploymentVersions: { ...initial.deploymentVersions, [MODEL_IDS.MAI26]: "unselected-version" },
    }, options);
    assert.equal(authCalls, 1);
    assert.equal(inferenceCalls, 1);
    assert.equal(resumed.jobs[0].state, "generated");
    const saved = loadRun(root, result.run).journal.jobs[0];
    assert.equal(saved.deploymentVersion, "version-1");
    assert.equal(saved.modelVersion, "fixture-version");
});

test("a blocked cell preserves earlier output and does not cancel unrelated cells", async (t) => {
    const root = workspace(t);
    let calls = 0;
    const result = await startRun([job("first"), job("blocked"), job("last")], root, config, offlineOptions({
        fetchImpl: async () => {
            calls++;
            if (calls > 1) {
                const run = join(root, "files", readdirSync(join(root, "files"))[0]);
                assert.equal(readJson(run, "journal.json").jobs[0].state, "generated");
                assert.ok(existsSync(join(run, "job-first.png")));
            }
            return calls === 2 ? new Response('{"error":{"code":"content_filter"}}', { status: 400 }) : imageResponse();
        },
    }));
    assert.equal(calls, 3);
    assert.deepEqual(result.jobs.map((item) => item.state), ["generated", "blocked", "generated"]);
    const resumed = await resumeRun(result.run, root, config, offlineOptions({ fetchImpl: () => assert.fail("no retries") }));
    assert.deepEqual(resumed.jobs.map((item) => item.state), ["generated", "blocked", "generated"]);
});

test("resumes pending work and recovers received PNGs without another paid request", async (t) => {
    const root = workspace(t);
    const result = await startRun([job("saved"), job("received"), job("pending")], root, config, offlineOptions());
    const { journal } = loadRun(root, result.run);
    journal.jobs[1].state = "requesting";
    rmSync(result.jobs[1].image);
    journal.jobs[2].state = "pending";
    journal.jobs[2].attempts = [];
    journal.jobs[2].output = undefined;
    rmSync(join(result.run, "job-pending.received.json"));
    rmSync(result.jobs[2].image);
    atomicJson(join(result.run, "journal.json"), journal);
    let calls = 0;
    const resumed = await resumeRun(result.run, root, config, offlineOptions({ fetchImpl: async () => { calls++; return imageResponse(); } }));
    assert.equal(calls, 1);
    assert.ok(resumed.jobs.every((item) => item.state === "generated"));
    assert.deepEqual(readFileSync(resumed.jobs[1].image), png());
});

test("interrupted submission is held as ambiguous while pending jobs can continue", async (t) => {
    const root = workspace(t);
    let calls = 0;
    const result = await startRun([job("uncertain"), job("next")], root, config, offlineOptions({
        fetchImpl: async () => { calls++; if (calls === 1) throw new Error("connection reset"); return imageResponse(); },
    }));
    assert.deepEqual(result.jobs.map((item) => item.state), ["ambiguous", "generated"]);
    assert.equal(calls, 2);
    await resumeRun(result.run, root, config, offlineOptions({ fetchImpl: () => assert.fail("ambiguous is not retried") }));
    const { journal } = loadRun(root, result.run);
    assert.equal(journal.jobs[0].attempts[0].possibleDuplicateBilling, true);
});

test("receipt-less interrupted jobs become ambiguous while saved receipts and pending work recover", async (t) => {
    const root = workspace(t);
    const result = await startRun(["requesting", "received", "output-error", "recoverable", "pending"].map((id) => job(id)), root, config, offlineOptions());
    const { journal } = loadRun(root, result.run);
    for (const [index, state] of ["requesting", "received", "output-error", "received", "pending"].entries()) {
        const record = journal.jobs[index];
        record.state = state;
        delete record.output;
        if (state === "pending") record.attempts = [];
        if (state === "requesting") record.attempts[0].outcome = "requesting";
        rmSync(result.jobs[index].image);
        if (index !== 3) rmSync(join(result.run, `job-${record.id}.received.json`));
    }
    atomicJson(join(result.run, "journal.json"), journal);
    let authCalls = 0;
    let inferenceCalls = 0;
    const resumed = await resumeRun(result.run, root, config, offlineOptions({
        tokenProvider: () => { authCalls++; return "fixture-auth-token"; },
        fetchImpl: async () => { inferenceCalls++; return imageResponse(); },
    }));
    assert.equal(authCalls, 1);
    assert.equal(inferenceCalls, 1);
    assert.deepEqual(resumed.jobs.map((item) => item.state), ["ambiguous", "ambiguous", "ambiguous", "generated", "generated"]);
    for (const interrupted of resumed.jobs.slice(0, 3)) {
        assert.equal(interrupted.image, null);
        assert.equal(interrupted.possibleDuplicateBilling, true);
        assert.match(interrupted.error, /No automatic paid retry/);
        assert.match(interrupted.error, /authorize a replacement job/);
    }
    const again = await resumeRun(result.run, root, config, offlineOptions({
        tokenProvider: () => assert.fail("no new authentication"),
        fetchImpl: () => assert.fail("no paid resubmission"),
    }));
    assert.deepEqual(again.jobs, resumed.jobs);
    assert.deepEqual(loadRun(root, result.run).journal.jobs.map((item) => item.state), ["ambiguous", "ambiguous", "ambiguous", "generated", "generated"]);
});

test("receipt-less post-response failures disclose billing risk and require explicit replacement", async (t) => {
    for (const kind of ["missing-image", "download-failure"]) {
        await t.test(kind, async (inner) => {
            const root = workspace(inner);
            let submissions = 0;
            let downloads = 0;
            const result = await startRun([job("image")], root, config, offlineOptions({
                fetchImpl: async (_url, init) => {
                    if (init.method === "POST") {
                        submissions++;
                        return new Response(JSON.stringify({ data: kind === "missing-image" ? [] :
                            [{ url: "https://assets.example.test/image.png?sig=fixture" }] }));
                    }
                    downloads++;
                    return new Response("", { status: 403 });
                },
            }));
            assert.equal(submissions, 1);
            assert.equal(downloads, kind === "missing-image" ? 0 : 1);
            assert.equal(result.jobs[0].state, "ambiguous");
            assert.equal(result.jobs[0].possibleDuplicateBilling, true);
            assert.match(result.jobs[0].error, kind === "missing-image" ? /no image data/ : /download failed \(403\)/);
            assert.match(result.jobs[0].error, /No automatic paid retry/);
            assert.match(result.jobs[0].error, /authorize a replacement job/);
            assert.equal(result.diagnostics[0].message, result.jobs[0].error);
            assert.equal(existsSync(join(result.run, "job-image.received.json")), false);
            const saved = loadRun(root, result.run).journal.jobs[0];
            assert.equal(saved.attempts.length, 1);
            assert.equal(saved.attempts[0].outcome, "ambiguous");
            assert.equal(saved.attempts[0].possibleDuplicateBilling, true);
            const resumed = await resumeRun(result.run, root, config, offlineOptions({
                tokenProvider: () => assert.fail("no authentication for an ambiguous job"),
                fetchImpl: () => assert.fail("no automatic paid replacement"),
            }));
            assert.deepEqual(resumed.jobs, result.jobs);
        });
    }
});

test("review is separate from generation and raw outputs remain unchanged", async (t) => {
    const root = workspace(t);
    const result = await startRun([job("image")], root, config, offlineOptions());
    const original = readFileSync(result.jobs[0].image);
    const reviewed = await reviewRun(result.run, root, "image", "revise", { copyNotes: "One label missing", visualNotes: "Explore a new layout" });
    assert.equal(reviewed.jobs[0].review.status, "revise");
    assert.equal(reviewed.jobs[0].state, "generated");
    assert.deepEqual(readFileSync(result.jobs[0].image), original);
    await assert.rejects(reviewRun(result.run, root, "image", "published"), /unreviewed/);
});

test("corrupt output is recovered to a new path, never overwritten or regenerated", async (t) => {
    const root = workspace(t);
    const result = await startRun([job("CON")], root, config, offlineOptions());
    writeFileSync(result.jobs[0].image, "corrupted fixture");
    const resumed = await resumeRun(result.run, root, config, offlineOptions({ fetchImpl: () => assert.fail() }));
    assert.notEqual(resumed.jobs[0].image, result.jobs[0].image);
    assert.equal(readFileSync(result.jobs[0].image, "utf8"), "corrupted fixture");
    assert.deepEqual(pngDimensions(readFileSync(resumed.jobs[0].image)), { width: 3, height: 2 });
});

test("recovery cannot substitute a different image or approve it through receipt metadata", async (t) => {
    const root = workspace(t);
    const result = await startRun([job("image")], root, config, offlineOptions());
    const receipt = readJson(result.run, "job-image.received.json");
    receipt.metadata.review = { status: "approved" };
    atomicJson(join(result.run, "job-image.received.json"), receipt);
    rmSync(result.jobs[0].image);
    const recovered = await resumeRun(result.run, root, config, offlineOptions({ fetchImpl: () => assert.fail() }));
    assert.equal(recovered.jobs[0].review.status, "unreviewed");
    writeFileSync(recovered.jobs[0].image, "corrupted fixture");
    receipt.b64 = png(10, 10).toString("base64");
    atomicJson(join(result.run, "job-image.received.json"), receipt);
    const held = await resumeRun(result.run, root, config, offlineOptions({ fetchImpl: () => assert.fail() }));
    assert.equal(held.jobs[0].state, "output-error");
    assert.match(held.jobs[0].error, /does not match/);
});

test("output, journal, recipe, and reference containment stay inside the workspace", async (t) => {
    const root = workspace(t);
    const outside = workspace(t);
    symlinkSync(outside, join(root, "files"), "junction");
    await assert.rejects(startRun([job("image")], root, config, offlineOptions()), /escapes/);
    writeFileSync(join(outside, "recipe.json"), "{}");
    assert.throws(() => readJson(root, join(outside, "recipe.json")), /escapes/);
});

test("an active run lock and edited output paths cannot cause duplicate or escaping writes", async (t) => {
    const root = workspace(t);
    const result = await startRun([job("image")], root, config, offlineOptions());
    writeFileSync(join(result.run, ".lock"), "{}");
    await assert.rejects(resumeRun(result.run, root, config, offlineOptions()), /locked/);
    rmSync(join(result.run, ".lock"));
    const { journal } = loadRun(root, result.run);
    journal.jobs[0].output.file = "../outside.png";
    atomicJson(join(result.run, "journal.json"), journal);
    await assert.rejects(resumeRun(result.run, root, config, offlineOptions()), /Invalid image run journal/);
});

test("long Retry-After defers the deployment, not unrelated models, and survives resume", async (t) => {
    const root = workspace(t);
    const isolated = { ...config, gptDeployment: "cooldown-fixture" };
    const clock = Date.parse("2030-01-01T00:00:00Z");
    let calls = 0;
    const result = await startRun([job("limited"), job("same"), job("other", { model: MODEL_IDS.FLARE })], root, isolated, offlineOptions({
        now: () => clock,
        fetchImpl: async () => {
            calls++;
            return calls === 1 ? new Response("busy", { status: 429, headers: { "retry-after": "600" } }) : imageResponse();
        },
    }));
    assert.equal(calls, 2);
    assert.deepEqual(result.jobs.map((item) => item.state), ["deferred", "deferred", "generated"]);
    const again = await resumeRun(result.run, root, isolated, offlineOptions({ now: () => clock, fetchImpl: () => assert.fail("too early") }));
    assert.deepEqual(again.jobs.map((item) => item.state), ["deferred", "deferred", "generated"]);
    const resumed = await resumeRun(result.run, root, isolated, offlineOptions({
        now: () => clock + 601_000, fetchImpl: async () => { calls++; return imageResponse(); },
    }));
    assert.equal(calls, 4);
    assert.ok(resumed.jobs.every((item) => item.state === "generated"));
    assert.equal(loadRun(root, result.run).journal.jobs[0].attempts.length, 2);
});

test("cross-run cooldowns persist without an attempt and survive a fresh process", async (t) => {
    const root = workspace(t);
    const isolated = { ...config, gptDeployment: "cross-run-cooldown-fixture" };
    const clock = Date.parse("2030-01-01T00:00:00Z");
    const first = await startRun([job("limited")], root, isolated, offlineOptions({
        now: () => clock,
        fetchImpl: async () => new Response("busy", { status: 429, headers: { "retry-after": "600" } }),
    }));
    assert.equal(first.jobs[0].state, "deferred");
    const waiting = [];
    let calls = 0;
    for (const id of ["second", "third"]) {
        const result = await startRun([job(id)], root, isolated, offlineOptions({
            now: () => clock, fetchImpl: async () => { calls++; return imageResponse(); },
        }));
        assert.equal(result.jobs[0].state, "deferred");
        assert.equal(result.jobs[0].attempts, 0);
        assert.equal(loadRun(root, result.run).journal.jobs[0].notBefore, clock + 600_000);
        waiting.push(result.run);
    }
    assert.equal(calls, 0);
    const restart = (now) => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
        import { resumeRun } from ${JSON.stringify(new URL("../lib/workflow.mjs", import.meta.url).href)};
        import { offlineOptions, imageResponse } from ${JSON.stringify(new URL("./helpers.mjs", import.meta.url).href)};
        let calls = 0;
        const result = await resumeRun(${JSON.stringify(waiting[0])}, ${JSON.stringify(root)}, ${JSON.stringify(isolated)}, offlineOptions({
            now: () => ${now}, fetchImpl: async () => { calls++; return imageResponse(); },
        }));
        console.log(JSON.stringify({ calls, jobs: result.jobs }));
    `], { encoding: "utf8", windowsHide: true }));
    const early = restart(clock);
    assert.equal(early.calls, 0);
    assert.equal(early.jobs[0].state, "deferred");
    assert.equal(early.jobs[0].attempts, 0);
    const ready = restart(clock + 601_000);
    assert.equal(ready.calls, 1);
    assert.equal(ready.jobs[0].state, "generated");
    assert.equal(ready.jobs[0].attempts, 1);
    const { journal } = loadRun(root, waiting[0]);
    journal.jobs[0].notBefore = "invalid";
    atomicJson(join(waiting[0], "journal.json"), journal);
    await assert.rejects(resumeRun(waiting[0], root, isolated, offlineOptions({
        tokenProvider: () => assert.fail("invalid cooldown must fail before auth"),
        fetchImpl: () => assert.fail("invalid cooldown must prevent submission"),
    })), /Invalid image run journal/);
});
