import { wormholes } from './data/wormholes.js';

// ────────────────────────────────────────────
// Jump-mass constants (all in tonnes, matching your JSON)
// ────────────────────────────────────────────
const JumpMass = {
  Battleship: { cold: 200_000, hot: 300_000 },
  Cruiser:    { cold:  36_000, hot: 126_000 },
  HIC:        { cold:     830, hot: 132_400 },
};

let maxMass_t    = 0;  // wormhole.totalMass (t)
let maxIndMass_t = 0;  // wormhole.maxIndividualMass (t)

function init() {
  const typeSel = document.getElementById('wormhole-type');
  const genBtn  = document.getElementById('generate-btn');

  // Populate the wormhole dropdown
  wormholes.forEach(w => {
    const o = document.createElement('option');
    o.value = w.type;
    o.textContent = `${w.type} – ${w.from||'?'} → ${w.to||'?'}`;
    typeSel.append(o);
  });

  // When the user selects a wormhole, store its mass limits
  typeSel.addEventListener('change', () => {
    const w = wormholes.find(x => x.type === typeSel.value);
    if (w) {
      maxMass_t    = w.totalMass;
      maxIndMass_t = w.maxIndividualMass;
    } else {
      maxMass_t = maxIndMass_t = 0;
    }
  });

  genBtn.addEventListener('click', generatePlan);
}

// Return the biggest ship that can do a 'cold' or 'hot' jump under maxIndMass_t
function getShipForJump(mode) {
  // Try Battleship → Cruiser → HIC
  for (const type of ['Battleship','Cruiser','HIC']) {
    const m = JumpMass[type][mode];
    if (m <= maxIndMass_t) {
      return { type, mass: m };
    }
  }
  return null;
}

// Classify wormhole by its totalMass (t)
function getClassKey() {
  if (maxMass_t >= 3_300_000) return 'orange';
  if (maxMass_t >= 3_000_000) return 'yellow';
  if (maxMass_t >= 2_000_000) return 'green';
  if (maxMass_t >= 1_000_000) return 'blue';
  return null;
}

// Stable‐state “method only” recipes
const stablePlans = {
  blue: {
    title: '1000G Wormhole',
    initial: [{ c:1, mode:'cold'},{ c:1, mode:'hot'}],
    yes:   { roll:[{c:2,mode:'hot'}],              crit:[{c:2,mode:'cold'}] },
    no:    { roll:[{c:2,mode:'hot'}],              crit:[{c:1,mode:'cold'},{c:1,mode:'hot'}] }
  },
  green: {
    title: '2000G Wormhole',
    initial: [{ c:2, mode:'cold'},{ c:2, mode:'hot'}],
    yes:   { roll:[{c:2,mode:'cold'},{c:2,mode:'hot'}], crit:[{c:4,mode:'cold'}] },
    no:    { roll:[{c:4,mode:'hot'}],              crit:[{c:2,mode:'cold'},{c:2,mode:'hot'}] }
  },
  yellow: {
    title: '3000G Wormhole',
    initial: [{ c:5, mode:'hot'}],
    yes:   { roll:[{c:1,mode:'hot'},{c:4,mode:'hot'}], crit:[{c:1,mode:'hot'},{c:1,mode:'cold'},{c:2,mode:'hot'}] },
    no:    { roll:[{c:1,mode:'hot'},{c:5,mode:'hot'}], crit:[{c:1,mode:'hot'},{c:1,mode:'cold'},{c:3,mode:'hot'}] }
  },
  orange: {
    title: '3300G Wormhole',
    initial: [{ c:1, mode:'cold'},{ c:5, mode:'hot'}],
    yes:   { roll:[{c:2,mode:'cold'},{c:4,mode:'hot'}], crit:[{c:4,mode:'hot'},{c:1,mode:'cold'}] },
    no:    { roll:[{c:6,mode:'hot'}],              crit:[{c:1,mode:'cold'},{c:5,mode:'hot'}] }
  }
};

function generatePlan() {
  const type   = document.getElementById('wormhole-type').value;
  const status = document.getElementById('wormhole-status').value;
  const out    = document.getElementById('plan-output');
  out.innerHTML = '';

  if (!type) {
    out.textContent = '❗ Please select a wormhole type.';
    return;
  }
  if (!maxMass_t || !maxIndMass_t) {
    out.textContent = '❗ Could not read wormhole mass limits.';
    return;
  }

  const classKey = getClassKey();
  let html = `<div class="plan-box">
    <h3>${type} — ${status.toUpperCase()}</h3>`;

  // === Critical ===
  if (status === 'critical') {
    const inShip  = getShipForJump('cold');
    const outShip = getShipForJump('hot');
    if (!inShip || !outShip) {
      html += `<p>⚠️ No ship ≤ ${maxIndMass_t.toLocaleString()} t can perform these jumps.</p>`;
    } else {
      html += `
      <h4>Critical (<10%)</h4>
      <ul>
        <li>${inShip.type} Cold <strong>IN</strong> (${inShip.mass.toLocaleString()} t)</li>
        <li>${outShip.type} Hot <strong>OUT</strong> (${outShip.mass.toLocaleString()} t) → collapse</li>
      </ul>
      <p><em>Repeat until collapsed; all ships end on the same side.</em></p>`;
    }
  }

  // === Unstable ===
  else if (status === 'unstable') {
    const rem_t = Math.floor(maxMass_t * 0.11);
    html += `<h4>Unstable (≈${rem_t.toLocaleString()} t remaining)</h4>`;

    // If a battleship fits the 11% rem AND the individual mass limit:
    if (
      JumpMass.Battleship.cold <= rem_t &&
      JumpMass.Battleship.cold <= maxIndMass_t &&
      JumpMass.Battleship.hot  <= maxIndMass_t
    ) {
      html += `
      <ul>
        <li>Battleship Cold <strong>IN</strong> (${JumpMass.Battleship.cold.toLocaleString()} t)</li>
        <li>Battleship Hot  <strong>OUT</strong> (${JumpMass.Battleship.hot .toLocaleString()} t) → collapse</li>
      </ul>
      <p><em>1 ship; ends on the same side.</em></p>`;
    } else {
      const inShip  = getShipForJump('cold');
      const outShip = getShipForJump('hot');
      if (!inShip || !outShip) {
        html += `<p>⚠️ No single‐ship solution under max individual ${maxIndMass_t.toLocaleString()} t.</p>`;
      } else {
        html += `
        <ul>
          <li>${inShip.type} Cold <strong>IN</strong> (${inShip.mass.toLocaleString()} t)</li>
          <li>${outShip.type} Hot  <strong>OUT</strong> (${outShip.mass.toLocaleString()} t) → collapse</li>
        </ul>
        <p><em>1 ship; ends on the same side.</em></p>`;
      }
    }
  }

  // === Stable ===
  else {
    const plan = stablePlans[classKey];
    if (!plan) {
      html += `<p>⚠️ No stable‐state logic defined for this class.</p>`;
    } else {
      html += `<h4>${plan.title}</h4>`;

      // Initial Check
      html += `<h4>Initial Check</h4><ul>`;
      plan.initial.forEach(jump => {
        const ship = getShipForJump(jump.mode);
        if (ship) {
          html += `<li>${jump.c} ${jump.mode.charAt(0).toUpperCase()+jump.mode.slice(1)} Jump${jump.c>1?'s':''} 
                   (${ship.type}, ${ship.mass.toLocaleString()} t each)</li>`;
        } else {
          html += `<li>⚠️ No ship can make a ${jump.mode} jump (max indiv ${maxIndMass_t.toLocaleString()} t)</li>`;
        }
      });
      html += `<li>🔍 Ask: Is the hole reduced?</li></ul>`;

      // If YES
      html += `<h4>If YES</h4><ul>`;
      plan.yes.roll.forEach(j => {
        const ship = getShipForJump(j.mode);
        if (ship) {
          html += `<li>To Roll: ${j.c} ${j.mode.charAt(0).toUpperCase()+j.mode.slice(1)} Jump${j.c>1?'s':''} 
                   (${ship.type}, ${ship.mass.toLocaleString()} t each)</li>`;
        } else {
          html += `<li>⚠️ No ship can roll with ${j.mode} jumps</li>`;
        }
      });
      plan.yes.crit.forEach(j => {
        const ship = getShipForJump(j.mode);
        if (ship) {
          html += `<li>To Crit: ${j.c} ${j.mode.charAt(0).toUpperCase()+j.mode.slice(1)} Jump${j.c>1?'s':''} 
                   (${ship.type}, ${ship.mass.toLocaleString()} t each)</li>`;
        } else {
          html += `<li>⚠️ No ship can crit with ${j.mode} jumps</li>`;
        }
      });
      html += `</ul>`;

      // If NO
      html += `<h4>If NO</h4><ul>`;
      plan.no.roll.forEach(j => {
        const ship = getShipForJump(j.mode);
        if (ship) {
          html += `<li>To Roll: ${j.c} ${j.mode.charAt(0).toUpperCase()+j.mode.slice(1)} Jump${j.c>1?'s':''} 
                   (${ship.type}, ${ship.mass.toLocaleString()} t each)</li>`;
        } else {
          html += `<li>⚠️ No ship can roll with ${j.mode} jumps</li>`;
        }
      });
      plan.no.crit.forEach(j => {
        const ship = getShipForJump(j.mode);
        if (ship) {
          html += `<li>To Crit: ${j.c} ${j.mode.charAt(0).toUpperCase()+j.mode.slice(1)} Jump${j.c>1?'s':''} 
                   (${ship.type
