import { wormholes } from './data/wormholes.js';

let totalMass = 0;

// Populate wormhole dropdown on page load
window.onload = () => {
  const select = document.getElementById('wormhole-type');
  wormholes.forEach(wh => {
    const opt = document.createElement('option');
    opt.value = wh.type;
    opt.textContent = `${wh.type} – ${wh.from || '?'} → ${wh.to || '?'}`;
    select.appendChild(opt);
  });
};

// Categorize wormhole by mass (values in millions of kg)
function getColorCodeByMass(mass) {
  if (mass >= 3_300_000) return 'orange';  // 3300G
  if (mass >= 3_000_000) return 'yellow';  // 3000G
  if (mass >= 2_000_000) return 'green';   // 2000G
  if (mass >= 1_000_000) return 'blue';    // 1000G
  return 'unknown';
}

// Auto-fill max/remaining mass from selected wormhole
window.updateWormholeMass = function () {
  const type = document.getElementById('wormhole-type').value;
  const wh = wormholes.find(w => w.type === type);
  if (!wh) return;

  document.getElementById('max-mass').value = wh.totalMass;
  document.getElementById('remaining-mass').value = wh.totalMass;
};

// Generate the rolling plan
window.generateRollPlan = function () {
  const type = document.getElementById('wormhole-type').value;
  const status = document.getElementById('wormhole-status').value;
  const wh = wormholes.find(w => w.type === type);

  const output = document.getElementById('plan-output');
  if (!wh) {
    output.innerHTML = `<p>Please select a valid wormhole type.</p>`;
    return;
  }

  const colorCode = getColorCodeByMass(wh.totalMass || 0);

  let intro = `<strong>Wormhole Type:</strong> ${type} (${wh.totalMass.toLocaleString()} kg)<br>`;
  intro += `<strong>Status:</strong> ${status.charAt(0).toUpperCase() + status.slice(1)}<br><br>`;

  let plan = '';

  switch (colorCode) {
    case 'blue':
      plan = `
        <strong>Initial Check:</strong><br>
        ➤ 1 Cold Jump<br>
        ➤ 1 Hot Jump<br>
        🔍 Ask: <em>Is the hole reduced?</em><br><br>

        <strong>If YES:</strong><br>
        ➤ <em>To Roll:</em> 2 Hot Jumps<br>
        ➤ <em>To Crit:</em> 2 Cold Jumps<br><br>

        <strong>If NO:</strong><br>
        ➤ <em>To Roll:</em> 2 Hot Jumps<br>
        ➤ <em>To Crit:</em> 1 Cold Jump + 1 Hot Jump
      `;
      break;

    case 'green':
      plan = `
        <strong>Initial Check:</strong><br>
        ➤ 2 Cold Jumps<br>
        ➤ 2 Hot Jumps<br>
        🔍 Ask: <em>Is the hole reduced?</em><br><br>

        <strong>If YES:</strong><br>
        ➤ <em>To Roll:</em> 2 Cold Jumps + 2 Hot Jumps<br>
        ➤ <em>To Crit:</em> 4 Cold Jumps<br><br>

        <strong>If NO:</strong><br>
        ➤ <em>To Roll:</em> 4 Hot Jumps<br>
        ➤ <em>To Crit:</em> 2 Cold Jumps + 2 Hot Jumps
      `;
      break;

    case 'yellow':
      plan = `
        <strong>Initial Check:</strong><br>
        ➤ 5 Hot Jumps<br>
        🔍 Ask: <em>Is the hole reduced?</em><br><br>

        <strong>If YES:</strong><br>
        ➤ <em>To Roll:</em> Return Hot + 4 Hot Jumps<br>
        ➤ <em>To Crit:</em> Return Hot + Cold Jumps + 2 Hot Jumps<br><br>

        <strong>If NO:</strong><br>
        ➤ <em>To Roll:</em> Return Hot + 5 Hot Jumps<br>
        ➤ <em>To Crit:</em> Return Hot + Cold Jumps + 3 Hot Jumps
      `;
      break;

    case 'orange':
      plan = `
        <strong>Initial Check:</strong><br>
        ➤ 1 Cold Jump + 5 Hot Jumps<br>
        🔍 Ask: <em>Is the hole reduced?</em><br><br>

        <strong>If YES:</strong><br>
        ➤ <em>To Roll:</em> 2 Cold Jumps + 4 Hot Jumps (HIC once if needed)<br>
        ➤ <em>To Crit:</em> 4 Hot Jumps + HIC once (if needed)<br><br>

        <strong>If NO:</strong><br>
        ➤ <em>To Roll:</em> 6 Hot Jumps (HIC once if needed)<br>
        ➤ <em>To Crit:</em> Cold Jumps + 5 Hot Jumps
      `;
      break;

    default:
      plan = `
        ⚠️ No step-by-step plan available for this wormhole mass. It may not be rollable using standard battleship mass logic.
      `;
  }

  output.innerHTML = `${intro}<div class="plan-box">${plan}</div>`;
};
