import { wormholes } from './data/wormholes.js';

let totalMass = 0;

window.onload = () => {
  const select = document.getElementById('wormhole-type');
  wormholes.forEach(wh => {
    const opt = document.createElement('option');
    opt.value = wh.type;
    opt.textContent = `${wh.type} – ${wh.from || '?'} → ${wh.to}`;
    select.appendChild(opt);
  });
};

window.updateWormholeMass = function () {
  const type = document.getElementById('wormhole-type').value;
  const wh = wormholes.find(w => w.type === type);
  if (!wh) return;

  document.getElementById('max-mass').value = wh.totalMass;
  document.getElementById('remaining-mass').value = wh.totalMass;
};

window.logJump = function () {
  const shipMass = parseInt(document.getElementById('ship-mass').value, 10);
  const maxMass = parseInt(document.getElementById('max-mass').value, 10);
  const remainingMassInput = document.getElementById('remaining-mass');
  let remainingMass = parseInt(remainingMassInput.value, 10);

  if (isNaN(shipMass) || isNaN(maxMass)) {
    alert('Please enter valid numbers for ship mass and max wormhole mass.');
    return;
  }

  totalMass += shipMass;
  remainingMass -= shipMass;
  remainingMassInput.value = remainingMass;

  const li = document.createElement('li');
  li.textContent = `Jumped: ${shipMass.toLocaleString()} kg | Remaining: ${remainingMass.toLocaleString()} kg`;
  document.getElementById('jump-log').appendChild(li);

  updateStatus(remainingMass, maxMass);
};

function updateStatus(remaining, max) {
  const statusText = document.getElementById('status-text');
  const percent = (remaining / max) * 100;

  if (percent > 75) {
    statusText.textContent = "Stable – Plenty of mass remaining.";
    statusText.style.color = "lightgreen";
  } else if (percent > 25) {
    statusText.textContent = "Caution – Wormhole weakening.";
    statusText.style.color = "gold";
  } else {
    statusText.textContent = "Danger – Collapse imminent!";
    statusText.style.color = "red";
  }
}
