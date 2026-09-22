import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configuredVersion, imageStatus } from "./azure.mjs";
import { getConfig, IMAGE_PARAMETERS, MODELS } from "./providers.mjs";
import { readJson } from "./files.mjs";
import { recipeJobs } from "./recipes.mjs";
import { resumeRun, REVIEW_STATES, reviewRun, startRun } from "./workflow.mjs";

const guard = (handler) => async (args) => {
    try {
        return await handler(args);
    } catch (error) {
        return { textResultForLlm: error.message, resultType: "failure" };
    }
};

function runResult(result) {
    const text = JSON.stringify(result, null, 2);
    return result.jobs.every((job) => job.state === "generated") ? text : { textResultForLlm: text, resultType: "failure" };
}

export function imageTools(getSession, runtime = {}) {
    let status;
    const config = () => {
        const current = (runtime.getConfig ?? getConfig)();
        const deploymentVersions = { ...current.deploymentVersions };
        for (const [id, cap] of Object.entries(MODELS)) {
            const endpoint = cap.family === "openai" ? current.openaiEndpoint : current.servicesEndpoint;
            if (status && endpoint) deploymentVersions[id] = configuredVersion(id, current, status);
        }
        return { ...current, deploymentVersions };
    };
    const context = () => {
        const session = getSession();
        const workspace = session.workspacePath || process.cwd();
        const outputWorkspace = session.workspacePath || join(tmpdir(), "foundry-images");
        if (!session.workspacePath) mkdirSync(outputWorkspace, { recursive: true });
        return {
            workspace, outputWorkspace,
            options: {
                ...runtime, outputWorkspace,
                onError: async ({ id, message }) => session.log?.(`${id}: ${message}`),
            },
        };
    };
    return [
        {
            name: "generate_image",
            description: "Generate or edit one image with one selected Foundry model. No discovery, comparison, gallery, or paid smoke test is required.",
            parameters: IMAGE_PARAMETERS,
            handler: guard(async (args) => {
                const { workspace, options } = context();
                const result = await startRun([{ id: "image", args }], workspace, config(), options);
                if (result.jobs[0].state !== "generated") return runResult(result);
                return [
                    `Image saved to: ${result.jobs[0].image}`,
                    `Model: ${result.jobs[0].model}; deployment: ${result.jobs[0].deployment}`,
                    `Prompt: ${args.prompt}`,
                    `Requested settings: ${JSON.stringify(result.jobs[0].requestedSettings)}`,
                    `Effective settings: ${JSON.stringify(result.jobs[0].effectiveSettings)}`,
                    `Actual PNG dimensions: ${JSON.stringify(result.jobs[0].dimensions)}`,
                    `Attempts: ${result.jobs[0].attempts}${result.jobs[0].possibleDuplicateBilling ? "; a provider failure may have incurred duplicate billing" : ""}`,
                    `Review: unreviewed. Inspect the output before acceptance.`,
                    `Run journal: ${join(result.run, "journal.json")}`,
                ].join("\n");
            }),
        },
        {
            name: "foundry_image_status",
            description: "Read-only Azure CLI discovery of one explicitly selected Foundry account: endpoints, existing deployments, catalog availability and adapter support. Does not test inference or change configuration.",
            parameters: {
                type: "object", additionalProperties: false,
                properties: {
                    account: { type: "string" }, resource_group: { type: "string" },
                    subscription: { type: "string", description: "Subscription GUID; overrides FOUNDRY_IMAGE_SUBSCRIPTION for this read only" },
                },
                required: ["account", "resource_group"],
            },
            handler: guard(async (args) => {
                status = imageStatus(args, (runtime.getConfig ?? getConfig)(), runtime.cli);
                return JSON.stringify(status, null, 2);
            }),
        },
        {
            name: "image_workflow",
            description: "Optional explicit image jobs: run an agent-written recipe, resume a journal, record review notes, or export an offline HTML gallery and ZIP. Never selects extra models or uploads files.",
            parameters: {
                type: "object", additionalProperties: false,
                properties: {
                    action: { type: "string", enum: ["run", "resume", "review", "export"] },
                    recipe: { type: "string", description: "Workspace-local version 1 recipe JSON for run" },
                    run: { type: "string", description: "Existing run directory for resume, review, or export" },
                    job_id: { type: "string", description: "Generated job to review" },
                    review_status: { type: "string", enum: REVIEW_STATES },
                    copy_notes: { type: "string" }, visual_notes: { type: "string" },
                },
                required: ["action"],
            },
            handler: guard(async (args) => {
                const { workspace, outputWorkspace, options } = context();
                switch (args.action) {
                    case "run":
                        return runResult(await startRun(recipeJobs(readJson(workspace, args.recipe)), workspace, config(), options));
                    case "resume":
                        return runResult(await resumeRun(args.run, workspace, config(), options));
                    case "review":
                        return runResult(await reviewRun(args.run, outputWorkspace, args.job_id, args.review_status, {
                            copyNotes: args.copy_notes, visualNotes: args.visual_notes,
                        }));
                    case "export": {
                        const { exportRun } = await import("./gallery.mjs");
                        return JSON.stringify(await exportRun(args.run, outputWorkspace), null, 2);
                    }
                    default:
                        throw new Error("Choose run, resume, review, or export explicitly");
                }
            }),
        },
    ];
}
