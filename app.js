import { wormholes } from './data/wormholes.js';

// Jump-mass constants in tonnes
const JumpMass = {
  Battleship: { cold: 200_000, hot: 300_000 },
  Cruiser:    { cold:  36_000, hot: 126_000 },
  HIC:        { cold:     830, hot: 132_400 },
};

// Worst-case starting mass fraction for each status
const STATUS_MAX = { stable: 1.0, unstable: 0.5, critical: 0.1 };

// Target remaining-mass fraction for each goal
const GOAL_TARGET = { crit: 0.1, close: 0.0 };

const state = {
  wormhole: null,
  totalMass: 0,
  remaining: 0,
  goalFraction: 0.1,
  history: [],
};

function init() {
  const input    = document.getElementById('wormhole-input');
  const datalist = document.getElementById('wormhole-list');

  // Populate datalist for autocomplete
  wormholes.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w.type;
    datalist.appendChild(opt);
  });

  input.addEventListener('input', onWormholeInput);
  input.addEventListener('change', onWormholeInput);
  document.getElementById('start-btn').addEventListener('click', onStart);
  document.getElementById('jump-in-btn').addEventListener('click', () => doJump('cold'));
  document.getElementById('jump-out-btn').addEventListener('click', () => doJump('hot'));
  document.getElementById('undo-btn').addEventListener('click', onUndo);
  document.getElementById('calc-btn').addEventListener('click', onCalculate);
}

function onWormholeInput() {
  const val = document.getElementById('wormhole-input').value.trim().toUpperCase();
  const w   = wormholes.find(w => w.type === val);

  document.getElementById('wormhole-details').classList.toggle('hidden', !w);
  document.getElementById('mass-tracker').classList.add('hidden');

  if (w) {
    document.getElementById('wormhole-info').textContent =
      `${w.from || '?'} → ${w.to || '?'} | Max mass: ${w.totalMass.toLocaleString()} t | Max individual: ${w.maxIndividualMass.toLocaleString()} t`;
  }

  state.wormhole = w || null;
}

function onStart() {
  const status = document.getElementById('wormhole-status').value;
  const goal   = document.getElementById('wormhole-goal').value;
  const w      = state.wormhole;
  if (!w) return;

  state.totalMass    = w.totalMass;
  state.remaining    = w.totalMass * STATUS_MAX[status];
  state.goalFraction = GOAL_TARGET[goal];
  state.history      = [];

  document.getElementById('mass-tracker').classList.remove('hidden');
  document.getElementById('plan-output').innerHTML = '';
  updateDisplay();
}

function doJump(mode) {
  const shipType = document.getElementById('ship-type').value;
  const mass     = JumpMass[shipType][mode];
  state.history.push(state.remaining);
  state.remaining = Math.max(0, state.remaining - mass);
  updateDisplay();
}

function onUndo() {
  if (!state.history.length) return;
  state.remaining = state.history.pop();
  updateDisplay();
}

function updateDisplay() {
  const { remaining, totalMass, goalFraction } = state;
  const goalMass = totalMass * goalFraction;
  const pct      = (remaining / totalMass * 100).toFixed(1);

  document.getElementById('remaining-mass').textContent = Math.round(remaining).toLocaleString();
  document.getElementById('remaining-pct').textContent  = pct;

  // Progress toward goal: 0% = just started, 100% = goal reached
  const rangeTotal = totalMass - goalMass;
  const consumed   = totalMass - remaining;
  const progress   = rangeTotal > 0 ? Math.min(100, consumed / rangeTotal * 100) : 100;
  document.getElementById('progress-bar').style.width = `${progress.toFixed(1)}%`;

  const goalLabel = document.getElementById('goal-label');
  if (remaining <= goalMass) {
    goalLabel.textContent = '✅ Goal reached!';
    goalLabel.className   = 'goal-label done';
  } else {
    goalLabel.textContent = `Goal: ≤ ${Math.round(goalMass).toLocaleString()} t (${(goalFraction * 100).toFixed(0)}%)`;
    goalLabel.className   = 'goal-label';
  }

  const done = remaining <= goalMass || remaining <= 0;
  document.getElementById('jump-in-btn').disabled  = done;
  document.getElementById('jump-out-btn').disabled = done;
}

function onCalculate() {
  const { remaining, totalMass, goalFraction, wormhole } = state;
  const goalMass    = totalMass * goalFraction;
  const massLeft    = remaining - goalMass;
  const outputEl    = document.getElementById('plan-output');

  if (massLeft <= 0) {
    outputEl.innerHTML = '<div class="plan-box">✅ Goal already reached — no more trips needed.</div>';
    return;
  }

  const shipType = document.getElementById('ship-type').value;
  const m        = JumpMass[shipType];

  if (m.cold > wormhole.maxIndividualMass || m.hot > wormhole.maxIndividualMass) {
    outputEl.innerHTML = `
      <div class="plan-box warning">
        ⚠️ ${shipType} exceeds the max individual mass of
        ${wormhole.maxIndividualMass.toLocaleString()} t for this wormhole.
        Choose a smaller ship.
      </div>`;
    return;
  }

  // Each round trip consumes cold (in) + hot (out) mass
  const massPerTrip = m.cold + m.hot;
  const trips       = Math.ceil(massLeft / massPerTrip);

  outputEl.innerHTML = `
    <div class="plan-box">
      <h3>${wormhole.type} — Rolling Plan</h3>
      <ul>
        <li><strong>Current Remaining:</strong> ${Math.round(remaining).toLocaleString()} t (${(remaining / totalMass * 100).toFixed(1)}%)</li>
        <li><strong>Goal:</strong> ≤ ${Math.round(goalMass).toLocaleString()} t (${(goalFraction * 100).toFixed(0)}%)</li>
        <li><strong>Mass to Consume:</strong> ${Math.round(massLeft).toLocaleString()} t</li>
        <li><strong>Ship:</strong> ${shipType} — ${m.cold.toLocaleString()} t cold + ${m.hot.toLocaleString()} t hot = ${massPerTrip.toLocaleString()} t/trip</li>
        <li><strong>Round-Trips Needed:</strong> ${trips}</li>
      </ul>
      <p>Jump <strong>${shipType}</strong> cold <em>in</em> then hot <em>out</em>,
         <strong>${trips}</strong> time${trips !== 1 ? 's' : ''} in a row.</p>
    </div>`;
}

init();
