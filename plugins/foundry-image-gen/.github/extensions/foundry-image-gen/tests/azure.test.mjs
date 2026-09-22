import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { configuredVersion, getEntraToken, imageStatus, runAz } from "../lib/azure.mjs";
import { getConfig, MODEL_IDS } from "../lib/providers.mjs";

test("discovery is read-only, scoped, and separates deployment/catalog/adapter/inference", () => {
    const calls = [];
    const config = getConfig({
        FOUNDRY_IMAGE_ENDPOINT: "https://openai.example.test",
        FOUNDRY_IMAGE_SERVICES_ENDPOINT: "https://services.example.test",
        FOUNDRY_IMAGE_SUNBURST_DEPLOYMENT: "sunburst-art",
    });
    const status = imageStatus({ account: "sample-account", resource_group: "sample-group" }, config, (args) => {
        calls.push(args);
        if (args.includes("show")) return JSON.stringify({ kind: "AIServices", properties: { endpoints: {
            "OpenAI Language Model Instance API": "https://openai.example.test/",
            "AI Model Inference API": "https://services.example.test/models",
        } } });
        if (args.includes("deployment")) return JSON.stringify([
            { name: "sunburst-art", properties: { model: { name: MODEL_IDS.SUNBURST, version: "sample-version" }, provisioningState: "Succeeded" } },
            { name: "future-model", properties: { model: { name: "unknown-image-model" }, provisioningState: "Succeeded" } },
        ]);
        return JSON.stringify([{ name: MODEL_IDS.MAI26 }, { name: "unknown-image-model" }]);
    });
    assert.equal(calls.length, 3);
    assert.equal(status.endpoints.servicesEndpoint, "https://services.example.test");
    assert.ok(calls.every((args) => args.includes("sample-account") && args.includes("--resource-group=sample-group")));
    assert.ok(calls.every((args) => !args.some((arg) => ["create", "set", "login", "get-access-token"].includes(arg))));
    const sunburst = status.models.find((item) => item.model === MODEL_IDS.SUNBURST);
    assert.equal(sunburst.configuredDeploymentFound, true);
    assert.equal(sunburst.catalogAvailable, false);
    assert.equal(sunburst.inference, "not-tested");
    assert.equal(status.models.find((item) => item.model === MODEL_IDS.MAI26).catalogAvailable, true);
    assert.equal(status.deployments[1].adapterSupported, false);
    assert.equal(configuredVersion(MODEL_IDS.SUNBURST, config, status), "sample-version");
    assert.equal(configuredVersion(MODEL_IDS.SUNBURST, { ...config, openaiEndpoint: "https://other.example.test" }, status), null);
});

test("discovery accepts Azure resource-group names and rejects invalid names before CLI calls", () => {
    for (const resource_group of ["sample(group)", "\u00c9quipe(\u6771\u4eac)-\u0661", "-sample", "a".repeat(90)]) {
        const calls = [];
        imageStatus({ account: "sample", resource_group }, getConfig({}), (args) => {
            calls.push(args);
            return args.includes("show") ? '{"kind":"AIServices","properties":{}}' : "[]";
        });
        assert.equal(calls.length, 3);
        assert.ok(calls.every((args) => args.includes(`--resource-group=${resource_group}`)));
    }
    for (const resource_group of ["", "sample.", "a".repeat(91), "sample group", "bad&command", "sample\u00b2", "sample\n"]) {
        assert.throws(() => imageStatus({ account: "sample", resource_group }, getConfig({}), () => assert.fail()), /resource_group/);
    }
    assert.throws(() => imageStatus({ account: "sample\n", resource_group: "sample" }, getConfig({}), () => assert.fail()), /account/);
});

test("status omits unsafe endpoint values without blocking unrelated configured models", () => {
    const hidden = "fixture-private-value";
    for (const endpoint of [
        `https://fixture-user:${hidden}@services.example.test`,
        `https://services.example.test?api-key=${hidden}`,
        `https://services.example.test/#${hidden}`,
        `not-a-url-${hidden}`,
        `data:text/plain,${hidden}`,
    ]) {
        const config = getConfig({
            FOUNDRY_IMAGE_ENDPOINT: "https://openai.example.test/proxy",
            FOUNDRY_IMAGE_SERVICES_ENDPOINT: endpoint,
        });
        const status = imageStatus({ account: "sample", resource_group: "sample" }, config, (args) => {
            if (args.includes("show")) return JSON.stringify({ properties: { endpoints: {
                "OpenAI Language Model Instance API": `${config.openaiEndpoint}/openai`,
                "AI Model Inference API": endpoint,
            } } });
            if (args.includes("deployment")) return JSON.stringify([{
                name: MODEL_IDS.GPT, properties: { model: { name: MODEL_IDS.GPT, version: "fixture-version" } },
            }]);
            return "[]";
        });
        assert.equal(status.configuredEndpoints.servicesEndpoint, "");
        assert.equal(status.endpoints.servicesEndpoint, "");
        assert.ok(status.diagnostics.some((message) => message.includes("Configured servicesEndpoint") && message.includes("omitted")));
        assert.ok(status.diagnostics.some((message) => message.includes("Discovered servicesEndpoint") && message.includes("omitted")));
        assert.doesNotMatch(JSON.stringify(status), /fixture-private-value|fixture-user/);
        assert.equal(status.configuredEndpoints.openaiEndpoint, config.openaiEndpoint);
        assert.equal(configuredVersion(MODEL_IDS.GPT, config, status), "fixture-version");
    }
});

test("Azure CLI preserves validated argv through the platform launcher without real Azure access", (t) => {
    const root = mkdtempSync(join(tmpdir(), "foundry-az (test)-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(join(root, "argv.mjs"), "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n");
    if (process.platform === "win32") {
        writeFileSync(join(root, "az.cmd"), `@echo off\r\n"${process.execPath}" "%~dp0argv.mjs" %*\r\n`);
    } else {
        const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
        writeFileSync(join(root, "az"), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(join(root, "argv.mjs"))} "$@"\n`, { mode: 0o755 });
    }
    const cases = [
        ["cognitiveservices", "account", "show", "--name", "sample", "--resource-group=sample(group)"],
        ["cognitiveservices", "account", "show", "--name", "sample", "--resource-group=\u00c9quipe(\u6771\u4eac)-\u0661"],
        ["cognitiveservices", "account", "show", "--name", "sample", "--resource-group=-sample"],
        ["account", "get-access-token", "--resource", "https://cognitiveservices.azure.com", "--query", "accessToken", "-o", "tsv"],
    ];
    const script = `
        import assert from "node:assert/strict";
        import { runAz } from ${JSON.stringify(new URL("../lib/azure.mjs", import.meta.url).href)};
        for (const args of ${JSON.stringify(cases)}) {
            assert.deepEqual(JSON.parse(runAz(args)), args);
        }
        for (const value of ${JSON.stringify(["bad&command", "bad|command", "bad>file", "bad<file", "bad^name", "%PATH%", "!PATH!", 'bad"name', "bad\nname", "bad\rname", "bad\0name", "bad\n", "bad\r", "bad\r\n", "", null, 1])}) {
            assert.throws(() => runAz(["account", "show", "--name", value]), /arguments/);
        }
    `;
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
        cwd: root,
        env: { PATH: root, SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec },
        stdio: ["ignore", "pipe", "pipe"],
    });
});

test("subscription precedence and auth never switch the global account", () => {
    const subscription = "00000000-0000-0000-0000-000000000001";
    let args;
    assert.equal(getEntraToken(subscription, (value) => { args = value; return "test-token"; }), "test-token");
    assert.equal(args[args.indexOf("--subscription") + 1], subscription);
    assert.ok(!args.includes("set"));
    assert.throws(() => getEntraToken("not-a-guid", () => assert.fail()), /GUID/);
    assert.throws(() => getEntraToken("", () => ""), /no access token/);
    assert.throws(() => runAz(["account", "show", "--name", "bad&command"]), /arguments/);
    assert.throws(() => imageStatus({}, getConfig({}), () => assert.fail()), /explicitly/);
    assert.throws(() => imageStatus({ account: "sample", resource_group: "sample" }, getConfig({}), () => "not json"), /invalid JSON/);
    const calls = [];
    imageStatus({ account: "sample", resource_group: "sample", subscription }, getConfig({ FOUNDRY_IMAGE_SUBSCRIPTION: "invalid" }), (value) => {
        calls.push(value);
        return value.includes("show") ? '{"kind":"AIServices","properties":{"endpoint":"https://services.example.test"}}' : "[]";
    });
    assert.ok(calls.every((value) => value[value.indexOf("--subscription") + 1] === subscription));
});
