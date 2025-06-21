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
  const endSide = document.getElementById('end-side').value; // "same" or "other"
  const wh = wormholes.find(w => w.type === type);
  const output = document.getElementById('plan-output');

  if (!wh) {
    output.innerHTML = `<p>Please select a valid wormhole type.</p>`;
    return;
  }

  const colorCode = getColorCodeByMass(wh.totalMass);
  let intro = `<strong>Wormhole Type:</strong> ${type} (${wh.totalMass.toLocaleString()} kg)<br>`;
  intro += `<strong>Status:</strong> ${status.charAt(0).toUpperCase() + status.slice(1)}<br>`;
  intro += `<strong>Desired End Side:</strong> ${endSide === 'same' ? 'Same Side' : 'Opposite Side'}<br><br>`;

  let plan = '';
  const BS = 'Battleship (BS)';
  const Cru = 'Cruiser';
  const hic = 'HIC';

  if (status === 'unstable') {
    plan = `
      ⚠️ The wormhole is <strong>Unstable</strong> (50–10%).<br><br>
      Suggested Ships: <strong>${BS}</strong> or <strong>${Cru}</strong><br><br>
      ✅ <strong>Safe Rolling Guide:</strong><br>
      ➤ Jump <strong>2 Cold + 2 Hot</strong> in pairs<br>
      ➤ Check status again<br><br>
      If still unstable:<br>
      ➤ Return <strong>2 Cold + 2 Hot</strong> to collapse on current side.<br>
      ➤ If ending on <strong>opposite</strong> side, finish with <strong>1 Hot</strong> or <strong>1 Cold</strong> as needed.<br><br>
      ❗ If you end in Critical, switch to HIC-based closure.
    `;
  }
  else if (status === 'critical') {
    plan = `
      🔴 <strong>CRITICAL STATE</strong> (<10%) — high collapse risk.<br><br>
      Suggested Ships: <strong>${hic}</strong> or small frigate due to fine control.<br><br>
      ➤ Jump <strong>1 Cold ship (HIC)</strong><br>
      ➤ If ending on same side, repeat <strong>1 Cold</strong> until collapse occurs.<br>
      ➤ If ending on opposite, after Cold-jump check scanners.<br><br>
      🧭 <u>Alternative (intentional collapse from far side):</u><br>
      ➤ Jump 1 Hot <strong>from your side</strong>, wait 60s, then repeat.<br><br>
      👉 Always scan carefully to confirm side and collapse.
    `;
  }
  else {
    switch (colorCode) {
      case 'blue':
        plan = `
          🎯 <strong>Initial Check:</strong><br>
          ➤ 1 Cold + 1 Hot jump (use ${BS})<br>
          🔍 Ask: "Is hole reduced?"<br><br>

          <strong>If YES:</strong><br>
          ➤ <em>To Roll:</em> 2 Hot jumps<br>
          ➤ <em>To Crit:</em> 2 Cold jumps<br><br>

          <strong>If NO:</strong><br>
          ➤ <em>To Roll:</em> 2 Hot jumps<br>
          ➤ <em>To Crit:</em> 1 Cold + 1 Hot jump<br><br>

          ➤ If ending on the opposite side, finish with 1 extra Hot jump.
        `;
        break;

      case 'green':
        plan = `
          🎯 <strong>Initial Check:</strong><br>
          ➤ 2 Cold + 2 Hot (${BS})<br>
          🔍 Ask: "Is hole reduced?"<br><br>

          <strong>If YES:</strong><br>
          ➤ <em>To Roll:</em> 2 Cold + 2 Hot<br>
          ➤ <em>To Crit:</em> 4 Cold<br><br>

          <strong>If NO:</strong><br>
          ➤ <em>To Roll:</em> 4 Hot<br>
          ➤ <em>To Crit:</em> 2 Cold + 2 Hot<br><br>

          ➤ Ending opposite side? Add Hot after rolling step.
        `;
        break;

      case 'yellow':
        plan = `
          🎯 <strong>Initial Check:</strong><br>
          ➤ 5 Hot (${BS})<br>
          🔍 Ask: "Is hole reduced?"<br><br>

          <strong>If YES:</strong><br>
          ➤ <em>To Roll:</em> Return Hot + 4 Hot<br>
          ➤ <em>To Crit:</em> Return Hot + Cold + 2 Hot<br><br>

          <strong>If NO:</strong><br>
          ➤ <em>To Roll:</em> Return Hot + 5 Hot<br>
          ➤ <em>To Crit:</em> Return Hot + Cold + 3 Hot<br><br>

          ➤ Use HIC (cold) at Crit for safe collapse.<br>
          ➤ Ending opposite side? Finish with Hot.
        `;
        break;

      case 'orange':
        plan = `
          🎯 <strong>Initial Check:</strong><br>
          ➤ 1 Cold + 5 Hot (${BS})<br>
          🔍 Ask: "Is hole reduced?"<br><br>

          <strong>If YES:</strong><br>
          ➤ <em>To Roll:</em> 2 Cold + 4 Hot (use ${hic} if needed)<br>
          ➤ <em>To Crit:</em> 4 Hot + optional ${hic}<br><br>

          <strong>If NO:</strong><br>
          ➤ <em>To Roll:</em> 6 Hot (+ ${hic} optional)<br>
          ➤ <em>To Crit:</em> Cold + 5 Hot<br><br>

          ➤ For Crit closures, recommended: 1 Cold (HIC) + 5 Hot.<br>
          ➤ Ending on opposite — finish with 1 Hot jump.
        `;
        break;

      default:
        plan = `
          ⚠️ No rolling strategy available for this wormhole mass category.
        `;
    }
  }

  output.innerHTML = `<div class="plan-box">${intro}${plan}</div>`;
};
