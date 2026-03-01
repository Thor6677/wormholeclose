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
 *     id, ship, direction, isHot, isHic, massThisJump, runningTotal,
 *     isGoalStep, collapses, isStrandingRisk,
 *     reason, switched, switchReason, showVariance, warning? }
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
 *
 * ─── Step mode fields ───────────────────────────────────────────────────────
 *   reason       — human-readable explanation of why hot or cold was chosen
 *   switched     — true if engine switched from default hot to cold
 *   switchReason — 'strand-risk' | 'collapse-risk' | 'abort' | null
 *   showVariance — true if ±10% mass variance is relevant for this jump
 *   warning      — optional alert string shown in execution UI
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
  Battleship:              { hotMass: 300_000,   coldMass: 200_000 },
  Orca:                    { hotMass: 700_000,   coldMass: 500_000 },
  Carrier:                 { hotMass: 1_000_000, coldMass: 800_000 },
  Battlecruiser:           { hotMass: 150_000,   coldMass: 100_000 },
  Cruiser:                 { hotMass: 75_000,    coldMass: 50_000  },
  'HIC (Mass Entanglers)': {
    // Entry: Mass Entanglers active → near-zero (~10,000 kg = 10 file units)
    // Return: MWD hot → same as battleship hot (300,000,000 kg = 300,000 file units)
    hotMass:  300_000,
    coldMass: 10,
    isHic:    true,
  },
  Custom:                  { hotMass: 0, coldMass: 0 },
};

/** Format raw value to display string: 300_000 → "300M" */
export function formatMass(value) {
  if (value == null) return '?';
  const m = Math.round(value / 1000);
  return m.toLocaleString() + 'M';
}

let _idCounter = 0;
function uid() { return ++_idCounter; }

/** True if this ship uses Mass Entanglers (near-zero entry, hot return). */
function _isHic(ship) {
  return SHIP_CLASSES[ship.shipClass]?.isHic === true;
}

// ─── Per-jump mode selection ──────────────────────────────────────────────────

/**
 * Determine the jump mode (hot/cold) for a single jump.
 *
 * Defaults to HOT for every jump; falls back to COLD when a hot jump would
 * create stranding or collapse risk.  Uses a ±10% mass variance buffer for
 * safety margin on all risk checks.
 *
 * HIC ships are always physics-forced:
 *   direction='in'   → cold (Mass Entanglers, near-zero mass)
 *   direction='home' → hot  (MWD, 300M)
 *
 * @param {object} ship
 * @param {'in'|'home'} direction
 * @param {number} runningTotal   mass consumed so far (before this jump)
 * @param {object} wormhole       { totalMass, maxIndividualMass }
 * @param {Array}  pilotsInHole   ships currently in hole, excluding self
 * @param {string} goal           'close' | 'crit' | 'doorstop'
 * @returns {{ mode: 'hot'|'cold', mass: number, reason: string,
 *             switched: boolean, switchReason: string|null,
 *             showVariance: boolean, warning?: string }}
 */
export function selectJumpMode(ship, direction, runningTotal, wormhole, pilotsInHole, goal) {
  const target   = wormhole.totalMass;
  const jumpLimit = wormhole.maxIndividualMass;
  const stranded = pilotsInHole.length;

  // ── HIC: physics-forced mode ─────────────────────────────────────────────
  if (_isHic(ship)) {
    if (direction === 'in') {
      return {
        mode: 'cold', mass: ship.coldMass,
        reason: 'Mass Entanglers active — near zero mass into hole',
        switched: false, switchReason: null, showVariance: false,
      };
    }
    return {
      mode: 'hot', mass: ship.hotMass,
      reason: 'MWD hot — 300M return home',
      switched: false, switchReason: null, showVariance: false,
    };
  }

  // ── Non-HIC: default HOT, fall back to COLD on risk ─────────────────────
  const canHot   = ship.hotMass <= jumpLimit;
  const hotMass  = canHot ? ship.hotMass : ship.coldMass; // effective "hot" mass
  const coldMass = ship.coldMass;

  // Worst-case hot mass with ±10% buffer for risk checks
  const hotWorst = Math.round(hotMass * 1.1);
  const afterHot = runningTotal + hotMass;

  const hotWouldCollapse = runningTotal + hotWorst >= target;

  if (direction === 'in') {
    if (hotWouldCollapse) {
      if (stranded > 0) {
        // Hot entry could collapse with pilots already in hole → strand risk
        return {
          mode: 'cold', mass: coldMass,
          reason: `hot entry worst-case (~${formatMass(hotWorst)} ±10%) could strand ${stranded} pilot${stranded > 1 ? 's' : ''}`,
          switched: canHot, switchReason: 'strand-risk', showVariance: true,
          warning: `Switched to cold — a hot jump here could collapse the hole and strand ${stranded} pilot${stranded > 1 ? 's' : ''} inside.`,
        };
      }
      if (goal !== 'close') {
        // Don't collapse on entry for crit/doorstop
        return {
          mode: 'cold', mass: coldMass,
          reason: 'hot entry would collapse hole — goal is ' + goal,
          switched: canHot, switchReason: 'collapse-risk', showVariance: true,
        };
      }
    }
    // Safe to jump hot (or forced cold by jump limit)
    return {
      mode: canHot ? 'hot' : 'cold',
      mass: hotMass,
      reason: canHot
        ? `safe — ${formatMass(Math.max(0, target - afterHot))} remaining`
        : 'forced cold — hot mass exceeds jump limit',
      switched: false, switchReason: null, showVariance: false,
    };
  }

  // direction === 'home'
  if (hotWouldCollapse) {
    if (stranded > 0) {
      // Hot return would collapse with other pilots still in hole → strand risk
      return {
        mode: 'cold', mass: coldMass,
        reason: `hot return worst-case (~${formatMass(hotWorst)} ±10%) would strand ${stranded} pilot${stranded > 1 ? 's' : ''}`,
        switched: canHot, switchReason: 'strand-risk', showVariance: true,
        warning: `Switched to cold — a hot return here would leave ${stranded} pilot${stranded > 1 ? 's' : ''} unable to return safely.`,
      };
    }
    if (goal !== 'close') {
      // Don't want to collapse for crit/doorstop
      return {
        mode: 'cold', mass: coldMass,
        reason: 'hot return would collapse hole — goal is ' + goal,
        switched: canHot, switchReason: 'collapse-risk', showVariance: true,
      };
    }
  }

  // Safe to jump hot (or forced cold by jump limit)
  return {
    mode: canHot ? 'hot' : 'cold',
    mass: hotMass,
    reason: canHot
      ? `safe — ${formatMass(Math.max(0, target - afterHot))} remaining`
      : 'forced cold — hot mass exceeds jump limit',
    switched: false, switchReason: null, showVariance: false,
  };
}

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
    if (_isHic(ship)) {
      if (ship.hotMass > jumpLimit) {
        warnings.push({
          id: uid(), type: 'hic-cant-return', shipId: ship.id,
          message: `${ship.pilotName} (HIC) return mass (${formatMass(ship.hotMass)}) exceeds the per-jump limit — cannot return through this wormhole.`,
        });
      }
    } else if (ship.coldMass > jumpLimit) {
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

  // HICs are eligible as long as they can return (hotMass <= jumpLimit).
  // Non-HICs are eligible as long as they can fit cold (coldMass <= jumpLimit).
  // Within each group, sort heaviest first; HICs always go last (in last, out last).
  const eligible = fleet
    .filter(s => _isHic(s) ? s.hotMass <= jumpLimit : s.coldMass <= jumpLimit)
    .sort((a, b) => {
      const aHic = _isHic(a), bHic = _isHic(b);
      if (aHic !== bHic) return aHic ? 1 : -1; // HICs sink to the back
      return b.hotMass - a.hotMass;
    });

  if (eligible.length === 0) {
    return { items: [], warnings, canReachGoal: false, goal, doorstopShip: null };
  }

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
 */
export function recalculatePlan(wormhole, fleet, goal, trackedConsumed, assessmentAnswer) {
  const target    = wormhole.totalMass;
  const jumpLimit = wormhole.maxIndividualMass;

  let estimatedConsumed = trackedConsumed;
  if (assessmentAnswer === 'reduced')  estimatedConsumed = Math.max(trackedConsumed, Math.round(target * 0.5));
  if (assessmentAnswer === 'critical') estimatedConsumed = Math.max(trackedConsumed, Math.round(target * 0.9));

  const eligible = fleet
    .filter(s => _isHic(s) ? s.hotMass <= jumpLimit : s.coldMass <= jumpLimit)
    .sort((a, b) => {
      const aHic = _isHic(a), bHic = _isHic(b);
      if (aHic !== bHic) return aHic ? 1 : -1;
      return b.hotMass - a.hotMass;
    });

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
    type:            'step',
    id:              `home-${ship.id}-${uid()}`,
    ship,
    direction:       'home',
    isHot:           ship.hotMass <= wormhole.maxIndividualMass,
    massThisJump:    mass,
    runningTotal:    newTotal,
    collapses,
    isGoalStep:      collapses,
    isStrandingRisk: false,
    reason:          'MWD hot — closing jump',
    switched:        false,
    switchReason:    null,
    showVariance:    false,
  };
}

// ─── Core plan builder ───────────────────────────────────────────────────────

/**
 * Build plan items starting from estimatedConsumed.
 *
 * Strategy:
 *   - Try to complete the goal in one "final pass" (greedy hot-first Phase 1 + Phase 2).
 *   - If that fails, generate an intermediate pass followed by an assessment
 *     checkpoint, then try again.
 *   - Repeat up to 10 passes.
 */
function _buildPlan(eligible, estimatedConsumed, wormhole, goal, doorstopShip, warnings) {
  const target        = wormhole.totalMass;
  const goalCfg       = GOALS[goal] ?? GOALS.close;
  const goalThreshold = Math.round(target * goalCfg.threshold);

  const allItems = [];
  let runningTotal = estimatedConsumed;

  // ── Already at goal ──────────────────────────────────────────────────────
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
      wormhole.maxIndividualMass, goal, doorstopShip, wormhole,
    );

    if (finalResult.canReachGoal) {
      allItems.push(...finalResult.items);
      if (goal === 'doorstop') allItems.push({ type: 'doorstop-marker', id: uid(), ship: doorstopShip });
      allItems.push({ type: 'outcome', id: uid(), result: goalCfg.outcomeResult });
      return { items: allItems, canReachGoal: true };
    }

    // ── Intermediate pass: all ships in, all ships out ───────────────────────
    const intResult = _intermediatePass(eligible, runningTotal, wormhole, goal);
    allItems.push(...intResult.items);

    if (!intResult.ok) {
      // Check: did the WH collapse cleanly during returns? (valid for close goal)
      const lastItem = intResult.items[intResult.items.length - 1];
      if (
        goal === 'close' &&
        lastItem?.collapses &&
        lastItem?.direction === 'home' &&
        !lastItem?.isStrandingRisk
      ) {
        allItems.push({ type: 'outcome', id: uid(), result: goalCfg.outcomeResult });
        return { items: allItems, canReachGoal: true };
      }
      if (warnings) {
        warnings.push({
          id: uid(), type: 'insufficient',
          message: 'An intermediate pass would collapse the wormhole before all ships are home. Reduce fleet size or switch goal.',
        });
      }
      break;
    }

    // Check: did the intermediate pass itself achieve the goal threshold?
    if (intResult.newRunning >= goalThreshold) {
      if (goal === 'doorstop') allItems.push({ type: 'doorstop-marker', id: uid(), ship: doorstopShip });
      allItems.push({ type: 'outcome', id: uid(), result: goalCfg.outcomeResult });
      return { items: allItems, canReachGoal: true };
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
 * If the full fleet can't achieve a clean crit/doorstop, progressively tries
 * with fewer ships (N-1, N-2, …).
 */
function _tryFinalPass(eligible, startRunning, target, goalThreshold, jumpLimit, goal, doorstopShip, wormhole) {
  const full = _singlePassGreedy(eligible, startRunning, target, goalThreshold, jumpLimit, goal, doorstopShip, wormhole);
  if (full.canReachGoal) return full;

  if (goal !== 'close') {
    for (let n = eligible.length - 1; n >= 1; n--) {
      const reduced = eligible.slice(0, n);
      const result  = _singlePassGreedy(reduced, startRunning, target, goalThreshold, jumpLimit, goal, doorstopShip, wormhole);
      if (result.canReachGoal) return result;
    }
  }

  return { items: [], canReachGoal: false };
}

/**
 * One greedy pass with a given ship list.
 *
 * All jumps default to HOT. selectJumpMode() switches to COLD when a hot jump
 * would create stranding or collapse risk (using ±10% mass variance).
 *
 * Phase 1 — All ships jump in.
 * Phase 2 — Ships return home; doorstop ship stays in hole.
 */
function _singlePassGreedy(ships, startRunning, target, goalThreshold, jumpLimit, goal, doorstopShip, wormhole) {
  const items = [];
  let running     = startRunning;
  let goalReached = false;

  // ── Phase 1: Inbound ────────────────────────────────────────────────────
  const inHole = [];

  for (const ship of ships) {
    const jr       = selectJumpMode(ship, 'in', running, wormhole, [...inHole], goal);
    const mass     = jr.mass;
    const isHot    = jr.mode === 'hot';
    running       += mass;
    const collapses  = running >= target;
    const isGoalStep = !goalReached && running >= goalThreshold;
    if (isGoalStep) goalReached = true;

    items.push({
      type: 'step', id: `in-${ship.id}-${uid()}`,
      ship, direction: 'in', isHot, massThisJump: mass, runningTotal: running,
      collapses, isGoalStep, isStrandingRisk: collapses && inHole.length > 0,
      isHic: _isHic(ship),
      reason: jr.reason, switched: jr.switched ?? false,
      warning: jr.warning, switchReason: jr.switchReason ?? null,
      showVariance: jr.showVariance ?? false,
    });

    if (collapses) {
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
    const ship              = returningShips[i];
    const pilotsStillInHole = returningShips.slice(i + 1);
    const jr       = selectJumpMode(ship, 'home', running, wormhole, pilotsStillInHole, goal);
    const mass     = jr.mass;
    const isHot    = jr.mode === 'hot';
    running       += mass;
    const collapses  = running >= target;
    const isGoalStep = !goalReached && running >= goalThreshold;
    if (isGoalStep) goalReached = true;

    items.push({
      type: 'step', id: `home-${ship.id}-${uid()}`,
      ship, direction: 'home', isHot, massThisJump: mass, runningTotal: running,
      collapses, isGoalStep,
      isStrandingRisk: collapses && pilotsStillInHole.length > 0,
      isHic: _isHic(ship),
      reason: jr.reason, switched: jr.switched ?? false,
      warning: jr.warning, switchReason: jr.switchReason ?? null,
      showVariance: jr.showVariance ?? false,
    });

    if (collapses) {
      if (goal !== 'close') return { items, canReachGoal: false };
      if (pilotsStillInHole.length > 0) break; // stranding flagged via isStrandingRisk
    }
  }

  return { items, canReachGoal: goalReached };
}

// ─── Intermediate pass ───────────────────────────────────────────────────────

/**
 * One intermediate pass: all ships in, all ships out.
 *
 * All jumps use selectJumpMode() — default HOT, switched to COLD on risk.
 * Returns { items, ok, newRunning }.
 * ok = false if the pass collapsed the wormhole.
 */
function _intermediatePass(eligible, startRunning, wormhole, goal) {
  const target  = wormhole.totalMass;
  const items   = [];
  let running   = startRunning;
  const inHole  = [];

  // Inbound
  for (const ship of eligible) {
    const jr      = selectJumpMode(ship, 'in', running, wormhole, [...inHole], goal);
    const mass    = jr.mass;
    const isHot   = jr.mode === 'hot';
    running      += mass;
    const collapses = running >= target;
    items.push({
      type: 'step', id: `in-${ship.id}-${uid()}`,
      ship, direction: 'in', isHot, massThisJump: mass, runningTotal: running,
      collapses, isGoalStep: false, isStrandingRisk: collapses && inHole.length > 0,
      isHic: _isHic(ship),
      reason: jr.reason, switched: jr.switched ?? false,
      warning: jr.warning, switchReason: jr.switchReason ?? null,
      showVariance: jr.showVariance ?? false,
    });
    if (collapses) return { items, ok: false, newRunning: running };
    inHole.push(ship);
  }

  // Returns
  for (let i = 0; i < inHole.length; i++) {
    const ship              = inHole[i];
    const pilotsStillInHole = inHole.slice(i + 1);
    const jr      = selectJumpMode(ship, 'home', running, wormhole, pilotsStillInHole, goal);
    const mass    = jr.mass;
    const isHot   = jr.mode === 'hot';
    running      += mass;
    const collapses = running >= target;
    items.push({
      type: 'step', id: `home-${ship.id}-${uid()}`,
      ship, direction: 'home', isHot, massThisJump: mass, runningTotal: running,
      collapses, isGoalStep: false,
      isStrandingRisk: collapses && pilotsStillInHole.length > 0,
      isHic: _isHic(ship),
      reason: jr.reason, switched: jr.switched ?? false,
      warning: jr.warning, switchReason: jr.switchReason ?? null,
      showVariance: jr.showVariance ?? false,
    });
    if (collapses) return { items, ok: false, newRunning: running };
  }

  return { items, ok: true, newRunning: running };
}

// ─── Plan Validation ──────────────────────────────────────────────────────────

/**
 * Validate a generated plan for safety and correctness.
 *
 * Checks performed:
 *   1. No pilot's return jump occurs after the wormhole has already collapsed
 *      (i.e. no stranding — isStrandingRisk === true on any step).
 *   2. No single jump exceeds the wormhole's per-jump mass limit.
 *   3. If a HIC is in the fleet, it enters last and returns last.
 *   4. Final jump in a close plan lands at or above max mass.
 *   5. Final jump in a crit/doorstop plan lands below max mass.
 *
 * Returns { valid: boolean, warnings: string[], recommendation: string | null }
 */
export function validatePlan(plan, wormhole) {
  if (!plan || !plan.items || plan.items.length === 0) {
    return { valid: true, warnings: [], recommendation: null };
  }

  const warnings    = [];
  const target      = wormhole.totalMass;
  const jumpLimit   = wormhole.maxIndividualMass;
  const stepItems   = plan.items.filter(i => i.type === 'step');
  const goal        = plan.goal ?? 'close';
  const goalCfg     = GOALS[goal] ?? GOALS.close;

  // ── Check 1: Stranding ──────────────────────────────────────────────────
  stepItems.forEach((step, idx) => {
    if (step.isStrandingRisk) {
      warnings.push(
        `⚠ STRANDING RISK: Step ${idx + 1} — ${step.ship.pilotName} (${step.ship.shipClass}) — ` +
        `this jump collapses the wormhole with other pilots still inside.`
      );
    }
  });

  // ── Check 2: Per-jump mass limit ────────────────────────────────────────
  stepItems.forEach((step, idx) => {
    if (step.massThisJump > jumpLimit) {
      warnings.push(
        `⚠ OVERSIZED: Step ${idx + 1} — ${step.ship.pilotName} (${step.ship.shipClass}) — ` +
        `${formatMass(step.massThisJump)} exceeds the per-jump limit of ${formatMass(jumpLimit)}.`
      );
    }
  });

  // ── Check 3: HIC placement (in last, out last) ──────────────────────────
  const inboundSteps = stepItems.filter(s => s.direction === 'in');
  const returnSteps  = stepItems.filter(s => s.direction === 'home');
  const hasHic       = stepItems.some(s => s.isHic);

  if (hasHic) {
    const lastInbound = inboundSteps[inboundSteps.length - 1];
    if (lastInbound && !lastInbound.isHic) {
      warnings.push(
        `⚠ HIC PLACEMENT: ${lastInbound.ship.pilotName} (${lastInbound.ship.shipClass}) enters after the HIC — ` +
        `HIC should always be the last ship into the hole to minimise inbound mass.`
      );
    }
    const lastReturn = returnSteps[returnSteps.length - 1];
    if (lastReturn && !lastReturn.isHic) {
      const hicReturn = returnSteps.find(s => s.isHic);
      if (hicReturn) {
        warnings.push(
          `⚠ HIC PLACEMENT: HIC (${hicReturn.ship.pilotName}) does not return last — ` +
          `it should be the final ship home to use its 300M return to collapse the wormhole.`
        );
      }
    }
  }

  // ── Check 4 & 5: Final jump correctness ────────────────────────────────
  if (stepItems.length > 0) {
    const lastStep      = stepItems[stepItems.length - 1];
    const goalThreshold = Math.round(target * goalCfg.threshold);

    if (goal === 'close' && lastStep.runningTotal < target) {
      warnings.push(
        `⚠ INCOMPLETE: Final jump does not collapse the wormhole ` +
        `(${formatMass(lastStep.runningTotal)} / ${formatMass(target)}). ` +
        `Add more ships or switch to a heavier fleet.`
      );
    }

    if ((goal === 'crit' || goal === 'doorstop') && lastStep.runningTotal >= target) {
      warnings.push(
        `⚠ OVER-ROLLED: Final return jump collapses the wormhole but goal is ${goalCfg.label}. ` +
        `Use fewer or lighter ships on the final return.`
      );
    }

    if ((goal === 'crit' || goal === 'doorstop') && lastStep.runningTotal < goalThreshold) {
      warnings.push(
        `⚠ UNDER-ROLLED: Final jump only reaches ${formatMass(lastStep.runningTotal)} ` +
        `— goal requires ≥ ${formatMass(goalThreshold)} (${Math.round(goalCfg.threshold * 100)}%).`
      );
    }
  }

  // ── Recommendation ──────────────────────────────────────────────────────
  let recommendation = null;
  const hasStranding = warnings.some(w => w.includes('STRANDING'));

  if (hasStranding) {
    const strandStep = stepItems.find(s => s.isStrandingRisk);
    const pilotName  = strandStep?.ship.pilotName ?? 'a pilot';
    const shipClass  = strandStep?.ship.shipClass ?? 'ship';
    recommendation =
      `Option A — Swap ${pilotName}'s ${shipClass} for a Cruiser or Battlecruiser ` +
      `to reduce mass on the final return jump.\n` +
      `Option B — Add a HIC with Mass Entanglers as the final ship: it enters near-zero mass ` +
      `and returns MWD hot (300M) to safely collapse the wormhole last.\n` +
      `Option C — Reduce fleet size so fewer ships are in the hole at once ` +
      `(the engine already tried this automatically).`;
  }

  return { valid: warnings.length === 0, warnings, recommendation };
}
