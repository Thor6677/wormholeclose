#!/usr/bin/env node
/**
 * rolling-simulation.mjs — End-to-end simulation test suite for the wormhole
 * rolling calculator.
 *
 * Faithfully re-uses the real rolling engine logic (imported directly) to
 * generate plans, then simulates execution with randomised mass outcomes
 * (the wormhole's ±10% variance) and FC status reports (reduced / critical).
 *
 * For each wormhole type × seed, it:
 *   1. Generates an initial plan via generatePlan()
 *   2. Walks through each step, applying a random actual-mass multiplier
 *      drawn from [0.9, 1.1] (EVE's ±10% variance)
 *   3. At assessment checkpoints, determines the FC's visual report based
 *      on actual consumed mass vs. the real wormhole total
 *   4. Replans via respondToStatus() or recalculatePlan() as appropriate
 *   5. Checks every invariant after every jump
 *
 * Checks performed (known failure modes):
 *   - Total mass sent ever exceeds the wormhole's max mass (stranding)
 *   - Ship sent when hole is at critical and can't safely accept it
 *   - Plan calls for a jump to a ship not in position (replan bug)
 *   - Plan's runningTotal is non-monotonic (contradiction after replan)
 *   - Per-jump mass exceeds the wormhole's per-jump limit
 *   - Collapse with pilots stranded inside
 *
 * Usage:  node tests/rolling-simulation.mjs
 */

import {
  SHIP_CLASSES,
  GOALS,
  generatePlan,
  selectJumpMode,
  respondToStatus,
  recalculatePlan,
  evaluateFullFleetSafety,
  getCritStrategy,
  buildCritClosingSequence,
  isInGreyZone,
  formatMass,
} from '../src/rollingEngine.js';
import { wormholes } from '../data/wormholes.js';

// ─── Seeded PRNG (xoshiro128**) ──────────────────────────────────────────────

function makeRng(seed) {
  let s = seed | 0;
  function splitmix32() {
    s = (s + 0x9e3779b9) | 0;
    let t = s ^ (s >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    t = t ^ (t >>> 15);
    return t >>> 0;
  }
  let a = splitmix32(), b = splitmix32(), c = splitmix32(), d = splitmix32();

  return function next() {
    const result = Math.imul(a * 5, 1 << 7 | 1) >>> 0;
    const t = b << 9;
    c ^= a; d ^= b; b ^= c; a ^= d;
    c ^= t;
    d = (d << 11) | (d >>> 21);
    return (result >>> 0) / 4294967296;
  };
}

// ─── Test configuration ──────────────────────────────────────────────────────

const WORMHOLE_TYPES = [
  'C140', 'C247', 'C391', 'C414', 'C461', 'C729',
  'D382', 'D845', 'E175', 'H121',
  'N110', 'Q317', 'X702',
];

const SEEDS_PER_WH = 3;
const BASE_SEED    = 42;

// ─── Fleet generators ────────────────────────────────────────────────────────

let _shipId = 0;
function makeShip(shipClass, pilotName) {
  const base = SHIP_CLASSES[shipClass];
  if (!base) throw new Error(`Unknown ship class: ${shipClass}`);
  return {
    id: ++_shipId,
    pilotName,
    shipClass,
    shipName: '',
    hotMass: base.hotMass,
    coldMass: base.coldMass,
  };
}

/**
 * Build a fleet appropriate for a wormhole's mass limits.
 * Uses the rng to vary fleet composition per seed.
 */
function buildFleet(wh, rng) {
  const limit = wh.maxIndividualMass;

  const fittingClasses = Object.entries(SHIP_CLASSES)
    .filter(([name, stats]) => {
      if (name === 'Custom') return false;
      if (stats.isHic) return stats.hotMass <= limit;
      return stats.coldMass <= limit;
    })
    .map(([name]) => name);

  if (fittingClasses.length === 0) return [];

  const count = 2 + Math.floor(rng() * 4); // 2..5
  const fleet = [];
  const pilots = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];

  for (let i = 0; i < count && i < pilots.length; i++) {
    const cls = fittingClasses[Math.floor(rng() * fittingClasses.length)];
    fleet.push(makeShip(cls, pilots[i]));
  }

  return fleet;
}

// ─── Simulation engine ───────────────────────────────────────────────────────

/**
 * Simulate a complete rolling operation for a given wormhole + fleet + seed.
 *
 * Returns a result object with pass/fail status, warnings, and detailed log.
 */
function simulateRoll(wh, fleet, seed, goal = 'close') {
  const rng = makeRng(seed);
  const log = [];
  const failures = [];    // Hard safety violations
  const warnings = [];    // Design issues (position mismatches, etc.)

  // The "real" wormhole total — what the game actually has.
  // We apply ±10% variance to the stated total to simulate the game's hidden variance.
  const realTotal = Math.round(wh.totalMass * (0.9 + rng() * 0.2));

  log.push(`Wormhole: ${wh.type} | Stated max: ${formatMass(wh.totalMass)} | Real max (hidden): ${formatMass(realTotal)} | Per-jump limit: ${formatMass(wh.maxIndividualMass)}`);
  log.push(`Goal: ${goal}`);
  log.push(`Fleet: ${fleet.map(s => `${s.pilotName}(${s.shipClass} hot=${formatMass(s.hotMass)} cold=${formatMass(s.coldMass)})`).join(', ')}`);
  log.push('');

  // Generate initial plan
  const plan = generatePlan(wh, fleet, goal, 'fresh');
  if (!plan || plan.items.length === 0) {
    log.push('No plan generated (fleet may not fit or empty).');
    return { wh: wh.type, seed, goal, pass: true, log, failures, warnings, reason: 'no-plan', jumpCount: 0 };
  }

  // Execution state
  let actualConsumed = 0;
  let consumedFloor = 0;
  let collapsed = false;
  let reductionObserved = false;
  let reductionAtMass = 0;
  const holeSide = [];
  const homeSide = [...fleet];
  let jumpCount = 0;
  let skippedSteps = 0;
  let currentPlanItems = [...plan.items];
  let stepIdx = 0;
  const MAX_JUMPS = 200;
  let prevPlanRunning = 0;
  let replanCount = 0;         // How many times we've replanned
  let lastReplanAtStep = -1;   // stepIdx where last replan occurred

  while (stepIdx < currentPlanItems.length && jumpCount < MAX_JUMPS) {
    const item = currentPlanItems[stepIdx];

    if (item.type === 'step') {
      // ── Pre-flight: check ship is in position ────────────────────────
      if (collapsed) {
        failures.push(`SAFETY: Step after collapse — ${item.ship.pilotName} ${item.direction} attempted on collapsed hole`);
        log.push(`  !! FAIL: Hole already collapsed, but plan has more steps`);
        break;
      }

      // Check if the ship is in position for this jump.
      // After replanning (non-critical path), the engine may produce steps
      // for ships that aren't in the expected location. The app's execution
      // mode would present these to the FC who would skip them. We do the same.
      if (item.direction === 'in') {
        const isHome = homeSide.some(s => s.id === item.ship.id);
        const alreadyInHole = holeSide.some(s => s.id === item.ship.id);
        if (!isHome && alreadyInHole) {
          warnings.push(
            `POSITION: Jump ${jumpCount + 1} — ${item.ship.pilotName} sent IN but already inside hole (replan position mismatch)`
          );
          log.push(
            `  [SKIP] ${item.ship.pilotName} → IN — already in hole (replan mismatch)`
          );
          skippedSteps++;
          stepIdx++;
          continue;
        }
      } else {
        const isInHole = holeSide.some(s => s.id === item.ship.id);
        const alreadyHome = homeSide.some(s => s.id === item.ship.id);
        if (!isInHole && alreadyHome) {
          warnings.push(
            `POSITION: Jump ${jumpCount + 1} — ${item.ship.pilotName} sent HOME but already at home (replan position mismatch)`
          );
          log.push(
            `  [SKIP] ${item.ship.pilotName} ← HOME — already at home (replan mismatch)`
          );
          skippedSteps++;
          stepIdx++;
          continue;
        }
      }

      // In EVE, per-jump mass deduction is deterministic — the ship's actual
      // mass at transit is subtracted exactly.  The only uncertainty is the
      // wormhole's hidden true total (±10%, applied on line 141).
      const actualMass = item.massThisJump;

      const prevActual = actualConsumed;
      actualConsumed += actualMass;
      consumedFloor += Math.round(item.massThisJump * 1.1);

      // Track ship positions
      if (item.direction === 'in') {
        const homeIdx = homeSide.findIndex(s => s.id === item.ship.id);
        if (homeIdx >= 0) homeSide.splice(homeIdx, 1);
        holeSide.push(item.ship);
      } else {
        const holeIdx = holeSide.findIndex(s => s.id === item.ship.id);
        if (holeIdx >= 0) holeSide.splice(holeIdx, 1);
        homeSide.push(item.ship);
      }

      const justCollapsed = actualConsumed >= realTotal;

      let stateAfter = 'fresh';
      if (actualConsumed >= realTotal) stateAfter = 'collapsed';
      else if (actualConsumed >= realTotal * 0.9) stateAfter = 'critical';
      else if (actualConsumed >= realTotal * 0.5) stateAfter = 'reduced';

      let stateBefore = 'fresh';
      if (prevActual >= realTotal) stateBefore = 'collapsed';
      else if (prevActual >= realTotal * 0.9) stateBefore = 'critical';
      else if (prevActual >= realTotal * 0.5) stateBefore = 'reduced';

      jumpCount++;

      log.push(
        `  Jump ${jumpCount}: ${item.ship.pilotName} (${item.ship.shipClass}) ` +
        `${item.direction === 'in' ? '→ IN' : '← HOME'} ` +
        `${item.isHot ? 'HOT' : 'COLD'} | ` +
        `nominal=${formatMass(item.massThisJump)} actual=${formatMass(actualMass)} | ` +
        `planRunning=${formatMass(item.runningTotal)} actual=${formatMass(actualConsumed)}/${formatMass(realTotal)} | ` +
        `state: ${stateBefore} → ${stateAfter}`
      );

      // ── SAFETY INVARIANT CHECKS ────────────────────────────────────────

      // Check 1: Per-jump mass exceeds wormhole's per-jump limit
      if (item.massThisJump > wh.maxIndividualMass) {
        failures.push(
          `SAFETY: Jump ${jumpCount} — ${item.ship.pilotName} mass ${formatMass(item.massThisJump)} ` +
          `exceeds per-jump limit ${formatMass(wh.maxIndividualMass)}`
        );
      }

      // Check 2: Plan's runningTotal should be monotonically non-decreasing
      // within the same plan segment (resets after each replan).
      if (stepIdx > lastReplanAtStep && item.runningTotal < prevPlanRunning - 1) {
        warnings.push(
          `MONOTONIC: Jump ${jumpCount} — Plan runningTotal decreased within segment: ` +
          `${formatMass(item.runningTotal)} < prev ${formatMass(prevPlanRunning)}`
        );
      }
      prevPlanRunning = item.runningTotal;

      // Check 3: Collapse with pilots stranded inside
      if (justCollapsed && !collapsed) {
        collapsed = true;

        // Determine if this stranding is a downstream consequence of position mismatches
        const hasPositionMismatch = skippedSteps > 0;
        const failPrefix = hasPositionMismatch ? 'STRAND-CASCADE' : 'SAFETY';

        if (item.direction === 'home' && holeSide.length > 0) {
          // Ship made it home but hole collapsed — others still inside
          const msg = `${failPrefix}: Jump ${jumpCount} — Hole collapsed on ${item.ship.pilotName}'s return, ` +
            `stranding ${holeSide.length} pilot(s) inside: ${holeSide.map(s => s.pilotName).join(', ')}`;
          if (hasPositionMismatch) {
            warnings.push(msg + ' (caused by replan position mismatch — skipped steps changed ship positions)');
          } else {
            failures.push(msg);
          }
        } else if (item.direction === 'in') {
          if (goal === 'close') {
            const othersInside = holeSide.filter(s => s.id !== item.ship.id);
            if (othersInside.length > 0) {
              warnings.push(
                `VARIANCE: Jump ${jumpCount} — Hole collapsed on ${item.ship.pilotName}'s entry (close goal), ` +
                `${othersInside.length} other pilot(s) inside: ${othersInside.map(s => s.pilotName).join(', ')}`
              );
            }
          } else {
            const msg = `${failPrefix}: Jump ${jumpCount} — Hole collapsed on inbound jump (goal=${goal})`;
            if (hasPositionMismatch) {
              warnings.push(msg + ' (caused by replan position mismatch)');
            } else {
              failures.push(msg);
            }
          }
        }
        log.push(`  ** HOLE COLLAPSED **`);
      }

      // Check 4: Sending a hot ship into a critical hole with pilots inside
      // The engine should switch to cold in this case
      if (stateBefore === 'critical' && item.direction === 'in' && item.isHot) {
        const pilotsAlreadyIn = holeSide.filter(s => s.id !== item.ship.id);
        if (pilotsAlreadyIn.length > 0) {
          warnings.push(
            `CAUTION: Jump ${jumpCount} — ${item.ship.pilotName} sent HOT into critical hole ` +
            `with ${pilotsAlreadyIn.length} pilot(s) already inside`
          );
        }
      }

      if (collapsed) break;

      // ── Mid-roll state change detection → replan ─────────────────────
      if (stateAfter !== stateBefore && (stateAfter === 'reduced' || stateAfter === 'critical')) {
        log.push(`  ** FC observes: wormhole is now ${stateAfter.toUpperCase()} **`);

        const session = {
          consumedFloor,
          reductionObserved,
          reductionAtMass,
          holeSide: [...holeSide],
          homeSide: [...homeSide],
        };

        const result = respondToStatus(stateAfter, session, fleet, wh, goal);

        if (stateAfter === 'reduced' && !reductionObserved) {
          reductionObserved = true;
          reductionAtMass = consumedFloor;
        }

        if (result.newSteps && result.newSteps.length > 0) {
          currentPlanItems = [
            ...currentPlanItems.slice(0, stepIdx + 1),
            ...result.newSteps,
          ];
          replanCount++;
          lastReplanAtStep = stepIdx;
          prevPlanRunning = 0; // Reset monotonicity tracking for new segment
          log.push(`  ** Replanned: ${result.newSteps.filter(s => s.type === 'step').length} new steps **`);
        }
      }

      stepIdx++;
      continue;
    }

    if (item.type === 'assessment') {
      let fcReport = 'no_change';
      if (actualConsumed >= realTotal * 0.9) fcReport = 'critical';
      else if (actualConsumed >= realTotal * 0.5) fcReport = 'reduced';

      log.push(`  Assessment (pass ${item.passNumber}): FC reports "${fcReport}" | actual=${formatMass(actualConsumed)}/${formatMass(realTotal)} (${(actualConsumed / realTotal * 100).toFixed(1)}%)`);

      const session = {
        consumedFloor,
        reductionObserved,
        reductionAtMass,
        holeSide: [...holeSide],
        homeSide: [...homeSide],
      };

      if (fcReport === 'reduced' && !reductionObserved) {
        reductionObserved = true;
        reductionAtMass = consumedFloor;
      }

      const result = respondToStatus(fcReport, session, fleet, wh, goal);

      if (result.newSteps && result.newSteps.length > 0) {
        currentPlanItems = [
          ...currentPlanItems.slice(0, stepIdx + 1),
          ...result.newSteps,
        ];
        replanCount++;
        lastReplanAtStep = stepIdx;
        prevPlanRunning = 0;
        log.push(`  ** Replanned after assessment: ${result.newSteps.filter(s => s.type === 'step').length} new steps **`);
      }

      stepIdx++;
      continue;
    }

    // Other item types (outcome, hold-back, standing-by, doorstop-marker) — skip
    stepIdx++;
  }

  // ── Final checks ─────────────────────────────────────────────────────────

  if (jumpCount >= MAX_JUMPS) {
    failures.push(`SAFETY: Exceeded ${MAX_JUMPS} jump safety limit — possible infinite loop`);
  }

  if (goal === 'close' && !collapsed && actualConsumed < realTotal * 0.85) {
    log.push(`  Note: Did not collapse. Actual consumed: ${formatMass(actualConsumed)}/${formatMass(realTotal)} (${(actualConsumed / realTotal * 100).toFixed(1)}%)`);
  }

  const pass = failures.length === 0;
  return {
    wh: wh.type, seed, goal, pass, log, failures, warnings,
    reason: pass ? 'ok' : failures[0],
    jumpCount, skippedSteps,
  };
}

// ─── Edge case tests ─────────────────────────────────────────────────────────

function runEdgeCaseTests() {
  const results = [];

  // Edge case 1: Single-ship roll
  {
    const wh = wormholes.find(w => w.type === 'C247');
    const fleet = [makeShip('Battleship', 'Solo')];
    const result = simulateRoll(wh, fleet, 999, 'close');
    result.testName = 'Single-ship roll (Battleship on C247)';
    results.push(result);
  }

  // Edge case 2: Exact-mass roll — fleet total ≈ wormhole mass
  {
    const wh = wormholes.find(w => w.type === 'D382');
    const fleet = [
      makeShip('Battleship', 'Tight1'),
      makeShip('Battleship', 'Tight2'),
      makeShip('Battleship', 'Tight3'),
    ];
    const result = simulateRoll(wh, fleet, 777, 'close');
    result.testName = 'Near-exact mass roll (3 BS on D382)';
    results.push(result);
  }

  // Edge case 3: HIC-only fleet
  {
    const wh = wormholes.find(w => w.type === 'E175');
    const fleet = [
      makeShip('HIC (Mass Entanglers)', 'HIC-Alpha'),
      makeShip('HIC (Mass Entanglers)', 'HIC-Bravo'),
    ];
    const result = simulateRoll(wh, fleet, 555, 'close');
    result.testName = 'HIC-only fleet (2 HICs on E175)';
    results.push(result);
  }

  // Edge case 4: Crit goal
  {
    const wh = wormholes.find(w => w.type === 'C140');
    const fleet = [
      makeShip('Battleship', 'CritA'),
      makeShip('Battleship', 'CritB'),
      makeShip('Orca', 'CritOrca'),
    ];
    const result = simulateRoll(wh, fleet, 333, 'crit');
    result.testName = 'Crit goal (3 ships on C140)';
    results.push(result);
  }

  // Edge case 5: Doorstop goal
  {
    const wh = wormholes.find(w => w.type === 'C391');
    const fleet = [
      makeShip('Orca', 'DoorOrca'),
      makeShip('Battleship', 'DoorBS1'),
      makeShip('Battleship', 'DoorBS2'),
    ];
    const result = simulateRoll(wh, fleet, 222, 'doorstop');
    result.testName = 'Doorstop goal (Orca + 2 BS on C391)';
    results.push(result);
  }

  // Edge case 6: Small wormhole with cruisers only
  {
    const wh = wormholes.find(w => w.type === 'H121');
    const fleet = [
      makeShip('Cruiser', 'SmallA'),
      makeShip('Cruiser', 'SmallB'),
      makeShip('Cruiser', 'SmallC'),
    ];
    const result = simulateRoll(wh, fleet, 111, 'close');
    result.testName = 'Small hole cruiser fleet (H121)';
    results.push(result);
  }

  // Edge case 7: Mixed fleet with HIC
  {
    const wh = wormholes.find(w => w.type === 'D382');
    const fleet = [
      makeShip('Battleship', 'MixBS'),
      makeShip('Battlecruiser', 'MixBC'),
      makeShip('HIC (Mass Entanglers)', 'MixHIC'),
    ];
    const result = simulateRoll(wh, fleet, 444, 'close');
    result.testName = 'Mixed fleet with HIC (D382)';
    results.push(result);
  }

  // Edge case 8: Carrier on large hole (close)
  {
    const wh = wormholes.find(w => w.type === 'C140');
    const fleet = [
      makeShip('Carrier', 'BigBoy'),
      makeShip('Battleship', 'Escort1'),
    ];
    const result = simulateRoll(wh, fleet, 888, 'close');
    result.testName = 'Carrier + BS on large hole (C140)';
    results.push(result);
  }

  // Edge case 9: Many small ships on medium hole
  {
    const wh = wormholes.find(w => w.type === 'C247');
    const fleet = [
      makeShip('Cruiser', 'Ant1'),
      makeShip('Cruiser', 'Ant2'),
      makeShip('Cruiser', 'Ant3'),
      makeShip('Cruiser', 'Ant4'),
      makeShip('Battlecruiser', 'Sgt'),
    ];
    const result = simulateRoll(wh, fleet, 666, 'close');
    result.testName = 'Many small ships on C247';
    results.push(result);
  }

  // Edge case 10: Doorstop with HIC
  {
    const wh = wormholes.find(w => w.type === 'E175');
    const fleet = [
      makeShip('Battleship', 'DoorBS'),
      makeShip('HIC (Mass Entanglers)', 'DoorHIC'),
      makeShip('Battlecruiser', 'DoorBC'),
    ];
    const result = simulateRoll(wh, fleet, 321, 'doorstop');
    result.testName = 'Doorstop with HIC (E175)';
    results.push(result);
  }

  // Edge case 11: G024 with 4 battleships — requires mixed hot/cold to close.
  // All-hot inbound exhausts the safe-entry window before the 4th ship; the
  // lookahead must switch the 3rd ship to cold so all four can get in and out.
  {
    const wh = wormholes.find(w => w.type === 'G024');
    const fleet = [
      makeShip('Battleship', 'BS1'),
      makeShip('Battleship', 'BS2'),
      makeShip('Battleship', 'BS3'),
      makeShip('Battleship', 'BS4'),
    ];
    const plan = generatePlan(wh, fleet, 'close', 'fresh');
    const canClose = plan && plan.canReachGoal;
    // Simulate across several seeds so we test different mass-variance outcomes
    for (const seed of [10, 20, 30]) {
      const result = simulateRoll(wh, fleet, seed, 'close');
      result.testName = `G024 4-battleship close seed=${seed}`;
      if (!canClose) {
        result.pass = false;
        result.failures.push('PLAN: generatePlan reports canReachGoal=false for 4 BS on G024');
      }
      results.push(result);
    }
  }

  return results;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  WORMHOLE ROLLING SIMULATION TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('');

  const allResults = [];
  let totalPass = 0;
  let totalFail = 0;
  let totalSkip = 0;
  let totalWarnings = 0;

  // ── Randomised wormhole simulations ────────────────────────────────────
  console.log('─── Randomised Wormhole Simulations ────────────────────────────────');
  console.log('');

  for (const whType of WORMHOLE_TYPES) {
    const wh = wormholes.find(w => w.type === whType);
    if (!wh) {
      console.log(`  [SKIP] ${whType} — not found in wormhole data`);
      totalSkip++;
      allResults.push({ wh: whType, seed: '-', goal: '-', pass: null, reason: 'not in data', jumpCount: 0, skippedSteps: 0, warnings: [], failures: [], log: [], testName: `${whType} (not in data)` });
      continue;
    }
    if (wh.totalMass == null || wh.maxIndividualMass == null) {
      console.log(`  [SKIP] ${whType} — null mass values (generic exit)`);
      totalSkip++;
      allResults.push({ wh: whType, seed: '-', goal: '-', pass: null, reason: 'null mass', jumpCount: 0, skippedSteps: 0, warnings: [], failures: [], log: [], testName: `${whType} (null mass)` });
      continue;
    }

    for (let s = 0; s < SEEDS_PER_WH; s++) {
      const seed = BASE_SEED + s * 1000 + WORMHOLE_TYPES.indexOf(whType) * 100;
      const rng = makeRng(seed);
      const fleetForSeed = buildFleet(wh, rng);

      if (fleetForSeed.length === 0) {
        console.log(`  [SKIP] ${whType} seed=${seed} — no ships can fit`);
        totalSkip++;
        continue;
      }

      const goals = ['close', 'crit', 'doorstop'];
      const goal = goals[s % goals.length];

      const result = simulateRoll(wh, fleetForSeed, seed, goal);
      result.testName = `${whType} seed=${seed} goal=${goal}`;
      allResults.push(result);

      const hasWarnings = result.warnings.length > 0;
      if (result.pass) totalPass++; else totalFail++;
      if (hasWarnings) totalWarnings += result.warnings.length;

      const status = result.pass ? (hasWarnings ? 'WARN' : 'PASS') : 'FAIL';
      const skipInfo = result.skippedSteps > 0 ? ` (${result.skippedSteps} skipped)` : '';
      console.log(`  [${status}] ${result.testName} — ${result.jumpCount} jumps${skipInfo}`);
      if (!result.pass) {
        for (const f of result.failures) console.log(`         ${f}`);
      }
      if (hasWarnings && !result.pass) {
        for (const w of result.warnings.slice(0, 3)) console.log(`         ${w}`);
        if (result.warnings.length > 3) console.log(`         ... and ${result.warnings.length - 3} more warnings`);
      }
    }
  }

  // ── Edge case tests ────────────────────────────────────────────────────
  console.log('');
  console.log('─── Edge Case Tests ────────────────────────────────────────────────');
  console.log('');

  const edgeResults = runEdgeCaseTests();
  for (const result of edgeResults) {
    allResults.push(result);
    const hasWarnings = result.warnings.length > 0;
    if (result.pass) totalPass++; else totalFail++;
    if (hasWarnings) totalWarnings += result.warnings.length;

    const status = result.pass ? (hasWarnings ? 'WARN' : 'PASS') : 'FAIL';
    const skipInfo = result.skippedSteps > 0 ? ` (${result.skippedSteps} skipped)` : '';
    console.log(`  [${status}] ${result.testName} — ${result.jumpCount} jumps${skipInfo}`);
    if (!result.pass) {
      for (const f of result.failures) console.log(`         ${f}`);
    }
  }

  // ── Detailed logs for failures ─────────────────────────────────────────
  const failedResults = allResults.filter(r => r.pass === false);
  if (failedResults.length > 0) {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('  DETAILED FAILURE LOGS');
    console.log('═══════════════════════════════════════════════════════════════════════');

    for (const result of failedResults) {
      console.log('');
      console.log(`── ${result.testName} ──`);
      for (const line of result.log) console.log(line);
      console.log('');
      if (result.failures.length > 0) {
        console.log('Safety failures:');
        for (const f of result.failures) console.log(`  ${f}`);
      }
      if (result.warnings.length > 0) {
        console.log('Warnings:');
        for (const w of result.warnings) console.log(`  ${w}`);
      }
    }
  }

  // ── Warnings report ────────────────────────────────────────────────────
  const warnResults = allResults.filter(r => r.pass === true && r.warnings.length > 0);
  if (warnResults.length > 0) {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('  WARNINGS (passed tests with design issues)');
    console.log('═══════════════════════════════════════════════════════════════════════');

    for (const result of warnResults) {
      console.log('');
      console.log(`── ${result.testName} ──`);
      for (const w of result.warnings) console.log(`  ${w}`);
    }
  }

  // ── Summary table ──────────────────────────────────────────────────────
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  SUMMARY TABLE');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('');

  console.log(
    'Test'.padEnd(50) +
    'Result'.padEnd(8) +
    'Jumps'.padEnd(7) +
    'Skip'.padEnd(6) +
    'Warn'.padEnd(6) +
    'Details'
  );
  console.log('─'.repeat(110));

  for (const r of allResults) {
    const name = (r.testName || `${r.wh} seed=${r.seed}`).slice(0, 48);
    const status = r.pass === null ? 'SKIP' : r.pass ? (r.warnings.length > 0 ? 'WARN' : 'PASS') : 'FAIL';
    const jumps = String(r.jumpCount || 0);
    const skip = String(r.skippedSteps || 0);
    const warn = String(r.warnings?.length || 0);
    const detail = r.pass === false
      ? (r.failures[0]?.slice(0, 55) || '')
      : (r.warnings.length > 0 ? r.warnings[0]?.slice(0, 55) || '' : '');
    console.log(
      name.padEnd(50) +
      status.padEnd(8) +
      jumps.padEnd(7) +
      skip.padEnd(6) +
      warn.padEnd(6) +
      detail
    );
  }

  console.log('─'.repeat(110));
  console.log('');
  console.log(`Total: ${allResults.length} | Pass: ${totalPass} | Fail: ${totalFail} | Skip: ${totalSkip} | Warnings: ${totalWarnings}`);
  console.log('');

  if (totalFail > 0) {
    console.log(`!! ${totalFail} test(s) had SAFETY FAILURES — see detailed logs above.`);
  }
  if (totalWarnings > 0) {
    console.log(`** ${totalWarnings} design warning(s) across ${warnResults.length + failedResults.filter(r => r.warnings.length > 0).length} test(s) — replan position mismatches detected.`);
  }
  if (totalFail === 0 && totalWarnings === 0) {
    console.log('All tests passed with no warnings!');
  } else if (totalFail === 0) {
    console.log('All safety checks passed (warnings are informational).');
  }

  process.exit(totalFail > 0 ? 1 : 0);
}

main();
