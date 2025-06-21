import { wormholes } from './data/wormholes.js';

const BS_COLD  = 200_000_000;   // Battleship cold jump
const BS_HOT   = 300_000_000;   // Battleship hot jump
const HIC_COLD =   830_000;     // HIC cold jump (entangled)
const HIC_HOT  = 132_400_000;   // HIC hot jump

let maxMass = 0;

function init() {
  const typeSel = document.getElementById('wormhole-type');
  const genBtn  = document.getElementById('generate-btn');

  // Populate wormhole dropdown
  wormholes.forEach(w => {
    const o = document.createElement('option');
    o.value = w.type;
    o.textContent = `${w.type} – ${w.from || '?'} → ${w.to || '?'}`;
    typeSel.append(o);
  });

  // Store the selected wormhole's maxMass (in kg from JSON)
  typeSel.addEventListener('change', () => {
    const w = wormholes.find(x => x.type === typeSel.value);
    maxMass = w ? w.totalMass : 0;
  });

  genBtn.addEventListener('click', generatePlan);
}

// Classify by JSON values (kg)
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
  let plan = `<div class="plan-box"><strong>${type}</strong> — <em>${status.toUpperCase()}</em><br><br>`;

  // ===== CRITICAL =====
  if (status === 'critical') {
    plan += `
      1. HIC Cold jump <strong>IN</strong> (${HIC_COLD.toLocaleString()} kg)<br>
      2. HIC HOT jump <strong>OUT</strong> (${HIC_HOT.toLocaleString()} kg) → collapse<br>
      <em>(Repeat until popped; all on same side.)</em>
    `;
  }

  // ===== UNSTABLE =====
  else if (status === 'unstable') {
    const rem = Math.floor(maxMass * 0.11);
    plan += `<!-- Estimated remaining ≈ ${rem.toLocaleString()} kg -->`;
    if (rem < BS_COLD) {
      plan += `
        1. HIC Cold jump <strong>IN</strong> (${HIC_COLD.toLocaleString()} kg)<br>
        2. HIC HOT jump <strong>OUT</strong> (${HIC_HOT.toLocaleString()} kg) → collapse<br>
        <em>1 ship, ends on same side.</em>
      `;
    } else {
      plan += `
        1. Battleship Cold jump <strong>IN</strong> (${BS_COLD.toLocaleString()} kg)<br>
        2. Battleship HOT jump <strong>OUT</strong> (${BS_HOT.toLocaleString()} kg) → collapse<br>
        <em>1 ship, ends on same side.</em>
      `;
    }
  }

  // ===== STABLE =====
  else { 
    switch (color) {
      case 'blue': // 1000G
        plan += `
          🟦 <strong>1000G Wormhole</strong><br><br>
          <strong>Initial Check:</strong>
          <ul>
            <li>1 Cold Jump (Battleship, ${BS_COLD.toLocaleString()} kg)</li>
            <li>1 Hot Jump (Battleship, ${BS_HOT.toLocaleString()} kg)</li>
            <li>🔍 Ask: Is the hole reduced?</li>
          </ul>
          <strong>If YES:</strong>
          <ul>
            <li>To Roll: 2 Hot Jumps (Battleship, ${BS_HOT.toLocaleString()} kg each)</li>
            <li>To Crit: 2 Cold Jumps (Battleship, ${BS_COLD.toLocaleString()} kg each)</li>
          </ul>
          <strong>If NO:</strong>
          <ul>
            <li>To Roll: 2 Hot Jumps (Battleship, ${BS_HOT.toLocaleString()} kg each)</li>
            <li>To Crit: 1 Cold Jump (${BS_COLD.toLocaleString()} kg) + 1 Hot Jump (${BS_HOT.toLocaleString()} kg)</li>
          </ul>
          <em>All ships end on the original side.</em>
        `;
        break;

      case 'green': // 2000G
        plan += `
          🟩 <strong>2000G Wormhole</strong><br><br>
          <strong>Initial Check:</strong>
          <ul>
            <li>2 Cold Jumps (Battleship, ${BS_COLD.toLocaleString()} kg each)</li>
            <li>2 Hot Jumps (Battleship, ${BS_HOT.toLocaleString()} kg each)</li>
            <li>🔍 Ask: Is the hole reduced?</li>
          </ul>
          <strong>If YES:</strong>
          <ul>
            <li>To Roll: 2 Cold + 2 Hot Jumps (Battleship)</li>
            <li>To Crit: 4 Cold Jumps (Battleship, ${BS_COLD.toLocaleString()} kg)</li>
          </ul>
          <strong>If NO:</strong>
          <ul>
            <li>To Roll: 4 Hot Jumps (Battleship, ${BS_HOT.toLocaleString()} kg)</li>
            <li>To Crit: 2 Cold + 2 Hot (Battleship)</li>
          </ul>
          <em>All ships end on the original side.</em>
        `;
        break;

      case 'yellow': // 3000G
        plan += `
          🟨 <strong>3000G Wormhole</strong><br><br>
          <strong>Initial Check:</strong>
          <ul>
            <li>5 Hot Jumps (Battleship, ${BS_HOT.toLocaleString()} kg each)</li>
            <li>🔍 Ask: Is the hole reduced?</li>
          </ul>
          <strong>If YES:</strong>
          <ul>
            <li>To Roll: Return Hot + 4 Hot Jumps (Battleship)</li>
            <li>To Crit: Return Hot + Cold + 2 Hot (Battleship & BS Cold)</li>
          </ul>
          <strong>If NO:</strong>
          <ul>
            <li>To Roll: Return Hot + 5 Hot Jumps (Battleship)</li>
            <li>To Crit: Return Hot + Cold + 3 Hot (Battleship & BS Cold)</li>
          </ul>
          <em>All ships end on the original side.</em>
        `;
        break;

      case 'orange': // 3300G
        plan += `
          🟧 <strong>3300G Wormhole</strong><br><br>
          <strong>Initial Check:</strong>
          <ul>
            <li>1 Cold Jump (Battleship, ${BS_COLD.toLocaleString()} kg)</li>
            <li>5 Hot Jumps (Battleship, ${BS_HOT.toLocaleString()} kg each)</li>
            <li>🔍 Ask: Is the hole reduced?</li>
          </ul>
          <strong>If YES:</strong>
          <ul>
            <li>To Roll: 2 Cold + 4 Hot (Battleship)</li>
            <li>To Crit: 4 Hot (Battleship) + HIC Cold (${HIC_COLD.toLocaleString()} kg) if needed</li>
          </ul>
          <strong>If NO:</strong>
          <ul>
            <li>To Roll: 6 Hot Jumps (Battleship)</li>
            <li>To Crit: Cold + 5 Hot (Battleship & BS Cold)</li>
          </ul>
          <em>All ships end on the original side.</em>
        `;
        break;

      default:
        plan += `⚠️ No stable-state logic defined for this wormhole class.`;
    }
  }

  plan += `</div>`;
  out.innerHTML = plan;
}

init();
