import { wormholes } from './data/wormholes.js';

let maxMass = 0;
let remainingMass = 0;

function init() {
  const typeSelect = document.getElementById('wormhole-type');
  const statusSelect = document.getElementById('wormhole-status');
  const generateBtn = document.getElementById('generate-btn');

  // Populate types
  wormholes.forEach(wh => {
    const opt = document.createElement('option');
    opt.value = wh.type;
    opt.textContent = `${wh.type} – ${wh.from || '?'} → ${wh.to || '?'}`;
    typeSelect.appendChild(opt);
  });

  // Event bindings
  typeSelect.addEventListener('change', onTypeChange);
  statusSelect.addEventListener('change', onStatusChange);
  generateBtn.addEventListener('click', onGenerate);
}

function getColorCodeByMass(m) {
  if (m >= 3_300_000) return 'orange';
  if (m >= 3_000_000) return 'yellow';
  if (m >= 2_000_000) return 'green';
  if (m >= 1_000_000) return 'blue';
  return 'unknown';
}

function onTypeChange() {
  const selected = document.getElementById('wormhole-type').value;
  const wh = wormholes.find(w => w.type === selected);
  if (!wh) return;

  maxMass = wh.totalMass;
  document.getElementById('max-mass-display').textContent = `${maxMass.toLocaleString()} kg`;
  document.getElementById('wormhole-status').value = 'stable';
  onStatusChange();
}

function onStatusChange() {
  const status = document.getElementById('wormhole-status').value;
  if (!maxMass) return;

  if (status === 'stable') remainingMass = maxMass;
  else if (status === 'unstable') remainingMass = Math.floor(maxMass * 0.11);
  else if (status === 'critical') remainingMass = Math.floor(maxMass * 0.01);

  document.getElementById('remaining-mass-display').textContent = `${remainingMass.toLocaleString()} kg`;
}

function onGenerate() {
  const type = document.getElementById('wormhole-type').value;
  const status = document.getElementById('wormhole-status').value;
  const endSide = document.getElementById('end-side').value;
  const wh = wormholes.find(w => w.type === type);

  const output = document.getElementById('plan-output');
  output.innerHTML = ''; // Clear old plan

  if (!wh) {
    output.textContent = '❌ Please select a valid wormhole type.';
    return;
  }

  const pct = (remainingMass / maxMass) * 100;
  const expected =
    pct > 50 ? 'stable' :
    pct > 10 ? 'unstable' :
    'critical';

  if (expected !== status) {
    output.innerHTML = `
      <div class="warning">
        ⚠️ Status "${status}" does not match mass (${pct.toFixed(1)}%).<br>
        Expect "${expected}". Please adjust.
      </div>`;
    return;
  }

  // Build plan
  const color = getColorCodeByMass(maxMass);
  const BS = 'Battleship (BS)';
  const Cru = 'Cruiser';
  const HIC = 'HIC';
  let plan = '';
  let intro = `<strong>Type:</strong> ${type} (${maxMass.toLocaleString()} kg)<br>`
            + `<strong>Status:</strong> ${status}<br>`
            + `<strong>End:</strong> ${endSide === 'same' ? 'Same Side' : 'Opposite Side'}<br><br>`;

  if (status === 'critical') {
    plan = `
      🔴 Critical (<10%)<br>
      ➤ Use <strong>${HIC}</strong> Cold-jump only.<br>
      ➤ <em>${endSide === 'same' ? 'Repeat until collapse.' : 'Cold then Hot after 60s.'}</em>`;
  } else if (status === 'unstable') {
    plan = `
      ⚠️ Unstable (50–10%)<br>
      ➤ Use <strong>${BS}</strong> or <strong>${Cru}</strong>: Jump 2 Cold + 2 Hot.<br>
      ➤ Then <em>${endSide === 'same' ? 'return 2 Cold + 2 Hot.' : 'add final Hot to land opposite.'}</em>`;
  } else {
    switch (color) {
      case 'blue':
        plan = `
          🟦 Stable (1000G)<br>
          ➤ 1 Cold + 1 Hot then check:<br>
          ➤ If reduced: Roll=2 Hot, Crit=2 Cold<br>
          ➤ If not: Roll=2 Hot, Crit=1 Cold + 1 Hot<br>
          ➤ ${endSide === 'same' ? 'Return matching.' : 'Add extra Hot for opposite.'}`;
        break;
      case 'green':
        plan = `
          🟩 Stable (2000G)<br>
          ➤ 2 Cold + 2 Hot then check:<br>
          ➤ If reduced: Roll=2 Cold+2 Hot, Crit=4 Cold<br>
          ➤ If not: Roll=4 Hot, Crit=2 Cold+2 Hot<br>
          ➤ ${endSide === 'same' ? 'Return matching.' : 'Add extra Hot.'}`;
        break;
      case 'yellow':
        plan = `
          🟨 Stable (3000G)<br>
          ➤ 5 Hot then check:<br>
          ➤ If reduced: Roll=Return Hot +4 Hot, Crit=Return Hot + Cold +2 Hot<br>
          ➤ If not: Roll=Return Hot +5 Hot, Crit=Return Hot + Cold +3 Hot<br>
          ➤ ${endSide === 'same' ? 'Use HIC final tweak.' : 'Extra Hot at end.'}`;
        break;
      case 'orange':
        plan = `
          🟧 Stable (3300G)<br>
          ➤ 1 Cold + 5 Hot then check:<br>
          ➤ If reduced: Roll=2 Cold+4 Hot, Crit=4 Hot+HIC<br>
          ➤ If not: Roll=6 Hot, Crit=Cold+5 Hot<br>
          ➤ ${endSide === 'same' ? 'HIC advised.' : 'Extra Hot end.'}`;
        break;
      default:
        plan = '⚠️ No strategy for this mass.';
    }
  }

  output.innerHTML = `<div class="plan-box">${intro}${plan}</div>`;
}

init();
