import { wormholes } from './data/wormholes.js';

const BS_COLD  = 200_000_000;   // Battleship cold jump
const BS_HOT   = 300_000_000;   // Battleship hot jump
const HIC_COLD =   830_000;     // HIC cold jump (entangled)
const HIC_HOT  = 132_400_000;   // HIC hot jump

let maxMass = 0;

function init() {
  const typeSel = document.getElementById('wormhole-type');
  const genBtn  = document.getElementById('generate-btn');

  // populate wormhole dropdown
  wormholes.forEach(w => {
    const o = document.createElement('option');
    o.value = w.type;
    o.textContent = `${w.type} – ${w.from || '?'} → ${w.to || '?'}`;
    typeSel.append(o);
  });

  // store maxMass in kg
  typeSel.addEventListener('change', () => {
    const w = wormholes.find(x => x.type === typeSel.value);
    maxMass = w ? w.totalMass : 0;
  });

  genBtn.addEventListener('click', generatePlan);
}

// classify by your JSON’s mass (in kg)
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
  let html = `<div class="plan-box">
    <h3>${type} — ${status.toUpperCase()}</h3>`;

  // CRITICAL
  if (status === 'critical') {
    html += `
    <h4>Critical (&lt;10%)</h4>
    <ul>
      <li>HIC Cold jump <strong>IN</strong> (${HIC_COLD.toLocaleString()} kg)</li>
      <li>HIC Hot jump <strong>OUT</strong> (${HIC_HOT.toLocaleString()} kg) → collapse</li>
    </ul>
    <p><em>Repeat until popped; ends on same side.</em></p>`;
  }

  // UNSTABLE
  else if (status === 'unstable') {
    const rem = Math.floor(maxMass * 0.11);
    html += `
    <h4>Unstable (≈${rem.toLocaleString()} kg remaining)</h4>`;
    if (rem < BS_COLD) {
      html += `
      <ul>
        <li>HIC Cold jump <strong>IN</strong> (${HIC_COLD.toLocaleString()} kg)</li>
        <li>HIC Hot jump <strong>OUT</strong> (${HIC_HOT.toLocaleString()} kg) → collapse</li>
      </ul>
      <p><em>1 ship; ends on same side.</em></p>`;
    } else {
      html += `
      <ul>
        <li>Battleship Cold jump <strong>IN</strong> (${BS_COLD.toLocaleString()} kg)</li>
        <li>Battleship Hot jump <strong>OUT</strong> (${BS_HOT.toLocaleString()} kg) → collapse</li>
      </ul>
      <p><em>1 ship; ends on same side.</em></p>`;
    }
  }

  // STABLE
  else {
    switch (color) {
      case 'blue': // 1000G
        html += `
        <h4>1000G Wormhole</h4>
        <h4>Initial Check</h4>
        <ul>
          <li>1 Cold Jump (BS, ${BS_COLD.toLocaleString()} kg)</li>
          <li>1 Hot Jump (BS, ${BS_HOT.toLocaleString()} kg)</li>
          <li>🔍 Ask: Is the hole reduced?</li>
        </ul>
        <h4>If YES</h4>
        <ul>
          <li>To Roll: 2 Hot Jumps (BS, ${BS_HOT.toLocaleString()} kg each)</li>
          <li>To Crit: 2 Cold Jumps (BS, ${BS_COLD.toLocaleString()} kg each)</li>
        </ul>
        <h4>If NO</h4>
        <ul>
          <li>To Roll: 2 Hot Jumps (BS, ${BS_HOT.toLocaleString()} kg each)</li>
          <li>To Crit: 1 Cold + 1 Hot (BS Cold ${BS_COLD.toLocaleString()} kg + BS Hot ${BS_HOT.toLocaleString()} kg)</li>
        </ul>
        <p><em>All ships end on the original side.</em></p>`;
        break;

      case 'green': // 2000G
        html += `
        <h4>2000G Wormhole</h4>
        <h4>Initial Check</h4>
        <ul>
          <li>2 Cold Jumps (BS, ${BS_COLD.toLocaleString()} kg each)</li>
          <li>2 Hot Jumps (BS, ${BS_HOT.toLocaleString()} kg each)</li>
          <li>🔍 Ask: Is the hole reduced?</li>
        </ul>
        <h4>If YES</h4>
        <ul>
          <li>To Roll: 2 Cold + 2 Hot (BS)</li>
          <li>To Crit: 4 Cold (BS, ${BS_COLD.toLocaleString()} kg)</li>
        </ul>
        <h4>If NO</h4>
        <ul>
          <li>To Roll: 4 Hot (BS, ${BS_HOT.toLocaleString()} kg each)</li>
          <li>To Crit: 2 Cold + 2 Hot (BS)</li>
        </ul>
        <p><em>All ships end on the original side.</em></p>`;
        break;

      case 'yellow': // 3000G
        html += `
        <h4>3000G Wormhole</h4>
        <h4>Initial Check</h4>
        <ul>
          <li>5 Hot Jumps (BS, ${BS_HOT.toLocaleString()} kg each)</li>
          <li>🔍 Ask: Is the hole reduced?</li>
        </ul>
        <h4>If YES</h4>
        <ul>
          <li>To Roll: Return Hot + 4 Hot (BS)</li>
          <li>To Crit: Return Hot + Cold + 2 Hot (BS & BS Cold)</li>
        </ul>
        <h4>If NO</h4>
        <ul>
          <li>To Roll: Return Hot + 5 Hot (BS)</li>
          <li>To Crit: Return Hot + Cold + 3 Hot (BS & BS Cold)</li>
        </ul>
        <p><em>All ships end on the original side.</em></p>`;
        break;

      case 'orange': // 3300G
        html += `
        <h4>3300G Wormhole</h4>
        <h4>Initial Check</h4>
        <ul>
          <li>1 Cold + 5 Hot Jumps (BS, Cold ${BS_COLD.toLocaleString()} kg + Hot ${BS_HOT.toLocaleString()} kg each)</li>
          <li>🔍 Ask: Is the hole reduced?</li>
        </ul>
        <h4>If YES</h4>
        <ul>
          <li>To Roll: 2 Cold + 4 Hot (BS)</li>
          <li>To Crit: 4 Hot (BS) + HIC Cold (${HIC_COLD.toLocaleString()} kg) if needed</li>
        </ul>
        <h4>If NO</h4>
        <ul>
          <li>To Roll: 6 Hot (BS)</li>
          <li>To Crit: Cold + 5 Hot (BS & BS Cold)</li>
        </ul>
        <p><em>All ships end on the original side.</em></p>`;
        break;

      default:
        html += `<p>⚠️ No stable‐state logic defined for this wormhole class.</p>`;
    }
  }

  html += `</div>`;
  out.innerHTML = html;
}

init();
