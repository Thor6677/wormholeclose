import { wormholes } from './data/wormholes.js';

const BS_COLD  = 200_000_000;   // Battleship cold jump
const BS_HOT   = 300_000_000;   // Battleship hot jump
const HIC_COLD =   830_000;     // HIC cold jump (entangled)
const HIC_HOT  = 132_400_000;   // HIC hot jump

let maxMass = 0;

function init() {
  const typeSel = document.getElementById('wormhole-type');
  const genBtn  = document.getElementById('generate-btn');

  // populate dropdown
  wormholes.forEach(w => {
    const o = document.createElement('option');
    o.value = w.type;
    o.textContent = `${w.type} – ${w.from || '?'} → ${w.to || '?'}`;
    typeSel.append(o);
  });

  // store maxMass on select
  typeSel.addEventListener('change', () => {
    const w = wormholes.find(x => x.type === typeSel.value);
    maxMass = w?.totalMass || 0;
  });

  genBtn.addEventListener('click', generatePlan);
}

// determine which class
function getColorCode() {
  if (maxMass >= 3_300_000) return 'orange'; // 3300G
  if (maxMass >= 3_000_000) return 'yellow'; // 3000G
  if (maxMass >= 2_000_000) return 'green';  // 2000G
  if (maxMass >= 1_000_000) return 'blue';   // 1000G
  return 'unknown';
}

function generatePlan() {
  const type   = document.getElementById('wormhole-type').value;
  const status = document.getElementById('wormhole-status').value;
  const out    = document.getElementById('plan-output');
  out.innerHTML = '';

  if (!type) {
    out.textContent = '❗ Please select a wormhole type.';
    return;
  }
  if (!maxMass) {
    out.textContent = '❗ Could not determine wormhole mass.';
    return;
  }

  const color = getColorCode();
  let plan = `<div class="plan-box"><strong>${type}</strong> — <em>${status.toUpperCase()}</em>\n\n`;

  // CRITICAL
  if (status === 'critical') {
    plan +=
`1. HIC Cold jump IN (${HIC_COLD.toLocaleString()} kg)
2. HIC HOT jump OUT (${HIC_HOT.toLocaleString()} kg) → collapse
(Repeat as needed; ends on same side.)`;
  }
  // UNSTABLE
  else if (status === 'unstable') {
    const rem = Math.floor(maxMass * 0.11);
    plan += `(≈${rem.toLocaleString()} kg remaining)\n\n`;
    if (rem < BS_COLD) {
      plan +=
`1. HIC Cold jump IN (${HIC_COLD.toLocaleString()} kg)
2. HIC HOT jump OUT (${HIC_HOT.toLocaleString()} kg) → collapse
(1 ship; ends on same side.)`;
    } else {
      plan +=
`1. Battleship Cold jump IN (${BS_COLD.toLocaleString()} kg)
2. Battleship HOT jump OUT (${BS_HOT.toLocaleString()} kg) → collapse
(1 ship; ends on same side.)`;
    }
  }
  // STABLE
  else {
    switch (color) {
      case 'blue': // 1000G
        plan +=
`🟦 1000G Wormhole

<strong>Initial Check:</strong>
• 1 Cold Jump (BS, ${BS_COLD.toLocaleString()} kg)
• 1 Hot Jump (BS, ${BS_HOT.toLocaleString()} kg)
🔍 Ask: Is the hole reduced?

<strong>If YES:</strong>
• To Roll: 2 Hot Jumps (BS, ${BS_HOT.toLocaleString()} kg each)
• To Crit: 2 Cold Jumps (BS, ${BS_COLD.toLocaleString()} kg each)

<strong>If NO:</strong>
• To Roll: 2 Hot Jumps (BS, ${BS_HOT.toLocaleString()} kg each)
• To Crit: 1 Cold Jump (BS, ${BS_COLD.toLocaleString()} kg) + 1 Hot Jump (BS, ${BS_HOT.toLocaleString()} kg)

<em>All ships end on original side.</em>`;
        break;

      case 'green': // 2000G
        plan +=
`🟩 2000G Wormhole

<strong>Initial Check:</strong>
• 2 Cold Jumps (BS, ${BS_COLD.toLocaleString()} kg each)
• 2 Hot Jumps (BS, ${BS_HOT.toLocaleString()} kg each)
🔍 Ask: Is the hole reduced?

<strong>If YES:</strong>
• To Roll: 2 Cold + 2 Hot (BS)
• To Crit: 4 Cold (BS, ${BS_COLD.toLocaleString()} kg)

<strong>If NO:</strong>
• To Roll: 4 Hot (BS, ${BS_HOT.toLocaleString()} kg)
• To Crit: 2 Cold + 2 Hot (BS)

<em>All ships end on original side.</em>`;
        break;

      case 'yellow': // 3000G
        plan +=
`🟨 3000G Wormhole

<strong>Initial Check:</strong>
• 5 Hot Jumps (BS, ${BS_HOT.toLocaleString()} kg each)
🔍 Ask: Is the hole reduced?

<strong>If YES:</strong>
• To Roll: Return Hot + 4 Hot (BS)
• To Crit: Return Hot + Cold + 2 Hot (BS)

<strong>If NO:</strong>
• To Roll: Return Hot + 5 Hot (BS)
• To Crit: Return Hot + Cold + 3 Hot (BS)

<em>All ships end on original side.</em>`;
        break;

      case 'orange': // 3300G
        plan +=
`🟧 3300G Wormhole

<strong>Initial Check:</strong>
• 1 Cold Jump (BS, ${BS_COLD.toLocaleString()} kg) + 5 Hot (BS, ${BS_HOT.toLocaleString()} kg each)
🔍 Ask: Is the hole reduced?

<strong>If YES:</strong>
• To Roll: 2 Cold + 4 Hot (BS) (HIC optional)
• To Crit: 4 Hot (BS) + HIC Cold (${HIC_COLD.toLocaleString()} kg)

<strong>If NO:</strong>
• To Roll: 6 Hot (BS)
• To Crit: Cold + 5 Hot (BS)

<em>All ships end on original side.</em>`;
        break;

      default:
        plan += `⚠️ No stable-state logic defined for this wormhole class.`;
    }
  }

  plan += `</div>`;
  out.innerHTML = plan;
}

init();
