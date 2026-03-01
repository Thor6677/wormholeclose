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

// Step navigator state
let _planSteps = [];
let _stepIndex = 0;

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
function stageLabel(frac) {
  if (frac >= 0.5) return 'Stage 1';
  if (frac >= 0.1) return 'Stage 2';
  return 'Stage 3';
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

  // Full passes: standard cold-in + hot-out
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
  const hasHIC = !!validFleet.HIC;
  let insertedPhase2Header = status !== 'stable';

  // ── Build header HTML ──
  let headerHtml = `
    <h3>${w.type} — ${capitalize(status)} → ${goal === 'crit' ? 'Crit' : goal === 'close' ? 'Close' : 'Doorstop'}</h3>
    <div class="plan-stats">
      <span>Worst-case start: <strong>${fmt(startMass)} t</strong></span>
      <span>Goal: <strong>${goal === 'close' ? 'Collapse' : `≤ ${fmt(goalMass)} t (${(GOAL_TARGET[goal]*100).toFixed(0)}%)`}</strong></span>
      <span>Max to consume: <strong>${fmt(Math.max(0, startMass - goalMass))} t</strong></span>
    </div>
    <p class="note">⚠️ The wormhole may already be closer to ${status === 'stable' ? 'Unstable' : status === 'unstable' ? 'Critical' : 'collapse'} than the worst case assumed.
    Check status after <strong>every jump in</strong> before committing to the return.</p>`;

  if (oversized.length)  headerHtml += `<p class="warn-text">⚠️ ${oversized.join(', ')} excluded — exceed max individual mass.</p>`;
  if (doorstopError)     headerHtml += `<p class="warn-text">${doorstopError}</p>`;
  if (trips.length === 0 && !isDoorstop) {
    headerHtml += `<p class="warn-text">⚠️ Wormhole is already at or below the target mass.</p>`;
  }

  // ── Build steps array ──
  const steps = [];
  let stepNum       = 0;
  let massRemaining = startMass;

  if (status === 'stable' && trips.length > 0) {
    steps.push({
      title: 'Phase 1 — Halve the Hole',
      html: `<div class="phase-separator phase-1">
        <h3>Phase 1 — Halve the Hole</h3>
        <p>Get the hole from <span class="status-stable">Stage 1 (Stable)</span> to <span class="status-unstable">Stage 2 (Unstable)</span> by passing roughly 50% of its worst-case mass.</p>
        <p>Jump ships <strong>COLD in, HOT out</strong>. Watch after every IN jump — if the hole goes Unstable earlier than expected, there was pre-existing mass and you have less remaining than worst case.</p>
      </div>`,
    });
  }

  for (let i = 0; i < trips.length; i++) {
    const trip      = trips[i];
    const mIn       = JumpMass[trip.type][trip.inMode];
    const mOut      = JumpMass[trip.type][trip.outMode];
    const isLast    = i === trips.length - 1;
    const typeClass = trip.passType === 'calibrated' ? 'step-calibrated' : 'step-full';

    const fracBefore     = massRemaining / totalMass;
    const massAfterIn    = massRemaining - mIn;
    const fracAfterIn    = massAfterIn  / totalMass;
    const massAfterOut   = massAfterIn  - mOut;
    const fracAfterOut   = massAfterOut / totalMass;
    const crossingStage2 = fracBefore >= 0.5 && fracAfterIn < 0.5;
    const isInsideCrit   = fracAfterIn < 0.1 && massAfterIn > 0;

    if (!insertedPhase2Header && crossingStage2) {
      insertedPhase2Header = true;
      steps.push({
        title: 'Phase 2 — Crit the Hole',
        html: `<div class="phase-separator phase-2">
          <h3>Phase 2 — Crit the Hole</h3>
          <p>The hole is now <span class="status-unstable">Stage 2 (Unstable)</span>. Roll carefully toward <span class="status-critical">Stage 3 (Critical)</span>.</p>
          <p>Assume worst case — the hole may be max under-sized. If a HIC is in your fleet, use it for any return from a Critical hole. Never jump a Battleship out of a Critical hole if a HIC is available.</p>
        </div>`,
      });
    }

    // ── IN jump step ──
    stepNum++;
    const inCollapses = massAfterIn <= 0;

    let inHtml = `<div class="step ${typeClass}${inCollapses ? ' step-danger' : ''}">
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
      inHtml += `<div class="step-check">
        <p class="check-danger">🚨 This Jump IN would collapse the wormhole — ship would be <strong>stranded on the far side</strong>. Do not jump. Reduce the previous rolling steps.</p>
      </div>`;
    } else {
      const expectedLabel = statusLabel(fracAfterIn);
      const expectedClass = statusClass(fracAfterIn);

      inHtml += `<div class="step-check">
        <strong>After jumping in — check wormhole status:</strong>
        <ul>
          <li class="check-ok">✅ Shows <span class="${expectedClass}">${expectedLabel}</span> → proceed to the next step (return)</li>`;

      if (expectedLabel === 'Stable') {
        inHtml += `<li class="check-warn">⚠️ Shows <span class="status-unstable">Unstable</span> → return <strong>COLD</strong>, reassess remaining ships</li>`;
        inHtml += `<li class="check-warn">⚠️ Shows <span class="status-critical">Critical</span> → return <strong>COLD</strong>, hold all ships, skip to closure</li>`;
      } else if (expectedLabel === 'Unstable') {
        inHtml += `<li class="check-warn">⚠️ Shows <span class="status-critical">Critical</span> → return <strong>COLD</strong>, hold all ships, skip to closure</li>`;
      }
      inHtml += `</ul></div>`;
    }
    if (crossingStage2) {
      inHtml += `<div class="stage-transition-alert">
        <strong>📍 Stage 2 Watch:</strong> This jump should take the hole from <span class="status-stable">Stage 1 (Stable)</span> to <span class="status-unstable">Stage 2 (Unstable)</span>.
        If it went Unstable on an earlier jump, there was pre-existing mass — you have less remaining than worst case assumed.
      </div>`;
    }
    inHtml += `</div>`;

    steps.push({
      num:   stepNum,
      title: `${trip.type} ${trip.inMode.toUpperCase()} → Jump IN`,
      html:  inHtml,
    });

    // ── OUT jump step ──
    stepNum++;
    const outCollapses = massAfterOut <= 0 && goal === 'close';
    const critOnReturn = fracAfterOut < 0.1 && fracAfterOut > 0;

    let outHtml = `<div class="step ${typeClass} step-return${outCollapses ? ' step-close' : ''}">
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
      outHtml += `<div class="step-check">
        <p class="check-ok">✅ This return jump collapses the wormhole — ship arrives safely in the origin system.</p>
      </div>`;
    } else {
      outHtml += `<div class="step-check">
        <strong>After returning — check status:</strong>
        <ul>`;
      if (critOnReturn) {
        outHtml += `<li class="check-ok">✅ Now <span class="status-critical">Critical</span> — rolling complete, proceed to closure</li>`;
        if (!isLast) {
          outHtml += `<li class="check-warn">⚠️ Hold all remaining ships — wormhole is Critical, no further rolling needed</li>`;
        }
      } else {
        outHtml += `<li class="check-ok">✅ <span class="${statusClass(fracAfterOut)}">${statusLabel(fracAfterOut)}</span>${isLast ? ' — all ships back, proceed to closure' : ' — continue to next step'}</li>`;
      }
      outHtml += `</ul></div>`;
    }
    if (isInsideCrit && !inCollapses) {
      const hicHint   = (trip.type === 'Battleship' && hasHIC)
        ? `<li>A HIC is in your fleet — use it for this return. Never jump a Battleship out of a Critical hole if a HIC is available.</li>` : '';
      const higgsHint = trip.type === 'Battleship'
        ? `<li>If a Battleship return is unavoidable: remove the Higgs rig (use a mobile depot), jump <strong>COLD</strong>, then re-fit the Higgs afterward.</li>` : '';
      outHtml += `<div class="crit-safety-alert">
        <strong>🚨 Returning from a Critical hole</strong>
        <ul>
          <li>Return <strong>COLD</strong> — do not jump HOT out of a Critical hole.</li>
          ${hicHint}${higgsHint}
        </ul>
      </div>`;
    }
    outHtml += `</div>`;

    steps.push({
      num:   stepNum,
      title: `${trip.type} ${trip.outMode.toUpperCase()} ← Return OUT`,
      html:  outHtml,
    });

    massRemaining = massAfterOut;
  }

  // ── Doorstop step ──
  if (isDoorstop && doorstopType && !doorstopError) {
    stepNum++;
    const collapseOnReturn = doorstopCold >= afterDoorstop;

    steps.push({
      num:   stepNum,
      title: `Send Doorstop — ${doorstopType} COLD IN`,
      html:  `<div class="closure-section doorstop-pass" style="margin-top:0;border-top:none;">
        <div class="pass-title">Step ${stepNum} — Send Doorstop (${doorstopType} COLD IN)</div>
        <p>1× ${doorstopType} jumps <strong>COLD in</strong> and stays on the far side. All other ships have already returned.</p>
        <p class="mass-note">After this jump: ~${fmt(afterDoorstop)} t remaining (${pct(afterDoorstop, totalMass)}%) — wormhole should now be Critical.</p>
      </div>`,
    });

    steps.push({
      title: 'Closure',
      html: `<div class="closure-section" style="margin-top:0;border-top:none;">
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
      </div>`,
    });

  } else if (goal !== 'close' || remaining > 0) {
    // ── Standard closure step ──
    const finalMass   = remaining;
    const goalReached = finalMass <= goalMass;

    steps.push({
      title: 'Closure',
      html: `<div class="closure-section" style="margin-top:0;border-top:none;">
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
      </div>`,
    });
  }

  // ── Rolled Out reference step ──
  steps.push({
    title: 'If You Get Rolled Out',
    html: `<div class="rolled-out-ref">
      <h3>If You Get Rolled Out</h3>
      <p>Getting rolled out happens to the best of us. Your options:</p>
      <ol>
        <li><strong>Scan yourself out</strong> — carry a probe launcher and cloak, or a mobile depot to refit. Remove the Higgs rig first to make the ship more manageable.</li>
        <li><strong>Self-Destruct</strong></li>
        <li><strong>Ask in local</strong> — good luck.</li>
      </ol>
      <p class="whsoc-tip">Prevention: on any calibrated step, if the last jump out is uncomfortably close to the limit, convert a HOT return to COLD. There is a slight chance you will need a HIC to finish the hole, but you will not get rolled out.</p>
    </div>`,
  });

  // ── Render step navigator ──
  _planSteps = steps;
  _stepIndex = 0;
  renderPlan(headerHtml);
}

function renderPlan(headerHtml) {
  const output = document.getElementById('plan-output');
  const steps  = _planSteps;
  const total  = steps.length;

  if (total === 0) {
    output.innerHTML = `<div class="plan-box">${headerHtml}</div>`;
    return;
  }

  const dotsHtml = steps.map((s, i) =>
    `<button class="step-dot${i === 0 ? ' active' : ''}" data-index="${i}" title="Step ${i + 1}: ${s.title}" aria-label="Go to step ${i + 1}"></button>`
  ).join('');

  output.innerHTML = `
    <div class="plan-box">
      ${headerHtml}
      <div class="step-nav">
        <div class="step-nav-header">
          <span class="step-of-label">Step <strong id="step-num-display">1</strong> of ${total}</span>
          <span id="step-title-display" class="step-title-display">${steps[0].title}</span>
        </div>
        <div class="step-dots" role="tablist" aria-label="Jump steps">${dotsHtml}</div>
        <div id="step-content" class="step-content">${steps[0].html}</div>
        <div class="step-controls">
          <button id="prev-step" class="nav-btn" disabled>← Prev</button>
          <button id="next-step" class="nav-btn"${total <= 1 ? ' disabled' : ''}>Next →</button>
        </div>
      </div>
    </div>`;

  document.getElementById('prev-step').addEventListener('click', () => goToStep(_stepIndex - 1));
  document.getElementById('next-step').addEventListener('click', () => goToStep(_stepIndex + 1));
  document.querySelectorAll('.step-dot').forEach(dot => {
    dot.addEventListener('click', () => goToStep(parseInt(dot.dataset.index)));
  });
}

function goToStep(index) {
  if (index < 0 || index >= _planSteps.length) return;
  _stepIndex = index;

  const step  = _planSteps[index];
  const total = _planSteps.length;

  document.getElementById('step-content').innerHTML           = step.html;
  document.getElementById('step-num-display').textContent     = index + 1;
  document.getElementById('step-title-display').textContent   = step.title;
  document.getElementById('prev-step').disabled               = index === 0;
  document.getElementById('next-step').disabled               = index === total - 1;

  document.querySelectorAll('.step-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === index);
    dot.classList.toggle('done',   i < index);
  });
}

function fmt(n)       { return Math.round(n).toLocaleString(); }
function pct(n, total){ return (Math.max(0, n) / total * 100).toFixed(1); }
function capitalize(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

init();
