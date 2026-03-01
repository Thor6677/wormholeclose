/**
 * rollingEngine.js — Pure logic. No React.
 *
 * Mass units: raw file units (same as wormholes.js).
 *   1 file unit = 1,000 kg in EVE.
 *   Display: value / 1000 + "M"  (e.g. 300_000 → "300M")
 */

/**
 * Rolling goals — determines when the plan is "done".
 *   close:    Fully collapse the wormhole (100% mass consumed)
 *   crit:     Bring to critical mass (≥90% consumed, one jump from death)
 *   doorstop: Bring to ~50% mass — keep it alive but weakened
 */
export const GOALS = {
  close: {
    label:       'Roll to Close',
    shortLabel:  'Close',
    description: 'Collapse and permanently seal the wormhole',
    threshold:   1.0,
    badge:       'COLLAPSES',
  },
  crit: {
    label:       'Crit It',
    shortLabel:  'Crit',
    description: 'Bring to critical mass — ≥90% consumed, one jump from death',
    threshold:   0.9,
    badge:       'CRITTED',
  },
  doorstop: {
    label:       'Door Stop It',
    shortLabel:  'Doorstop',
    description: 'Bring to ~50% mass — keep the hole alive but heavily rolled',
    threshold:   0.5,
    badge:       'DOORSTOP',
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

/**
 * Generate the rolling plan.
 *
 * Algorithm:
 *  Phase 1 — All eligible ships jump IN hot (heaviest first).
 *             If a ship exceeds jump limit hot, it jumps cold instead.
 *             Stop inbound if a jump collapses the WH (stranding detected).
 *
 *  Phase 2 — Greedy cold-first return pass.
 *             Targets goalThreshold (determined by `goal`).
 *             For each ship: try cold first.
 *             If cold + remaining ships' max-hot can still reach goal → use cold.
 *             Otherwise → must use hot.
 *             Once goalThreshold is reached, remaining ships return cold.
 *             The first step crossing goalThreshold is flagged isGoalStep=true.
 *
 * @param {object} wormhole  — from wormholes.js
 * @param {Array}  fleet     — [{id, pilotName, shipName, shipClass, hotMass, coldMass}]
 * @param {string} goal      — 'close' | 'crit' | 'doorstop'
 * @returns {{ steps, warnings, canReachGoal, goal }}
 */
export function generatePlan(wormhole, fleet, goal = 'close') {
  if (!wormhole || !fleet || fleet.length === 0) return null;

  const target        = wormhole.totalMass;
  const jumpLimit     = wormhole.maxIndividualMass;
  const goalConfig    = GOALS[goal] ?? GOALS.close;
  const goalThreshold = Math.round(target * goalConfig.threshold);
  const warnings      = [];
  const steps         = [];

  // --- Validate each ship ---
  fleet.forEach(ship => {
    if (ship.coldMass > jumpLimit) {
      warnings.push({
        id: uid(),
        type: 'cant-fit',
        shipId: ship.id,
        message: `${ship.pilotName} (${ship.shipClass}${ship.shipName ? ' — ' + ship.shipName : ''}) cannot fit through this wormhole even cold — excluded.`,
      });
    } else if (ship.hotMass > jumpLimit) {
      warnings.push({
        id: uid(),
        type: 'hot-oversized',
        shipId: ship.id,
        message: `${ship.pilotName} (${ship.shipClass}) exceeds the jump limit hot (${formatMass(ship.hotMass)} > ${formatMass(jumpLimit)}) — will jump cold.`,
      });
    }
    // Orca near-limit flag
    if (ship.shipClass === 'Orca' && ship.hotMass >= jumpLimit * 0.8) {
      warnings.push({
        id: uid(),
        type: 'orca-risk',
        shipId: ship.id,
        message: `${ship.pilotName} (Orca) is close to the per-jump mass limit — double-check mass before jumping.`,
      });
    }
  });

  // Eligible ships (cold mass fits)
  const eligible = fleet
    .filter(s => s.coldMass <= jumpLimit)
    .sort((a, b) => b.hotMass - a.hotMass); // heaviest hot-mass first

  if (eligible.length === 0) {
    return { steps: [], warnings, canReachGoal: false, goal };
  }

  // --- Phase 1: Inbound ---
  let runningTotal = 0;
  const shipsInHole = [];
  let collapsedDuringInbound = false;
  let goalReached = false;

  for (const ship of eligible) {
    const canHot        = ship.hotMass <= jumpLimit;
    const massThisJump  = canHot ? ship.hotMass : ship.coldMass;
    runningTotal       += massThisJump;
    const collapses     = runningTotal >= target;
    const isGoalStep    = !goalReached && runningTotal >= goalThreshold;
    if (isGoalStep) goalReached = true;

    steps.push({
      id:             `in-${ship.id}-${uid()}`,
      ship,
      direction:      'in',
      isHot:          canHot,
      massThisJump,
      runningTotal,
      collapses,
      isGoalStep,
      isStrandingRisk: collapses,  // pilot is on far side when WH dies
    });

    if (collapses) {
      collapsedDuringInbound = true;
      warnings.push({
        id: uid(),
        type: 'stranded-inbound',
        message: `${ship.pilotName} would be stranded — this inbound jump collapses the wormhole! Use fewer ships.`,
      });
      break;
    }
    shipsInHole.push(ship);
  }

  if (collapsedDuringInbound) {
    return { steps, warnings, canReachGoal: true, goal, collapsedDuringInbound: true };
  }

  // --- Phase 2: Returns (greedy, goal-aware) ---
  //
  // goalReached tracks whether we've already crossed goalThreshold.
  // Once the goal is reached, remaining ships return cold to minimise added mass.
  // Actual WH collapse (>= target) is always treated as a stranding risk.

  for (let i = 0; i < shipsInHole.length; i++) {
    const ship         = shipsInHole[i];
    const remaining    = shipsInHole.slice(i + 1);
    const remainMaxHot = remaining.reduce((s, sh) => s + sh.hotMass, 0);
    const afterCold    = runningTotal + ship.coldMass;
    const afterHot     = runningTotal + ship.hotMass;

    if (afterCold >= target) {
      // Cold return would actually collapse the WH — always a stranding risk.
      runningTotal = afterCold;
      const isGoalStep = !goalReached;
      goalReached = true;
      steps.push({
        id:              `home-${ship.id}-${uid()}`,
        ship,
        direction:       'home',
        isHot:           false,
        massThisJump:    ship.coldMass,
        runningTotal,
        collapses:       true,
        isGoalStep,
        isStrandingRisk: remaining.length > 0,
      });
      if (remaining.length > 0) {
        warnings.push({
          id: uid(),
          type: 'stranded-return',
          message: `${remaining.map(s => s.pilotName).join(', ')} would be stranded — wormhole collapses before they return! Reduce fleet or reorder.`,
        });
      }
      break;

    } else if (goalReached) {
      // Goal already achieved — return cold to minimise additional mass.
      runningTotal = afterCold;
      steps.push({
        id:           `home-${ship.id}-${uid()}`,
        ship,
        direction:    'home',
        isHot:        false,
        massThisJump: ship.coldMass,
        runningTotal,
        collapses:    false,
        isGoalStep:   false,
      });

    } else if (afterCold >= goalThreshold) {
      // Cold return reaches the goal without collapsing.
      runningTotal = afterCold;
      goalReached  = true;
      steps.push({
        id:           `home-${ship.id}-${uid()}`,
        ship,
        direction:    'home',
        isHot:        false,
        massThisJump: ship.coldMass,
        runningTotal,
        collapses:    false,
        isGoalStep:   true,
      });

    } else if (afterCold + remainMaxHot >= goalThreshold) {
      // Cold is safe; remaining ships (all hot) can still reach the goal.
      runningTotal = afterCold;
      steps.push({
        id:           `home-${ship.id}-${uid()}`,
        ship,
        direction:    'home',
        isHot:        false,
        massThisJump: ship.coldMass,
        runningTotal,
        collapses:    false,
        isGoalStep:   false,
      });

    } else {
      // Must go hot — cold + remaining max-hot isn't enough to reach the goal.
      runningTotal        = afterHot;
      const isGoalStep    = !goalReached && afterHot >= goalThreshold;
      if (isGoalStep) goalReached = true;
      const collapses     = afterHot >= target;
      steps.push({
        id:             `home-${ship.id}-${uid()}`,
        ship,
        direction:      'home',
        isHot:          true,
        massThisJump:   ship.hotMass,
        runningTotal,
        collapses,
        isGoalStep,
        isStrandingRisk: collapses && remaining.length > 0,
      });
      if (collapses && remaining.length > 0) {
        warnings.push({
          id: uid(),
          type: 'stranded-return',
          message: `${remaining.map(s => s.pilotName).join(', ')} would be stranded — wormhole collapses before they return!`,
        });
        break;
      }
    }
  }

  const canReachGoal = steps.some(s => s.isGoalStep);
  if (!canReachGoal) {
    warnings.push({
      id: uid(),
      type: 'insufficient',
      message: `Fleet does not have enough total mass to ${goalConfig.label.toLowerCase()} this wormhole. Add more or heavier ships.`,
    });
  }

  return { steps, warnings, canReachGoal, goal };
}

/**
 * Recompute runningTotal, collapses, and isGoalStep after manual step reorder.
 * isStrandingRisk is simplified: flag if a collapse step has later 'in' steps still pending.
 *
 * @param {Array}  steps
 * @param {object} wormhole
 * @param {string} goal     — 'close' | 'crit' | 'doorstop'
 */
export function recalculatePlan(steps, wormhole, goal = 'close') {
  const target        = wormhole.totalMass;
  const goalConfig    = GOALS[goal] ?? GOALS.close;
  const goalThreshold = Math.round(target * goalConfig.threshold);
  let running         = 0;
  let goalReached     = false;

  return steps.map((step, idx) => {
    running += step.massThisJump;
    const collapses    = running >= target;
    const isGoalStep   = !goalReached && running >= goalThreshold;
    if (isGoalStep) goalReached = true;

    const shipsStillInHole = steps.slice(idx + 1).filter(s => s.direction === 'in');
    const isStrandingRisk  = collapses && shipsStillInHole.length > 0;

    return { ...step, runningTotal: running, collapses, isGoalStep, isStrandingRisk };
  });
}
