/**
 * rollingEngine.js — Pure logic. No React.
 *
 * Mass units: raw file units (same as wormholes.js).
 *   1 file unit = 1,000 kg in EVE.
 *   Display: value / 1000 + "M"  (e.g. 300_000 → "300M")
 */

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
 *             For each ship about to return: try cold.
 *             If cold + remaining ships' max-hot can still collapse → use cold.
 *             Otherwise → must use hot.
 *             The first return that pushes runningTotal >= totalMass is the collapse step.
 *
 * @param {object} wormhole  — from wormholes.js
 * @param {Array}  fleet     — [{id, pilotName, shipName, shipClass, hotMass, coldMass}]
 * @returns {{ steps, warnings, canCollapse }}
 */
export function generatePlan(wormhole, fleet) {
  if (!wormhole || !fleet || fleet.length === 0) return null;

  const target    = wormhole.totalMass;
  const jumpLimit = wormhole.maxIndividualMass;
  const warnings  = [];
  const steps     = [];

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
    return { steps: [], warnings, canCollapse: false };
  }

  // --- Phase 1: Inbound ---
  let runningTotal = 0;
  const shipsInHole = [];
  let collapsedDuringInbound = false;

  for (const ship of eligible) {
    const canHot        = ship.hotMass <= jumpLimit;
    const massThisJump  = canHot ? ship.hotMass : ship.coldMass;
    runningTotal       += massThisJump;
    const collapses     = runningTotal >= target;

    steps.push({
      id:             `in-${ship.id}-${uid()}`,
      ship,
      direction:      'in',
      isHot:          canHot,
      massThisJump,
      runningTotal,
      collapses,
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
    return { steps, warnings, canCollapse: true, collapsedDuringInbound: true };
  }

  // --- Phase 2: Returns (greedy cold-first) ---
  for (let i = 0; i < shipsInHole.length; i++) {
    const ship          = shipsInHole[i];
    const remaining     = shipsInHole.slice(i + 1);
    const remainMaxHot  = remaining.reduce((s, sh) => s + sh.hotMass, 0);
    const afterCold     = runningTotal + ship.coldMass;
    const afterHot      = runningTotal + ship.hotMass;

    if (afterCold >= target) {
      // Cold return collapses — all remaining ships are stranded
      runningTotal = afterCold;
      steps.push({
        id:             `home-${ship.id}-${uid()}`,
        ship,
        direction:      'home',
        isHot:          false,
        massThisJump:   ship.coldMass,
        runningTotal,
        collapses:      true,
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

    } else if (afterCold + remainMaxHot >= target) {
      // Cold is safe; remaining ships (all hot) can still collapse
      runningTotal = afterCold;
      steps.push({
        id:           `home-${ship.id}-${uid()}`,
        ship,
        direction:    'home',
        isHot:        false,
        massThisJump: ship.coldMass,
        runningTotal,
        collapses:    false,
      });

    } else {
      // Must go hot — cold + remaining max-hot isn't enough to ever collapse
      runningTotal   = afterHot;
      const collapses = afterHot >= target;
      steps.push({
        id:             `home-${ship.id}-${uid()}`,
        ship,
        direction:      'home',
        isHot:          true,
        massThisJump:   ship.hotMass,
        runningTotal,
        collapses,
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

  const canCollapse = steps.some(s => s.collapses);
  if (!canCollapse) {
    warnings.push({
      id: uid(),
      type: 'insufficient',
      message: 'Fleet does not have enough total mass to collapse this wormhole. Add more or heavier ships.',
    });
  }

  return { steps, warnings, canCollapse };
}

/**
 * Recompute runningTotal and collapses after manual step reorder.
 * isStrandingRisk is simplified: flag if a collapse step has later 'in' steps still pending.
 */
export function recalculatePlan(steps, wormhole) {
  const target = wormhole.totalMass;
  let running  = 0;

  return steps.map((step, idx) => {
    running += step.massThisJump;
    const collapses = running >= target;

    // Stranding: if this step collapses and there are still 'in' steps after it
    const shipsStillInHole = steps.slice(idx + 1).filter(s => {
      // A ship is "in hole" if it went in but hasn't come back before this point
      // Simplified: check if any later step has direction 'home' for same ship
      return s.direction === 'in';
    });
    const isStrandingRisk = collapses && shipsStillInHole.length > 0;

    return { ...step, runningTotal: running, collapses, isStrandingRisk };
  });
}
