import { wormholes } from './data/wormholes.js';

let totalMass = 0;

window.onload = () => {
  const select = document.getElementById('wormhole-type');
  wormholes.forEach(wh => {
    const opt = document.createElement('option');
    opt.value = wh.type;
    opt.textContent = `${wh.type} – ${wh.from || '?'} → ${wh.to || '?'}`;
    select.appendChild(opt);
  });
};

function getColorCodeByMass(mass) {
  // Adjusted thresholds to match your real data (values in millions)
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

  document.getElementById('max-mass').value = wh.totalMass;
  document.getElementById('remaining-mass').value = wh.totalMass;
};

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

  let intro = `<strong>Wormhole Type:</strong> ${type} (${wh.totalMass.toLocaleString()}kg)<br>`;
  intro += `<strong>Status:</strong> ${status.charAt(0).toUpperCase() + status.slice(1)}<br><br>`;

  const cold = 200_000; // 200M kg
  const hot = 300_000;  // 300M kg

  let plan = '';

  switch (colorCode) {
    case 'orange':
      if (status === 'stable') {
        plan = `
          🔸 Jump 5 Hot, 1 Cold<br>
          🔍 Check if status is reduced (Unstable)<br><br>
          If <strong>Still Stable</strong>:<br>
          ➤ Return 6 Hot to collapse<br><br>
          If <strong>Now Unstable</strong>:<br>
          ➤ Return 2 Cold, 4 Hot to collapse
        `;
      } else if (status === 'unstable') {
        plan = `
          ➤ Jump 2 Cold, 4 Hot through<br>
          ➤ Collapse from other side with same mass (2 Cold, 4 Hot)<br>
        `;
      } else if (status === 'critical') {
        plan = `
          ❗ Use 1 Hot ship at a time<br>
          🧍 Have a HIC (Heavy Interdictor) ready if needed<br>
          ➤ Jump 1 Hot ship repeatedly until collapse
        `;
      }
      break;

    case 'yellow':
      if (status === 'stable') {
        plan = `
          🔸 Jump 5 Hot<br>
          🔍 Check if status is reduced<br><br>
          If <strong>Still Stable</strong>:<br>
          ➤ Return 5 Hot<br><br>
          If <strong>Unstable</strong>:<br>
          ➤ Return 1 Cold, 4 Hot
        `;
      } else if (status === 'unstable') {
        plan = `
          ➤ Jump 1 Cold, 4 Hot through<br>
          ➤ Collapse with return jump (same config)
        `;
      } else {
        plan = `
          ⚠️ Use Hot jumps carefully<br>
          ➤ Return Hot jumps one by one until collapse<br>
          🧍 HIC mass may be needed
        `;
      }
      break;

    case 'green':
      plan = `
        ➤ Jump 2 Cold, 2 Hot<br>
        🔍 Check status<br>
        ➤ Repeat up to 4 total jumps<br>
        ➤ Match cold/hot on return based on updated state
      `;
      break;

    case 'blue':
      plan = `
        ➤ Jump 1 Cold, 1 Hot<br>
        🔍 Check status<br><br>
        If <strong>Still Stable</strong>:<br>
        ➤ 2 Hot return jumps<br><br>
        If <strong>Unstable</strong>:<br>
        ➤ 1 Cold, 1 Hot return
      `;
      break;

    default:
      plan = `⚠️ No rolling strategy available for this wormhole type. It may not support battleship mass.`;
  }

  output.innerHTML = `${intro}<div class="plan-box">${plan}</div>`;
};
