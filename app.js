import { wormholes } from './data/wormholes.js';

const BS_COLD  = 200_000_000;   // Battleship cold jump mass
const BS_HOT   = 300_000_000;   // Battleship hot jump mass
const HIC_COLD =   830_000;     // HIC cold jump mass (entangled)
const HIC_HOT  = 132_400_000;   // HIC hot jump mass

let maxMass = 0;

function init() {
  const typeSel   = document.getElementById('wormhole-type');
  const statusSel = document.getElementById('wormhole-status');
  const genBtn    = document.getElementById('generate-btn');

  // Populate wormhole types
  wormholes.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w.type;
    opt.textContent = `${w.type} – ${w.from || '?'} → ${w.to || '?'}`;
    typeSel.append(opt);
  });

  // Update maxMass when a type is selected
  typeSel.addEventListener('change', () => {
    const w = wormholes.find(x => x.type === typeSel.value);
    maxMass = w ? w.totalMass : 0;
  });

  genBtn.addEventListener('click', generatePlan);
}

// Determine wormhole class by maxMass
function getColorCode() {
  if (maxMass >= 3_300_000_000) return 'orange'; // 3300G
  if (maxMass >= 3_000_000_000) return 'yellow'; // 3000G
  if (maxMass >= 2_000_000_000) return 'green';  // 2000G
  if (maxMass >= 1_000_000_000) return 'blue';   // 1000G
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
      <em>(Repeat HIC Cold IN → HIC HOT OUT if not yet collapsed.)</em><br>
      <em>Ends on original side.</em>
    `;
  }

  // ===== UNSTABLE =====
  else if (status === 'unstable') {
    // worst-case remaining = 11% of maxMass
    const rem = maxMass * 0.11;
    plan += `<!-- Estimated remaining ≈ ${Math.floor(rem).toLocaleString()} kg -->`;

    // If hole too small for battleship cold:
    if (rem < BS_COLD) {
      plan += `
        1. HIC Cold jump <strong>IN</strong> (${HIC_COLD.toLocaleString()} kg)<br>
        2. HIC HOT jump <strong>OUT</strong> (${HIC_HOT.toLocaleString()} kg) → collapse<br>
        <em>1 ship, ends same side.</em>
      `;
    }
    else {
      plan += `
        1. Battleship Cold jump <strong>IN</strong> (${BS_COLD.toLocaleString()} kg)<br>
        2. Battleship HOT jump <strong>OUT</strong> (${BS_HOT.toLocaleString()} kg) → collapse<br>
        <em>1 ship, ends same side.</em>
      `;
    }
  }

  // ===== STABLE =====
  else if (status === 'stable') {
    switch (color) {
      case 'blue': // 1000G
        plan += `
          🟦 <strong>1000G Wormhole</strong><br><br>
          <strong>Initial Check:</strong><br>
          • 1 Cold Jump<br>
          • 1 Hot Jump<br>
          🔍 Ask: Is the hole reduced?<br><br>

          <strong>If YES:</strong><br>
          • To Roll: 2 Hot Jumps<br>
          • To Crit: 2 Cold Jumps<br><br>

          <strong>If NO:</strong><br>
          • To Roll: 2 Hot Jumps<br>
          • To Crit: 1 Cold Jump + 1 Hot Jump<br><br>

          <em>All ships end on original side.</em>
        `;
        break;

      case 'green': // 2000G
        plan += `
          🟩 <strong>2000G Wormhole</strong><br><br>
          <strong>Initial Check:</strong><br>
          • 2 Cold Jumps<br>
          • 2 Hot Jumps<br>
          🔍 Ask: Is the hole reduced?<br><br>

          <strong>If YES:</strong><br>
          • To Roll: 2 Cold + 2 Hot Jumps<br>
          • To Crit: 4 Cold Jumps<br><br>

          <strong>If NO:</strong><br>
          • To Roll: 4 Hot Jumps<br>
          • To Crit: 2 Cold + 2 Hot Jumps<br><br>

          <em>All ships end on original side.</em>
        `;
        break;

      case 'yellow': // 3000G
        plan += `
          🟨 <strong>3000G Wormhole</strong><br><br>
          <strong>Initial Check:</strong><br>
          • 5 Hot Jumps<br>
          🔍 Ask: Is the hole reduced?<br><br>

          <strong>If YES:</strong><br>
          • To Roll: Return Hot + 4 Hot Jumps<br>
          • To Crit: Return Hot + Cold Jumps + 2 Hot Jumps<br><br>

          <strong>If NO:</strong><br>
          • To Roll: Return Hot + 5 Hot Jumps<br>
          • To Crit: Return Hot + Cold Jumps + 3 Hot Jumps<br><br>

          <em>All ships end on original side.</em>
        `;
        break;

      case 'orange': // 3300G
        plan += `
          🟧 <strong>3300G Wormhole</strong><br><br>
          <strong>Initial Check:</strong><br>
          • 1 Cold Jump + 5 Hot Jumps<br>
          🔍 Ask: Is the hole reduced?<br><br>

          <strong>If YES:</strong><br>
          • To Roll: 2 Cold + 4 Hot Jumps (HIC once if needed)<br>
          • To Crit: 4 Hot Jumps + HIC once (if needed)<br><br>

          <strong>If NO:</strong><br>
          • To Roll: 6 Hot Jumps (HIC once if needed)<br>
          • To Crit: Cold Jumps + 5 Hot Jumps<br><br>

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
