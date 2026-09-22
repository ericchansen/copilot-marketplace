import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";
import test from "node:test";

import { validateImageInputs } from "../lib/input-validation.mjs";
import {
    MODEL_IDS,
    MODELS,
    IMAGE_PARAMETERS,
    buildProviderRequest,
    executeProviderRequest,
    extractImage,
    formatEffectiveSettings,
    getConfig,
    getEffectiveSettings,
    normalizeModel,
    validateImageRequest,
} from "../lib/providers.mjs";
import { isPathInside, validateReferenceImages } from "../lib/references.mjs";

const config = {
    openaiEndpoint: "https://openai.example.test",
    servicesEndpoint: "https://services.example.test",
    gptDeployment: "gpt-deployment",
    fluxDeployment: "flux-deployment",
    maiDeployment: "mai-deployment",
    openaiApiVersion: "preview",
    fluxApiVersion: "preview",
    subscription: "",
};
const png = { data: Buffer.from([0x89, 0x50]), name: "layout.png", type: "image/png" };
const jpg = { data: Buffer.from([0xff, 0xd8]), name: "style.jpg", type: "image/jpeg" };

test("defaults to GPT-Image-2 and preserves legacy environment names", () => {
    assert.equal(normalizeModel(), MODEL_IDS.GPT);
    assert.deepEqual(
        getConfig({
            FOUNDRY_IMAGE_ENDPOINT: " https://legacy.example.test/ ",
            FOUNDRY_IMAGE_DEPLOYMENT: " legacy-deployment ",
        }),
        {
            openaiEndpoint: "https://legacy.example.test/",
            servicesEndpoint: "",
            gptDeployment: "legacy-deployment",
            fluxDeployment: MODEL_IDS.FLUX,
            maiDeployment: MODEL_IDS.MAI,
            sunburstDeployment: MODEL_IDS.SUNBURST,
            flareDeployment: MODEL_IDS.FLARE,
            mai26Deployment: MODEL_IDS.MAI26,
            defaultModel: MODEL_IDS.GPT,
            openaiApiVersion: "preview",
            fluxApiVersion: "preview",
            subscription: "",
        }
    );
});

test("builds GPT generation and edit requests", () => {
    const generation = buildProviderRequest({ prompt: "test" }, [], "token", config);
    assert.match(generation.url, /\/openai\/v1\/images\/generations\?api-version=preview$/);
    assert.deepEqual(JSON.parse(generation.init.body), {
        model: "gpt-deployment",
        prompt: "test",
        n: 1,
        size: "1024x1024",
        quality: "high",
        output_format: "png",
    });
    assert.deepEqual(generation.effectiveSettings, {
        operation: "generate",
        size: "1024x1024",
        outputFormat: "png",
        referenceCount: 0,
        quality: "high",
    });

    const edit = buildProviderRequest(
        { prompt: "edit", reference_images: ["layout.png"], input_fidelity: "high" },
        [png],
        "token",
        config
    );
    assert.match(edit.url, /\/openai\/v1\/images\/edits/);
    assert.equal(edit.init.body.has("input_fidelity"), false);
    assert.equal(edit.init.body.getAll("image[]").length, 1);
    assert.deepEqual(edit.effectiveSettings, {
        operation: "edit",
        size: "1024x1024",
        outputFormat: "png",
        referenceCount: 1,
        quality: "high",
        inputFidelity: "high (implicit)",
    });
});

test("builds FLUX provider JSON with controls and ordered references", () => {
    const request = buildProviderRequest(
        {
            model: MODEL_IDS.FLUX,
            prompt: "compose",
            size: "1600x900",
            guidance: 4.5,
            steps: 30,
        },
        [png, jpg],
        "token",
        config
    );
    assert.match(request.url, /\/providers\/blackforestlabs\/v1\/flux-2-flex\?api-version=preview$/);
    assert.deepEqual(JSON.parse(request.init.body), {
        model: "flux-deployment",
        prompt: "compose",
        output_format: "png",
        width: 1600,
        height: 900,
        guidance: 4.5,
        steps: 30,
        input_image: png.data.toString("base64"),
        input_image_2: jpg.data.toString("base64"),
    });
    assert.deepEqual(request.effectiveSettings, {
        operation: "edit",
        size: "1600x900",
        outputFormat: "png",
        referenceCount: 2,
        guidance: 4.5,
        steps: 30,
    });
});

test("builds MAI generation and MIME-correct multipart edit requests", () => {
    const generation = buildProviderRequest(
        { model: MODEL_IDS.MAI, prompt: "generate", size: "1024x1024" },
        [],
        "token",
        config
    );
    assert.equal(generation.url, "https://services.example.test/mai/v1/images/generations");
    assert.deepEqual(JSON.parse(generation.init.body), {
        model: "mai-deployment",
        prompt: "generate",
        width: 1024,
        height: 1024,
    });
    assert.deepEqual(generation.effectiveSettings, {
        operation: "generate",
        size: "1024x1024",
        outputFormat: "png",
        referenceCount: 0,
    });

    const edit = buildProviderRequest({ model: MODEL_IDS.MAI, prompt: "edit" }, [jpg], "token", config);
    assert.equal(edit.url, "https://services.example.test/mai/v1/images/edits");
    assert.equal(edit.init.body.get("image").type, "image/jpeg");
    assert.equal(edit.init.headers["Content-Type"], undefined);
    assert.deepEqual(edit.effectiveSettings, {
        operation: "edit",
        size: "provider-determined",
        outputFormat: "png",
        referenceCount: 1,
    });
});

test("reports provider defaults and effective controls reproducibly", () => {
    assert.deepEqual(getEffectiveSettings({ prompt: "x" }, [png]), {
        operation: "edit",
        size: "1024x1024",
        outputFormat: "png",
        referenceCount: 1,
        quality: "high",
        inputFidelity: "high (implicit)",
    });
    assert.deepEqual(getEffectiveSettings({ model: MODEL_IDS.FLUX, prompt: "x" }, []), {
        operation: "generate",
        size: "1024x1024",
        outputFormat: "png",
        referenceCount: 0,
        guidance: 4.5,
        steps: 50,
    });
    assert.equal(
        formatEffectiveSettings({
            operation: "edit",
            size: "1024x1024",
            outputFormat: "png",
            referenceCount: 1,
            quality: "high",
            inputFidelity: "high",
        }),
        "operation: edit, size: 1024x1024, outputFormat: png, referenceCount: 1, quality: high, inputFidelity: high"
    );
});

test("enforces provider reference limits", () => {
    assert.doesNotThrow(() =>
        validateImageRequest({ model: MODEL_IDS.GPT, prompt: "x" }, Array(16).fill(png), config)
    );
    assert.throws(
        () => validateImageRequest({ model: MODEL_IDS.GPT, prompt: "x" }, Array(17).fill(png), config),
        /at most 16/
    );
    assert.doesNotThrow(() =>
        validateImageRequest({ model: MODEL_IDS.FLUX, prompt: "x" }, Array(10).fill(png), config)
    );
    assert.throws(
        () => validateImageRequest({ model: MODEL_IDS.MAI, prompt: "x" }, Array(6).fill(png), config),
        /at most 5/
    );
});

test("rejects over-limit provider references before reading files", () => {
    const cases = [
        [MODEL_IDS.GPT, 17, /gpt-image-2 supports at most 16 reference images/],
        [MODEL_IDS.FLUX, 11, /FLUX\.2-flex supports at most 10 reference images/],
        [MODEL_IDS.MAI, 6, /MAI-Image-2\.5-Pro supports at most 5 reference images/],
        [MODEL_IDS.MAI26, 6, /MAI-Image-2\.6 supports at most 5 reference images/],
    ];

    for (const [model, count, expected] of cases) {
        let validationCalls = 0;
        assert.throws(
            () =>
                validateImageInputs(
                    {
                        model,
                        prompt: "x",
                        reference_images: Array.from({ length: count }, (_, index) => `missing-${index}.png`),
                    },
                    join(tmpdir(), `foundry-image-gen-missing-workspace-${process.pid}`),
                    config,
                    () => {
                        validationCalls += 1;
                        throw new Error("reference validator must not run");
                    }
                ),
            expected
        );
        assert.equal(validationCalls, 0);
    }
});

test("preserves local reference path, type, size, and workspace containment", () => {
    const root = mkdtempSync(join(tmpdir(), "foundry-image-gen-"));
    try {
        const workspace = join(root, "workspace");
        const workspaceAlias = join(root, "workspace-alias");
        const outside = join(root, "outside");
        mkdirSync(workspace);
        mkdirSync(outside);
        writeFileSync(
            join(workspace, "reference.png"),
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        );
        writeFileSync(join(workspace, "invalid.gif"), Buffer.from("GIF89a"));
        writeFileSync(
            join(outside, "reference.png"),
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        );
        const oversized = join(workspace, "oversized.png");
        writeFileSync(oversized, "");
        truncateSync(oversized, 50 * 1024 * 1024 + 1);
        symlinkSync(workspace, workspaceAlias, "junction");
        symlinkSync(outside, join(workspace, "linked"), "junction");

        assert.equal(validateReferenceImages(["reference.png"], workspace)[0].type, "image/png");
        assert.equal(validateReferenceImages([join(workspace, "reference.png")], workspace)[0].type, "image/png");
        assert.equal(validateReferenceImages([join(workspace, "reference.png")], workspaceAlias)[0].type, "image/png");
        assert.throws(() => validateReferenceImages(["../outside/reference.png"], workspace), /escapes/);
        assert.throws(() => validateReferenceImages([join(outside, "reference.png")], workspace), /escapes/);
        assert.throws(() => validateReferenceImages(["linked/reference.png"], workspace), /escapes/);
        assert.throws(() => validateReferenceImages(["invalid.gif"], workspace), /PNG or JPEG/);
        assert.throws(() => validateReferenceImages(["oversized.png"], workspace), /under 50 MB/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("treats Windows cross-drive paths as outside the workspace", () => {
    assert.equal(isPathInside("C:\\workspace", "C:\\workspace\\reference.png", win32), true);
    assert.equal(isPathInside("C:\\workspace", "D:\\reference.png", win32), false);
});

test("validates provider dimensions and unsupported combinations", () => {
    assert.doesNotThrow(() =>
        validateImageRequest({ model: MODEL_IDS.GPT, prompt: "x", size: "1280x1024" }, [], config)
    );
    assert.throws(
        () => validateImageRequest({ model: MODEL_IDS.GPT, prompt: "x", size: "1279x1024" }, [], config),
        /multiples of 16/
    );
    assert.throws(
        () => validateImageRequest({ model: MODEL_IDS.GPT, prompt: "x", size: "3840x1024" }, [], config),
        /aspect ratio/
    );
    assert.throws(
        () => validateImageRequest({ model: MODEL_IDS.FLUX, prompt: "x", size: "4096x2048" }, [], config),
        /4194304 pixels/
    );
    assert.throws(
        () => validateImageRequest({ model: MODEL_IDS.FLUX, prompt: "x", guidance: 10.1 }, [], config),
        /between 1.5 and 10/
    );
    assert.throws(
        () => validateImageRequest({ model: MODEL_IDS.FLUX, prompt: "x", steps: 1.5 }, [], config),
        /integer/
    );
    assert.throws(
        () => validateImageRequest({ model: MODEL_IDS.MAI, prompt: "x", size: "767x1024" }, [], config),
        /at least 768/
    );
    assert.throws(
        () => validateImageRequest({ model: MODEL_IDS.MAI, prompt: "x", size: "1024x1024" }, [png], config),
        /edits do not support output dimensions/
    );
    assert.throws(
        () => validateImageRequest({ model: MODEL_IDS.GPT, prompt: "x", guidance: 4 }, [], config),
        /does not support guidance/
    );
    assert.throws(
        () => validateImageRequest({ model: MODEL_IDS.FLUX, prompt: "x" }, [], { ...config, servicesEndpoint: "" }),
        /FOUNDRY_IMAGE_SERVICES_ENDPOINT is required/
    );
});

test("extracts supported response shapes", () => {
    assert.deepEqual(extractImage({ data: [{ b64_json: "abc" }] }), { b64: "abc" });
    assert.deepEqual(extractImage({ data: [{ url: "https://example.test/image.png" }] }), {
        url: "https://example.test/image.png",
    });
    assert.deepEqual(extractImage({ result: { sample: "https://example.test/flux.png" } }), {
        url: "https://example.test/flux.png",
    });
    assert.equal(extractImage({ data: [] }), null);
});

test("schema and config use exactly the supported adapters, never catalog expansion", () => {
    assert.deepEqual(IMAGE_PARAMETERS.properties.model.enum, Object.keys(MODELS));
    assert.deepEqual(IMAGE_PARAMETERS.properties.quality.enum, ["low", "medium", "high", "xhigh", "max", "auto"]);
    assert.throws(() => normalizeModel("gpt-image-future"), /Unsupported model/);
    assert.throws(() => normalizeModel(""), /Unsupported model/);
    const selected = getConfig({
        FOUNDRY_IMAGE_MODEL: MODEL_IDS.SUNBURST,
        FOUNDRY_IMAGE_ENDPOINT: "https://openai.example.test",
        FOUNDRY_IMAGE_DEPLOYMENT: "legacy",
        FOUNDRY_IMAGE_SUNBURST_DEPLOYMENT: "selected-sunburst",
    });
    assert.equal(buildProviderRequest({ prompt: "x" }, [], "token", selected).model, MODEL_IDS.SUNBURST);
    assert.equal(JSON.parse(buildProviderRequest({ prompt: "x" }, [], "token", selected).init.body).model, "selected-sunburst");
    assert.equal(JSON.parse(buildProviderRequest({ prompt: "x", model: MODEL_IDS.GPT }, [], "token", selected).init.body).model, "legacy");
    assert.equal(buildProviderRequest({ prompt: "x", model: MODEL_IDS.FLARE }, [], "token", selected).deployment, MODEL_IDS.FLARE);
});

test("GPT-Image-2.5 supports documented qualities without injecting edit fidelity", () => {
    for (const model of [MODEL_IDS.SUNBURST, MODEL_IDS.FLARE]) {
        for (const quality of ["low", "medium", "high", "xhigh", "max", "auto"]) {
            const generation = buildProviderRequest({ model, prompt: "x", quality, size: "1536x1152" }, [], "token", config);
            assert.equal(JSON.parse(generation.init.body).quality, quality);
            assert.equal(generation.family, "openai");
        }
        const edit = buildProviderRequest({ model, prompt: "x", size: "2048x1536" }, [png, jpg], "token", config);
        assert.equal(edit.init.body.has("input_fidelity"), false);
        assert.equal(edit.init.body.getAll("image[]").length, 2);
        assert.equal(edit.init.body.get("quality"), "high");
        assert.throws(() => buildProviderRequest({ model, prompt: "x", input_fidelity: "high" }, [png], "token", config), /does not support input_fidelity/);
    }
    assert.throws(() => validateImageRequest({ prompt: "x", quality: "xhigh" }, [], config), /does not support quality/);
    assert.throws(() => validateImageRequest({ prompt: "x", input_fidelity: "low" }, [png], config), /Always high/);
    assert.throws(() => validateImageRequest({ prompt: "x", quality: "typo" }, [], config), /does not support quality/);
});

test("MAI-Image-2.6 uses generation controls and repeated ordered edit images", () => {
    const cfg = { ...config, mai26Deployment: "mai-latest" };
    const request = buildProviderRequest({ model: MODEL_IDS.MAI26, prompt: "x", size: "1536x1152" }, [], "token", cfg);
    assert.deepEqual(JSON.parse(request.init.body), {
        model: "mai-latest", prompt: "x", width: 1536, height: 1152, auto_aspect_ratio: false, web_grounding: false,
    });
    for (const model of [MODEL_IDS.MAI, MODEL_IDS.MAI26]) {
        const refs = [png, jpg, png, jpg, png];
        const edit = buildProviderRequest({ model, prompt: "x" }, refs, "token", cfg);
        assert.deepEqual(edit.init.body.getAll("image").map((image) => image.type), refs.map((image) => image.type));
        assert.equal(edit.init.body.has("width"), false);
        assert.equal(edit.effectiveSettings.size, "provider-determined");
        assert.throws(() => validateImageRequest({ model, prompt: "x", quality: "high" }, [], cfg), /does not support quality/);
        assert.throws(() => validateImageRequest({ model, prompt: "x", size: "1024x1024" }, refs, cfg), /edits do not support/);
    }
    assert.doesNotThrow(() => validateImageRequest({ model: MODEL_IDS.MAI26, prompt: "x", size: "1536x1536" }, [], cfg));
    assert.doesNotThrow(() => validateImageRequest({ model: MODEL_IDS.MAI26, prompt: "x", size: "3072x768" }, [], cfg));
    assert.throws(() => validateImageRequest({ model: MODEL_IDS.MAI26, prompt: "x", size: "1537x1536" }, [], cfg), /2359296/);
    assert.throws(() => validateImageRequest({ model: MODEL_IDS.MAI, prompt: "x", size: "1536x1152" }, [], cfg), /1048576/);
    assert.throws(() => validateImageRequest({ model: MODEL_IDS.MAI, prompt: "x", web_grounding: false }, [], cfg), /MAI-Image-2.6/);
    assert.throws(() => validateImageRequest({ model: MODEL_IDS.MAI26, prompt: "x", auto_aspect_ratio: "false" }, [], cfg), /boolean/);
    const automatic = buildProviderRequest({ model: MODEL_IDS.MAI26, prompt: "x", auto_aspect_ratio: true }, [], "token", cfg);
    assert.equal(automatic.effectiveSettings.size, "provider-determined");
    assert.deepEqual(automatic.requestedSettings, { auto_aspect_ratio: true });
});

test("invalid controls and dimensions fail before inference", () => {
    for (const size of ["0x0", "NaNx1024", "1024x0", "", 1024, "9007199254740993x1024"]) {
        assert.throws(() => validateImageRequest({ prompt: "x", size }, [], config), /Invalid size/);
    }
    assert.throws(() => validateImageRequest({ prompt: "x", unexpected: true }, [], config), /Unsupported image parameter/);
    assert.throws(() => validateImageRequest({ prompt: "x", reference_roles: ["style"] }, [], config), /one non-empty role/);
    assert.throws(() => validateImageRequest({ prompt: "x" }, [], { ...config, openaiEndpoint: "http://remote.example.test" }), /HTTPS/);
    assert.throws(() => validateImageRequest({ prompt: "x" }, [], { ...config, openaiEndpoint: "https://example.test?key=placeholder" }), /without credentials/);
});

test("surfaces provider errors verbatim", async () => {
    const request = buildProviderRequest({ prompt: "test" }, [], "token", config);
    await assert.rejects(
        executeProviderRequest(request, async () => ({
            ok: false,
            status: 400,
            text: async () => '{"error":"provider detail"}',
        })),
        (error) => error.message === '{"error":"provider detail"}'
    );
});
