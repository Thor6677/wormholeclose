import { wormholes } from './data/wormholes.js';

const JumpMass = {
  Battleship: { cold: 200_000, hot: 300_000 },
  Cruiser:    { cold:  36_000, hot: 126_000 },
  HIC:        { cold:     830, hot: 132_400 },
  Custom:     { cold:       0, hot:       0 },
};

// Worst-case starting mass fraction per status
const STATUS_MAX = { stable: 1.0, unstable: 0.5, critical: 0.1 };

// Target remaining mass fraction per goal
// 'doorstop' uses same target as 'crit' — rolling stops at crit, then doorstop handles close
const GOAL_TARGET = { crit: 0.1, close: 0.0, doorstop: 0.1 };

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
  document.getElementById('fleet-custom').addEventListener('input',    onCustomCount);
  document.getElementById('calc-btn').addEventListener('click', onCalculate);
}

function onWHInput() {
  const val   = document.getElementById('wormhole-input').value.trim().toUpperCase();
  const w     = wormholes.find(w => w.type === val);
  const valid = w && w.totalMass !== null;
  document.getElementById('wormhole-details').classList.toggle('hidden', !valid);
  document.getElementById('plan-output').innerHTML = '';
  if (valid) {
    document.getElementById('wormhole-info').textContent =
      `${w.from || '?'} → ${w.to || '?'} | Total: ${w.totalMass.toLocaleString()} t | Max individual: ${w.maxIndividualMass.toLocaleString()} t`;
  }
}

function onGoalChange() {
  const goal = document.getElementById('wormhole-goal').value;
  document.getElementById('doorstop-section').classList.toggle('hidden', goal !== 'doorstop');
}

function onCustomCount() {
  const count = parseInt(document.getElementById('fleet-custom').value) || 0;
  document.getElementById('custom-mass-row').classList.toggle('hidden', count === 0);
}

function getFleet() {
  const customCold = parseInt(document.getElementById('custom-cold').value) || 0;
  const customHot  = parseInt(document.getElementById('custom-hot').value)  || 0;
  JumpMass.Custom = { cold: customCold, hot: customHot };

  return {
    Battleship: parseInt(document.getElementById('fleet-battleship').value) || 0,
    Cruiser:    parseInt(document.getElementById('fleet-cruiser').value)    || 0,
    HIC:        parseInt(document.getElementById('fleet-hic').value)        || 0,
    Custom:     parseInt(document.getElementById('fleet-custom').value)     || 0,
  };
}

/**
 * Assign the minimum number of ships and the best cold/hot leg combination
 * to consume at least targetMass tonnes.
 *
 * Adds ships largest-per-trip first (for efficiency), starting each at
 * cold-cold (minimum), then upgrades individual legs cold→hot until target reached.
 */
function assignJumps(validFleet, targetMass) {
  const types = Object.keys(validFleet).sort(
    (a, b) => (JumpMass[b].cold + JumpMass[b].hot) - (JumpMass[a].cold + JumpMass[a].hot)
  );

  const used = {};
  let currentMass = 0;

  // Add ships one at a time (largest first), each starting at CC
  outer: for (const type of types) {
    for (let i = 0; i < validFleet[type]; i++) {
      if (currentMass >= targetMass) break outer;
      if (!used[type]) used[type] = { cc: 0, ch: 0, hh: 0 };
      used[type].cc++;
      currentMass += 2 * JumpMass[type].cold;
    }
  }

  // Upgrade legs cold→hot (largest gain first) to fine-tune toward target
  const upgrades = [];
  for (const [type, asgn] of Object.entries(used)) {
    const gain  = JumpMass[type].hot - JumpMass[type].cold;
    const count = asgn.cc + asgn.ch + asgn.hh;
    for (let i = 0; i < count * 2; i++) upgrades.push({ type, gain });
  }
  upgrades.sort((a, b) => b.gain - a.gain);

  for (const upg of upgrades) {
    if (currentMass >= targetMass) break;
    currentMass += upg.gain;
    const asgn = used[upg.type];
    if (asgn.cc > 0)      { asgn.cc--; asgn.ch++; }
    else if (asgn.ch > 0) { asgn.ch--; asgn.hh++; }
  }

  const assignments = {};
  for (const type of Object.keys(validFleet)) assignments[type] = used[type] || { cc: 0, ch: 0, hh: 0 };
  return { assignments, actualMass: currentMass };
}

/**
 * Expand passes into a flat list of per-ship round trips.
 * Each entry: { type, inMode, outMode, passType }
 */
function buildRoundTrips(validFleet, fullPasses, partialResult) {
  const trips = [];

  for (let p = 0; p < fullPasses; p++) {
    for (const [type, count] of Object.entries(validFleet)) {
      for (let i = 0; i < count; i++)
        trips.push({ type, inMode: 'cold', outMode: 'hot', passType: 'full' });
    }
  }

  if (partialResult) {
    for (const type of ['Battleship', 'Custom', 'Cruiser', 'HIC']) {
      const asgn = partialResult.assignments[type];
      if (!asgn || !validFleet[type]) continue;
      for (let i = 0; i < asgn.cc; i++)
        trips.push({ type, inMode: 'cold', outMode: 'cold', passType: 'calibrated' });
      for (let i = 0; i < asgn.ch; i++)
        trips.push({ type, inMode: 'cold', outMode: 'hot',  passType: 'calibrated' });
      for (let i = 0; i < asgn.hh; i++)
        trips.push({ type, inMode: 'hot',  outMode: 'hot',  passType: 'calibrated' });
    }
  }

  return trips;
}

function statusLabel(frac) {
  return frac >= 0.5 ? 'Stable' : frac >= 0.1 ? 'Unstable' : 'Critical';
}
function statusClass(frac) {
  return frac >= 0.5 ? 'status-stable' : frac >= 0.1 ? 'status-unstable' : 'status-critical';
}

function onCalculate() {
  const val    = document.getElementById('wormhole-input').value.trim().toUpperCase();
  const w      = wormholes.find(wh => wh.type === val);
  const status = document.getElementById('wormhole-status').value;
  const goal   = document.getElementById('wormhole-goal').value;
  const fleet  = getFleet();
  const output = document.getElementById('plan-output');

  const isDoorstop   = goal === 'doorstop';
  const doorstopType = isDoorstop ? document.getElementById('doorstop-ship').value : null;

  if (!w || !w.totalMass) {
    output.innerHTML = '<div class="plan-box warning">❗ Select a valid wormhole first.</div>';
    return;
  }
  if (Object.values(fleet).every(n => n === 0)) {
    output.innerHTML = '<div class="plan-box warning">❗ Add at least one ship to your fleet.</div>';
    return;
  }
  if (fleet.Custom > 0 && (JumpMass.Custom.cold === 0 && JumpMass.Custom.hot === 0)) {
    output.innerHTML = '<div class="plan-box warning">❗ Enter cold and hot mass values for your custom ship.</div>';
    return;
  }

  // Separate valid fleet from oversized ships
  const oversized  = [];
  const validFleet = {};
  for (const [type, count] of Object.entries(fleet)) {
    if (count <= 0) continue;
    const m = JumpMass[type];
    if (m.cold > w.maxIndividualMass || m.hot > w.maxIndividualMass) oversized.push(type);
    else validFleet[type] = count;
  }
  if (Object.keys(validFleet).length === 0) {
    output.innerHTML = `<div class="plan-box warning">⚠️ None of your ships fit this wormhole (max individual: ${w.maxIndividualMass.toLocaleString()} t).</div>`;
    return;
  }

  let doorstopError = '';
  if (isDoorstop && doorstopType) {
    const dm = JumpMass[doorstopType];
    if (!dm || dm.cold > w.maxIndividualMass) {
      doorstopError = `⚠️ Doorstop ${doorstopType} exceeds max individual mass (${w.maxIndividualMass.toLocaleString()} t).`;
    }
    if (doorstopType === 'Custom' && dm.cold === 0 && dm.hot === 0) {
      doorstopError = '⚠️ Enter cold/hot values for the custom doorstop ship.';
    }
  }

  const totalMass    = w.totalMass;
  const startMass    = totalMass * STATUS_MAX[status];
  const critMass     = totalMass * 0.10;
  const goalMass     = totalMass * GOAL_TARGET[goal];
  const doorstopCold = (isDoorstop && doorstopType && !doorstopError) ? JumpMass[doorstopType].cold : 0;

  // Round trips should leave: critMass + doorstopCold for doorstop, or goalMass otherwise
  const roundTripTarget   = (isDoorstop && !doorstopError) ? critMass + doorstopCold : goalMass;
  const massForRoundTrips = Math.max(0, startMass - roundTripTarget);

  // Full passes: standard cold-out + hot-back
  const massPerPassCH = Object.entries(validFleet)
    .reduce((s, [t, c]) => s + c * (JumpMass[t].cold + JumpMass[t].hot), 0);

  const fullPasses  = Math.floor(massForRoundTrips / massPerPassCH);
  let   remaining   = startMass - fullPasses * massPerPassCH;

  const partialMassNeeded = remaining - roundTripTarget;
  const partialResult     = partialMassNeeded > 0 ? assignJumps(validFleet, partialMassNeeded) : null;
  if (partialResult) remaining -= partialResult.actualMass;

  const afterDoorstop = (isDoorstop && !doorstopError)
    ? Math.max(0, remaining - doorstopCold) : remaining;

  const trips = buildRoundTrips(validFleet, fullPasses, partialResult);

  // ── Render ──
  let html = `<div class="plan-box">
    <h3>${w.type} — ${capitalize(status)} → ${goal === 'crit' ? 'Crit' : goal === 'close' ? 'Close' : 'Doorstop'}</h3>
    <div class="plan-stats">
      <span>Worst-case start: <strong>${fmt(startMass)} t</strong></span>
      <span>Goal: <strong>${goal === 'close' ? 'Collapse' : `≤ ${fmt(goalMass)} t (${(GOAL_TARGET[goal]*100).toFixed(0)}%)`}</strong></span>
      <span>Max to consume: <strong>${fmt(Math.max(0, startMass - goalMass))} t</strong></span>
    </div>
    <p class="note">⚠️ The wormhole may already be closer to ${status === 'stable' ? 'Unstable' : status === 'unstable' ? 'Critical' : 'collapse'} than the worst case assumed.
    Check status after <strong>every jump in</strong> before committing to the return.</p>`;

  if (oversized.length)  html += `<p class="warn-text">⚠️ ${oversized.join(', ')} excluded — exceed max individual mass.</p>`;
  if (doorstopError)     html += `<p class="warn-text">${doorstopError}</p>`;
  if (trips.length === 0 && !isDoorstop) {
    html += `<p class="warn-text">⚠️ Wormhole is already at or below the target mass.</p>`;
  }

  // ── Step list ──
  let stepNum       = 0;
  let massRemaining = startMass;

  if (trips.length > 0) {
    html += `<ol class="step-list">`;

    for (let i = 0; i < trips.length; i++) {
      const trip       = trips[i];
      const mIn        = JumpMass[trip.type][trip.inMode];
      const mOut       = JumpMass[trip.type][trip.outMode];
      const isLast     = i === trips.length - 1;
      const typeClass  = trip.passType === 'calibrated' ? 'step-calibrated' : 'step-full';

      const fracBefore   = massRemaining / totalMass;
      const massAfterIn  = massRemaining - mIn;
      const fracAfterIn  = massAfterIn  / totalMass;
      const massAfterOut = massAfterIn  - mOut;
      const fracAfterOut = massAfterOut / totalMass;

      // ── IN jump ──
      stepNum++;
      const inCollapses = massAfterIn <= 0;

      html += `<li class="step ${typeClass}${inCollapses ? ' step-danger' : ''}">
        <div class="step-header">
          <span class="step-num">${stepNum}</span>
          <span class="step-desc">
            <strong>${trip.type}</strong>
            <span class="mode-badge mode-${trip.inMode}">${trip.inMode.toUpperCase()}</span>
            <span class="dir-in">→ Jump IN</span>
            <span class="step-mass">(${fmt(mIn)} t)</span>
          </span>
          ${trip.passType === 'calibrated' ? '<span class="badge-calibrated">calibrated</span>' : ''}
        </div>`;

      if (inCollapses) {
        html += `<div class="step-check">
          <p class="check-danger">🚨 This Jump IN would collapse the wormhole — ship would be <strong>stranded on the far side</strong>. Do not jump. Reduce the previous rolling steps.</p>
        </div>`;
      } else {
        const expectedLabel = statusLabel(fracAfterIn);
        const expectedClass = statusClass(fracAfterIn);

        html += `<div class="step-check">
          <strong>After jumping in — check wormhole status:</strong>
          <ul>
            <li class="check-ok">✅ Shows <span class="${expectedClass}">${expectedLabel}</span> → proceed to Step ${stepNum + 1} (return)</li>`;

        if (expectedLabel === 'Stable') {
          html += `<li class="check-warn">⚠️ Shows <span class="status-unstable">Unstable</span> → return <strong>COLD</strong>, reassess remaining ships</li>`;
          html += `<li class="check-warn">⚠️ Shows <span class="status-critical">Critical</span> → return <strong>COLD</strong>, hold all ships, skip to closure</li>`;
        } else if (expectedLabel === 'Unstable') {
          html += `<li class="check-warn">⚠️ Shows <span class="status-critical">Critical</span> → return <strong>COLD</strong>, hold all ships, skip to closure</li>`;
        }
        html += `</ul>
        </div>`;
      }
      html += `</li>`;

      // ── OUT jump ──
      stepNum++;
      const outCollapses  = massAfterOut <= 0 && goal === 'close';
      const critOnReturn  = fracAfterOut < 0.1 && fracAfterOut > 0;

      html += `<li class="step ${typeClass} step-return${outCollapses ? ' step-close' : ''}">
        <div class="step-header">
          <span class="step-num">${stepNum}</span>
          <span class="step-desc">
            <strong>${trip.type}</strong>
            <span class="mode-badge mode-${trip.outMode}">${trip.outMode.toUpperCase()}</span>
            <span class="dir-out">← Return OUT</span>
            <span class="step-mass">(${fmt(mOut)} t)</span>
          </span>
          ${outCollapses ? '<span class="badge-close">CLOSES HOLE</span>' : ''}
        </div>`;

      if (outCollapses) {
        html += `<div class="step-check">
          <p class="check-ok">✅ This return jump collapses the wormhole — ship arrives safely in the origin system.</p>
        </div>`;
      } else {
        html += `<div class="step-check">
          <strong>After returning — check status:</strong>
          <ul>`;
        if (critOnReturn) {
          html += `<li class="check-ok">✅ Now <span class="status-critical">Critical</span> — rolling complete, proceed to closure</li>`;
          if (!isLast) {
            html += `<li class="check-warn">⚠️ Hold all remaining ships — wormhole is Critical, no further rolling needed</li>`;
          }
        } else {
          html += `<li class="check-ok">✅ <span class="${statusClass(fracAfterOut)}">${statusLabel(fracAfterOut)}</span>${isLast ? ' — all ships back, proceed to closure' : ` — continue to Step ${stepNum + 1}`}</li>`;
        }
        html += `</ul></div>`;
      }
      html += `</li>`;

      massRemaining = massAfterOut;
    }

    html += `</ol>`;
  }

  // ── Doorstop step ──
  if (isDoorstop && doorstopType && !doorstopError) {
    const collapseOnReturn = doorstopCold >= afterDoorstop;
    stepNum++;
    html += `<div class="closure-section doorstop-pass">
      <div class="pass-title">Step ${stepNum} — Send Doorstop (${doorstopType} COLD IN)</div>
      <p>1× ${doorstopType} jumps <strong>COLD in</strong> and stays on the far side. All other ships have already returned.</p>
      <p class="mass-note">After this jump: ~${fmt(afterDoorstop)} t remaining (${pct(afterDoorstop, totalMass)}%) — wormhole should now be Critical.</p>
    </div>`;

    html += `<div class="closure-section">
      <h3>Closure</h3>
      <ol class="step-list">
        <li class="step step-closure">
          <div class="step-header">
            <span class="step-num">✦</span>
            <span class="step-desc">Confirm all ships <strong>except the doorstop</strong> are on the origin side</span>
          </div>
        </li>
        <li class="step step-closure step-close">
          <div class="step-header">
            <span class="step-num">✦</span>
            <span class="step-desc">
              Doorstop <strong>${doorstopType}</strong>
              <span class="mode-badge mode-cold">COLD</span>
              <span class="dir-in">← jumps back to origin</span>
            </span>
            <span class="badge-close">CLOSES HOLE</span>
          </div>
          <div class="step-check">
            ${collapseOnReturn
              ? `<p class="check-ok">✅ Cold return (${fmt(doorstopCold)} t) will collapse the wormhole — ship arrives safely in origin.</p>`
              : `<p class="check-warn">⚠️ Cold return (${fmt(doorstopCold)} t) may not be enough to collapse (${fmt(afterDoorstop)} t remaining). Send a second ship cold immediately after.</p>`
            }
          </div>
        </li>
      </ol>
    </div>`;

  } else if (goal !== 'close' || remaining > 0) {
    // Standard closure section
    const finalMass   = remaining;
    const goalReached = finalMass <= goalMass;

    html += `<div class="closure-section">
      <h3>Closure</h3>
      <ol class="step-list">
        <li class="step step-closure">
          <div class="step-header">
            <span class="step-num">✦</span>
            <span class="step-desc">Confirm all ships are back on the <strong>origin side</strong></span>
          </div>
        </li>
        <li class="step step-closure ${goal === 'close' ? 'step-close' : ''}">
          <div class="step-header">
            <span class="step-num">✦</span>
            <span class="step-desc">
              Wormhole should show as
              <span class="${goalReached ? 'status-critical' : 'status-unstable'}">${goalReached ? 'Critical' : 'check status'}</span>
            </span>
            ${goal === 'close' ? '<span class="badge-close">CLOSES HOLE</span>' : ''}
          </div>
          <div class="step-check">
            ${goal === 'close' && goalReached
              ? `<p class="check-ok">✅ Send one final ship COLD in — the outbound jump will collapse the wormhole and the ship returns safely to origin.</p>`
              : goal === 'crit' && goalReached
                ? `<p class="check-ok">✅ Wormhole is Critical. You can leave it to expire or send one ship cold in to collapse it.</p>`
                : `<p class="check-warn">⚠️ Plan may not have fully reached the goal (${fmt(Math.max(0, finalMass))} t remaining). Check actual status and continue rolling if needed.</p>`
            }
          </div>
        </li>
      </ol>
    </div>`;
  }

  html += `</div>`; // close plan-box
  output.innerHTML = html;
}

function fmt(n)       { return Math.round(n).toLocaleString(); }
function pct(n, total){ return (Math.max(0, n) / total * 100).toFixed(1); }
function capitalize(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

init();
