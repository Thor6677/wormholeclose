import { wormholes } from './data/wormholes.js';

let maxMass = 0;
let remainingMass = 0;

window.onload = () => {
  const select = document.getElementById('wormhole-type');
  wormholes.forEach(wh => {
    const opt = document.createElement('option');
    opt.value = wh.type;
    opt.textContent = `${wh.type} – ${wh.from || '?'} → ${wh.to || '?'}`;
    select.appendChild(opt);
  });

  document.getElementById('wormhole-status').addEventListener('change', updateMassFromStatus);
};

function getColorCodeByMass(mass) {
  if (mass >= 3_300_000) return 'orange';
  if (mass >= 3_000_000) return 'yellow';
  if (mass >= 2_000_000) return 'green';
  if (mass >= 1_000_000) return 'blue';
  return 'unknown';
}

window.updateWormholeMass = function () {
  const type = document.getElementById('wormhole-type').value;
  const wh = wormholes.find(w => w.type === type);
  if (!wh) return;

  maxMass = wh.totalMass;
  document.getElementById('max-mass-display').textContent = maxMass.toLocaleString() + ' kg';

  document.getElementById('wormhole-status').value = 'stable';
  updateMassFromStatus();
};

function updateMassFromStatus() {
  const status = document.getElementById('wormhole-status').value;

  if (status === 'stable') {
    remainingMass = maxMass;
  } else if (status === 'unstable') {
    remainingMass = Math.floor(maxMass * 0.11);
  } else if (status === 'critical') {
    remainingMass = Math.floor(maxMass * 0.01);
  }

  document.getElementById('remaining-mass-display').textContent = remainingMass.toLocaleString() + ' kg';
}

window.generateRollPlan = function () {
  const type = document.getElementById('wormhole-type').value;
  const status = document.getElementById('wormhole-status').value;
  const endSide = document.getElementById('end-side').value;
  const wh = wormholes.find(w => w.type === type);
  const output = document.getElementById('plan-output');

  if (!wh) {
    output.innerHTML = `<p>Please select a valid wormhole type.</p>`;
    return;
  }

  const percentRemaining = (remainingMass / maxMass) * 100;

  const colorCode = getColorCodeByMass(maxMass);
  let intro = `<strong>Wormhole Type:</strong> ${type} (${maxMass.toLocaleString()} kg)<br>`;
  intro += `<strong>Status:</strong> ${status.charAt(0).toUpperCase() + status.slice(1)}<br>`;
  intro += `<strong>Desired End Side:</strong> ${endSide === 'same' ? 'Same Side' : 'Opposite Side'}<br><br>`;

  let plan = '';
  const BS = 'Battleship (BS)';
  const Cru = 'Cruiser';
  const hic = 'HIC (Heavy Interdictor)';

  if (status === 'critical') {
    plan = `
      🔴 <strong>Critical (<10%)</strong><br><br>
      Suggested Ship: <strong>${hic}</strong><br>
      ➤ Use 1 Cold jump at a time.<br>
      ➤ Avoid Hot jumps unless collapsing intentionally.<br>
      ➤ <em>Same Side:</em> Repeat Cold until collapse.<br>
      ➤ <em>Opposite Side:</em> Hot jump, wait 60s, second Hot jump to collapse.
    `;
  } else if (status === 'unstable') {
    plan = `
      ⚠️ <strong>Unstable (50–10%)</strong><br><br>
      Suggested Ships: <strong>${BS}</strong> or <strong>${Cru}</strong><br>
      ➤ Jump 2 Cold + 2 Hot through.<br>
      ➤ Check WH status after each pair.<br>
      ➤ <em>Same Side:</em> Return 2 Cold + 2 Hot.<br>
      ➤ <em>Opposite Side:</em> Add final Hot jump from your side.
    `;
  } else {
    switch (colorCode) {
      case 'blue':
        plan = `
          🟦 <strong>Stable (1000G)</strong><br>
          ➤ Jump 1 Cold + 1 Hot (${BS})<br>
          🔍 Check if reduced<br><br>

          If YES:<br>
          ➤ Roll: 2 Hot<br>
          ➤ Crit: 2 Cold<br><br>

          If NO:<br>
          ➤ Roll: 2 Hot<br>
          ➤ Crit: 1 Cold + 1 Hot<br><br>

          ➤ <em>${endSide === 'same' ? 'Ensure all ships return in same configuration' : 'Add extra Hot to land opposite'}</em>
        `;
        break;

      case 'green':
        plan = `
          🟩 <strong>Stable (2000G)</strong><br>
          ➤ Jump 2 Cold + 2 Hot<br>
          🔍 Check if reduced<br><br>

          If YES:<br>
          ➤ Roll: 2 Cold + 2 Hot<br>
          ➤ Crit: 4 Cold<br><br>

          If NO:<br>
          ➤ Roll: 4 Hot<br>
          ➤ Crit: 2 Cold + 2 Hot<br><br>

          ➤ <em>${endSide === 'same' ? 'Match return jumps' : 'Add 1 Hot to finish'}</em>
        `;
        break;

      case 'yellow':
        plan = `
          🟨 <strong>Stable (3000G)</strong><br>
          ➤ Jump 5 Hot<br>
          🔍 Check if reduced<br><br>

          If YES:<br>
          ➤ Roll: Return Hot + 4 Hot<br>
          ➤ Crit: Return Hot + Cold + 2 Hot<br><br>

          If NO:<br>
          ➤ Roll: Return Hot + 5 Hot<br>
          ➤ Crit: Return Hot + Cold + 3 Hot<br><br>

          ➤ <em>${endSide === 'same' ? 'Use HIC for final tweak' : 'Final Hot jump to land opposite'}</em>
        `;
        break;

      case 'orange':
        plan = `
          🟧 <strong>Stable (3300G)</strong><br>
          ➤ Jump 1 Cold + 5 Hot<br>
          🔍 Check if reduced<br><br>

          If YES:<br>
          ➤ Roll: 2 Cold + 4 Hot<br>
          ➤ Crit: 4 Hot + HIC<br><br>

          If NO:<br>
          ➤ Roll: 6 Hot<br>
          ➤ Crit: Cold + 5 Hot<br><br>

          ➤ <em>${endSide === 'same' ? 'HIC advised on return' : 'Add Hot jump on far side'}</em>
        `;
        break;

      default:
        plan = `<p>⚠️ No rolling logic defined for this wormhole class.</p>`;
    }
  }

  output.innerHTML = `<div class="plan-box">${intro}${plan}</div>`;
};
