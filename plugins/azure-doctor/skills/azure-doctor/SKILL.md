---
name: azure-doctor
description: >
  Diagnose and fix Azure deployments — investigate repos, CI/CD pipelines, Azure
  subscriptions, and service health. Use when user says "is my app working",
  "check my deployment", "why is my site down", "fix my Azure app", "check health",
  "investigate deployment", "what's broken", "debug my Azure deployment",
  "check CI/CD", "check my demo sub", or any request to diagnose, troubleshoot,
  or repair a deployed Azure application. Covers Container Apps, App Service,
  PostgreSQL, ACR, GitHub Actions, and general Azure resource health.
license: MIT
allowed-tools: Bash, PowerShell
---

# Azure Doctor

Diagnose and repair Azure deployments end-to-end: repo → CI/CD → infra → runtime health.

## Philosophy

Work like an SRE: gather evidence first, form a hypothesis, fix, then verify. Never guess — always check.

## Conventions

- **Resource naming:** `<type>-<app>-<env>` (e.g., `rg-itemwise-prod`, `ca-itemwise-dev`). Never bare `prod`/`dev`.
- **Demo subscriptions:** MCAPS Managed Environment subscriptions match `ME-MngEnv*` — check these first for demo/dev deployments. Find them with:
  ```bash
  az account list --query "[?starts_with(name,'ME-MngEnv')].name" -o tsv
  ```

## Workflow

### 1. Understand the Deployment Architecture

Read the repo to identify what's deployed and how:

```
azure.yaml          → azd services (Container Apps, App Service, Functions)
.github/workflows/  → CI/CD pipeline (deploy steps, target resources)
infra/              → Bicep/Terraform (resource names, dependencies)
Dockerfile.*        → Container images
docker-compose.yml  → Local dev setup (mirrors prod architecture)
docs/deployment.md  → Deployment documentation
```

**Extract key resource identifiers from CI/CD workflows.** Look for:
- Resource group names, subscription IDs
- Container App / App Service names
- ACR registry names
- Database server names (PostgreSQL, SQL, Cosmos)
- Service FQDNs and health endpoints

CI/CD workflows often use `${{ vars.X || 'default-value' }}` patterns — the fallback literal reveals the default naming convention, but if repository variables are set, the actual deployed names come from those variables. Check `gh variable list` or workflow run logs to confirm.

### 2. Find the Azure Subscription

The repo's CI/CD may target a subscription you don't have set as default. Strategies:

1. **Check azd environment:** `azd env get-values` for `AZURE_SUBSCRIPTION_ID`
2. **Check GitHub Actions vars:** CI/CD workflows reference `vars.AZURE_SUBSCRIPTION_ID`
3. **Search across subscriptions:** Use `az group list --subscription <id>` to find the resource group
4. **Brute force:** Loop through `az account list` to find which sub has the target RG:

```bash
# Find which subscription contains a resource group
for sub in $(az account list --query "[].id" -o tsv); do
  result=$(az group show --name <RG_NAME> --subscription "$sub" --query "name" -o tsv 2>/dev/null)
  if [ "$result" = "<RG_NAME>" ]; then
    echo "Found in subscription: $sub"
    break
  fi
done
```

**Prefer Azure MCP tools** (`azure-mcp-subscription_list`, `azure-mcp-group_list`, `azure-mcp-containerapps`, etc.) when available — they're faster for listing and querying.

### 3. Check CI/CD Pipeline Status

Check recent workflow runs using `gh` CLI (always available):

```bash
gh run list --workflow ci-cd.yml --limit 5          # recent runs
gh run view <RUN_ID>                                 # run details + steps
gh run view <RUN_ID> --log-failed                    # logs for failed steps
```

If GitHub MCP tools are available (`github-mcp-server-actions_list`, `github-mcp-server-get_job_logs`), prefer those for structured output.

Key things to check:
- **Last deploy status:** Did it succeed or fail? Which step failed?
- **Deploy frequency:** When was the last successful deploy?
- **Failure patterns:** Is the same step failing repeatedly?

### 4. Check Service Health

Hit health endpoints directly. Container App FQDNs follow the pattern:
`https://<app-name>.<env-hash>.<region>.azurecontainerapps.io`

Get the actual FQDNs from:
```bash
az containerapp show -n <APP> -g <RG> --subscription <SUB> \
  --query 'properties.configuration.ingress.fqdn' -o tsv
```

Then check health:
```powershell
# Check each service — use timeouts to detect hung services
Invoke-WebRequest "https://<fqdn>/health" -TimeoutSec 15
```

Build a health matrix:

| Service | Status | Details |
|---------|--------|---------|
| Frontend | ✅/❌ | HTTP status, content check |
| Backend | ✅/❌ | /health response, DB connectivity |
| Agent | ✅/❌ | /health response |
| Database | ✅/❌ | State (Ready/Stopped) |

### 5. Diagnose Issues

#### Database Stopped (Most Common)
**Symptoms:** Backend/agent timeout, health returns connection errors.
**Check:**
```bash
az postgres flexible-server show --name <SERVER> -g <RG> --subscription <SUB> \
  --query "{state:state,fqdn:fullyQualifiedDomainName}" -o json
```
**Fix:**
```bash
az postgres flexible-server start --name <SERVER> -g <RG> --subscription <SUB>
```
**Prevention:** Tag with `CostControl=Ignore` to exempt from MCAPS nightly shutdown:
```bash
az postgres flexible-server update --name <SERVER> -g <RG> --subscription <SUB> \
  --tags "CostControl=Ignore"
```

#### Container Not Starting
**Symptoms:** Provisioning state Succeeded but health times out.
**Check:**
```bash
# Check revision status
az containerapp revision list -n <APP> -g <RG> --subscription <SUB> \
  --query "[].{name:name,active:properties.active,replicas:properties.replicas,state:properties.runningState}" -o table

# Check container logs
az containerapp logs show -n <APP> -g <RG> --subscription <SUB> --tail 50 --type console
```

#### Image Not Activating
**Symptoms:** Deploy succeeded but container runs old image.
**Check:** Compare active revision image tag against expected commit SHA.
**Fix:** Restart the revision or trigger a new deploy.

#### CI/CD Failing
**Symptoms:** GitHub Actions deploy job fails.
**Check:** Read job logs for the failed step via `github-mcp-server-get_job_logs`.
**Common causes:**
- DB stopped → container can't start → health check fails
- OIDC auth issues → Azure login step fails
- Image build failures → check Dockerfile dependencies

### 6. Fix and Verify

After applying a fix:

1. **Wait for propagation** — DB starts take 1-3 minutes, container reconnects may take 10-30 seconds
2. **Re-check health** — Hit all health endpoints again
3. **Build the health matrix** — Confirm all services are green
4. **Report to user** — Show before/after with the root cause and fix applied

### 7. Suggest Prevention

After fixing, always recommend prevention measures:
- **Tagging:** `CostControl=Ignore` for databases in demo/dev subscriptions
- **Pre-deploy gates:** CI/CD steps that verify infrastructure health before deploying
- **Monitoring:** Azure alerts, health probes, or scheduled checks
- **Documentation:** Update deployment docs with the failure mode and fix

## Common Azure Resource Commands

```bash
# List resource groups in a subscription
az group list --subscription <SUB> -o table

# List all resources in a resource group
az resource list -g <RG> --subscription <SUB> -o table

# Container Apps
az containerapp list -g <RG> --subscription <SUB> -o table
az containerapp logs show -n <APP> -g <RG> --subscription <SUB> --tail 50
az containerapp revision list -n <APP> -g <RG> --subscription <SUB> -o table

# PostgreSQL Flexible Server
az postgres flexible-server show --name <SERVER> -g <RG> --subscription <SUB>
az postgres flexible-server start --name <SERVER> -g <RG> --subscription <SUB>

# App Service
az webapp show -n <APP> -g <RG> --subscription <SUB>
az webapp log tail -n <APP> -g <RG> --subscription <SUB>
```

## Output Format

Always present findings as a clear diagnostic report:

```
## Diagnosis

**Root cause:** <one sentence>

| Service    | Status | Details            |
|------------|--------|--------------------|
| Frontend   | ✅ Up  | HTTP 200           |
| Backend    | ❌ Down| DB connection timeout |
| Database   | ⛔ Stopped | MCAPS shutdown |

## Fix Applied

<what was done>

## Verification

| Service    | Status | Details            |
|------------|--------|--------------------|
| Frontend   | ✅ Up  | HTTP 200           |
| Backend    | ✅ Up  | DB connected, 52ms |
| Database   | ✅ Ready | Started, tagged  |

## Prevention

<recommendations>
```
