import { wormholes } from './data/wormholes.js';

const JumpMass = {
  Battleship: { cold: 200_000, hot: 300_000 },
  Cruiser:    { cold:  36_000, hot: 126_000 },
  HIC:        { cold:     830, hot: 132_400 },
};

const STATUS_MAX  = { stable: 1.0, unstable: 0.5, critical: 0.1 };
const GOAL_TARGET = { crit: 0.1, close: 0.0 };

function init() {
  const datalist = document.getElementById('wormhole-list');
  wormholes.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w.type;
    datalist.appendChild(opt);
  });
  document.getElementById('wormhole-input').addEventListener('input',  onWHInput);
  document.getElementById('wormhole-input').addEventListener('change', onWHInput);
  document.getElementById('wormhole-goal').addEventListener('change',  onGoalChange);
  document.getElementById('use-doorstop').addEventListener('change',   onDoorstopToggle);
  document.getElementById('calc-btn').addEventListener('click', onCalculate);
}

function onWHInput() {
  const val = document.getElementById('wormhole-input').value.trim().toUpperCase();
  const w   = wormholes.find(w => w.type === val);
  document.getElementById('wormhole-details').classList.toggle('hidden', !w);
  document.getElementById('plan-output').innerHTML = '';
  if (w) {
    document.getElementById('wormhole-info').textContent =
      `${w.from || '?'} → ${w.to || '?'} | Total: ${w.totalMass.toLocaleString()} t | Max individual: ${w.maxIndividualMass.toLocaleString()} t`;
  }
}

function onGoalChange() {
  const isCrit = document.getElementById('wormhole-goal').value === 'crit';
  document.getElementById('doorstop-section').classList.toggle('hidden', !isCrit);
  if (!isCrit) {
    document.getElementById('use-doorstop').checked = false;
    document.getElementById('doorstop-ship-wrap').classList.add('hidden');
  }
}

function onDoorstopToggle() {
  const checked = document.getElementById('use-doorstop').checked;
  document.getElementById('doorstop-ship-wrap').classList.toggle('hidden', !checked);
}

function getFleet() {
  return {
    Battleship: parseInt(document.getElementById('fleet-battleship').value) || 0,
    Cruiser:    parseInt(document.getElementById('fleet-cruiser').value)    || 0,
    HIC:        parseInt(document.getElementById('fleet-hic').value)        || 0,
  };
}

/**
 * Given a mass target, assign each ship's two legs (out + back) as cold or hot
 * to consume as close to targetMass as possible without going under.
 *
 * Strategy: start all cold-cold (minimum), then greedily upgrade individual
 * legs cold→hot (largest gain first) until we reach the target.
 *
 * Each ship can be in one of three states:
 *   cc = both legs cold  (2 × cold)
 *   ch = one leg cold + one leg hot  (cold + hot)
 *   hh = both legs hot  (2 × hot)
 */
function assignJumps(validFleet, targetMass) {
  const assignments = {};
  let currentMass = 0;

  for (const [type, count] of Object.entries(validFleet)) {
    assignments[type] = { cc: count, ch: 0, hh: 0 };
    currentMass += count * 2 * JumpMass[type].cold;
  }

  if (currentMass >= targetMass) {
    return { assignments, actualMass: currentMass };
  }

  // Each ship has 2 legs; each upgrade swaps one cold leg to hot
  const upgrades = [];
  for (const type of Object.keys(validFleet)) {
    const gain = JumpMass[type].hot - JumpMass[type].cold;
    for (let i = 0; i < validFleet[type] * 2; i++) {
      upgrades.push({ type, gain });
    }
  }
  upgrades.sort((a, b) => b.gain - a.gain);

  for (const upg of upgrades) {
    if (currentMass >= targetMass) break;
    currentMass += upg.gain;
    const asgn = assignments[upg.type];
    if (asgn.cc > 0) {
      asgn.cc--;
      asgn.ch++;   // CC → CH
    } else if (asgn.ch > 0) {
      asgn.ch--;
      asgn.hh++;   // CH → HH
    }
  }

  return { assignments, actualMass: currentMass };
}

function renderAssignmentRows(validFleet, assignments) {
  let html = '';
  for (const [type, asgn] of Object.entries(assignments)) {
    if (!validFleet[type]) continue;
    const m = JumpMass[type];
    if (asgn.cc > 0) {
      html += `<li>${asgn.cc}× ${type} — COLD out + COLD back = ${fmt(2 * m.cold)} t each (${fmt(asgn.cc * 2 * m.cold)} t)</li>`;
    }
    if (asgn.ch > 0) {
      html += `<li>${asgn.ch}× ${type} — one leg COLD + one leg HOT = ${fmt(m.cold + m.hot)} t each (${fmt(asgn.ch * (m.cold + m.hot))} t)</li>`;
    }
    if (asgn.hh > 0) {
      html += `<li>${asgn.hh}× ${type} — HOT out + HOT back = ${fmt(2 * m.hot)} t each (${fmt(asgn.hh * 2 * m.hot)} t)</li>`;
    }
  }
  return html;
}

function onCalculate() {
  const val    = document.getElementById('wormhole-input').value.trim().toUpperCase();
  const w      = wormholes.find(wh => wh.type === val);
  const status = document.getElementById('wormhole-status').value;
  const goal   = document.getElementById('wormhole-goal').value;
  const fleet  = getFleet();
  const output = document.getElementById('plan-output');

  const useDoorstop  = goal === 'crit' && document.getElementById('use-doorstop').checked;
  const doorstopType = useDoorstop ? document.getElementById('doorstop-ship').value : null;

  if (!w) {
    output.innerHTML = '<div class="plan-box warning">❗ Select a valid wormhole first.</div>';
    return;
  }
  if (Object.values(fleet).every(n => n === 0)) {
    output.innerHTML = '<div class="plan-box warning">❗ Add at least one ship to your fleet.</div>';
    return;
  }

  // Separate valid ships from oversized ones
  const oversized  = [];
  const validFleet = {};
  for (const [type, count] of Object.entries(fleet)) {
    if (count <= 0) continue;
    const m = JumpMass[type];
    if (m.cold > w.maxIndividualMass || m.hot > w.maxIndividualMass) {
      oversized.push(type);
    } else {
      validFleet[type] = count;
    }
  }

  if (Object.keys(validFleet).length === 0) {
    output.innerHTML = `<div class="plan-box warning">⚠️ None of your ships fit this wormhole (max individual: ${w.maxIndividualMass.toLocaleString()} t).</div>`;
    return;
  }

  let doorstopError = '';
  if (useDoorstop && doorstopType) {
    if (JumpMass[doorstopType].cold > w.maxIndividualMass) {
      doorstopError = `⚠️ Doorstop ${doorstopType} (cold ${JumpMass[doorstopType].cold.toLocaleString()} t) exceeds max individual mass (${w.maxIndividualMass.toLocaleString()} t).`;
    }
  }

  const startMass    = w.totalMass * STATUS_MAX[status];
  const critMass     = w.totalMass * 0.10;
  const goalMass     = w.totalMass * GOAL_TARGET[goal];
  const doorstopCold = (useDoorstop && doorstopType && !doorstopError) ? JumpMass[doorstopType].cold : 0;

  // Round trips target: leave room for doorstop cold jump if using one
  const roundTripTarget   = (useDoorstop && !doorstopError) ? critMass + doorstopCold : goalMass;
  const massForRoundTrips = Math.max(0, startMass - roundTripTarget);

  // Full passes use standard cold+hot per ship (familiar EVE rolling pattern)
  const massPerPassCH = Object.entries(validFleet).reduce(
    (sum, [type, count]) => sum + count * (JumpMass[type].cold + JumpMass[type].hot), 0
  );

  const fullPasses = Math.floor(massForRoundTrips / massPerPassCH);
  let   remaining  = startMass - fullPasses * massPerPassCH;

  // Partial pass: use assignJumps to optimise cold/hot per leg to hit the target
  const partialMassNeeded = remaining - roundTripTarget;
  let   partialResult     = null;
  if (partialMassNeeded > 0) {
    partialResult = assignJumps(validFleet, partialMassNeeded);
    remaining -= partialResult.actualMass;
  }

  // Doorstop cold jump
  const afterDoorstop = (useDoorstop && !doorstopError)
    ? Math.max(0, remaining - doorstopCold)
    : remaining;

  // ── Build output ──
  let stepNum = 0;
  let html = `<div class="plan-box">
    <h3>${w.type} — ${capitalize(status)} → ${goal === 'crit' ? 'Crit' : 'Close'}</h3>
    <div class="plan-stats">
      <span>Start (worst case): <strong>${fmt(startMass)} t</strong></span>
      <span>Goal: <strong>≤ ${fmt(goalMass)} t (${(GOAL_TARGET[goal] * 100).toFixed(0)}%)</strong></span>
      <span>To consume: <strong>${fmt(Math.max(0, startMass - goalMass))} t</strong></span>
    </div>`;

  if (oversized.length) {
    html += `<p class="warn-text">⚠️ ${oversized.join(', ')} excluded — exceed max individual mass (${w.maxIndividualMass.toLocaleString()} t).</p>`;
  }
  if (doorstopError) html += `<p class="warn-text">${doorstopError}</p>`;

  if (fullPasses === 0 && !partialResult) {
    html += `<p class="warn-text">⚠️ Wormhole is already at or below the target mass.</p>`;
  }

  // Step: full passes (all ships cold out + hot back)
  if (fullPasses > 0) {
    stepNum++;
    const afterFull = startMass - fullPasses * massPerPassCH;
    html += `<div class="pass full-pass">
      <div class="pass-title">Step ${stepNum} — Full Fleet × ${fullPasses} Pass${fullPasses !== 1 ? 'es' : ''}</div>
      <ul>`;
    for (const [type, count] of Object.entries(validFleet)) {
      const perShip = JumpMass[type].cold + JumpMass[type].hot;
      html += `<li>${count}× ${type} — COLD out + HOT back = ${fmt(perShip)} t each (${fmt(count * perShip)} t)</li>`;
    }
    html += `<li><strong>Per pass: ${fmt(massPerPassCH)} t × ${fullPasses} = ${fmt(fullPasses * massPerPassCH)} t consumed</strong></li>
      </ul>
      <p class="mass-note">After all full passes: <strong>${fmt(afterFull)} t</strong> remaining (${pct(afterFull, w.totalMass)}%)</p>
    </div>`;
  }

  // Step: partial pass (calibrated cold/hot per leg)
  if (partialResult) {
    stepNum++;
    html += `<div class="pass partial-pass">
      <div class="pass-title">Step ${stepNum} — Calibrated Pass</div>
      <ul>
        ${renderAssignmentRows(validFleet, partialResult.assignments)}
        <li><strong>Total this pass: ${fmt(partialResult.actualMass)} t consumed</strong></li>
      </ul>
      <p class="mass-note">After this pass: <strong>${fmt(remaining)} t</strong> remaining (${pct(remaining, w.totalMass)}%)</p>
    </div>`;
  }

  // Step: doorstop
  if (useDoorstop && doorstopType && !doorstopError) {
    stepNum++;
    const collapseOnReturn = doorstopCold >= afterDoorstop;
    html += `<div class="pass doorstop-pass">
      <div class="pass-title">Step ${stepNum} — Doorstop (${doorstopType})</div>
      <p>1× ${doorstopType} jumps <strong>COLD in</strong> and stays on the far side. All other ships have already returned.</p>
      <p class="mass-note">After doorstop: <strong>${fmt(afterDoorstop)} t</strong> remaining (${pct(afterDoorstop, w.totalMass)}%) — wormhole is now critical.</p>
      <p class="doorstop-close"><strong>To close:</strong> when ready, the doorstop ${doorstopType} jumps COLD back to the origin side.</p>
      ${collapseOnReturn
        ? `<p class="success-text">✅ Its cold return (${fmt(doorstopCold)} t) will collapse the wormhole.</p>`
        : `<p class="warn-text">⚠️ Its cold return (${fmt(doorstopCold)} t) alone may not collapse the wormhole (${fmt(afterDoorstop)} t remaining). You may need one more ship to assist.</p>`
      }
    </div>`;
  }

  // Final summary
  const finalMass   = (useDoorstop && !doorstopError) ? afterDoorstop : remaining;
  const goalReached = finalMass <= goalMass;

  html += `<div class="final-result ${goalReached ? 'success' : 'warning'}">
    <strong>Wormhole after plan: ${fmt(Math.max(0, finalMass))} t (${pct(Math.max(0, finalMass), w.totalMass)}%)</strong>`;

  if (!useDoorstop) {
    if (finalMass <= 0 && goal === 'close') {
      html += `<p>✅ Wormhole will collapse.</p>`;
    } else if (goalReached && goal === 'crit') {
      html += `<p>✅ Wormhole in critical state — ready for final collapse.</p>`;
    } else if (finalMass <= 0 && goal === 'crit') {
      html += `<p>⚠️ Plan may accidentally collapse the wormhole. Reduce the calibrated pass by one ship.</p>`;
    }
  }

  html += `</div></div>`;
  output.innerHTML = html;
}

function fmt(n)       { return Math.round(n).toLocaleString(); }
function pct(n, total){ return (Math.max(0, n) / total * 100).toFixed(1); }
function capitalize(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

init();
