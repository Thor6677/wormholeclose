import { wormholes } from './data/wormholes.js';

// ────────────────────────────────────────────
// Ship jump masses, in the same TONNES unit as your JSON
// ────────────────────────────────────────────
const SHIPS = {
  Battleship: { cold: 200_000, hot: 300_000 },
  Cruiser:    { cold:  36_000, hot: 126_000 },
  HIC:        { cold:     830, hot: 132_400 },
};

let maxMass       = 0;   // wormhole.totalMass in t
let maxIndMass    = 0;   // wormhole.maxIndividualMass in t

function init() {
  const typeSel = document.getElementById('wormhole-type');
  const genBtn  = document.getElementById('generate-btn');

  // 1) Populate the wormhole dropdown
  wormholes.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w.type;
    opt.textContent = `${w.type} – ${w.from||'?'} → ${w.to||'?'}`;
    typeSel.appendChild(opt);
  });

  // 2) When a wormhole is chosen, store its mass limits
  typeSel.addEventListener('change', () => {
    const w = wormholes.find(x => x.type === typeSel.value);
    if (w) {
      maxMass    = w.totalMass;
      maxIndMass = w.maxIndividualMass;
    } else {
      maxMass = maxIndMass = 0;
    }
  });

  // 3) Wire up the button
  genBtn.addEventListener('click', generatePlan);
}

// Return the “largest” ship that can do a cold/hot jump under maxIndMass
function getBestShipForJump(mode /* 'cold' or 'hot' */) {
  for (const type of ['Battleship','Cruiser','HIC']) {
    const mass = SHIPS[type][mode];
    if (mass <= maxIndMass) {
      return { type, mass };
    }
  }
  return null;
}

// Classify wormhole by its totalMass
function getClassKey() {
  if (maxMass >= 3_300_000) return 'orange';
  if (maxMass >= 3_000_000) return 'yellow';
  if (maxMass >= 2_000_000) return 'green';
  if (maxMass >= 1_000_000) return 'blue';
  return null;
}

// Your “Method-Only” stable plans, keyed by classKey
const STABLE_PLANS = {
  blue: {
    title: '1000G Wormhole',
    initial: [{c:1,m:'cold'},{c:1,m:'hot'}],
    yes:   { roll:[{c:2,m:'hot'}],              crit:[{c:2,m:'cold'}] },
    no:    { roll:[{c:2,m:'hot'}],              crit:[{c:1,m:'cold'},{c:1,m:'hot'}] }
  },
  green: {
    title: '2000G Wormhole',
    initial: [{c:2,m:'cold'},{c:2,m:'hot'}],
    yes:   { roll:[{c:2,m:'cold'},{c:2,m:'hot'}], crit:[{c:4,m:'cold'}] },
    no:    { roll:[{c:4,m:'hot'}],              crit:[{c:2,m:'cold'},{c:2,m:'hot'}] }
  },
  yellow: {
    title: '3000G Wormhole',
    initial: [{c:5,m:'hot'}],
    yes:   { roll:[{c:1,m:'hot'},{c:4,m:'hot'}], crit:[{c:1,m:'hot'},{c:1,m:'cold'},{c:2,m:'hot'}] },
    no:    { roll:[{c:1,m:'hot'},{c:5,m:'hot'}], crit:[{c:1,m:'hot'},{c:1,m:'cold'},{c:3,m:'hot'}] }
  },
  orange: {
    title: '3300G Wormhole',
    initial: [{c:1,m:'cold'},{c:5,m:'hot'}],
    yes:   { roll:[{c:2,m:'cold'},{c:4,m:'hot'}], crit:[{c:4,m:'hot'},{c:1,m:'cold'}] },
    no:    { roll:[{c:6,m:'hot'}],              crit:[{c:1,m:'cold'},{c:5,m:'hot'}] }
  }
};

function generatePlan() {
  const type   = document.getElementById('wormhole-type').value;
  const status = document.getElementById('wormhole-status').value;
  const out    = document.getElementById('plan-output');
  out.innerHTML = '';  // clear

  // Basic validations
  if (!type) {
    out.textContent = '❗ Please select a wormhole type.';
    return;
  }
  if (!maxMass || !maxIndMass) {
    out.textContent = '❗ Invalid wormhole mass limits.';
    return;
  }

  let html = `<div class="plan-box"><h3>${type} — ${status.toUpperCase()}</h3>`;

  // 1) CRITICAL
  if (status === 'critical') {
    const inSh  = getBestShipForJump('cold');
    const outSh = getBestShipForJump('hot');
    if (!inSh || !outSh) {
      html += `<p>⚠️ No ship ≤ ${maxIndMass.toLocaleString()} t can make a cold→hot combo here.</p>`;
    } else {
      html += `
      <h4>Critical (<10%)</h4>
      <ul>
        <li>${inSh.type} Cold IN (${inSh.mass.toLocaleString()} t)</li>
        <li>${outSh.type} Hot  OUT (${outSh.mass.toLocaleString()} t) → collapse</li>
      </ul>
      <p><em>Repeat until it pops; all ships end on the same side.</em></p>`;
    }
  }

  // 2) UNSTABLE
  else if (status === 'unstable') {
    const rem = Math.floor(maxMass * 0.11);
    html += `<h4>Unstable (≈${rem.toLocaleString()} t remaining)</h4>`;

    // If a Battleship can do the full in/out safely
    if (
      SHIPS.Battleship.cold <= rem &&
      SHIPS.Battleship.cold <= maxIndMass &&
      SHIPS.Battleship.hot  <= maxIndMass
    ) {
      html += `
      <ul>
        <li>Battleship Cold IN (${SHIPS.Battleship.cold.toLocaleString()} t)</li>
        <li>Battleship Hot  OUT (${SHIPS.Battleship.hot .toLocaleString()} t) → collapse</li>
      </ul>
      <p><em>1 battleship; ends on the same side.</em></p>`;
    } else {
      const inSh  = getBestShipForJump('cold');
      const outSh = getBestShipForJump('hot');
      if (!inSh || !outSh) {
        html += `<p>⚠️ No single-ship combo ≤ ${maxIndMass.toLocaleString()} t can collapse this Unstable hole.</p>`;
      } else {
        html += `
        <ul>
          <li>${inSh.type} Cold IN (${inSh.mass.toLocaleString()} t)</li>
          <li>${outSh.type} Hot  OUT (${outSh.mass.toLocaleString()} t) → collapse</li>
        </ul>
        <p><em>1 ship; ends on the same side.</em></p>`;
      }
    }
  }

  // 3) STABLE
  else {
    const key  = getClassKey();
    const plan = STABLE_PLANS[key];
    if (!plan) {
      html += `<p>⚠️ No Stable-state logic defined for this class.</p>`;
    } else {
      html += `<h4>${plan.title}</h4>`;

      // Initial Check
      html += `<h4>Initial Check</h4><ul>`;
      plan.initial.forEach(j => {
        const ship = getBestShipForJump(j.m);
        if (ship) {
          html += `<li>${j.c} ${j.m.charAt(0).toUpperCase()+j.m.slice(1)} Jump${j.c>1?'s':''}
                   (${ship.type}, ${ship.mass.toLocaleString()} t each)</li>`;
        } else {
          html += `<li>⚠️ No ship can make a ${j.m} jump (limit ${maxIndMass.toLocaleString()} t)</li>`;
        }
      });
      html += `<li>🔍 Ask: Is the hole reduced?</li></ul>`;

      // If YES
      html += `<h4>If YES</h4><ul>`;
      plan.yes.roll.forEach(j => {
        const ship = getBestShipForJump(j.m);
        html += ship
          ? `<li>To Roll: ${j.c} ${j.m.toUpperCase()} Jump${j.c>1?'s':''} (${ship.type}, ${ship.mass.toLocaleString()} t each)</li>`
          : `<li>⚠️ No ship can Roll with ${j.m} jumps</li>`;
      });
      plan.yes.crit.forEach(j => {
        const ship = getBestShipForJump(j.m);
        html += ship
          ? `<li>To Crit: ${j.c} ${j.m.toUpperCase()} Jump${j.c>1?'s':''} (${ship.type}, ${ship.mass.toLocaleString()} t each)</li>`
          : `<li>⚠️ No ship can Crit with ${j.m} jumps</li>`;
      });
      html += `</ul>`;

      // If NO
      html += `<h4>If NO</h4><ul>`;
      plan.no.roll.forEach(j => {
        const ship = getBestShipForJump(j.m);
        html += ship
          ? `<li>To Roll: ${j.c} ${j.m.toUpperCase()} Jump${j.c>1?'s':''} (${ship.type}, ${ship.mass.toLocaleString()} t each)</li>`
          : `<li>⚠️ No ship can Roll with ${j.m} jumps</li>`;
      });
      plan.no.crit.forEach(j => {
        const ship = getBestShipForJump(j.m);
        html += ship
          ? `<li>To Crit: ${j.c} ${j.m.toUpperCase()} Jump${j.c>1?'s':''} (${ship.type}, ${ship.mass.toLocaleString()} t each)</li>`
          : `<li>⚠️ No ship can Crit with ${j.m} jumps</li>`;
      });
      html += `</ul><p><em>All ships end on the same side.</em></p>`;
    }
  }

  html += `</div>`;
  out.innerHTML = html;
}

// Kick things off
init();
