import { wormholes } from './data/wormholes.js';

// all masses in tonnes (t), matching your JSON
const BS_COLD_T  = 200_000;
const BS_HOT_T   = 300_000;
const CR_COLD_T  =  36_000;
const CR_HOT_T   = 126_000;
const HIC_COLD_T =     830;
const HIC_HOT_T  = 132_400;

let maxMass_t = 0;
let maxIndMass_t = 0;

// pre‐define your Stable “Method Only” recipes:
const stablePlans = {
  blue: {
    title: '1000G Wormhole',
    initial: [{ c:1, m:'cold' }, { c:1, m:'hot' }],
    yes:   { roll:[{c:2,m:'hot'}],             crit:[{c:2,m:'cold'}] },
    no:    { roll:[{c:2,m:'hot'}],             crit:[{c:1,m:'cold'},{c:1,m:'hot'}] }
  },
  green: {
    title: '2000G Wormhole',
    initial: [{ c:2, m:'cold' }, { c:2, m:'hot' }],
    yes:   { roll:[{c:2,m:'cold'},{c:2,m:'hot'}], crit:[{c:4,m:'cold'}] },
    no:    { roll:[{c:4,m:'hot'}],             crit:[{c:2,m:'cold'},{c:2,m:'hot'}] }
  },
  yellow: {
    title: '3000G Wormhole',
    initial: [{ c:5, m:'hot' }],
    yes:   { roll:[{c:1,m:'hot'},{c:4,m:'hot'}], crit:[{c:1,m:'hot'},{c:1,m:'cold'},{c:2,m:'hot'}] },
    no:    { roll:[{c:1,m:'hot'},{c:5,m:'hot'}], crit:[{c:1,m:'hot'},{c:1,m:'cold'},{c:3,m:'hot'}] }
  },
  orange: {
    title: '3300G Wormhole',
    initial: [{ c:1, m:'cold' }, { c:5, m:'hot' }],
    yes:   { roll:[{c:2,m:'cold'},{c:4,m:'hot'}], crit:[{c:4,m:'hot'},{c:1,m:'cold','type':'HIC'}] },
    no:    { roll:[{c:6,m:'hot'}],              crit:[{c:1,m:'cold'},{c:5,m:'hot'}] }
  }
};

function init() {
  const typeSel = document.getElementById('wormhole-type');
  const genBtn  = document.getElementById('generate-btn');

  // fill dropdown
  wormholes.forEach(w => {
    const o = document.createElement('option');
    o.value = w.type;
    o.textContent = `${w.type} – ${w.from||'?'} → ${w.to||'?'}`;
    typeSel.append(o);
  });

  // store mass limits on change
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

function getShipForJump(kind) {
  // return {name,mass} or null
  if (kind === 'cold') {
    if (BS_COLD_T  <= maxIndMass_t) return {name:'Battleship', mass:BS_COLD_T};
    if (CR_COLD_T  <= maxIndMass_t) return {name:'Cruiser',    mass:CR_COLD_T};
    if (HIC_COLD_T <= maxIndMass_t) return {name:'HIC',        mass:HIC_COLD_T};
  } else {
    if (BS_HOT_T   <= maxIndMass_t) return {name:'Battleship', mass:BS_HOT_T};
    if (CR_HOT_T   <= maxIndMass_t) return {name:'Cruiser',    mass:CR_HOT_T};
    if (HIC_HOT_T  <= maxIndMass_t) return {name:'HIC',        mass:HIC_HOT_T};
  }
  return null;
}

function getColorCode() {
  if (maxMass_t >= 3_300_000) return 'orange';
  if (maxMass_t >= 3_000_000) return 'yellow';
  if (maxMass_t >= 2_000_000) return 'green';
  if (maxMass_t >= 1_000_000) return 'blue';
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
  if (!maxMass_t || !maxIndMass_t) {
    out.textContent = '❗ Cannot read wormhole mass limits.';
    return;
  }

  const color = getColorCode();
  let html = `<div class="plan-box">
    <h3>${type} — ${status.toUpperCase()}</h3>`;

  // CRITICAL
  if (status === 'critical') {
    const inShip  = getShipForJump('cold');
    const outShip = getShipForJump('hot');
    if (!inShip || !outShip) {
      html += `<p>⚠️ No ship ≤ ${maxIndMass_t.toLocaleString()} t can make a Critical jump.</p>`;
    } else {
      html += `
      <h4>Critical (&lt;10%)</h4>
      <ul>
        <li>${inShip.name} Cold IN (${inShip.mass.toLocaleString()} t)</li>
        <li>${outShip.name} Hot OUT (${outShip.mass.toLocaleString()} t) → collapse</li>
      </ul>
      <p><em>Repeat until popped; ends same side.</em></p>`;
    }
  }

  // UNSTABLE
  else if (status === 'unstable') {
    const rem_t = Math.floor(maxMass_t * 0.11);
    html += `<h4>Unstable (≈${rem_t.toLocaleString()} t remaining)</h4>`;

    // battleship route?
    if (BS_COLD_T <= rem_t && BS_COLD_T <= maxIndMass_t && BS_HOT_T <= maxIndMass_t) {
      html += `
      <ul>
        <li>Battleship Cold IN (${BS_COLD_T.toLocaleString()} t)</li>
        <li>Battleship Hot OUT (${BS_HOT_T.toLocaleString()} t) → collapse</li>
      </ul>
      <p><em>1 ship; ends same side.</em></p>`;
    } else {
      const inShip  = getShipForJump('cold');
      const outShip = getShipForJump('hot');
      if (!inShip || !outShip) {
        html += `<p>⚠️ No ship ≤ ${maxIndMass_t.toLocaleString()} t can collapse this Unstable hole.</p>`;
      } else {
        html += `
        <ul>
          <li>${inShip.name} Cold IN (${inShip.mass.toLocaleString()} t)</li>
          <li>${outShip.name} Hot OUT (${outShip.mass.toLocaleString()} t) → collapse</li>
        </ul>
        <p><em>1 ship; ends same side.</em></p>`;
      }
    }
  }

  // STABLE
  else {
    const plan = stablePlans[color];
    if (!plan) {
      html += `<p>⚠️ No stable‐state logic for this class.</p>`;
    } else {
      html += `<h4>${plan.title}</h4>
        <h4>Initial Check</h4>
        <ul>`;
      plan.initial.forEach(j => {
        const ship = getShipForJump(j.m);
        if (ship) {
          html += `<li>${j.c} ${j.m.charAt(0).toUpperCase()+j.m.slice(1)} Jump${j.c>1?'s':''}
                   (${ship.name}, ${ship.mass.toLocaleString()} t each)</li>`;
        } else {
          html += `<li>⚠️ No ship can make a ${j.m} jump (max indiv ${maxIndMass_t.toLocaleSt_
