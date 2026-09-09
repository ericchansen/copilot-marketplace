"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROLES = ["Core", "Mid", "Support"];
const DEFAULT_TRIALS = 500;
const DEFAULT_SEED = 0x51f15e;
const DEFAULT_CANDIDATE_LIMIT = 4;

function parseArgs(argv) {
  const options = {
    trials: null,
    seed: null,
    statePath: null,
    dataPath: null,
    modelDir: path.join(__dirname, "vendor"),
    json: false,
    quiet: false,
    allActions: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--quiet") options.quiet = true;
    else if (argument === "--all-actions") options.allActions = true;
    else if (["--state", "--data", "--trials", "--seed", "--model-dir"].includes(argument)) {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${argument} requires a value`);
      if (argument === "--state") options.statePath = value;
      if (argument === "--data") options.dataPath = value;
      if (argument === "--trials") options.trials = Number(value);
      if (argument === "--seed") options.seed = Number(value);
      if (argument === "--model-dir") options.modelDir = value;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function usage() {
  return [
    "Usage:",
    "  node horizon-analyzer.js --state state.json [--data data.json] [options]",
    "",
    "Options:",
    `  --trials N       Monte Carlo trials (default: ${DEFAULT_TRIALS})`,
    `  --seed N         Deterministic random seed (default: ${DEFAULT_SEED})`,
    "  --data FILE      Separately supplied model JSON (match data is not bundled)",
    "  --model-dir DIR  Trusted directory containing calc.js and rolls.js",
    "                   Also supplies data.json unless --data overrides it",
    "  --all-actions    Simulate every applicable current operation",
    "  --json           Emit machine-readable JSON",
    "  --quiet          Suppress progress output",
    "  --help           Show this help",
  ].join("\n");
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read JSON from ${filePath}: ${error.message}`);
  }
}

function loadModel(modelDir = path.join(__dirname, "vendor"), dataFile) {
  const resolved = path.resolve(modelDir);
  const dataPath = dataFile ? path.resolve(dataFile) : path.join(resolved, "data.json");
  const calcPath = path.join(resolved, "calc.js");
  const rollsPath = path.join(resolved, "rolls.js");

  for (const filePath of [dataPath, calcPath, rollsPath]) {
    if (!fs.existsSync(filePath)) {
      const hint = filePath === dataPath
        ? ". Match data is not bundled; supply --data FILE (see tools/README.md)"
        : "";
      throw new Error(`Model file not found: ${filePath}${hint}`);
    }
  }

  delete require.cache[require.resolve(calcPath)];
  delete require.cache[require.resolve(rollsPath)];

  return {
    data: readJson(dataPath),
    calc: require(calcPath),
    rolls: require(rollsPath),
    modelDir: resolved,
  };
}

function asList(value) {
  return Array.isArray(value) ? value : [value];
}

function indexByName(items, label, value, getter = (item) => item.name) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  const wanted = value.trim().toLowerCase();
  const index = items.findIndex((item) => getter(item).toLowerCase() === wanted);
  if (index < 0) {
    const choices = items.map(getter).join(", ");
    throw new Error(`Unknown ${label} "${value}". Expected one of: ${choices}`);
  }
  return index;
}

function compileState(raw, data) {
  if (!raw || typeof raw !== "object") throw new Error("State must be a JSON object");

  const tokens = Number(raw.tokens);
  if (!Number.isInteger(tokens) || tokens < 1) {
    throw new Error("tokens must be an integer greater than or equal to 1");
  }

  if (!Number.isInteger(raw.period)) {
    throw new Error("period must be an integer matching the supplied model");
  }
  if (raw.period !== Number(data.meta.period)) {
    throw new Error(
      `State period ${raw.period} does not match model period ${data.meta.period} ` +
      `(${data.meta.periods[data.meta.period].name})`
    );
  }

  if (!raw.banners || typeof raw.banners !== "object") {
    throw new Error("banners must contain Core, Mid, and Support arrays");
  }

  const banners = {};
  for (const role of ROLES) {
    const colours = asList(data.banner[role]);
    const inputSlots = raw.banners[role];
    if (!Array.isArray(inputSlots) || inputSlots.length !== colours.length) {
      throw new Error(
        `${role} must contain ${colours.length} slots for model period ${data.meta.period}`
      );
    }

    banners[role] = inputSlots.map((slot, position) => {
      if (!slot || typeof slot !== "object") {
        throw new Error(`${role} slot ${position + 1} must be an object`);
      }
      const stat = indexByName(data.stats, "stat", slot.stat, (item) => item.label);
      const quality = indexByName(data.qualities, "quality", slot.quality);
      const trait = indexByName(data.traits, "trait", slot.trait);
      if (data.stats[stat].colour !== colours[position]) {
        throw new Error(
          `${role} slot ${position + 1} is ${colours[position]}, but ` +
          `${data.stats[stat].label} is ${data.stats[stat].colour}`
        );
      }
      return { stat, quality, trait };
    });

    const seen = new Set();
    for (let position = 0; position < banners[role].length; position++) {
      const slot = banners[role][position];
      const key = `${colours[position]}:${slot.stat}`;
      if (seen.has(key)) {
        throw new Error(
          `${role} repeats ${data.stats[slot.stat].label} on ${colours[position]} slots`
        );
      }
      seen.add(key);
    }
  }

  if (!Array.isArray(raw.offers) || raw.offers.length !== 3) {
    throw new Error("offers must contain exactly three operation names");
  }
  const offers = raw.offers.map((offer) =>
    indexByName(data.rolls, "roll operation", offer)
  );
  if (new Set(offers).size !== offers.length) {
    throw new Error("offers must contain three distinct operations");
  }

  const offerWeights = new Float64Array(data.rolls.length);
  offerWeights.fill(1);
  if (raw.offerWeights !== undefined) {
    if (!raw.offerWeights || typeof raw.offerWeights !== "object") {
      throw new Error("offerWeights must map operation names to positive weights");
    }
    for (const [name, weightValue] of Object.entries(raw.offerWeights)) {
      const operation = indexByName(data.rolls, "roll operation", name);
      const weight = Number(weightValue);
      if (!Number.isFinite(weight) || weight <= 0) {
        throw new Error(`Offer weight for "${name}" must be positive`);
      }
      offerWeights[operation] = weight;
    }
  }

  const objective = raw.objective || "expected";
  if (!["expected", "ceiling", "floor"].includes(objective)) {
    throw new Error('objective must be "expected", "ceiling", or "floor"');
  }

  let candidates = null;
  if (raw.candidates !== undefined) {
    if (!Array.isArray(raw.candidates) || raw.candidates.length === 0) {
      throw new Error("candidates must be a non-empty array when supplied");
    }
    candidates = raw.candidates.map((candidate) => {
      if (candidate === "Reroll Roll Operations") return { reroll: true };
      if (!candidate || typeof candidate !== "object") {
        throw new Error(
          'Each candidate must be "Reroll Roll Operations" or an operation/role object'
        );
      }
      if (!ROLES.includes(candidate.role)) {
        throw new Error(`Unknown candidate role "${candidate.role}"`);
      }
      return {
        reroll: false,
        role: candidate.role,
        operationIndex: indexByName(
          data.rolls,
          "candidate roll operation",
          candidate.operation
        ),
      };
    });
  }

  const candidateLimit = raw.candidateLimit === undefined
    ? DEFAULT_CANDIDATE_LIMIT
    : Number(raw.candidateLimit);
  if (!Number.isInteger(candidateLimit) || candidateLimit < 1) {
    throw new Error("candidateLimit must be an integer greater than or equal to 1");
  }

  return {
    tokens,
    banners,
    offers,
    offerWeights,
    objective,
    candidates,
    candidateLimit,
  };
}

function cloneSlots(slots) {
  return slots.map((slot) => ({ ...slot }));
}

function cloneBanners(banners) {
  return Object.fromEntries(
    ROLES.map((role) => [role, cloneSlots(banners[role])])
  );
}

function signature(slots) {
  return slots
    .map((slot) => `${slot.stat},${slot.quality},${slot.trait}`)
    .join("|");
}

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function mixSeed(seed, trial) {
  let value = (seed ^ Math.imul(trial + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  return (value ^ value >>> 16) >>> 0;
}

function sampleDistinctOffers(random, weights, count = 3) {
  const pool = Array.from(weights, (weight, index) => ({ index, weight }));
  const result = [];

  for (let draw = 0; draw < count; draw++) {
    const total = pool.reduce((sum, item) => sum + item.weight, 0);
    let target = random() * total;
    let selected = pool.length - 1;
    for (let index = 0; index < pool.length; index++) {
      target -= pool[index].weight;
      if (target <= 0) {
        selected = index;
        break;
      }
    }
    result.push(pool[selected].index);
    pool.splice(selected, 1);
  }
  return result;
}

function sampleOutcome(outcomes, draw) {
  let cumulative = 0;
  for (const outcome of outcomes) {
    cumulative += outcome.probability;
    if (draw < cumulative) return outcome;
  }
  return outcomes[outcomes.length - 1];
}

function quantile(sorted, probability) {
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - index) + sorted[upper] * (index - lower);
}

function summarize(values) {
  const sorted = values.slice().sort((left, right) => left - right);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0
  ) / Math.max(1, values.length - 1);
  const standardError = Math.sqrt(variance / values.length);
  return {
    mean,
    standardError,
    confidence95: 1.96 * standardError,
    p10: quantile(sorted, 0.1),
    median: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    chanceBelowCurrent:
      values.filter((value) => value < -1e-9).length / values.length,
  };
}

function makeAnalyzer(model, compiled) {
  const { data, rolls } = model;
  const unitsByRole = Object.fromEntries(
    ROLES.map((role) => [
      role,
      data.units.filter((unit) => unit.role === role),
    ])
  );
  const priceCaches = Object.fromEntries(ROLES.map((role) => [role, {}]));
  const evaluationCache = new Map();

  function evaluate(role, slots, operationIndex) {
    const key = `${role}:${signature(slots)}:${operationIndex}`;
    if (!evaluationCache.has(key)) {
      evaluationCache.set(
        key,
        rolls.evaluate(
          data,
          unitsByRole[role],
          slots,
          role,
          data.rolls[operationIndex],
          priceCaches[role]
        )
      );
    }
    return evaluationCache.get(key);
  }

  function currentRows() {
    const rows = [];
    for (const operationIndex of compiled.offers) {
      for (const role of ROLES) {
        const result = evaluate(role, compiled.banners[role], operationIndex);
        if (result) rows.push({ operationIndex, role, result });
      }
    }
    return rows;
  }

  function actionKey(action) {
    return action.reroll
      ? "Reroll Roll Operations"
      : `${action.operationIndex}:${action.role}`;
  }

  function actionLabel(action) {
    return action.reroll
      ? "Reroll Roll Operations"
      : `${data.rolls[action.operationIndex].name} / ${action.role}`;
  }

  function selectRootActions(allActions) {
    const rows = currentRows();
    const byKey = new Map(
      rows.map((row) => [
        `${row.operationIndex}:${row.role}`,
        { reroll: false, ...row },
      ])
    );
    const reroll = { reroll: true, result: null };

    if (compiled.candidates) {
      const selected = [];
      for (const candidate of compiled.candidates) {
        if (candidate.reroll) {
          selected.push(reroll);
          continue;
        }
        const key = actionKey(candidate);
        const action = byKey.get(key);
        if (!action) {
          throw new Error(
            `${actionLabel(candidate)} is not applicable to the current offers/banner`
          );
        }
        selected.push(action);
      }
      if (!selected.some((action) => action.reroll)) selected.unshift(reroll);
      return Array.from(
        new Map(selected.map((action) => [actionKey(action), action])).values()
      );
    }

    if (allActions) return [reroll, ...rows.map((row) => ({ reroll: false, ...row }))];

    const selected = new Map();
    const add = (row) => {
      if (selected.size >= compiled.candidateLimit) return;
      selected.set(`${row.operationIndex}:${row.role}`, {
        reroll: false,
        ...row,
      });
    };

    rows
      .filter((row) => row.result.expected > 1e-9)
      .sort((left, right) => right.result.expected - left.result.expected)
      .forEach(add);
    rows
      .slice()
      .sort((left, right) => right.result.expected - left.result.expected)
      .forEach(add);
    rows
      .slice()
      .sort((left, right) => right.result.best - left.result.best)
      .forEach(add);

    return [reroll, ...selected.values()];
  }

  function bestGreedyAction(state, offers) {
    let best = null;
    for (const operationIndex of offers) {
      for (const role of ROLES) {
        const result = evaluate(role, state[role], operationIndex);
        if (!result) continue;
        if (!best || result.expected > best.result.expected) {
          best = { operationIndex, role, result };
        }
      }
    }
    return best && best.result.expected > 1e-9 ? best : null;
  }

  function simulateFuture(startState, offerSequence, outcomeDraws) {
    const state = cloneBanners(startState);
    let delta = 0;
    for (let token = 0; token < offerSequence.length; token++) {
      const action = bestGreedyAction(state, offerSequence[token]);
      if (!action) continue;
      const outcome = sampleOutcome(action.result.outcomes, outcomeDraws[token]);
      state[action.role] = cloneSlots(outcome.slots);
      delta += outcome.delta;
    }
    return delta;
  }

  function run(options = {}) {
    const trials = options.trials ?? DEFAULT_TRIALS;
    const seed = options.seed ?? DEFAULT_SEED;
    if (!Number.isInteger(trials) || trials < 1) {
      throw new Error("trials must be an integer greater than or equal to 1");
    }
    if (!Number.isInteger(seed)) throw new Error("seed must be an integer");

    const rootActions = selectRootActions(Boolean(options.allActions));
    const futureTokens = compiled.tokens - 1;
    const trialInputs = [];
    for (let trial = 0; trial < trials; trial++) {
      const random = mulberry32(mixSeed(seed, trial));
      trialInputs.push({
        rootDraw: random(),
        offers: Array.from(
          { length: futureTokens },
          () => sampleDistinctOffers(random, compiled.offerWeights)
        ),
        outcomeDraws: Array.from({ length: futureTokens }, () => random()),
      });
    }

    const samples = new Map(
      rootActions.map((action) => [actionLabel(action), []])
    );
    const started = performance.now();

    for (let trial = 0; trial < trials; trial++) {
      const input = trialInputs[trial];
      for (const action of rootActions) {
        const state = cloneBanners(compiled.banners);
        let delta = 0;

        if (!action.reroll) {
          const outcome = sampleOutcome(action.result.outcomes, input.rootDraw);
          state[action.role] = cloneSlots(outcome.slots);
          delta += outcome.delta;
        }

        delta += simulateFuture(state, input.offers, input.outcomeDraws);
        samples.get(actionLabel(action)).push(delta);
      }

      if (
        options.progress &&
        (trial + 1 === trials || (trial + 1) % Math.max(1, Math.floor(trials / 10)) === 0)
      ) {
        options.progress(trial + 1, trials);
      }
    }

    const baselineLabel = "Reroll Roll Operations";
    const baseline = samples.get(baselineLabel);
    const results = rootActions.map((action) => {
      const label = actionLabel(action);
      const values = samples.get(label);
      const summary = summarize(values);
      let versusReroll = null;
      if (!action.reroll && baseline) {
        const differences = values.map(
          (value, index) => value - baseline[index]
        );
        versusReroll = {
          ...summarize(differences),
          chanceBetter:
            differences.filter((difference) => difference > 1e-9).length /
            differences.length,
        };
      }

      return {
        label,
        role: action.role || null,
        operation: action.reroll ? null : data.rolls[action.operationIndex].name,
        immediate: action.reroll
          ? { expected: 0, worse: 0, worst: 0, best: 0 }
          : {
              expected: action.result.expected,
              worse: action.result.worse,
              worst: action.result.worst,
              best: action.result.best,
            },
        horizon: summary,
        versusReroll,
      };
    });

    const rankMetric = {
      expected: (result) => result.horizon.mean,
      ceiling: (result) => result.horizon.p90,
      floor: (result) => result.horizon.p10,
    }[compiled.objective];
    results.sort((left, right) => rankMetric(right) - rankMetric(left));

    return {
      assumptions: {
        offerModel: rawOfferModel(compiled, data),
        futurePolicy:
          "Apply the highest positive one-step EV action; otherwise reroll offers",
        scoringTransitions: "Enumerated helper transitions with binned series maxima",
        valuation: "Mean across each role's teams, without roster selection or Title bonuses",
        modelUncertainty:
          "Monte Carlo intervals exclude unknown Valve offer/outcome model error",
      },
      model: {
        synthetic: data.meta.synthetic === true,
        generated: data.meta.generated,
        period: data.meta.period,
        periodName: data.meta.periods[data.meta.period].name,
      },
      input: {
        tokens: compiled.tokens,
        trials,
        seed,
        objective: compiled.objective,
      },
      runtime: {
        seconds: (performance.now() - started) / 1000,
        cachedEvaluations: evaluationCache.size,
      },
      results,
    };
  }

  return { currentRows, run, selectRootActions };
}

function rawOfferModel(compiled, data) {
  const weights = Array.from(compiled.offerWeights);
  const equal = weights.every((weight) => weight === weights[0]);
  if (equal) {
    return `Three distinct operations drawn uniformly from ${data.rolls.length}`;
  }
  return {
    description: "Three distinct operations drawn without replacement by weight",
    weights: Object.fromEntries(
      data.rolls.map((operation, index) => [
        operation.name,
        compiled.offerWeights[index],
      ])
    ),
  };
}

function signed(value, digits = 0) {
  const rounded = value.toFixed(digits);
  return value > 0 ? `+${rounded}` : rounded;
}

function formatReport(report) {
  const lines = [
    `Model: ${report.model.periodName}, generated ${report.model.generated}`,
    `Tokens: ${report.input.tokens}; trials: ${report.input.trials}; ` +
      `objective: ${report.input.objective}`,
    `Offers: ${typeof report.assumptions.offerModel === "string"
      ? report.assumptions.offerModel
      : report.assumptions.offerModel.description}`,
    `Future policy: ${report.assumptions.futurePolicy}`,
    `Valuation: ${report.assumptions.valuation}`,
    "",
    "Ranked strategies:",
  ];

  if (report.model.synthetic) {
    lines.unshift("SYNTHETIC TEST DATA: do not use these results for fantasy recommendations.", "");
  }

  report.results.forEach((result, index) => {
    lines.push(
      `${index + 1}. ${result.label}`,
      `   Horizon mean ${signed(result.horizon.mean)} ` +
        `(95% MC +/-${result.horizon.confidence95.toFixed(0)}), ` +
        `p10 ${signed(result.horizon.p10)}, ` +
        `median ${signed(result.horizon.median)}, ` +
        `p90 ${signed(result.horizon.p90)}, ` +
        `below current ${(100 * result.horizon.chanceBelowCurrent).toFixed(1)}%`,
      `   Immediate EV ${signed(result.immediate.expected)}, ` +
        `worse ${(100 * result.immediate.worse).toFixed(1)}%, ` +
        `worst ${signed(result.immediate.worst)}, best ${signed(result.immediate.best)}`
    );
    if (result.versusReroll) {
      lines.push(
        `   Vs reroll offers: mean ${signed(result.versusReroll.mean)} ` +
          `(95% MC +/-${result.versusReroll.confidence95.toFixed(0)}), ` +
          `better ${(100 * result.versusReroll.chanceBetter).toFixed(1)}%`
      );
    }
  });

  lines.push(
    "",
    `Runtime: ${report.runtime.seconds.toFixed(1)}s; ` +
      `${report.runtime.cachedEvaluations} cached state/operation evaluations`,
    "Caution: Monte Carlo intervals cover simulation noise, not uncertainty in Valve's odds."
  );
  return lines.join("\n");
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    if (!options.statePath) throw new Error("--state is required");

    const raw = readJson(path.resolve(options.statePath));
    const model = loadModel(options.modelDir, options.dataPath);
    const compiled = compileState(raw, model.data);
    const analyzer = makeAnalyzer(model, compiled);
    const report = analyzer.run({
      trials: options.trials ?? raw.trials ?? DEFAULT_TRIALS,
      seed: options.seed ?? raw.seed ?? DEFAULT_SEED,
      allActions: options.allActions,
      progress:
        options.quiet || options.json
          ? null
          : (done, total) => process.stderr.write(`\rSimulating ${done}/${total}`),
    });
    if (!options.quiet && !options.json) process.stderr.write("\n");
    console.log(options.json ? JSON.stringify(report, null, 2) : formatReport(report));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  compileState,
  formatReport,
  loadModel,
  makeAnalyzer,
  mixSeed,
  mulberry32,
  parseArgs,
  sampleDistinctOffers,
  summarize,
};
