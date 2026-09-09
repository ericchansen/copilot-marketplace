"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  compileState,
  formatReport,
  loadModel,
  makeAnalyzer,
  mulberry32,
  parseArgs,
  sampleDistinctOffers,
} = require("./horizon-analyzer.js");

const vendorPath = path.join(__dirname, "vendor");
const dataPath = path.join(__dirname, "examples", "synthetic-model.json");
const statePath = path.join(__dirname, "examples", "synthetic-state.json");
const model = loadModel(vendorPath, dataPath);
const example = require("./examples/synthetic-state.json");

test("compiles the synthetic banner and offer state", () => {
  const state = compileState(example, model.data);
  assert.equal(state.tokens, 2);
  assert.deepEqual(state.offers, [2, 9, 13]);
  assert.deepEqual(state.banners.Support[1], {
    stat: 16,
    quality: 1,
    trait: 1,
  });
});

test("matches an independently calculated quality reroll on constant scores", () => {
  const data = structuredClone(model.data);
  for (const unit of data.units) {
    unit.pts = unit.pts.map((row) => row.map(() => 100));
  }
  const state = compileState(example, data);
  const rows = makeAnalyzer({ ...model, data }, state).currentRows();
  const result = rows.find((row) => row.operationIndex === 2 && row.role === "Core").result;
  const expectedBonus = (5 * 0.1 + 3 * 0.6 + 2 * 1 + 1 * 1.5) / 11;
  assert.ok(Math.abs(result.current - 940) < 1e-8);
  assert.ok(Math.abs(result.expected - 200 * (expectedBonus - 0.3)) < 1e-8);
  assert.ok(Math.abs(result.worst - -40) < 1e-8);
  assert.ok(Math.abs(result.best - 240) < 1e-8);
  assert.ok(Math.abs(result.outcomes.reduce((sum, outcome) => sum + outcome.probability, 0) - 1) < 1e-8);
});

test("draws three distinct operations under equal offer weights", () => {
  const weights = new Float64Array(20);
  weights.fill(1);
  const offers = sampleDistinctOffers(() => 0.5, weights);
  assert.equal(offers.length, 3);
  assert.equal(new Set(offers).size, 3);
});

test("honours custom operation-offer weights", () => {
  const weights = new Float64Array(20);
  weights.fill(1);
  weights[0] = 100;
  const random = mulberry32(1234);
  let includesHeavyOperation = 0;
  for (let trial = 0; trial < 1000; trial++) {
    if (sampleDistinctOffers(random, weights).includes(0)) {
      includesHeavyOperation++;
    }
  }
  assert.ok(includesHeavyOperation > 900);
});

test("limits automatically selected root contenders", () => {
  const input = {
    ...example,
    candidates: undefined,
    candidateLimit: 2,
  };
  const state = compileState(input, model.data);
  const actions = makeAnalyzer(model, state).selectRootActions(false);
  assert.equal(actions.length, 3);
  assert.equal(actions[0].reroll, true);
});

test("one remaining token leaves a reroll strategy unchanged", () => {
  const input = {
    ...example,
    tokens: 1,
    candidates: ["Reroll Roll Operations"],
  };
  const state = compileState(input, model.data);
  const report = makeAnalyzer(model, state).run({ trials: 3, seed: 1234 });
  assert.equal(report.results[0].horizon.mean, 0);
  assert.equal(report.results[0].horizon.chanceBelowCurrent, 0);
});

test("produces deterministic horizon results for a fixed seed", () => {
  const input = {
    ...example,
    tokens: 2,
    candidates: ["Reroll Roll Operations"],
  };
  const state = compileState(input, model.data);
  const first = makeAnalyzer(model, state).run({ trials: 3, seed: 1234 });
  const second = makeAnalyzer(model, state).run({ trials: 3, seed: 1234 });
  assert.deepEqual(first.results, second.results);
});

test("requires a period and rejects data from another period", () => {
  assert.throws(
    () => compileState({ ...example, period: undefined }, model.data),
    /period must be an integer/
  );
  assert.throws(
    () => compileState({ ...example, period: 2 }, model.data),
    /does not match model period/
  );
});

test("validates offer uniqueness, slot colours, and applicable candidates", () => {
  assert.throws(
    () => compileState({ ...example, offers: [example.offers[0], example.offers[0], example.offers[1]] }, model.data),
    /three distinct/
  );
  const wrongColour = structuredClone(example);
  wrongColour.banners.Core[0].stat = "Wards Placed";
  assert.throws(() => compileState(wrongColour, model.data), /is Red.*is Blue/);
  const unavailable = {
    ...example,
    candidates: [{ operation: "Randomly increase one Quality", role: "Core" }],
  };
  assert.throws(
    () => makeAnalyzer(model, compileState(unavailable, model.data)).selectRootActions(false),
    /not applicable/
  );
});

test("parses external data paths without changing the script-relative engine", () => {
  const options = parseArgs(["--state", statePath, "--data", dataPath, "--trials", "3"]);
  assert.equal(options.dataPath, dataPath);
  assert.equal(options.statePath, statePath);
  assert.equal(options.modelDir, vendorPath);
  assert.equal(options.trials, 3);
  assert.throws(() => parseArgs(["--data"]), /requires a value/);
});

test("missing match data gives actionable setup guidance, never an implicit fixture", () => {
  assert.equal(fs.existsSync(path.join(vendorPath, "data.json")), false);
  assert.throws(() => loadModel(), /Match data is not bundled; supply --data FILE/);
});

test("synthetic reports are marked in JSON and human-readable output", () => {
  const state = compileState({ ...example, tokens: 1 }, model.data);
  const report = makeAnalyzer(model, state).run({ trials: 3, seed: 1234 });
  assert.equal(report.model.synthetic, true);
  assert.match(formatReport(report), /^SYNTHETIC TEST DATA:/);
  assert.match(report.assumptions.valuation, /without roster selection or Title bonuses/);
});

test("CLI help marks external data optional and explains the model directory fallback", () => {
  const child = spawnSync(process.execPath, [
    path.join(__dirname, "horizon-analyzer.js"),
    "--help",
  ], { cwd: path.parse(__dirname).root, encoding: "utf8", timeout: 30000 });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, "");
  assert.match(child.stdout, /--state state\.json \[--data data\.json\] \[options\]/);
  assert.match(child.stdout, /Also supplies data\.json unless --data overrides it/);
});

test("CLI works from an unrelated cwd and emits usable JSON", () => {
  const child = spawnSync(process.execPath, [
    path.join(__dirname, "horizon-analyzer.js"),
    "--state", statePath,
    "--data", dataPath,
    "--trials", "3",
    "--json",
  ], {
    cwd: path.parse(__dirname).root,
    encoding: "utf8",
    timeout: 30000,
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, "");
  const report = JSON.parse(child.stdout);
  assert.equal(report.model.synthetic, true);
  assert.equal(report.input.tokens, 2);
  assert.equal(report.input.trials, 3);
  assert.equal(report.results.length, 2);
  assert.ok(report.results.every((result) => Number.isFinite(result.horizon.mean)));
  assert.ok(report.results.some((result) => result.versusReroll !== null));
});

test("CLI accepts cwd-relative external data and trusted engine paths", () => {
  const child = spawnSync(process.execPath, [
    path.join(__dirname, "horizon-analyzer.js"),
    "--state", path.join("examples", "synthetic-state.json"),
    "--data", path.join("examples", "synthetic-model.json"),
    "--model-dir", "vendor",
    "--trials", "1",
    "--json",
  ], { cwd: __dirname, encoding: "utf8", timeout: 30000 });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).model.synthetic, true);
});

test("CLI missing-data failure stays on stderr and returns a nonzero exit", () => {
  const child = spawnSync(process.execPath, [
    path.join(__dirname, "horizon-analyzer.js"),
    "--state", statePath,
    "--json",
  ], { cwd: path.parse(__dirname).root, encoding: "utf8", timeout: 30000 });
  assert.ifError(child.error);
  assert.equal(child.status, 1);
  assert.equal(child.stdout, "");
  assert.match(child.stderr, /Match data is not bundled; supply --data FILE/);
});
