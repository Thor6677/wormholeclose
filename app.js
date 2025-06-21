import { wormholes } from './data/wormholes.js';

const BS_COLD  = 200_000_000;   // Battleship cold
const BS_HOT   = 300_000_000;   // Battleship hot
const HIC_COLD =   830_000;     // HIC cold (entangled)
const HIC_HOT  = 132_400_000;   // HIC hot

let maxMass = 0;

function init() {
  const typeSel = document.getElementById('wormhole-type');
  const genBtn  = document.getElementById('generate-btn');

  // populate types
  wormholes.forEach(w => {
    const o = document.createElement('option');
    o.value = w.type;
    o.textContent = `${w.type} – ${w.from||'?'} → ${w.to||'?'}`;
    typeSel.append(o);
  });

  // on selection, store mass (kg)
  typeSel.addEventListener('change', () => {
    const w = wormholes.find(x => x.type === typeSel.value);
    maxMass = w ? w.totalMass : 0;
  });

  genBtn.addEventListener('click', generatePlan);
}

// classify by JSON’s kg values
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
    out.textContent = '❗ Unable to read wormhole mass.';
    return;
  }

  const color = getColorCode();
  let plan = `<div class="plan-box"><strong>${type}</strong> — <em>${status.toUpperCase()}</em><br><br>`;

  // 1) CRITICAL
  if (status === 'critical') {
    plan += `
      1. HIC Cold jump <strong>IN</strong> (${HIC_COLD.toLocaleString()} kg)<br>
      2. HIC HOT jump <strong>OUT</strong> (${HIC_HOT.toLocaleString()} kg) → collapse<br>
      <em>(Repeat IN→OUT until popped; always ends same side.)</em>
    `;
  }

  // 2) UNSTABLE
  else if (status === 'unstable') {
    const rem = Math.floor(maxMass * 0.11);
    plan += `<!-- ~${rem.toLocaleString()} kg remaining -->`;
    if (rem < BS_COLD) {
      plan += `
        1. HIC Cold jump <strong>IN</strong> (${HIC_COLD.toLocaleString()} kg)<br>
        2. HIC HOT jump <strong>OUT</strong> (${HIC_HOT.toLocaleString()} kg) → collapse<br>
        <em>1 ship, same side.</em>
      `;
    } else {
      plan += `
        1. Battleship Cold jump <strong>IN</strong> (${BS_COLD.toLocaleString()} kg)<br>
        2. Battleship HOT jump <strong>OUT</strong> (${BS_HOT.toLocaleString()} kg) → collapse<br>
        <em>1 ship, same side.</em>
      `;
    }
  }

  // 3) STABLE
  else {
    switch (color) {
      case 'blue': // 1000G
        plan += `
          🟦 <strong>1000G Wormhole</strong><br><br>
          <strong>Initial Check:</strong>
          <ul>
            <li>1 Cold Jump (BS Cold: 200 M kg)</li>
            <li>1 Hot Jump (BS Hot: 300 M kg)</li>
            <li>🔍 Ask: Is the hole reduced?</li>
          </ul>
          <strong>If YES:</strong>
          <ul>
            <li>To Roll: 2 Hot Jumps (BS Hot)</li>
            <li>To Crit: 2 Cold Jumps (BS Cold)</li>
          </ul>
          <strong>If NO:</strong>
          <ul>
            <li>To Roll: 2 Hot Jumps (BS Hot)</li>
            <li>To Crit: 1 Cold Jump (BS Cold) + 1 Hot Jump (BS Hot)</li>
          </ul>
          <em>All ships end on original side.</em>
        `;
        break;

      case 'green': // 2000G
        plan += `
          🟩 <strong>2000G Wormhole</strong><br><br>
          <strong>Initial Check:</strong>
          <ul>
            <li>2 Cold Jumps (BS Cold)</li>
            <li>2 Hot Jumps (BS Hot)</li>
            <li>🔍 Ask: Is the hole reduced?</li>
          </ul>
          <strong>If YES:</strong>
          <ul>
            <li>To Roll: 2 Cold + 2 Hot (BS Cold & BS Hot)</li>
            <li>To Crit: 4 Cold Jumps (BS Cold)</li>
          </ul>
          <strong>If NO:</strong>
          <ul>
            <li>To Roll: 4 Hot Jumps (BS Hot)</li>
            <li>To Crit: 2 Cold + 2 Hot (BS Cold & BS Hot)</li>
          </ul>
          <em>All ships end on original side.</em>
        `;
        break;

      case 'yellow': // 3000G
        plan += `
          🟨 <strong>3000G Wormhole</strong><br><br>
          <strong>Initial Check:</strong>
          <ul>
            <li>5 Hot Jumps (BS Hot)</li>
            <li>🔍 Ask: Is the hole reduced?</li>
          </ul>
          <strong>If YES:</strong>
          <ul>
            <li>To Roll: Return Hot + 4 Hot Jumps (BS Hot)</li>
            <li>To Crit: Return Hot + Cold + 2 Hot Jumps (BS Cold & BS Hot)</li>
          </ul>
          <strong>If NO:</strong>
          <ul>
            <li>To Roll: Return Hot + 5 Hot Jumps (BS Hot)</li>
            <li>To Crit: Return Hot + Cold + 3 Hot Jumps (BS Cold & BS Hot)</li>
          </ul>
          <em>All ships end on original side.</em>
        `;
        break;

      case 'orange': // 3300G
        plan += `
          🟧 <strong>3300G Wormhole</strong><br><br>
          <strong>Initial Check:</strong>
          <ul>
            <li>1 Cold Jump (BS Cold) + 5 Hot Jumps (BS Hot)</li>
            <li>🔍 Ask: Is the hole reduced?</li>
          </ul>
          <strong>If YES:</strong>
          <ul>
            <li>To Roll: 2 Cold + 4 Hot (BS Cold & BS Hot) <em>(HIC optional)</em></li>
            <li>To Crit: 4 Hot (BS Hot) + HIC once (if needed)</li>
          </ul>
          <strong>If NO:</strong>
          <ul>
            <li>To Roll: 6 Hot (BS Hot) <em>(HIC optional)</em></li>
            <li>To Crit: Cold + 5 Hot (BS Cold & BS Hot)</li>
          </ul>
          <em>All ships end on original side.</em>
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
