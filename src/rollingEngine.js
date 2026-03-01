/**
 * rollingEngine.js — Pure logic. No React.
 *
 * Mass units: raw file units (same as wormholes.js).
 *   1 file unit = 1,000 kg in EVE.
 *   Display: value / 1000 + "M"  (e.g. 300_000 → "300M")
 *
 * ─── Plan item types ────────────────────────────────────────────────────────
 *
 *   { type: 'step',
 *     id, ship, direction, isHot, massThisJump, runningTotal,
 *     isGoalStep, collapses, isStrandingRisk }
 *
 *   { type: 'assessment', id, passNumber, estimatedConsumed }
 *     → Shown mid-execution: FC reports whether the WH is visually reduced.
 *
 *   { type: 'doorstop-marker', id, ship }
 *     → All other pilots are home; this ship is staged in the hole.
 *
 *   { type: 'outcome', id, result: 'collapsed'|'critical'|'doorstop_active' }
 *
 * ─── Assessment answers ─────────────────────────────────────────────────────
 *   'not_reduced' — WH still looks fresh (>50% mass remaining)
 *   'reduced'     — WH is visually reduced  (≤50% remaining ≈ ≥50% consumed)
 *   'critical'    — WH is already flashing  (≤10% remaining ≈ ≥90% consumed)
 */

/**
 * Rolling goals — determines when the plan is "done".
 *   close:    Fully collapse the wormhole (100% mass consumed)
 *   crit:     Bring to critical mass (≥90% consumed), all ships home
 *   doorstop: Same as crit, but the heaviest ship stays staged in the hole
 *             so the FC can close on demand with one hot jump
 */
export const GOALS = {
  close: {
    label:         'Roll to Close',
    shortLabel:    'Close',
    description:   'Collapse and permanently seal the wormhole',
    threshold:     1.0,
    badge:         'COLLAPSES',
    outcomeResult: 'collapsed',
  },
  crit: {
    label:         'Crit It',
    shortLabel:    'Crit',
    description:   'Bring to critical mass — ≥90% consumed, one jump from death',
    threshold:     0.9,
    badge:         'CRITTED',
    outcomeResult: 'critical',
  },
  doorstop: {
    label:         'Door Stop It',
    shortLabel:    'Doorstop',
    description:   'Crit the hole and stage one ship inside — close on demand',
    threshold:     0.9,
    badge:         'DOORSTOP',
    outcomeResult: 'doorstop_active',
  },
};

export const SHIP_CLASSES = {
  Battleship:    { hotMass: 300_000, coldMass: 200_000 },
  Orca:          { hotMass: 700_000, coldMass: 500_000 },
  Carrier:       { hotMass: 1_000_000, coldMass: 800_000 },
  Battlecruiser: { hotMass: 150_000, coldMass: 100_000 },
  Cruiser:       { hotMass: 75_000,  coldMass: 50_000 },
  Custom:        { hotMass: 0,       coldMass: 0 },
};

/** Format raw value to display string: 300_000 → "300M" */
export function formatMass(value) {
  if (value == null) return '?';
  const m = Math.round(value / 1000);
  return m.toLocaleString() + 'M';
}

let _idCounter = 0;
function uid() { return ++_idCounter; }

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the full rolling plan.
 *
 * Returns { items, warnings, canReachGoal, goal, doorstopShip }
 *
 * The plan is a flat array of typed items (step / assessment / doorstop-marker
 * / outcome).  Assessment items are inserted between passes; the FC answers
 * them during execution and the tail of the plan is regenerated via
 * recalculatePlan().
 */
export function generatePlan(wormhole, fleet, goal = 'close') {
  if (!wormhole || !fleet || fleet.length === 0) return null;

  const jumpLimit = wormhole.maxIndividualMass;
  const warnings  = [];

  // ── Ship validation ──────────────────────────────────────────────────────
  fleet.forEach(ship => {
    if (ship.coldMass > jumpLimit) {
      warnings.push({
        id: uid(), type: 'cant-fit', shipId: ship.id,
        message: `${ship.pilotName} (${ship.shipClass}${ship.shipName ? ' — ' + ship.shipName : ''}) cannot fit through this wormhole even cold — excluded.`,
      });
    } else if (ship.hotMass > jumpLimit) {
      warnings.push({
        id: uid(), type: 'hot-oversized', shipId: ship.id,
        message: `${ship.pilotName} (${ship.shipClass}) exceeds the jump limit hot — will jump cold on inbound.`,
      });
    }
    if (ship.shipClass === 'Orca' && ship.hotMass >= jumpLimit * 0.8) {
      warnings.push({
        id: uid(), type: 'orca-risk', shipId: ship.id,
        message: `${ship.pilotName} (Orca) is close to the per-jump mass limit — double-check mass before jumping.`,
      });
    }
  });

  const eligible = fleet
    .filter(s => s.coldMass <= jumpLimit)
    .sort((a, b) => b.hotMass - a.hotMass);

  if (eligible.length === 0) {
    return { items: [], warnings, canReachGoal: false, goal, doorstopShip: null };
  }

  // Doorstop ship: heaviest eligible ship — stays staged in hole so it can
  // close the WH on demand with one hot return jump.
  const doorstopShip = goal === 'doorstop' ? eligible[0] : null;

  if (goal === 'doorstop' && eligible.length === 1) {
    warnings.push({
      id: uid(), type: 'doorstop-solo',
      message: `Only one ship in fleet — cannot doorstop with a single ship (the staged ship would have no escort home). Add a second ship.`,
    });
  }

  const { items, canReachGoal } = _buildPlan(eligible, 0, wormhole, goal, doorstopShip, warnings);

  return { items, warnings, canReachGoal, goal, doorstopShip };
}

/**
 * Regenerate the plan tail after an assessment answer.
 *
 * Call this when the FC answers an assessment item. The return value is the
 * new items array (splice it in from the assessment index onwards).
 *
 * @param {object} wormhole
 * @param {Array}  fleet              — full original fleet
 * @param {string} goal               — 'close' | 'crit' | 'doorstop'
 * @param {number} trackedConsumed    — runningTotal of the last completed step
 * @param {string} assessmentAnswer   — 'not_reduced' | 'reduced' | 'critical'
 */
export function recalculatePlan(wormhole, fleet, goal, trackedConsumed, assessmentAnswer) {
  const target    = wormhole.totalMass;
  const jumpLimit = wormhole.maxIndividualMass;

  let estimatedConsumed = trackedConsumed;
  if (assessmentAnswer === 'reduced')  estimatedConsumed = Math.max(trackedConsumed, Math.round(target * 0.5));
  if (assessmentAnswer === 'critical') estimatedConsumed = Math.max(trackedConsumed, Math.round(target * 0.9));

  const eligible = fleet
    .filter(s => s.coldMass <= jumpLimit)
    .sort((a, b) => b.hotMass - a.hotMass);

  const doorstopShip = goal === 'doorstop' ? eligible[0] : null;
  const { items } = _buildPlan(eligible, estimatedConsumed, wormhole, goal, doorstopShip, []);
  return items;
}

/**
 * Generate the single closing step for a doorstop ship jumping home hot.
 * Call this when the FC presses "Close Now" on the doorstop screen.
 */
export function generateClosingStep(ship, currentRunningTotal, wormhole) {
  const mass      = ship.hotMass <= wormhole.maxIndividualMass ? ship.hotMass : ship.coldMass;
  const newTotal  = currentRunningTotal + mass;
  const collapses = newTotal >= wormhole.totalMass;
  return {
    type:           'step',
    id:             `home-${ship.id}-${uid()}`,
    ship,
    direction:      'home',
    isHot:          ship.hotMass <= wormhole.maxIndividualMass,
    massThisJump:   mass,
    runningTotal:   newTotal,
    collapses,
    isGoalStep:     collapses,
    isStrandingRisk: false,
  };
}

// ─── Core plan builder ───────────────────────────────────────────────────────

/**
 * Build plan items starting from estimatedConsumed.
 *
 * Strategy:
 *   - Try to complete the goal in one "final pass" (greedy Phase 1 + Phase 2).
 *   - If that fails, generate an intermediate pass (all in hot, all out cold)
 *     followed by an assessment checkpoint, then try again.
 *   - Repeat up to 10 passes.
 *
 * For CRIT/DOORSTOP: if the full fleet can't achieve a clean crit (all ships
 * home, no collapse), progressively try with N-1, N-2, … ships on the final
 * pass until a clean plan is found.
 */
function _buildPlan(eligible, estimatedConsumed, wormhole, goal, doorstopShip, warnings) {
  const target        = wormhole.totalMass;
  const goalCfg       = GOALS[goal] ?? GOALS.close;
  const goalThreshold = Math.round(target * goalCfg.threshold);

  const allItems = [];
  let runningTotal = estimatedConsumed;

  // ── Already at goal (e.g. FC answered "critical" for a crit/doorstop run) ──
  if (runningTotal >= goalThreshold) {
    if (goal === 'doorstop') allItems.push({ type: 'doorstop-marker', id: uid(), ship: doorstopShip });
    allItems.push({ type: 'outcome', id: uid(), result: goalCfg.outcomeResult });
    return { items: allItems, canReachGoal: true };
  }

  let passNumber = 0;

  while (runningTotal < goalThreshold && passNumber < 10) {
    passNumber++;

    // ── Try to finish in this pass ───────────────────────────────────────────
    const finalResult = _tryFinalPass(
      eligible, runningTotal, target, goalThreshold,
      wormhole.maxIndividualMass, goal, doorstopShip,
    );

    if (finalResult.canReachGoal) {
      allItems.push(...finalResult.items);
      if (goal === 'doorstop') allItems.push({ type: 'doorstop-marker', id: uid(), ship: doorstopShip });
      allItems.push({ type: 'outcome', id: uid(), result: goalCfg.outcomeResult });
      return { items: allItems, canReachGoal: true };
    }

    // ── Intermediate pass: all ships in hot, all ships out cold ──────────────
    const intResult = _intermediatePass(
      eligible, runningTotal, target, wormhole.maxIndividualMass,
    );
    allItems.push(...intResult.items);

    if (!intResult.ok) {
      if (warnings) {
        warnings.push({
          id: uid(), type: 'insufficient',
          message: 'An intermediate pass would collapse the wormhole before all ships are home. Reduce fleet size or switch goal.',
        });
      }
      break;
    }

    runningTotal = intResult.newRunning;

    if (runningTotal < goalThreshold) {
      allItems.push({ type: 'assessment', id: uid(), passNumber, estimatedConsumed: runningTotal });
    }
  }

  const canReachGoal = allItems.some(i => i.type === 'outcome');

  if (!canReachGoal && warnings) {
    warnings.push({
      id: uid(), type: 'insufficient',
      message: `Fleet cannot ${goalCfg.label.toLowerCase()} this wormhole within ${passNumber} passes. Add heavier ships.`,
    });
  }

  return { items: allItems, canReachGoal };
}

// ─── Final-pass attempts ─────────────────────────────────────────────────────

/**
 * Try to complete the goal in a single pass.
 *
 * For CLOSE: greedy cold-first returns until the WH collapses.
 * For CRIT/DOORSTOP: greedy cold-first until goal threshold; no return may
 *   collapse the WH (that would be a close, not a crit).
 *
 * If the full fleet can't achieve a clean crit/doorstop, progressively tries
 * with fewer ships (N-1, N-2, …) — this handles cases like 4 BSes on a G024
 * where 3 BSes achieve a clean crit but 4 would collapse on the last return.
 */
function _tryFinalPass(eligible, startRunning, target, goalThreshold, jumpLimit, goal, doorstopShip) {
  // Try with full fleet first
  const full = _singlePassGreedy(eligible, startRunning, target, goalThreshold, jumpLimit, goal, doorstopShip);
  if (full.canReachGoal) return full;

  // For CRIT/DOORSTOP: try with progressively fewer ships
  if (goal !== 'close') {
    for (let n = eligible.length - 1; n >= 1; n--) {
      const reduced = eligible.slice(0, n);
      const result  = _singlePassGreedy(reduced, startRunning, target, goalThreshold, jumpLimit, goal, doorstopShip);
      if (result.canReachGoal) return result;
    }
  }

  return { items: [], canReachGoal: false };
}

/**
 * One greedy pass with a given ship list.
 *
 * Phase 1 — All ships jump in (hot if within limit, else cold).
 * Phase 2 — Ships return using greedy cold-first targeting goalThreshold.
 *           For CRIT/DOORSTOP: if any return collapses the WH, the plan
 *           fails (canReachGoal = false) because collapse ≠ crit.
 *           For DOORSTOP: the doorstop ship is excluded from returns.
 */
function _singlePassGreedy(ships, startRunning, target, goalThreshold, jumpLimit, goal, doorstopShip) {
  const items = [];
  let running   = startRunning;
  let goalReached = false;

  // ── Phase 1: Inbound ────────────────────────────────────────────────────
  const inHole = [];

  for (const ship of ships) {
    const isHot        = ship.hotMass <= jumpLimit;
    const mass         = isHot ? ship.hotMass : ship.coldMass;
    running           += mass;
    const collapses    = running >= target;
    const isGoalStep   = !goalReached && running >= goalThreshold;
    if (isGoalStep) goalReached = true;

    items.push({
      type: 'step', id: `in-${ship.id}-${uid()}`,
      ship, direction: 'in', isHot, massThisJump: mass, runningTotal: running,
      collapses, isGoalStep, isStrandingRisk: collapses,
    });

    if (collapses) {
      // Inbound collapse is only acceptable for the CLOSE goal (goal already reached)
      return { items, canReachGoal: goal === 'close' && goalReached };
    }
    inHole.push(ship);
  }

  // ── Phase 2: Returns ────────────────────────────────────────────────────
  // Doorstop ship stays in hole — exclude from returns.
  const returningShips = (goal === 'doorstop' && doorstopShip)
    ? inHole.filter(s => s.id !== doorstopShip.id)
    : inHole;

  for (let i = 0; i < returningShips.length; i++) {
    const ship         = returningShips[i];
    const remaining    = returningShips.slice(i + 1);
    const remainMaxHot = remaining.reduce((s, sh) => s + sh.hotMass, 0);
    const afterCold    = running + ship.coldMass;
    const afterHot     = running + ship.hotMass;

    if (afterCold >= target) {
      // Cold return would actually collapse the WH
      running = afterCold;
      const isGoalStep = !goalReached;
      goalReached = true;
      items.push({
        type: 'step', id: `home-${ship.id}-${uid()}`,
        ship, direction: 'home', isHot: false, massThisJump: ship.coldMass,
        runningTotal: running, collapses: true, isGoalStep,
        isStrandingRisk: remaining.length > 0,
      });
      // Collapse during returns = can't achieve crit/doorstop cleanly
      if (goal !== 'close') return { items, canReachGoal: false };
      if (remaining.length > 0) {
        // Stranding: plan is included but flagged; warn at call site if needed
      }
      break;

    } else if (goalReached) {
      // Goal already reached — return cold to minimise added mass
      running = afterCold;
      const collapses = running >= target;
      items.push({
        type: 'step', id: `home-${ship.id}-${uid()}`,
        ship, direction: 'home', isHot: false, massThisJump: ship.coldMass,
        runningTotal: running, collapses, isGoalStep: false,
        isStrandingRisk: collapses && remaining.length > 0,
      });
      if (collapses) {
        if (goal !== 'close') return { items, canReachGoal: false };
        break;
      }

    } else if (afterCold >= goalThreshold) {
      // Cold return reaches goal without collapsing
      running     = afterCold;
      goalReached = true;
      items.push({
        type: 'step', id: `home-${ship.id}-${uid()}`,
        ship, direction: 'home', isHot: false, massThisJump: ship.coldMass,
        runningTotal: running, collapses: false, isGoalStep: true,
      });

    } else if (afterCold + remainMaxHot >= goalThreshold) {
      // Cold is safe; remaining ships can still reach goal
      running = afterCold;
      items.push({
        type: 'step', id: `home-${ship.id}-${uid()}`,
        ship, direction: 'home', isHot: false, massThisJump: ship.coldMass,
        runningTotal: running, collapses: false, isGoalStep: false,
      });

    } else {
      // Must go hot — cold + remaining max-hot isn't enough
      running          = afterHot;
      const isGoalStep = !goalReached && afterHot >= goalThreshold;
      if (isGoalStep) goalReached = true;
      const collapses  = afterHot >= target;
      items.push({
        type: 'step', id: `home-${ship.id}-${uid()}`,
        ship, direction: 'home', isHot: true, massThisJump: ship.hotMass,
        runningTotal: running, collapses, isGoalStep,
        isStrandingRisk: collapses && remaining.length > 0,
      });
      if (collapses) {
        if (goal !== 'close') return { items, canReachGoal: false };
        if (remaining.length > 0) break;
      }
    }
  }

  return { items, canReachGoal: goalReached };
}

// ─── Intermediate pass ───────────────────────────────────────────────────────

/**
 * One intermediate pass: all ships in hot, all ships return cold.
 * Returns { items, ok, newRunning }.
 * ok = false if the pass would collapse the WH (shouldn't happen if _tryFinalPass
 * correctly determines "can't close this pass" before calling _intermediatePass).
 */
function _intermediatePass(eligible, startRunning, target, jumpLimit) {
  const items  = [];
  let running  = startRunning;
  const inHole = [];

  // Inbound
  for (const ship of eligible) {
    const isHot      = ship.hotMass <= jumpLimit;
    const mass       = isHot ? ship.hotMass : ship.coldMass;
    running         += mass;
    const collapses  = running >= target;
    items.push({
      type: 'step', id: `in-${ship.id}-${uid()}`,
      ship, direction: 'in', isHot, massThisJump: mass, runningTotal: running,
      collapses, isGoalStep: false, isStrandingRisk: collapses,
    });
    if (collapses) return { items, ok: false, newRunning: running };
    inHole.push(ship);
  }

  // Returns (all cold)
  for (let i = 0; i < inHole.length; i++) {
    const ship      = inHole[i];
    const remaining = inHole.slice(i + 1);
    running        += ship.coldMass;
    const collapses = running >= target;
    items.push({
      type: 'step', id: `home-${ship.id}-${uid()}`,
      ship, direction: 'home', isHot: false, massThisJump: ship.coldMass,
      runningTotal: running, collapses, isGoalStep: false,
      isStrandingRisk: collapses && remaining.length > 0,
    });
    if (collapses) return { items, ok: false, newRunning: running };
  }

  return { items, ok: true, newRunning: running };
}
