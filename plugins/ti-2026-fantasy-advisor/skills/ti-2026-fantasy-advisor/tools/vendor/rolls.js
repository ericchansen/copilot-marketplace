// What a roll operation does to a War Banner, and what that is worth.
//
// Every outcome is enumerated exactly rather than sampled. The largest case is a
// stat reroll across three same-colour slots at 71 possibilities, until a period
// widens the War Banner: quality redistribution over five emblems reaches a few
// hundred. The operations themselves, the quality ladder and the trait bonuses
// all come from the CSVs via data.json, so nothing about them is a literal here.

var CALC = (function () {
  if (typeof module !== "undefined" && module.exports) return require("./calc.js");
  return null;
})();

function valueOf(units, slots, data) {
  return CALC ? CALC.bannerValue(units, slots, data) : bannerValue(units, slots, data);
}

function asList(x) {
  return Array.isArray(x) ? x : [x];
}

// What a banner is, for the purpose of what it scores. Two operations that reach
// the same arrangement are worth the same, and they do so often: on a banner
// holding one emblem of a colour, "all", "first", "last" and "random" are the
// same operation. Around a third of valuations are repeats because of it.
function signature(slots) {
  var out = "";
  for (var i = 0; i < slots.length; i++) {
    out += slots[i].stat + "," + slots[i].quality + "," + slots[i].trait + "|";
  }
  return out;
}

function cloneSlots(slots) {
  return slots.map(function (s) {
    return { stat: s.stat, quality: s.quality, trait: s.trait };
  });
}

// The slot groups an operation can hit, each with the chance of being the one
// hit — "one random Red emblem" is a mixture over the Red slots. An empty list
// means the operation cannot apply to this banner at all.
function targetGroups(colours, operation) {
  if (operation.property === "increase" || operation.property === "redistribute") {
    return [{ slots: colours.map(function (_, i) { return i; }), probability: 1 }];
  }

  var idx = [];
  colours.forEach(function (c, i) { if (c === operation.colour) idx.push(i); });
  if (idx.length === 0) return [];

  if (operation.scope === "all") return [{ slots: idx, probability: 1 }];
  if (operation.scope === "first") return [{ slots: [idx[0]], probability: 1 }];
  if (operation.scope === "last") return [{ slots: [idx[idx.length - 1]], probability: 1 }];
  if (operation.scope === "random") {
    return idx.map(function (i) {
      return { slots: [i], probability: 1 / idx.length };
    });
  }
  throw new Error("unknown roll scope: " + operation.scope);
}

// Quality and trait rerolls are independent per slot and cannot return the
// current value, so the remaining options renormalise.
function independentOutcomes(base, targets, key, options) {
  var results = [{ slots: cloneSlots(base), probability: 1 }];

  targets.forEach(function (si) {
    var current = base[si][key];
    var choices = options.filter(function (o) { return o.value !== current; });
    var mass = choices.reduce(function (s, c) { return s + c.weight; }, 0);
    var next = [];

    results.forEach(function (r) {
      choices.forEach(function (c) {
        var slots = cloneSlots(r.slots);
        slots[si][key] = c.value;
        next.push({ slots: slots, probability: r.probability * (c.weight / mass) });
      });
    });
    results = next;
  });

  return results;
}

// A stat reroll is a joint draw, not independent ones: a banner cannot hold the
// same stat twice, so the new stats must differ from each other, from every
// same-colour slot left untouched, and from their own current value. Uniform
// over the valid assignments.
function statOutcomes(base, targets, colours, colour, pool) {
  var held = [];
  colours.forEach(function (c, i) {
    if (c === colour && targets.indexOf(i) < 0) held.push(base[i].stat);
  });

  var results = [];
  (function recurse(k, taken, slots) {
    if (k === targets.length) {
      results.push(slots);
      return;
    }
    var si = targets[k];
    pool.forEach(function (stat) {
      if (stat === base[si].stat) return;
      if (held.indexOf(stat) >= 0) return;
      if (taken.indexOf(stat) >= 0) return;
      var copy = cloneSlots(slots);
      copy[si].stat = stat;
      recurse(k + 1, taken.concat([stat]), copy);
    });
  })(0, [], cloneSlots(base));

  // Unreachable while a colour offers more stats than a banner has slots for it,
  // but silence here would become probabilities of Infinity rather than a stop
  if (results.length === 0) {
    throw new Error("no legal stat assignment for " + targets.length + " " +
                    colour + " slots out of " + pool.length + " stats");
  }

  return results.map(function (s) {
    return { slots: s, probability: 1 / results.length };
  });
}

// An emblem that moves is rerolled, not stepped: the game raises or lowers the
// quality without saying by how much, so the new tier is drawn from the same
// weights a free reroll uses, restricted to one side of the current tier and
// renormalised over what is left. Tier III can therefore land on V as easily as
// on IV, and the weights favouring the low tiers make a reduction bite hard.
// A direction of 0 is the forced case below: the emblem was picked for a move it
// cannot make, so it rerolls over every tier but its own. At a cap that is the
// same set as the one direction still open to it, which is why a Tier V told to
// rise falls and a Tier I told to fall rises.
function tierDraw(qualities, current, direction) {
  var options = [];
  var mass = 0;
  qualities.forEach(function (q, i) {
    var wanted = direction > 0 ? i > current
      : direction < 0 ? i < current
      : i !== current;
    if (wanted) {
      options.push({ quality: i, weight: q.weight });
      mass += q.weight;
    }
  });

  return options.map(function (o) {
    return { quality: o.quality, probability: o.weight / mass };
  });
}

// Uniform over the emblems that can still rise, then a weighted draw over the
// tiers above whichever one was picked. With the whole War Banner already at the
// top there is nothing to pick but a capped emblem, and that one rerolls — which
// is how a roll that promises an increase can hand back a lower tier.
function increaseOutcomes(base, qualities) {
  var top = qualities.length - 1;
  var can = [];
  base.forEach(function (s, i) { if (s.quality < top) can.push(i); });

  var forced = can.length === 0;
  if (forced) base.forEach(function (s, i) { can.push(i); });

  var results = [];
  can.forEach(function (i) {
    tierDraw(qualities, base[i].quality, forced ? 0 : 1).forEach(function (draw) {
      var slots = cloneSlots(base);
      slots[i].quality = draw.quality;
      results.push({ slots: slots, probability: draw.probability / can.length });
    });
  });

  return results;
}

// Two sets of picks can land on the same arrangement once a capped emblem is
// involved, so they are one outcome carrying both chances rather than two rows
// that read as a bug.
function mergeOutcomes(outcomes) {
  var at = {};
  var merged = [];
  outcomes.forEach(function (o) {
    var key = signature(o.slots);
    if (at[key] === undefined) {
      at[key] = merged.length;
      merged.push(o);
    } else {
      merged[at[key]].probability += o.probability;
    }
  });
  return merged;
}

// Two emblems go up and a third comes down. A capped emblem is passed over where
// there is any way to avoid it, but unlike "increase one Quality" that is not
// always possible — one Tier I beside two Tier V has no clean assignment at all
// — so the picks that break the fewest of those rules are the ones made, and
// whatever is left stuck rerolls instead of moving.
function redistributeOutcomes(base, qualities) {
  var top = qualities.length - 1;
  var stuck = function (i, direction) {
    return direction > 0 ? base[i].quality === top : base[i].quality === 0;
  };

  var combos = [];
  for (var a = 0; a < base.length; a++) {
    for (var b = a + 1; b < base.length; b++) {
      for (var d = 0; d < base.length; d++) {
        if (d === a || d === b) continue;
        var count = 0;
        if (stuck(a, 1)) count++;
        if (stuck(b, 1)) count++;
        if (stuck(d, -1)) count++;
        combos.push({ raise: [a, b], lower: d, stuck: count });
      }
    }
  }
  // A War Banner too small to hold three distinct emblems has nothing to pick
  if (combos.length === 0) return [{ slots: cloneSlots(base), probability: 1 }];

  var fewest = Math.min.apply(null, combos.map(function (c) { return c.stuck; }));
  combos = combos.filter(function (c) { return c.stuck === fewest; });

  // Each emblem that moves draws its own tier, so an outcome is one choice of
  // which emblems move crossed with one tier for each of them
  var results = [];
  combos.forEach(function (c) {
    var moves = c.raise.map(function (i) {
      return { slot: i, direction: stuck(i, 1) ? 0 : 1 };
    });
    moves.push({ slot: c.lower, direction: stuck(c.lower, -1) ? 0 : -1 });

    var branches = [{ slots: cloneSlots(base), probability: 1 / combos.length }];
    moves.forEach(function (move) {
      var next = [];
      branches.forEach(function (branch) {
        tierDraw(qualities, base[move.slot].quality, move.direction).forEach(function (draw) {
          var slots = cloneSlots(branch.slots);
          slots[move.slot].quality = draw.quality;
          next.push({
            slots: slots,
            probability: branch.probability * draw.probability
          });
        });
      });
      branches = next;
    });
    results = results.concat(branches);
  });

  return mergeOutcomes(results);
}

function outcomesFor(data, base, colours, group, operation) {
  if (operation.property === "quality") {
    return independentOutcomes(base, group.slots, "quality",
      data.qualities.map(function (q, i) { return { value: i, weight: q.weight }; }));
  }
  if (operation.property === "trait") {
    return independentOutcomes(base, group.slots, "trait",
      data.traits.map(function (_, i) { return { value: i, weight: 1 }; }));
  }
  if (operation.property === "stat") {
    var pool = [];
    data.stats.forEach(function (s, i) { if (s.colour === operation.colour) pool.push(i); });
    return statOutcomes(base, group.slots, colours, operation.colour, pool);
  }
  if (operation.property === "increase") return increaseOutcomes(base, data.qualities);
  if (operation.property === "redistribute") return redistributeOutcomes(base, data.qualities);

  throw new Error("unknown roll property: " + operation.property);
}

// null when the operation cannot touch this banner. Otherwise every outcome with
// its probability and its change in points, plus the summary the table shows.
//
// `cache` is optional and keyed by arrangement, so the unchanged banner is priced
// once per role rather than once per operation, and arrangements two operations
// share are priced once between them.
function evaluate(data, units, slots, role, operation, cache) {
  var colours = asList(data.banner[role]);
  var groups = targetGroups(colours, operation);
  if (groups.length === 0) return null;

  var price = function (s) {
    if (!cache) return valueOf(units, s, data);
    var key = signature(s);
    if (cache[key] === undefined) cache[key] = valueOf(units, s, data);
    return cache[key];
  };

  var current = price(slots);
  var outcomes = [];

  groups.forEach(function (group) {
    outcomesFor(data, slots, colours, group, operation).forEach(function (o) {
      outcomes.push({
        slots: o.slots,
        probability: group.probability * o.probability
      });
    });
  });

  var expected = 0;
  var worse = 0;
  var worst = Infinity;
  var best = -Infinity;

  outcomes.forEach(function (o) {
    o.delta = price(o.slots) - current;
    expected += o.probability * o.delta;
    if (o.delta < -1e-9) worse += o.probability;
    if (o.delta < worst) worst = o.delta;
    if (o.delta > best) best = o.delta;
  });

  return {
    current: current,
    expected: expected,
    worse: worse,
    worst: worst,
    best: best,
    outcomes: outcomes
  };
}

// Every operation against every banner, dropping the pairs that cannot apply.
//
// Editing a banner only changes one role, so `only` keeps the other two as they
// were rather than pricing them again. `previous` is the last result set.
function evaluateAll(data, unitsByRole, banner, previous, only) {
  var rows = [];
  Object.keys(banner).forEach(function (role) {
    if (only && role !== only && previous) {
      previous.forEach(function (row) { if (row.role === role) rows.push(row); });
      return;
    }
    // One cache per role, since a banner is only ever priced against its own
    var cache = {};
    data.rolls.forEach(function (operation, oi) {
      var result = evaluate(data, unitsByRole[role], banner[role], role, operation, cache);
      if (result) rows.push({ operation: operation, index: oi, role: role, result: result });
    });
  });
  rows.sort(function (a, b) { return b.result.expected - a.result.expected; });
  return rows;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    targetGroups: targetGroups,
    outcomesFor: outcomesFor,
    evaluate: evaluate,
    evaluateAll: evaluateAll
  };
}
