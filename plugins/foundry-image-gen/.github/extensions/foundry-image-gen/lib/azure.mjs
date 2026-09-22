import { execFileSync } from "node:child_process";
import { getConfig, MODEL_IDS, MODELS, requireEndpoint } from "./providers.mjs";

export function validateSubscription(subscription) {
    if (subscription && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subscription)) {
        throw new Error("FOUNDRY_IMAGE_SUBSCRIPTION / subscription must be a subscription GUID");
    }
}

export function runAz(args) {
    if (args.some((arg) => typeof arg !== "string" || !arg || /[^\p{L}\p{Nd}_.:/()=-]/u.test(arg))) {
        throw new Error("Azure CLI arguments contain unsupported characters");
    }
    try {
        const windows = process.platform === "win32";
        // az.cmd needs cmd.exe; quote validated arguments so parentheses remain literal.
        const command = windows ? process.env.ComSpec || "cmd.exe" : "az";
        const argv = windows ? ["/d", "/s", "/c", `"az ${args.map((arg) => `"${arg}"`).join(" ")}"`] : args;
        return execFileSync(command, argv, {
            encoding: "utf8", timeout: 30_000, windowsHide: true,
            shell: false, windowsVerbatimArguments: windows, stdio: ["ignore", "pipe", "pipe"],
        }).trim();
    } catch (error) {
        const detail = String(error.stderr ?? "");
        if (error.code === "ENOENT" || /['"]?az(?:\.cmd)?['"]? is not recognized/i.test(detail)) {
            throw new Error("Azure CLI is unavailable. Install az before using this tool; nothing was installed automatically.");
        }
        if (/az login|AADSTS|not logged/i.test(detail)) {
            throw new Error("Azure CLI sign-in is missing or expired. Run 'az login' for the intended account, then retry. No account was switched.");
        }
        throw new Error("Azure CLI read failed. Check that az is installed, run 'az login' if needed, and verify the selected subscription, account, resource group, and read/inference permissions. No account was switched.");
    }
}

export function getEntraToken(subscription, cli = runAz) {
    validateSubscription(subscription);
    const args = ["account", "get-access-token"];
    if (subscription) args.push("--subscription", subscription);
    args.push("--resource", "https://cognitiveservices.azure.com", "--query", "accessToken", "-o", "tsv");
    const token = cli(args);
    if (!token) throw new Error("Azure CLI returned no access token; run 'az login' for the selected subscription.");
    return token;
}

function readJson(cli, args) {
    const value = cli([...args, "--only-show-errors", "-o", "json"]);
    try {
        return JSON.parse(value);
    } catch {
        throw new Error("Azure CLI returned invalid JSON; check Azure CLI and the selected account.");
    }
}

function statusEndpoint(value, name, diagnostics) {
    if (!value) return "";
    try {
        return requireEndpoint(value, name);
    } catch (error) {
        diagnostics.push(`${error.message}; the value was omitted from this status result.`);
        return "";
    }
}

export function imageStatus({ account, resource_group, subscription } = {}, config = getConfig(), cli = runAz) {
    if (typeof account !== "string" || !account || /[^a-zA-Z0-9_.-]/.test(account)) {
        throw new Error("Select an account explicitly (letters, digits, underscores, periods, or hyphens).");
    }
    if (typeof resource_group !== "string" || !resource_group || resource_group.length > 90 ||
        /[^\p{L}\p{Nd}_.()-]/u.test(resource_group) || resource_group.endsWith(".")) {
        throw new Error("Select a resource_group explicitly: 1-90 letters, decimal digits, underscores, hyphens, periods, or parentheses; no final period.");
    }
    const selectedSubscription = subscription ?? config.subscription;
    validateSubscription(selectedSubscription);
    const scope = ["--name", account, `--resource-group=${resource_group}`];
    if (selectedSubscription) scope.push("--subscription", selectedSubscription);
    const resource = readJson(cli, ["cognitiveservices", "account", "show", ...scope]);
    const deployed = readJson(cli, ["cognitiveservices", "account", "deployment", "list", ...scope]);
    const catalog = readJson(cli, ["cognitiveservices", "account", "list-models", ...scope]);
    if (!resource?.properties || !Array.isArray(deployed) || !Array.isArray(catalog)) {
        throw new Error("Unexpected Azure account/deployment/catalog response; no configuration was changed.");
    }
    const diagnostics = [];
    const endpoints = resource.properties.endpoints ?? {};
    const resolved = {
        openaiEndpoint: endpoints["OpenAI Language Model Instance API"] ?? "",
        servicesEndpoint: endpoints["AI Model Inference API"] ?? "",
    };
    const configuredEndpoints = {};
    const primary = resource.properties.endpoint ?? "";
    if (!resolved.openaiEndpoint && resource.kind === "OpenAI") resolved.openaiEndpoint = primary;
    if (!resolved.servicesEndpoint && resource.kind === "AIServices") resolved.servicesEndpoint = primary;
    for (const key of Object.keys(resolved)) {
        // ARM can return the model-inference route rather than the account API base.
        resolved[key] = statusEndpoint(resolved[key], `Discovered ${key}`, diagnostics).replace(/\/(?:models|openai)$/, "");
        configuredEndpoints[key] = statusEndpoint(config[key], `Configured ${key}`, diagnostics);
    }
    const deployments = deployed.map((item) => {
        const model = item.properties?.model ?? {};
        return {
            deployment: item.name,
            model: model.name ?? null,
            version: model.version ?? null,
            format: model.format ?? null,
            state: item.properties?.provisioningState ?? "unknown",
            adapterSupported: Object.hasOwn(MODELS, model.name),
            inference: "not-tested",
        };
    });
    const available = catalog.map((item) => item.model ?? item);
    const models = Object.entries(MODELS).map(([id, capabilities]) => {
        const matches = deployments.filter((item) => item.model === id);
        const configuredDeployment = config[capabilities.deploymentKey] ?? id;
        const configured = matches.find((item) => item.deployment === configuredDeployment);
        const endpointKey = capabilities.family === "openai" ? "openaiEndpoint" : "servicesEndpoint";
        if (configuredEndpoints[endpointKey] && resolved[endpointKey] && configuredEndpoints[endpointKey] !== resolved[endpointKey]) {
            diagnostics.push(`${id}: the configured endpoint differs from the selected account; it was not changed.`);
        }
        return {
            model: id, family: capabilities.family, adapterSupported: true,
            catalogAvailable: available.some((item) => item.name === id),
            deployments: matches, configuredDeployment, configuredDeploymentFound: Boolean(configured),
            deploymentEnvironment: capabilities.deploymentEnv,
            suggestedDeployment: configured?.deployment ?? (matches.length === 1 ? matches[0].deployment : null),
            inference: "not-tested",
        };
    });
    if (!resolved.openaiEndpoint || !resolved.servicesEndpoint) {
        diagnostics.push("An endpoint was not returned for this account. Use its Keys and Endpoint page; do not infer a hostname or create resources.");
    }
    if (!deployments.length) diagnostics.push("No deployments found on the selected account. Catalog availability is not a deployment.");
    return {
        endpoints: resolved, configuredEndpoints,
        defaultModel: config.defaultModel ?? MODEL_IDS.GPT, models, deployments, diagnostics,
        inference: "not-tested",
        note: "Read-only discovery. Catalog availability, deployment state, adapter support, and successful inference are separate. No inference call or persistent plugin configuration was created.",
    };
}

export function configuredVersion(model, config, status) {
    const { family, deploymentKey } = MODELS[model];
    const key = family === "openai" ? "openaiEndpoint" : "servicesEndpoint";
    const endpoint = config[key]?.replace(/\/+$/, "");
    const deployment = config[deploymentKey] ?? model;
    // Metadata matching must not validate unselected adapters; generation validates each selected job.
    if (!endpoint || status?.endpoints[key]?.replace(/\/+$/, "") !== endpoint) return null;
    return status.deployments.find((item) => item.model === model && item.deployment === deployment)?.version ?? null;
}
