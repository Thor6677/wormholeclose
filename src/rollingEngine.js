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
 *   { type: 'hold-back', id, passNumber, sittingOut: Ship[], reason }
 *     → Shown before a subset pass: which ships are held out this pass and why.
 *
 *   { type: 'standing-by', id, ship, reason }
 *     → Ship is in the fleet but not jumping this pass (or ever, if goal already reached).
 *     → Every eligible ship must appear as at least one step OR standing-by.
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
 * Defaults to HOT; falls back to COLD (or aborts) when a hot jump would
 * create stranding risk, collapse risk, or uncertainty (grey zone).
 *
 * Inbound: calls canSafelyEnter() to simulate worst-case returns for all
 * pilots that would be in the hole.  If hot entry fails the simulation, tries
 * cold entry.  If both fail, returns switchReason='abort'.
 *
 * Also applies grey-zone protection: if the nominal jump outcome falls in
 * [target×0.9, target×1.1), the WH may or may not close — switch to cold
 * when other pilots are at risk.
 *
 * HIC ships are physics-forced:
 *   direction='in'   → cold (Mass Entanglers, near-zero mass)
 *   direction='home' → hot  (MWD, 300M)
 *
 * switchReason values: 'strand-risk' | 'collapse-risk' | 'abort' | null
 */
export function selectJumpMode(ship, direction, runningTotal, wormhole, pilotsInHole, goal) {
  const target    = wormhole.totalMass;
  const jumpLimit = wormhole.maxIndividualMass;
  const stranded  = pilotsInHole.length;

  // ── HIC: physics-forced mode ─────────────────────────────────────────────
  if (_isHic(ship)) {
    if (direction === 'in') {
      // HIC enters cold (Mass Entanglers), but still check if all pilots
      // (including this HIC's mandatory 300M hot return) can safely get home.
      // canSafelyEnter simulates worst-case returns for everyone inside.
      const safety = canSafelyEnter(ship, 'cold', runningTotal, pilotsInHole, wormhole);
      if (!safety.safe) {
        return {
          mode: 'cold', mass: ship.coldMass,
          reason: `cannot enter safely — ${safety.reason}`,
          switched: false, switchReason: 'abort', showVariance: true,
          warning: `🚨 Do not send ${ship.pilotName} — HIC's mandatory 300M hot return would risk stranding pilots inside. ${safety.reason}.`,
        };
      }
      return {
        mode: 'cold', mass: ship.coldMass,
        reason: 'Mass Entanglers active — near zero mass into hole',
        switched: false, switchReason: null, showVariance: false,
      };
    }
    // HIC return is physics-forced hot — cannot go cold.
    // Warn if this hot return would collapse the hole with pilots still inside.
    const hotWorst = Math.round(ship.hotMass * 1.1);
    if (runningTotal + hotWorst >= target && stranded > 0) {
      return {
        mode: 'hot', mass: ship.hotMass,
        reason: `⚠ MWD hot (forced) — may collapse with ${stranded} pilot${stranded > 1 ? 's' : ''} inside`,
        switched: false, switchReason: null, showVariance: true,
        warning: `⚠ ${ship.pilotName} (HIC) MUST return hot (${formatMass(ship.hotMass)}) — wormhole may collapse ` +
                 `with ${stranded} pilot${stranded > 1 ? 's' : ''} still inside.`,
      };
    }
    return {
      mode: 'hot', mass: ship.hotMass,
      reason: 'MWD hot — 300M return home',
      switched: false, switchReason: null, showVariance: false,
    };
  }

  const canHot   = ship.hotMass <= jumpLimit;
  const hotMass  = canHot ? ship.hotMass : ship.coldMass;
  const coldMass = ship.coldMass;
  const hotWorst = Math.round(hotMass * 1.1);
  const afterHot = runningTotal + hotMass;

  // ── Inbound ───────────────────────────────────────────────────────────────
  if (direction === 'in') {
    // Full return-sequence simulation for all pilots that would be inside
    const hotSafety = canSafelyEnter(ship, canHot ? 'hot' : 'cold', runningTotal, pilotsInHole, wormhole);

    if (!hotSafety.safe) {
      // Hot (or effective hot) entry fails — try cold
      const coldSafety = canSafelyEnter(ship, 'cold', runningTotal, pilotsInHole, wormhole);
      if (!coldSafety.safe) {
        // Both modes unsafe — abort
        return {
          mode: 'cold', mass: coldMass,
          reason: `cannot enter safely — ${coldSafety.reason}`,
          switched: false, switchReason: 'abort', showVariance: true,
          warning: `🚨 Do not send ${ship.pilotName} — entering would risk stranding pilots inside. ${coldSafety.reason}.`,
        };
      }
      return {
        mode: 'cold', mass: coldMass,
        reason: hotSafety.reason,
        switched: canHot, switchReason: 'strand-risk', showVariance: true,
        warning: `Switched to cold — ${hotSafety.reason}.`,
      };
    }

    // Simulation passed. Check goal constraint (crit/doorstop must not collapse on entry).
    if (runningTotal + hotWorst >= target && goal !== 'close') {
      return {
        mode: 'cold', mass: coldMass,
        reason: 'hot entry would collapse hole — goal is ' + goal,
        switched: canHot, switchReason: 'collapse-risk', showVariance: true,
      };
    }

    // For crit/doorstop: even if hot entry itself is safe, the mandatory cold return
    // that follows might still collapse the hole (e.g. running+hot reaches goal threshold,
    // then running+hot+cold >= target).  Switch to cold entry so cold-in + cold-back
    // stays safely below the collapse point.
    // Use worst-case (×1.1) for BOTH legs — the wormhole applies ±10% variance to
    // the entry mass too, so nominal hotMass underestimates the collapse risk.
    if (goal !== 'close' && canHot) {
      const coldReturnWorst = Math.round(coldMass * 1.1);
      if (runningTotal + hotWorst + coldReturnWorst >= target) {
        return {
          mode: 'cold', mass: coldMass,
          reason: `cold in — hot entry + cold return would collapse (goal: ${goal})`,
          switched: true, switchReason: 'collapse-risk', showVariance: true,
        };
      }
    }

    // Grey zone: hot entry outcome uncertain with pilots already inside
    if (stranded > 0 && isInGreyZone(runningTotal, hotMass, target)) {
      return {
        mode: 'cold', mass: coldMass,
        reason: `hot entry in grey zone (±10% WH variance) — cold safer with ${stranded} pilot${stranded > 1 ? 's' : ''} inside`,
        switched: canHot, switchReason: 'strand-risk', showVariance: true,
        warning: `⚠ UNCERTAIN — hot entry may collapse (±10% variance). Switched to cold to protect ${stranded} pilot${stranded > 1 ? 's' : ''} inside.`,
      };
    }

    return {
      mode: canHot ? 'hot' : 'cold',
      mass: hotMass,
      reason: canHot
        ? `safe — ${formatMass(Math.max(0, target - afterHot))} remaining`
        : 'forced cold — hot mass exceeds jump limit',
      switched: false, switchReason: null, showVariance: false,
    };
  }

  // ── Outbound (home) ───────────────────────────────────────────────────────
  const hotWouldCollapse = runningTotal + hotWorst >= target;

  // Grey zone: hot return outcome uncertain with pilots still inside
  if (stranded > 0 && isInGreyZone(runningTotal, hotMass, target)) {
    return {
      mode: 'cold', mass: coldMass,
      reason: `hot return in grey zone (±10% WH variance) — could strand ${stranded} pilot${stranded > 1 ? 's' : ''}`,
      switched: canHot, switchReason: 'strand-risk', showVariance: true,
      warning: `⚠ UNCERTAIN — hot return may collapse (±10% variance). ${stranded} pilot${stranded > 1 ? 's' : ''} still inside. Switched to cold.`,
    };
  }

  if (hotWouldCollapse) {
    if (stranded > 0) {
      return {
        mode: 'cold', mass: coldMass,
        reason: `hot return worst-case (~${formatMass(hotWorst)} ±10%) would strand ${stranded} pilot${stranded > 1 ? 's' : ''}`,
        switched: canHot, switchReason: 'strand-risk', showVariance: true,
        warning: `Switched to cold — a hot return here would leave ${stranded} pilot${stranded > 1 ? 's' : ''} unable to return safely.`,
      };
    }
    if (goal !== 'close') {
      return {
        mode: 'cold', mass: coldMass,
        reason: 'hot return would collapse hole — goal is ' + goal,
        switched: canHot, switchReason: 'collapse-risk', showVariance: true,
      };
    }
  }

  return {
    mode: canHot ? 'hot' : 'cold',
    mass: hotMass,
    reason: canHot
      ? `safe — ${formatMass(Math.max(0, target - afterHot))} remaining`
      : 'forced cold — hot mass exceeds jump limit',
    switched: false, switchReason: null, showVariance: false,
  };
}

// ─── Fleet safety helpers ─────────────────────────────────────────────────────

/**
 * Worst-case mass a single ship contributes to a cold round trip.
 *   Non-HIC: (coldIn × 1.1) + (coldBack × 1.1) = coldMass × 2.2
 *   HIC:     (coldIn × 1.1) + (hotBack × 1.1)  — HIC always returns MWD hot
 */
function _roundTripWorstCase(ship) {
  if (_isHic(ship)) return Math.round((ship.coldMass + ship.hotMass) * 1.1);
  return Math.round(ship.coldMass * 2 * 1.1);
}

/**
 * Test whether the given fleet can complete a full cold round trip safely.
 *
 * "Safe" = total worst-case mass (all cold in + all cold back, each ×1.1)
 * does NOT reach wormhole.totalMass.  If the sum stays below the cap, no
 * ship can be stranded regardless of jump ordering.
 *
 * HICs use their near-zero coldMass on entry and their hotMass on return
 * (physics-forced — they always come back MWD hot).
 *
 * Returns { safe: boolean, totalWorstCase: number, reason: string }
 */
export function evaluateFullFleetSafety(fleet, runningTotal, wormhole) {
  const target = wormhole.totalMass;
  let totalWorstCase = runningTotal;
  for (const ship of fleet) totalWorstCase += _roundTripWorstCase(ship);

  const safe = totalWorstCase < target;
  return {
    safe,
    totalWorstCase,
    reason: safe
      ? `Full-fleet cold round trip worst-case ${formatMass(totalWorstCase)} < ${formatMass(target)} — safe`
      : `Full-fleet cold round trip worst-case ${formatMass(totalWorstCase)} ≥ ${formatMass(target)} — would collapse`,
  };
}

/**
 * Find the largest subset of fleet that can safely complete a cold round trip.
 *
 * Iteratively removes the ship with the highest round-trip mass contribution
 * (non-HICs by 2×coldMass, HICs by coldMass+hotMass) until
 * evaluateFullFleetSafety returns true for the remaining group.
 *
 * Returns { subset: Ship[], sittingOut: Ship[], reason: string }
 */
export function findLargestSafeSubset(fleet, runningTotal, wormhole) {
  // Sort by round-trip contribution descending — heaviest contributor removed first
  const byContrib = [...fleet].sort((a, b) => _roundTripWorstCase(b) - _roundTripWorstCase(a));

  for (let remove = 1; remove < byContrib.length; remove++) {
    const sittingOut = byContrib.slice(0, remove);
    const subset     = byContrib.slice(remove);
    if (evaluateFullFleetSafety(subset, runningTotal, wormhole).safe) {
      const names = sittingOut.map(s => s.pilotName).join(', ');
      return {
        subset,
        sittingOut,
        reason: `Sending full fleet would risk stranding pilots on the final return. ` +
                `Sending ${subset.length} ship${subset.length !== 1 ? 's' : ''} this pass — ` +
                `re-evaluating after. Sitting out: ${names}.`,
      };
    }
  }

  // Only 1 ship left (or all are unsafe — shouldn't happen in practice)
  const lightest = byContrib[byContrib.length - 1];
  return {
    subset:     [lightest],
    sittingOut: byContrib.slice(0, byContrib.length - 1),
    reason:     `Only 1 ship can safely go — full-fleet cold round trip exceeds mass budget.`,
  };
}

// ─── Per-jump safety utilities ────────────────────────────────────────────────

/**
 * True if the nominal outcome of a jump (runningTotal + jumpMass) falls in the
 * uncertain grey zone: ≥ target×0.9 (might collapse on pessimistic WH mass)
 * but < target×1.1 (might not collapse on optimistic WH mass).
 *
 * Use this to prefer cold alternatives and to label steps "UNCERTAIN".
 */
export function isInGreyZone(runningTotal, jumpMass, wormholeMaxMass) {
  const afterJump      = runningTotal + jumpMass;
  const pessimisticMax = Math.round(wormholeMaxMass * 0.9);
  const optimisticMax  = Math.round(wormholeMaxMass * 1.1);
  return afterJump >= pessimisticMax && afterJump < optimisticMax;
}

/**
 * Test whether a ship can safely enter the hole without risking stranding anyone.
 *
 * Simulates:
 *   1. This ship's entry at worst-case mass (entryMass × 1.1).
 *   2. Every pilot in the hole returning, in order, at worst-case hot mass (× 1.1).
 *      This ship is appended last (it entered last).
 *
 * A step is unsafe if its worst-case total reaches the WH cap while other
 * pilots are still inside.  The LAST pilot's return may collapse the hole
 * safely (there is nobody left to strand).
 *
 * @param {object}  ship
 * @param {'hot'|'cold'} mode  — intended entry mode
 * @param {number}  runningTotal  — mass consumed before entry
 * @param {Array}   pilotsInHole  — ships already inside (BEFORE this ship enters)
 * @param {object}  wormhole      — { totalMass, maxIndividualMass }
 * @returns {{ safe: boolean, reason: string }}
 */
export function canSafelyEnter(ship, mode, runningTotal, pilotsInHole, wormhole) {
  const target    = wormhole.totalMass;
  const jumpLimit = wormhole.maxIndividualMass;

  // ── Entry simulation ──────────────────────────────────────────────────────
  const entryMass  = mode === 'hot'
    ? (ship.hotMass <= jumpLimit ? ship.hotMass : ship.coldMass)
    : ship.coldMass;
  const entryWorst = Math.round(entryMass * 1.1);

  // Entry collapses with others already inside → strand risk
  if (runningTotal + entryWorst >= target && pilotsInHole.length > 0) {
    return {
      safe:   false,
      reason: `${mode} entry worst-case (~${formatMass(entryWorst)}) collapses hole with ` +
              `${pilotsInHole.length} pilot${pilotsInHole.length > 1 ? 's' : ''} still inside`,
    };
  }

  // ── Return simulation — all pilots who would be in hole after entry ───────
  // Order: pilots already inside return first (same order as plan), this ship last.
  const allInHole  = [...pilotsInHole, ship];
  let   simTotal   = runningTotal + entryWorst;

  for (let i = 0; i < allInHole.length; i++) {
    const returning     = allInHole[i];
    const stillInHole   = allInHole.slice(i + 1);

    // Mirror the actual plan logic: use hot where it won't collapse with others
    // inside, fall back to cold when it would.  This makes the simulation
    // accurate rather than over-conservative (old code always assumed hot).
    const baseHot   = _isHic(returning)
      ? returning.hotMass
      : (returning.hotMass <= jumpLimit ? returning.hotMass : returning.coldMass);
    const hotWorst  = Math.round(baseHot * 1.1);

    if (stillInHole.length === 0) {
      // Last pilot home — collapse is safe, no one left inside
      simTotal += hotWorst;
    } else if (simTotal + hotWorst >= target) {
      // Hot return would collapse with others still inside — use cold instead
      const coldWorst = Math.round(returning.coldMass * 1.1);
      if (simTotal + coldWorst >= target) {
        // Cold also collapses with others inside → genuine strand risk
        return {
          safe:   false,
          reason: `${returning.pilotName}'s cold return worst-case (~${formatMass(coldWorst)}) ` +
                  `collapses hole with ${stillInHole.length} pilot${stillInHole.length > 1 ? 's' : ''} still inside`,
        };
      }
      simTotal += coldWorst;
    } else {
      simTotal += hotWorst;
    }
  }

  return { safe: true, reason: 'all pilots can safely return after entry' };
}

/**
 * Build the safest closing sequence when the wormhole is at critical mass
 * (≥90% consumed, close goal).
 *
 * Strategy: cold in → hot back (controlled collapse).
 *   Cold entry minimises mass on the way in, preserving the variance buffer.
 *   Hot return is the controlled collapse jump.
 *
 * If pilots are already in the hole at crit declaration, handle their
 * returns first (cold if safe, else flag strand risk).
 *
 * @param {Array}       pilotsInHole  — ships already inside ([] during plan-time)
 * @param {Array}       pilotsAtHome  — available ships at home
 * @param {number}      runningTotal
 * @param {object}      wormhole
 * @param {string}      goal
 * @param {object|null} doorstopShip
 * @returns {Array}  plan items (steps + optional outcome)
 */
export function getCritStrategy(pilotsInHole, pilotsAtHome, runningTotal, wormhole, goal, doorstopShip) {
  const items   = [];
  const target  = wormhole.totalMass;
  const goalCfg = GOALS[goal] ?? GOALS.close;
  const goalThreshold = Math.round(target * goalCfg.threshold);
  let running     = runningTotal;
  let goalReached = false;

  // ── Handle pilots already in the hole ────────────────────────────────────
  // For doorstop: the staged ship stays inside — exclude it from the return sequence.
  const returningFromHole = pilotsInHole.filter(
    s => !(goal === 'doorstop' && doorstopShip && s.id === doorstopShip.id)
  );
  for (let i = 0; i < returningFromHole.length; i++) {
    const ship      = returningFromHole[i];
    const stillIn   = returningFromHole.slice(i + 1);
    // HICs always return hot (MWD, physics-forced) — use hotMass for mass tracking.
    // Non-HICs return cold at crit to preserve the variance buffer.
    const isHic       = _isHic(ship);
    const returnMass  = isHic ? ship.hotMass : ship.coldMass;
    const returnWorst = Math.round(returnMass * 1.1);
    const strandRisk  = running + returnWorst >= target && stillIn.length > 0;

    if (strandRisk) {
      // Cannot return safely — surface strand warning and stop planning
      items.push({
        type: 'step', id: `home-${ship.id}-${uid()}`,
        ship, direction: 'home', isHot: isHic, massThisJump: returnMass,
        runningTotal: running + returnMass,
        collapses: running + returnMass >= target,
        isGoalStep: false, isStrandingRisk: true, isHic,
        reason: isHic
          ? '⚠ STRAND RISK — HIC must return hot (MWD), worst-case may collapse with pilots still inside'
          : '⚠ STRAND RISK — cold return worst-case may collapse with pilots still inside',
        switched: false, switchReason: 'strand-risk', showVariance: true,
        warning: `⚠ STRAND RISK: ${ship.pilotName} is in the hole and the wormhole may collapse ` +
                 `before they can return. Recommend ${isHic ? 'hot' : 'cold'} return immediately before any other jumps.`,
      });
      return items; // FC must act; no further plan possible
    }

    running += returnMass;
    const isGoalStep = !goalReached && running >= goalThreshold;
    if (isGoalStep) goalReached = true;

    items.push({
      type: 'step', id: `home-${ship.id}-${uid()}`,
      ship, direction: 'home', isHot: isHic, massThisJump: returnMass,
      runningTotal: running, collapses: running >= target,
      isGoalStep, isStrandingRisk: false, isHic,
      reason: isHic
        ? 'MWD hot return — HIC physics-forced, crit state'
        : 'cold return — crit state, preserving variance buffer',
      switched: false, switchReason: null, showVariance: true,
    });

    if (running >= target) {
      if (goalReached) items.push({ type: 'outcome', id: uid(), result: goalCfg.outcomeResult });
      return items;
    }
  }

  // ── For crit/doorstop: goal already reached at critical state ────────────
  // Don't send any more ships in — just confirm the outcome and, for doorstop,
  // mark the staged ship.
  if (goal !== 'close') {
    if (goal === 'doorstop' && doorstopShip) {
      items.push({ type: 'doorstop-marker', id: uid(), ship: doorstopShip });
    }
    if (!goalReached) goalReached = running >= goalThreshold;
    if (goalReached) items.push({ type: 'outcome', id: uid(), result: goalCfg.outcomeResult });
    return items;
  }

  // ── Cold in / hot back for ships at home (close goal only) ───────────────
  // Sort by coldMass ascending — lightest ship enters first to minimise
  // the chance that the entry itself collapses the hole and strands the pilot.
  const sortedHome = [...pilotsAtHome].sort((a, b) => a.coldMass - b.coldMass);

  for (const ship of sortedHome) {
    if (running >= target) break;

    // SAFETY: if this ship's worst-case cold entry would collapse the hole,
    // the pilot would be stranded inside. Skip and try the next lighter ship.
    const coldWorst = Math.round(ship.coldMass * 1.1);
    if (running + coldWorst >= target) continue;

    // Cold entry — minimal mass into hole
    running += ship.coldMass;
    items.push({
      type: 'step', id: `in-${ship.id}-${uid()}`,
      ship, direction: 'in', isHot: false, massThisJump: ship.coldMass,
      runningTotal: running, collapses: false,
      isGoalStep: false, isStrandingRisk: false, isHic: _isHic(ship),
      reason: 'cold in — crit state, minimise entry mass before controlled close',
      switched: true, switchReason: 'collapse-risk', showVariance: true,
    });

    // Hot back — controlled collapse
    const jumpLimit  = wormhole.maxIndividualMass;
    const returnMass = _isHic(ship) ? ship.hotMass
      : (ship.hotMass <= jumpLimit ? ship.hotMass : ship.coldMass);
    const isHot      = !_isHic(ship) && ship.hotMass <= jumpLimit;
    running         += returnMass;
    const collapses  = running >= target;
    const isGoalStep = !goalReached && running >= goalThreshold;
    if (isGoalStep) goalReached = true;

    items.push({
      type: 'step', id: `home-${ship.id}-${uid()}`,
      ship, direction: 'home', isHot,
      massThisJump: returnMass, runningTotal: running,
      collapses, isGoalStep, isStrandingRisk: false, isHic: _isHic(ship),
      reason: collapses
        ? 'HOT ← home — controlled collapse at critical mass'
        : 'hot return — crit closing pass',
      switched: false, switchReason: null, showVariance: true,
    });

    if (collapses) {
      if (goalReached) items.push({ type: 'outcome', id: uid(), result: goalCfg.outcomeResult });
      return items;
    }
  }

  return items;
}

// ─── Mass estimation ──────────────────────────────────────────────────────────

/**
 * Estimate remaining wormhole mass from confirmed jumps and FC observations.
 *
 * consumedFloor = sum of (massThisJump × 1.10) for all confirmed jumps —
 *   the pessimistic lower bound on how much the hole has consumed.
 *
 * Before any reduction observed:
 *   pessimistic = statedMax × 0.90 − consumedFloor  (hole might accept 10% less)
 *   optimistic  = statedMax       − consumedFloor
 *
 * After FC confirms "Wormhole Reduced" (≈50% consumed at that moment):
 *   estimatedTotal = reductionAtMass / 0.50
 *   pessimistic    = estimatedTotal   − consumedFloor
 *   optimistic     = statedMax        − consumedFloor
 *
 * @param {object}  wormhole
 * @param {number}  consumedFloor      Sum of massThisJump×1.1 for all done steps
 * @param {boolean} reductionObserved  FC confirmed "Wormhole Reduced"
 * @param {number}  reductionAtMass    consumedFloor when reduction was confirmed
 * @returns {{ pessimistic: number, optimistic: number }}
 */
export function estimateRemainingMass(wormhole, consumedFloor, reductionObserved, reductionAtMass) {
  const statedMax = wormhole.totalMass;

  if (reductionObserved && reductionAtMass > 0) {
    const estimatedTotal = Math.round(reductionAtMass / 0.5);
    return {
      pessimistic: Math.max(0, estimatedTotal - consumedFloor),
      optimistic:  Math.max(0, statedMax      - consumedFloor),
    };
  }

  return {
    pessimistic: Math.max(0, Math.round(statedMax * 0.9) - consumedFloor),
    optimistic:  Math.max(0, statedMax - consumedFloor),
  };
}

/**
 * Build a position-aware plan when pilots may already be in the hole.
 *
 * Non-critical replan flow:
 *   1. Return any in-hole pilots home safely (using selectJumpMode to
 *      pick cold/hot appropriately for each return).
 *   2. If the goal is already reached after those returns → done.
 *   3. Otherwise delegate to _buildPlan() for further passes, starting
 *      from the updated running total (all ships are now at home).
 *
 * This is used by respondToStatus() and recalculatePlan() for the
 * non-critical path, where _buildPlan() was previously called with
 * the full fleet regardless of current ship positions — producing
 * "jump IN" steps for ships already inside the hole.
 *
 * @param {Array}       eligible      All eligible ships (sorted)
 * @param {Array}       holeSide      Ships currently in the hole
 * @param {number}      runningTotal  Mass consumed so far
 * @param {object}      wormhole      { totalMass, maxIndividualMass }
 * @param {string}      goal          'close' | 'crit' | 'doorstop'
 * @param {object|null} doorstopShip
 * @param {Array}       warnings      Mutable warnings array
 * @returns {{ items: Array, canReachGoal: boolean }}
 */
function _buildPositionAwarePlan(eligible, holeSide, runningTotal, wormhole, goal, doorstopShip, warnings) {
  const target      = wormhole.totalMass;
  const jumpLimit   = wormhole.maxIndividualMass;
  const goalCfg     = GOALS[goal] ?? GOALS.close;
  const goalThreshold = Math.round(target * goalCfg.threshold);

  const items   = [];
  let running   = runningTotal;
  let goalReached = running >= goalThreshold;

  // ── Phase 0: Return in-hole pilots home ─────────────────────────────────
  if (holeSide.length > 0) {
    const eligibleHole = holeSide
      .filter(s => _isHic(s) ? s.hotMass <= jumpLimit : s.coldMass <= jumpLimit);

    // For doorstop: the staged ship stays inside — exclude from returns.
    const returningFromHole = (goal === 'doorstop' && doorstopShip)
      ? eligibleHole.filter(s => s.id !== doorstopShip.id)
      : eligibleHole;

    for (let i = 0; i < returningFromHole.length; i++) {
      const ship     = returningFromHole[i];
      const stillIn  = returningFromHole.slice(i + 1);
      // Include doorstop ship in stranding checks — it IS still in the hole
      const pilotsStillInHole = (goal === 'doorstop' && doorstopShip)
        ? [...stillIn, doorstopShip]
        : stillIn;

      const jr = selectJumpMode(ship, 'home', running, wormhole, pilotsStillInHole, goal);
      const mass    = jr.mass;
      const isHot   = jr.mode === 'hot';
      running      += mass;
      const collapses  = running >= target;
      const isGoalStep = !goalReached && running >= goalThreshold;
      if (isGoalStep) goalReached = true;

      items.push({
        type: 'step', id: `home-${ship.id}-${uid()}`,
        ship, direction: 'home', isHot, massThisJump: mass,
        runningTotal: running, collapses, isGoalStep,
        isStrandingRisk: collapses && pilotsStillInHole.length > 0,
        isHic: _isHic(ship),
        reason: jr.reason, switched: jr.switched ?? false,
        warning: jr.warning, switchReason: jr.switchReason ?? null,
        showVariance: jr.showVariance ?? false,
      });

      if (collapses) {
        if (goalReached) items.push({ type: 'outcome', id: uid(), result: goalCfg.outcomeResult });
        return { items, canReachGoal: goalReached };
      }
    }

    // Goal reached from returns alone
    if (goalReached) {
      if (goal === 'doorstop' && doorstopShip) {
        items.push({ type: 'doorstop-marker', id: uid(), ship: doorstopShip });
      }
      items.push({ type: 'outcome', id: uid(), result: goalCfg.outcomeResult });
      return { items, canReachGoal: true };
    }
  }

  // ── Phase 1: All ships home — continue with normal planning ─────────────
  // If the doorstop ship is already in the hole (it was excluded from Phase 0
  // returns), remove it from the eligible list so _buildPlan/singlePassGreedy
  // won't generate a redundant "jump IN" step for it.  The doorstopShip param
  // is still passed so _buildPlan emits the doorstop-marker and handles
  // standing-by / stranding logic correctly.
  const doorstopAlreadyInHole = goal === 'doorstop' && doorstopShip &&
    holeSide.some(s => s.id === doorstopShip.id);
  const planEligible = doorstopAlreadyInHole
    ? eligible.filter(s => s.id !== doorstopShip.id)
    : eligible;

  const { items: planItems, canReachGoal } = _buildPlan(
    planEligible, running, wormhole, goal, doorstopShip, warnings || [],
  );
  items.push(...planItems);

  return { items, canReachGoal: canReachGoal || goalReached };
}

/**
 * Build the critical closing sequence from actual pilot positions.
 *
 * Return order for in-hole pilots: lightest cold mass first (preserves mass
 * for the remaining pilots' returns).
 *
 * Closing sequence priority:
 *   1. HIC with Mass Entanglers (cold in ≈0M, hot back → collapses)
 *   2. Lightest eligible home ship (cold in, hot back → collapses)
 *
 * Delegates to getCritStrategy() with the corrected sort orders applied.
 *
 * @param {Array}  holeSide     Ships currently in the hole
 * @param {Array}  homeSide     Ships currently at home
 * @param {number} runningTotal Mass consumed so far (consumedFloor)
 * @param {object} wormhole
 * @param {string} goal
 * @returns {Array} Plan items (steps + optional outcome)
 */
export function buildCritClosingSequence(holeSide, homeSide, runningTotal, wormhole, goal, originalDoorstopShip = null) {
  const jumpLimit = wormhole.maxIndividualMass;

  // Return hole pilots lightest-cold-first to preserve mass for later returns
  const eligibleHole = holeSide
    .filter(s => _isHic(s) ? s.hotMass <= jumpLimit : s.coldMass <= jumpLimit)
    .sort((a, b) => a.coldMass - b.coldMass);

  // Home pilots for closing: HICs first (near-zero entry, hot collapse), then lightest non-HIC
  const eligibleHome = homeSide.filter(s => _isHic(s) ? s.hotMass <= jumpLimit : s.coldMass <= jumpLimit);
  const hics    = eligibleHome.filter(s =>  _isHic(s));
  const nonHics = eligibleHome.filter(s => !_isHic(s)).sort((a, b) => a.coldMass - b.coldMass);
  const closingOrder = [...hics, ...nonHics];

  // Use the original doorstop ship if it's still eligible (in hole or at home).
  // Only fall back to picking a new one if the original is unavailable.
  let doorstopShip = null;
  if (goal === 'doorstop') {
    const allEligible = [...eligibleHole, ...closingOrder];
    const originalStillEligible = originalDoorstopShip &&
      allEligible.some(s => s.id === originalDoorstopShip.id);
    doorstopShip = originalStillEligible
      ? originalDoorstopShip
      : (allEligible.sort((a, b) => b.hotMass - a.hotMass)[0] ?? null);
  }
  return getCritStrategy(eligibleHole, closingOrder, runningTotal, wormhole, goal, doorstopShip);
}

/**
 * Central entry point called when the FC taps a pass-end status button.
 *
 * Updates session state (reduction tracking) and returns a fresh plan tail.
 *
 * @param {'no_change'|'reduced'|'critical'} status
 * @param {{ consumedFloor, reductionObserved, reductionAtMass, holeSide, homeSide }} currentSession
 * @param {Array}  fleet
 * @param {object} wormhole
 * @param {string} goal
 * @returns {{ updatedSession: object, newSteps: Array }}
 */
export function respondToStatus(status, currentSession, fleet, wormhole, goal, originalDoorstopShip = null) {
  const { consumedFloor, reductionObserved, reductionAtMass, holeSide, homeSide } = currentSession;
  const jumpLimit = wormhole.maxIndividualMass;

  const updatedSession = { ...currentSession };
  let updatedTotalMass = null;

  // ── Critical: worst-case totalMass, evacuate hole, then close ────────────
  if (status === 'critical') {
    // Worst case: the hole went critical at exactly 90% consumed, meaning
    // the true totalMass is consumedFloor / 0.9 (the minimum it could be).
    const worstCaseTotal = Math.round(consumedFloor / 0.9);
    updatedTotalMass = Math.min(wormhole.totalMass, worstCaseTotal);
    const effectiveWH = { ...wormhole, totalMass: updatedTotalMass };
    const newSteps = buildCritClosingSequence(holeSide, homeSide, consumedFloor, effectiveWH, goal, originalDoorstopShip);
    return { updatedSession, newSteps, updatedTotalMass };
  }

  // ── Reduced: worst-case totalMass, record when first observed ────────────
  if (status === 'reduced' && !reductionObserved) {
    updatedSession.reductionObserved = true;
    updatedSession.reductionAtMass   = consumedFloor;
    // Worst case: the hole went reduced at exactly 50% consumed, meaning
    // the true totalMass is consumedFloor / 0.5 (the minimum it could be).
    const worstCaseTotal = Math.round(consumedFloor / 0.5);
    updatedTotalMass = Math.min(wormhole.totalMass, worstCaseTotal);
  }

  // ── Compute effective wormhole using pessimistic mass estimate ────────────
  let effectiveWormhole = updatedTotalMass != null
    ? { ...wormhole, totalMass: updatedTotalMass }
    : wormhole;

  if (updatedSession.reductionObserved && updatedTotalMass == null) {
    const { pessimistic } = estimateRemainingMass(
      wormhole, consumedFloor,
      updatedSession.reductionObserved, updatedSession.reductionAtMass,
    );
    // Effective total = what we've burned + pessimistic remaining, but never
    // exceed the stated max.  reductionAtMass is a pessimistic (×1.1) sum, so
    // reductionAtMass / 0.5 can overshoot statedMax — capping prevents the
    // planner from assuming more headroom than the hole actually has.
    const effTotal = Math.min(wormhole.totalMass, consumedFloor + pessimistic);
    effectiveWormhole = { ...wormhole, totalMass: effTotal };
  }

  // ── Replan from consumedFloor with effective wormhole ────────────────────
  const eligible = fleet
    .filter(s => _isHic(s) ? s.hotMass <= jumpLimit : s.coldMass <= jumpLimit)
    .sort((a, b) => {
      const aHic = _isHic(a), bHic = _isHic(b);
      if (aHic !== bHic) return aHic ? 1 : -1;
      return b.hotMass - a.hotMass;
    });

  const doorstopShip = goal === 'doorstop' ? eligible[0] : null;

  // Use position-aware planning: return in-hole pilots home first, then
  // continue with normal passes.  This prevents generating "jump IN" steps
  // for ships already inside the hole.
  const { items } = _buildPositionAwarePlan(
    eligible, holeSide, consumedFloor, effectiveWormhole, goal, doorstopShip, [],
  );
  return { updatedSession, newSteps: items, updatedTotalMass };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Initial mass state options for when the wormhole is already partially consumed.
 *
 *   'fresh'    — Default. Full mass budget available.
 *   'reduced'  — Wormhole is visually reduced (~50% consumed). Plan uses
 *                conservative estimate: only 50% of stated mass remains.
 *   'critical' — Wormhole is already flashing (~90% consumed). Plan jumps
 *                straight to critical closing strategy.
 */
export const INITIAL_MASS_STATES = {
  fresh:    { label: 'Fresh',    description: 'Full mass — wormhole just spawned or looks normal' },
  reduced:  { label: 'Reduced',  description: 'Visually smaller — ~50% mass already consumed' },
  critical: { label: 'Critical', description: 'Flashing — ~90% mass consumed, one jump from death' },
};

/**
 * Build the full rolling plan.
 *
 * Returns { items, warnings, canReachGoal, goal, doorstopShip, initialMassState }
 *
 * The plan is a flat array of typed items (step / assessment / doorstop-marker
 * / outcome).  Assessment items are inserted between passes; the FC answers
 * them during execution and the tail of the plan is regenerated via
 * recalculatePlan().
 *
 * @param {object} wormhole
 * @param {Array}  fleet
 * @param {string} goal
 * @param {'fresh'|'reduced'|'critical'} initialMassState  Starting mass state
 */
export function generatePlan(wormhole, fleet, goal = 'close', initialMassState = 'fresh') {
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

  // ── Apply initial mass state ────────────────────────────────────────────
  let estimatedConsumed = 0;
  let effectiveWormhole = wormhole;
  let items, canReachGoal;

  if (initialMassState === 'critical') {
    // Already at ~90% consumed — jump straight to crit strategy
    estimatedConsumed = Math.round(wormhole.totalMass * 0.9);
    const critItems = getCritStrategy([], eligible, estimatedConsumed, wormhole, goal, doorstopShip);
    items = critItems;
    canReachGoal = critItems.some(i => i.type === 'outcome');

    // Standing-by for ships not used by crit strategy
    const critUsed = new Set(critItems.filter(i => i.type === 'step').map(i => i.ship.id));
    for (const ship of eligible) {
      if (!critUsed.has(ship.id) && ship.id !== doorstopShip?.id) {
        const reason = canReachGoal
          ? 'not needed — goal reached without this ship'
          : 'too heavy — cold entry at critical mass would collapse the wormhole and strand the pilot';
        items.push({ type: 'standing-by', id: uid(), ship, reason });
      }
    }

    if (!canReachGoal) {
      warnings.push({
        id: uid(), type: 'insufficient',
        message: 'Cannot safely close at critical mass — all fleet ships are too heavy to enter without collapsing the hole. Add a lighter ship (Cruiser, Battlecruiser) or a HIC with Mass Entanglers.',
      });
    }
  } else {
    if (initialMassState === 'reduced') {
      // ~50% consumed → use conservative effective total (only 50% of stated mass remains)
      estimatedConsumed = Math.round(wormhole.totalMass * 0.5);
      effectiveWormhole = { ...wormhole, totalMass: wormhole.totalMass };
    }

    ({ items, canReachGoal } = _buildPlan(eligible, estimatedConsumed, effectiveWormhole, goal, doorstopShip, warnings));
  }

  // Assertion: every eligible ship must appear as a step or standing-by entry.
  const coveredIds = new Set(
    items.filter(i => i.type === 'step' || i.type === 'standing-by').map(i => i.ship.id),
  );
  const missing = eligible.filter(s => !coveredIds.has(s.id) && s.id !== doorstopShip?.id);
  if (missing.length > 0) {
    console.error(
      '[rollingEngine] BUG: ships missing from plan:',
      missing.map(s => `${s.pilotName} (${s.shipClass})`).join(', '),
    );
  }

  return { items, warnings, canReachGoal, goal, doorstopShip, initialMassState };
}

/**
 * Regenerate the plan tail using confirmed wormhole state.
 *
 * State-aware strategy:
 *   'fresh'    → plan normally from currentTotal
 *   'unknown'  → plan normally from currentTotal
 *   'reduced'  → conservative: effectiveTotal = currentTotal + remaining × 0.6
 *   'critical' → getCritStrategy: return in-hole pilots; for close, also cold-in/hot-back collapse
 *
 * @param {Array}   completedSteps  All items completed so far (used for side tracking)
 * @param {number}  currentTotal    Mass consumed so far
 * @param {string}  confirmedState  'fresh'|'reduced'|'critical'|'unknown'
 * @param {Array}   homeSide        Pilots currently at home
 * @param {Array}   holeSide        Pilots currently in the hole
 * @param {Array}   fleet           Full fleet roster
 * @param {object}  wormhole        { totalMass, maxIndividualMass, ... }
 * @param {string}  goal            Original goal (unchanged)
 * @returns {Array} New plan tail (items[])
 */
export function recalculatePlan(
  completedSteps,
  currentTotal,
  confirmedState,
  homeSide,
  holeSide,
  fleet,
  wormhole,
  goal,
  originalDoorstopShip = null,
) {
  const target    = wormhole.totalMass;
  const jumpLimit = wormhole.maxIndividualMass;

  const eligible = fleet
    .filter(s => _isHic(s) ? s.hotMass <= jumpLimit : s.coldMass <= jumpLimit)
    .sort((a, b) => {
      const aHic = _isHic(a), bHic = _isHic(b);
      if (aHic !== bHic) return aHic ? 1 : -1;
      return b.hotMass - a.hotMass;
    });

  // Preserve the original doorstop ship if still eligible; fall back to heaviest.
  const doorstopShip = goal === 'doorstop'
    ? (originalDoorstopShip && eligible.some(s => s.id === originalDoorstopShip.id)
        ? originalDoorstopShip
        : eligible[0] ?? null)
    : null;

  // ── Critical state: use getCritStrategy with actual hole/home composition ──
  if (confirmedState === 'critical') {
    const eligibleHole = holeSide.filter(s => _isHic(s) ? s.hotMass <= jumpLimit : s.coldMass <= jumpLimit);
    const eligibleHome = homeSide.filter(s => _isHic(s) ? s.hotMass <= jumpLimit : s.coldMass <= jumpLimit);
    // For crit/doorstop the goal is already reached — return in-hole pilots home (keeping
    // the doorstop ship staged) but do NOT send any home-side ships back in.
    // Only close needs the cold-in / hot-back collapse sequence.
    return getCritStrategy(eligibleHole, goal === 'close' ? eligibleHome : [], currentTotal, wormhole, goal, doorstopShip);
  }

  // ── Reduced: conservative estimate — only 60% of remaining mass usable ────
  let effectiveWormhole = wormhole;
  if (confirmedState === 'reduced') {
    const remaining = target - currentTotal;
    effectiveWormhole = { ...wormhole, totalMass: currentTotal + Math.round(remaining * 0.6) };
  }

  // ── Fresh / unknown: position-aware plan from currentTotal ────────────────
  // Return in-hole pilots home first, then continue with normal passes.
  const { items } = _buildPositionAwarePlan(
    eligible, holeSide, currentTotal, effectiveWormhole, goal, doorstopShip, [],
  );
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
 * Strategy per pass:
 *   1. SWITCHOVER TEST — can the full eligible fleet complete a cold round trip
 *      without collapse?  If yes → use full fleet.  If no → find the largest
 *      safe subset (greedy removal of heaviest round-trip contributors).
 *   2. Try to finish the goal in this pass with the chosen fleet.
 *      If that succeeds → done.
 *   3. Otherwise run a safe intermediate pass (all ships in + all ships home).
 *      Insert an assessment checkpoint and repeat.
 *   - Repeat up to 10 passes.
 */
function _buildPlan(eligible, estimatedConsumed, wormhole, goal, doorstopShip, warnings) {
  const target        = wormhole.totalMass;
  const goalCfg       = GOALS[goal] ?? GOALS.close;
  const goalThreshold = Math.round(target * goalCfg.threshold);

  const allItems   = [];
  let runningTotal = estimatedConsumed;

  // Track ship IDs that received step items across ALL passes.
  // Used at the end to emit standing-by entries for ships never needed.
  const _usedShipIds = new Set();

  function _registerSteps(items) {
    for (const i of items) if (i.type === 'step') _usedShipIds.add(i.ship.id);
  }

  // Emit standing-by entries for eligible ships that never got a step or
  // standing-by anywhere in the plan.  Call just before each successful return.
  function _finalStandingBy() {
    const covered = new Set(
      allItems.filter(i => i.type === 'step' || i.type === 'standing-by').map(i => i.ship.id)
    );
    for (const ship of eligible) {
      if (!covered.has(ship.id) && ship.id !== doorstopShip?.id) {
        allItems.push({
          type: 'standing-by', id: uid(), ship,
          reason: 'not needed — goal reached without this ship',
        });
      }
    }
  }

  // ── Already at goal ──────────────────────────────────────────────────────
  if (runningTotal >= goalThreshold) {
    _finalStandingBy();
    if (goal === 'doorstop') allItems.push({ type: 'doorstop-marker', id: uid(), ship: doorstopShip });
    allItems.push({ type: 'outcome', id: uid(), result: goalCfg.outcomeResult });
    return { items: allItems, canReachGoal: true };
  }

  let passNumber = 0;

  while (runningTotal < goalThreshold && passNumber < 10) {
    passNumber++;

    // ── Crit state: ≥90% consumed on a close goal → cold in / hot back ───────
    if (goal === 'close' && runningTotal >= Math.round(target * 0.9)) {
      const critItems = getCritStrategy([], eligible, runningTotal, wormhole, goal, doorstopShip);
      _registerSteps(critItems);
      allItems.push(...critItems);
      // Standing-by for any eligible ship not used by crit strategy
      const canReach = critItems.some(i => i.type === 'outcome');
      const critUsed = new Set(critItems.filter(i => i.type === 'step').map(i => i.ship.id));
      for (const ship of eligible) {
        if (!critUsed.has(ship.id) && ship.id !== doorstopShip?.id) {
          const reason = canReach
            ? 'not needed — goal reached without this ship'
            : 'too heavy — cold entry at critical mass would collapse the wormhole and strand the pilot';
          allItems.push({ type: 'standing-by', id: uid(), ship, reason });
        }
      }
      if (!canReach && warnings) {
        warnings.push({
          id: uid(), type: 'insufficient',
          message: 'Cannot safely close at critical mass — all fleet ships are too heavy to enter without collapsing the hole. Add a lighter ship (Cruiser, Battlecruiser) or a HIC with Mass Entanglers.',
        });
      }
      return { items: allItems, canReachGoal: canReach };
    }

    // ── SWITCHOVER TEST ──────────────────────────────────────────────────────
    let passFleet  = eligible;
    let sittingOut = [];

    const safety = evaluateFullFleetSafety(eligible, runningTotal, wormhole);
    if (!safety.safe) {
      const subsetResult = findLargestSafeSubset(eligible, runningTotal, wormhole);
      passFleet  = subsetResult.subset;
      sittingOut = subsetResult.sittingOut;

      // Hold-back group notice + individual standing-by per sitting-out ship
      if (sittingOut.length > 0) {
        allItems.push({
          type: 'hold-back', id: uid(), passNumber,
          sittingOut, reason: subsetResult.reason,
        });
        for (const ship of sittingOut) {
          allItems.push({
            type: 'standing-by', id: uid(), ship,
            reason: 'held back this pass — full-fleet round trip would exceed mass budget',
          });
        }
      }
    }

    if (passFleet.length === 0) break;

    // ── Try to finish in this pass ───────────────────────────────────────────
    const finalResult = _tryFinalPass(
      passFleet, runningTotal, target, goalThreshold,
      wormhole.maxIndividualMass, goal, doorstopShip, wormhole,
    );

    if (finalResult.canReachGoal) {
      _registerSteps(finalResult.items);
      allItems.push(...finalResult.items);
      // Standing-by for passFleet ships not used by final pass (e.g. aborted, or crit/doorstop precision)
      const finalUsed = new Set(finalResult.items.filter(i => i.type === 'step').map(i => i.ship.id));
      for (const ship of passFleet) {
        if (!finalUsed.has(ship.id) && ship.id !== doorstopShip?.id) {
          allItems.push({ type: 'standing-by', id: uid(), ship, reason: 'not needed this pass — goal reached by earlier ships' });
        }
      }
      _finalStandingBy();
      if (goal === 'doorstop') allItems.push({ type: 'doorstop-marker', id: uid(), ship: doorstopShip });
      allItems.push({ type: 'outcome', id: uid(), result: goalCfg.outcomeResult });
      return { items: allItems, canReachGoal: true };
    }

    // ── Intermediate pass ────────────────────────────────────────────────────
    const intResult = _intermediatePass(passFleet, runningTotal, wormhole, goal);
    _registerSteps(intResult.items);
    allItems.push(...intResult.items);

    // Standing-by for passFleet ships that were aborted mid-pass
    const intUsed = new Set(intResult.items.filter(i => i.type === 'step').map(i => i.ship.id));
    for (const ship of passFleet) {
      if (!intUsed.has(ship.id) && ship.id !== doorstopShip?.id) {
        allItems.push({ type: 'standing-by', id: uid(), ship, reason: 'held back this pass — return simulation blocked entry' });
      }
    }

    if (!intResult.ok) {
      const lastItem = intResult.items[intResult.items.length - 1];
      if (
        goal === 'close' &&
        lastItem?.collapses &&
        lastItem?.direction === 'home' &&
        !lastItem?.isStrandingRisk
      ) {
        _finalStandingBy();
        allItems.push({ type: 'outcome', id: uid(), result: goalCfg.outcomeResult });
        return { items: allItems, canReachGoal: true };
      }
      if (warnings) {
        warnings.push({
          id: uid(), type: 'insufficient',
          message: 'An intermediate pass collapsed unexpectedly — safety check may have underestimated mass. Reduce fleet size.',
        });
      }
      break;
    }

    if (intResult.newRunning >= goalThreshold) {
      _finalStandingBy();
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
 * Lookahead helper: would sending `ship` hot block `nextShip` from entering
 * at all, and does switching `ship` to cold unblock it?
 *
 * Only called when `ship` would naturally go hot.  Returns true when we
 * should prefer cold for `ship` so that `nextShip` can enter.
 */
function _coldEnablesNextShip(ship, nextShip, running, currentInHole, wormhole) {
  const inHoleAfterShip  = [...currentInHole, ship];
  const runningAfterHot  = running + ship.hotMass;
  const runningAfterCold = running + ship.coldMass;

  // If next ship can enter (hot or cold) after current goes hot → no switch needed
  if (canSafelyEnter(nextShip, 'hot',  runningAfterHot, inHoleAfterShip, wormhole).safe ||
      canSafelyEnter(nextShip, 'cold', runningAfterHot, inHoleAfterShip, wormhole).safe) {
    return false;
  }

  // Next ship is completely blocked after hot.  Check if cold here unblocks it.
  return canSafelyEnter(nextShip, 'hot',  runningAfterCold, inHoleAfterShip, wormhole).safe ||
         canSafelyEnter(nextShip, 'cold', runningAfterCold, inHoleAfterShip, wormhole).safe;
}

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

  for (let si = 0; si < ships.length; si++) {
    const ship = ships[si];
    let jr = selectJumpMode(ship, 'in', running, wormhole, [...inHole], goal);

    // canSafelyEnter determined no mode is safe — stop sending ships in
    if (jr.switchReason === 'abort') break;

    // Lookahead: if we'd go hot and that would completely block the next ship
    // from entering, prefer cold so the next ship can still get in.
    if (jr.mode === 'hot' && jr.switchReason === null && si + 1 < ships.length) {
      if (_coldEnablesNextShip(ship, ships[si + 1], running, inHole, wormhole)) {
        jr = {
          mode: 'cold', mass: ship.coldMass,
          reason: 'cold — hot would prevent next ship from entering safely',
          switched: true, switchReason: 'enable-entry', showVariance: false,
        };
      }
    }

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
  const doorstopStaysInHole = goal === 'doorstop' && doorstopShip && inHole.some(s => s.id === doorstopShip.id);
  const returningShips = doorstopStaysInHole
    ? inHole.filter(s => s.id !== doorstopShip.id)
    : inHole;

  for (let i = 0; i < returningShips.length; i++) {
    const ship              = returningShips[i];
    // Include doorstop ship in pilotsStillInHole — it IS still inside the hole
    // and would be stranded if the wormhole collapses during this return.
    const remainingReturns  = returningShips.slice(i + 1);
    const pilotsStillInHole = doorstopStaysInHole
      ? [...remainingReturns, doorstopShip]
      : remainingReturns;
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
  for (let si = 0; si < eligible.length; si++) {
    const ship = eligible[si];
    let jr = selectJumpMode(ship, 'in', running, wormhole, [...inHole], goal);

    // canSafelyEnter determined no mode is safe — stop sending ships in
    if (jr.switchReason === 'abort') break;

    // Lookahead: if we'd go hot and that would completely block the next ship
    // from entering, prefer cold so the next ship can still get in.
    if (jr.mode === 'hot' && jr.switchReason === null && si + 1 < eligible.length) {
      if (_coldEnablesNextShip(ship, eligible[si + 1], running, inHole, wormhole)) {
        jr = {
          mode: 'cold', mass: ship.coldMass,
          reason: 'cold — hot would prevent next ship from entering safely',
          switched: true, switchReason: 'enable-entry', showVariance: false,
        };
      }
    }

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
