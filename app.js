import { wormholes } from './data/wormholes.js';

const BS_COLD = 200_000_000;
const BS_HOT = 300_000_000;
const HIC_COLD =   830_000;
const HIC_HOT  = 132_400_000;

let maxMass = 0;

function init() {
  const typeSel = document.getElementById('wormhole-type');
  const statusSel = document.getElementById('wormhole-status');
  const genBtn = document.getElementById('generate-btn');

  wormholes.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w.type;
    opt.textContent = `${w.type} – ${w.from || '?'} → ${w.to || '?'}`;
    typeSel.append(opt);
  });

  typeSel.addEventListener('change', () => {
    const w = wormholes.find(w => w.type === typeSel.value);
    maxMass = w ? w.totalMass : 0;
  });

  genBtn.addEventListener('click', generatePlan);
}

function safePlan(type, status) {
  if (!maxMass) {
    return '❗ Select a wormhole first.';
  }

  const unlucky = maxMass * 0.11;
  let plan = `🌀 <strong>${type}</strong> – status: <strong>${status}</strong><br><br>`;

  if (status === 'stable') {
    plan += '🟢 Use full rolling logic (existing) — returning to same side.';
    return plan;
  }

  if (status === 'critical') {
    plan += `1. HIC Cold IN<br>
2. HIC HOT OUT — collapse on return`;
    return plan;
  }

  // Unstable
  const rem = unlucky;

  if (rem < BS_COLD) {
    // Use HIC only
    plan += `1. HIC Cold IN (~${HIC_COLD.toLocaleString()} kg)<br>`;
    plan += `2. HIC HOT OUT (~${HIC_HOT.toLocaleString()} kg) — collapse`;
  } else if (rem < BS_HOT) {
    // Use BS & HIC
    plan += `1. BS Cold IN (~${BS_COLD.toLocaleString()} kg)<br>`;
    plan += `2. HIC HOT OUT (~${HIC_HOT.toLocaleString()} kg) — collapse`;
  } else {
    // Can use BS in/out
    plan += `1. BS Cold IN<br>`;
    plan += `2. BS HOT OUT — collapse`;
  }

  return plan;
}

function generatePlan() {
  const type = document.getElementById('wormhole-type').value;
  const status = document.getElementById('wormhole-status').value;
  const output = document.getElementById('plan-output');
  output.innerHTML = '';

  if (!type) {
    output.textContent = '❗ Select a wormhole type.';
    return;
  }

  output.innerHTML = `<div class="plan-box">${safePlan(type, status)}</div>`;
}

init();
