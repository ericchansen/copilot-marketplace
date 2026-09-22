import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { imageTools } from "../lib/tools.mjs";
import { MODEL_IDS } from "../lib/providers.mjs";
import { config, imageResponse, offlineOptions } from "./helpers.mjs";

test("the original generate_image contract stays prompt-only with one preferred model", async (t) => {
    const root = mkdtempSync(join(tmpdir(), "foundry-tools-test-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    let calls = 0;
    const tools = imageTools(() => ({ workspacePath: root, log: async () => {} }), {
        ...offlineOptions({ fetchImpl: async (_url, init) => {
            calls++;
            assert.equal(JSON.parse(init.body).model, "art-sunburst");
            return imageResponse();
        } }),
        getConfig: () => ({ ...config, defaultModel: MODEL_IDS.SUNBURST }),
        cli: () => assert.fail("generation must not discover"),
    });
    const tool = tools.find((item) => item.name === "generate_image");
    assert.deepEqual(tool.parameters.required, ["prompt"]);
    const result = await tool.handler({ prompt: "A garden" });
    assert.equal(calls, 1);
    assert.equal(typeof result, "string");
    assert.match(result, /Image saved to:/);
    assert.match(result, /Review: unreviewed/);
    assert.equal(readdirSync(join(root, "files")).length, 1);
    assert.deepEqual(tools.map((item) => item.name), ["generate_image", "foundry_image_status", "image_workflow"]);
});

test("provider failure details stay out of tool diagnostics, session logs, and the journal", async (t) => {
    const root = mkdtempSync(join(tmpdir(), "foundry-error-test-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const hidden = "fixture-private-value";
    const logs = [];
    let calls = 0;
    const tools = imageTools(() => ({ workspacePath: root, log: async (message) => { logs.push(message); } }), {
        ...offlineOptions({ fetchImpl: async () => {
            calls++;
            return new Response(JSON.stringify({ error: {
                message: "Reference download failed",
                url: `https://assets.example.test/image.png?sig=${hidden}`,
                detail: hidden,
            } }), { status: 400 });
        } }),
        getConfig: () => config,
    });
    const result = await tools.find((tool) => tool.name === "generate_image").handler({ prompt: "A public garden" });
    assert.equal(calls, 1);
    assert.equal(result.resultType, "failure");
    const summary = JSON.parse(result.textResultForLlm);
    const error = summary.jobs[0].error;
    assert.match(error, /^failed: 400\./);
    assert.ok(!JSON.stringify({ result, logs }).includes(hidden), "provider details must not leak into tool output or logs");
    assert.deepEqual(summary.diagnostics, [{ id: "image", message: error }]);
    assert.deepEqual(logs, [`image: ${error}`]);
    assert.ok(!readFileSync(join(summary.run, "journal.json"), "utf8").includes(hidden));
});

test("optional workflow tools execute exactly the explicit recipe jobs and report failures", async (t) => {
    const root = mkdtempSync(join(tmpdir(), "foundry-tools-test-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    let calls = 0;
    const tools = imageTools(() => ({ workspacePath: root, log: async () => {} }), {
        ...offlineOptions({ fetchImpl: async () => { calls++; return imageResponse(); } }), getConfig: () => config,
    });
    const workflow = tools.find((item) => item.name === "image_workflow");
    writeFileSync(join(root, "recipe.json"), JSON.stringify({
        version: 1, content: { garden: { brief: "Garden" } }, designs: { paper: "Folded paper" },
        jobs: [{ id: "one", content: "garden", design: "paper", model: MODEL_IDS.GPT }],
    }));
    const run = JSON.parse(await workflow.handler({ action: "run", recipe: "recipe.json" }));
    assert.equal(calls, 1);
    const resumed = JSON.parse(await workflow.handler({ action: "resume", run: run.run }));
    assert.equal(calls, 1);
    assert.equal(resumed.jobs.length, 1);
    const reviewed = JSON.parse(await workflow.handler({ action: "review", run: run.run, job_id: "one", review_status: "approved" }));
    assert.equal(reviewed.jobs[0].review.status, "approved");
    const exported = JSON.parse(await workflow.handler({ action: "export", run: run.run }));
    assert.match(exported.zip, /\.zip$/);
    const failed = await workflow.handler({ action: "run", recipe: "missing.json" });
    assert.equal(failed.resultType, "failure");
    assert.equal(calls, 1);
});

test("cached status keeps generation validation scoped to the selected model", async (t) => {
    const hidden = "fixture-private-value";
    const credentialEndpoint = `https://fixture-user:${hidden}@services.example.test?api-key=${hidden}#${hidden}`;
    const cases = [
        { name: "unused services endpoint", changes: { servicesEndpoint: "not-a-url" } },
        { name: "unused services endpoint with credentials", changes: { servicesEndpoint: credentialEndpoint } },
        { name: "unused FLUX deployment", changes: { fluxDeployment: "invalid deployment" } },
        { name: "unused MAI deployment", changes: { maiDeployment: "invalid deployment" } },
        { name: "unused MAI-2.6 deployment", changes: { mai26Deployment: "invalid deployment" } },
        { name: "unused GPT deployment", model: MODEL_IDS.SUNBURST, changes: { gptDeployment: "invalid deployment" } },
        { name: "selected GPT endpoint", changes: { openaiEndpoint: "not-a-url" }, error: /FOUNDRY_IMAGE_ENDPOINT/ },
        { name: "selected GPT endpoint with credentials", changes: { openaiEndpoint: credentialEndpoint }, error: /FOUNDRY_IMAGE_ENDPOINT/ },
        { name: "selected GPT deployment", changes: { gptDeployment: "invalid deployment" }, error: /Deployment must be a name/ },
        { name: "selected FLUX endpoint", model: MODEL_IDS.FLUX, changes: { servicesEndpoint: "not-a-url" }, error: /FOUNDRY_IMAGE_SERVICES_ENDPOINT/ },
        { name: "selected MAI-2.6 deployment", model: MODEL_IDS.MAI26, changes: { mai26Deployment: "invalid deployment" }, error: /Deployment must be a name/ },
    ];
    for (const scenario of cases) {
        await t.test(scenario.name, async (t) => {
            const root = mkdtempSync(join(tmpdir(), "foundry-cached-status-test-"));
            t.after(() => rmSync(root, { recursive: true, force: true }));
            let inferenceCalls = 0;
            let authCalls = 0;
            let discoveryCalls = 0;
            const tools = imageTools(() => ({ workspacePath: root, log: async () => {} }), {
                ...offlineOptions({
                    tokenProvider: () => { authCalls++; return "fixture-auth-token"; },
                    fetchImpl: async (_url, init) => {
                        inferenceCalls++;
                        const body = JSON.parse(init.body);
                        assert.equal(body.model, scenario.model === MODEL_IDS.SUNBURST ? config.sunburstDeployment : config.gptDeployment);
                        assert.equal(body.n, 1);
                        return imageResponse();
                    },
                }),
                getConfig: () => ({ ...config, ...scenario.changes }),
                cli: (args) => {
                    discoveryCalls++;
                    if (args.includes("show")) return JSON.stringify({ properties: { endpoints: {
                        "OpenAI Language Model Instance API": config.openaiEndpoint,
                        "AI Model Inference API": config.servicesEndpoint,
                    } } });
                    if (args.includes("deployment")) return JSON.stringify([{
                        name: config.gptDeployment,
                        properties: { model: { name: MODEL_IDS.GPT, version: "fixture-version" }, provisioningState: "Succeeded" },
                    }]);
                    return JSON.stringify([{ name: MODEL_IDS.GPT }]);
                },
            });
            const status = await tools.find((tool) => tool.name === "foundry_image_status").handler({
                account: "sample-account", resource_group: "sample-group",
            });
            assert.equal(typeof status, "string", "diagnostic must succeed and populate the cache");
            assert.doesNotMatch(status, /fixture-private-value|fixture-user/);
            assert.equal(discoveryCalls, 3);
            const result = await tools.find((tool) => tool.name === "generate_image").handler({
                prompt: "A garden", ...(scenario.model ? { model: scenario.model } : {}),
            });
            assert.doesNotMatch(JSON.stringify(result), /fixture-private-value|fixture-user/);
            if (scenario.error) {
                assert.equal(result.resultType, "failure");
                assert.match(result.textResultForLlm, scenario.error);
                assert.equal(authCalls, 0);
                assert.equal(inferenceCalls, 0);
                assert.deepEqual(readdirSync(root), []);
            } else {
                assert.equal(typeof result, "string", JSON.stringify(result));
                assert.match(result, /Image saved to:/);
                assert.equal(authCalls, 1);
                assert.equal(inferenceCalls, 1);
            }
            assert.equal(discoveryCalls, 3, "generation must not repeat discovery");
        });
    }
});
