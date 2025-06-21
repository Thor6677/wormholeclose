import { wormholes } from './data/wormholes.js';

// ──────────────────────────────────────────
//   JUMP MASSES (all in tonnes, to match JSON)
// ──────────────────────────────────────────
const BS_COLD_T    = 200_000;   // Battleship cold jump ≃200 000 t
const BS_HOT_T     = 300_000;   // Battleship hot jump  ≃300 000 t
const CR_COLD_T    =  36_000;   // Cruiser cold jump   ≃36 000 t
const CR_HOT_T     = 126_000;   // Cruiser hot jump    ≃126 000 t
const HIC_COLD_T   =     830;   // HIC cold w/entangle  830 t
const HIC_HOT_T    = 132_400;   // HIC hot jump       132 400 t

let maxMass_t    = 0;  // totalMass in t
let maxIndMass_t = 0;  // maxIndividualMass in t

function init() {
  const typeSel  = document.getElementById('wormhole-type');
  const genBtn   = document.getElementById('generate-btn');

  // Populate dropdown
  wormholes.forEach(w => {
    const o = document.createElement('option');
    o.value = w.type;
    o.textContent = `${w.type} – ${w.from||'?'} → ${w.to||'?'}`;
    typeSel.append(o);
  });

  // Store the selected wormhole’s mass (in tonnes)
  typeSel.addEventListener('change', () => {
    const w = wormholes.find(x => x.type === typeSel.value);
    if (w) {
      maxMass_t = w.totalMass;          // already in t
      maxIndMass_t = w.maxIndividualMass; // in t
    } else {
      maxMass_t = maxIndMass_t = 0;
    }
  });

  genBtn.addEventListener('click', generatePlan);
}

// Pick the largest ship whose jump‐mass (tonnes) ≤ maxIndMass_t
function getShipForJump(kind /* 'cold'|'hot' */) {
  if (kind === 'cold') {
    if (BS_COLD_T   <= maxIndMass_t) return { name:'Battleship', mass:BS_COLD_T };
    if (CR_COLD_T   <= maxIndMass_t) return { name:'Cruiser',    mass:CR_COLD_T };
    if (HIC_COLD_T  <= maxIndMass_t) return { name:'HIC',        mass:HIC_COLD_T };
  } else {
    if (BS_HOT_T    <= maxIndMass_t) return { name:'Battleship', mass:BS_HOT_T };
    if (CR_HOT_T    <= maxIndMass_t) return { name:'Cruiser',    mass:CR_HOT_T };
    if (HIC_HOT_T   <= maxIndMass_t) return { name:'HIC',        mass:HIC_HOT_T };
  }
  return null;
}

// Classify wormhole by totalMass (tonnes)
function getColorCode() {
  if (maxMass_t >= 3_300_000) return 'orange'; // 3300G
  if (maxMass_t >= 3_000_000) return 'yellow'; // 3000G
  if (maxMass_t >= 2_000_000) return 'green';  // 2000G
  if (maxMass_t >= 1_000_000) return 'blue';   // 1000G
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
    out.textContent = '❗ Could not read wormhole mass limits.';
    return;
  }

  const color = getColorCode();
  let html = `<div class="plan-box">
    <h3>${type} — ${status.toUpperCase()}</h3>`;

  // ─── CRITICAL (<10%)
  if (status === 'critical') {
    const inShip  = getShipForJump('cold');
    const outShip = getShipForJump('hot');
    if (!inShip || !outShip) {
      html += `<p>⚠️ No ship fits the max‐individual mass of ${maxIndMass_t.toLocaleString()} t.</p>`;
    } else {
      html += `
      <h4>Critical (&lt;10% remaining)</h4>
      <ul>
        <li>${inShip.name} Cold <strong>IN</strong> (${inShip.mass.toLocaleString()} t)</li>
        <li>${outShip.name} Hot <strong>OUT</strong> (${outShip.mass.toLocaleString()} t) → collapse</li>
      </ul>
      <p><em>Repeat until collapsed; all end on same side.</em></p>`;
    }
  }

  // ─── UNSTABLE (10–50%)
  else if (status === 'unstable') {
    const rem_t = Math.floor(maxMass_t * 0.11);
    html += `<h4>Unstable (≈${rem_t.toLocaleString()} t remaining)</h4>`;

    // Try BS route if BS fits rem and ind‐mass limit
    if (BS_COLD_T <= rem_t && BS_COLD_T <= maxIndMass_t && BS_HOT_T <= maxIndMass_t) {
      html += `
      <ul>
        <li>Battleship Cold <strong>IN</strong> (${BS_COLD_T.toLocaleString()} t)</li>
        <li>Battleship Hot <strong>OUT</strong> (${BS_HOT_T.toLocaleString()} t) → collapse</li>
      </ul>
      <p><em>1 ship; ends on same side.</em></p>`;
    }
    else {
      const inShip  = getShipForJump('cold');
      const outShip = getShipForJump('hot');
      if (!inShip || !outShip) {
        html += `<p>⚠️ No single‐ship solution under max‐individual ${maxIndMass_t.toLocaleString()} t.</p>`;
      } else {
        html += `
        <ul>
          <li>${inShip.name} Cold <strong>IN</strong> (${inShip.mass.toLocaleString()} t)</li>
          <li>${outShip.name} Hot <strong>OUT</strong> (${outShip.mass.toLocaleString()} t) → collapse</li>
        </ul>
        <p><em>1 ship; ends on same side.</em></p>`;
      }
    }
  }

  // ─── STABLE (50–100%)
  else {
    switch (color) {
      case 'blue': // 1000G
        html += renderStableBlock(
          '1000G Wormhole',
          [{ count:1, mode:'Cold',  type:'Battleship', mass:BS_COLD_T },
           { count:1, mode:'Hot',   type:'Battleship', mass:BS_HOT_T }],
          { roll:[2,'Hot','Battleship',BS_HOT_T], crit:[2,'Cold','Battleship',BS_COLD_T] },
          { roll:[2,'Hot','Battleship',BS_HOT_T], 
            crit:[1,'Cold','Battleship',BS_COLD_T,1,'Hot','Battleship',BS_HOT_T] }
        );
        break;

      case 'green': // 2000G
        html += renderStableBlock(
          '2000G Wormhole',
          [{ count:2, mode:'Cold',  type:'Battleship', mass:BS_COLD_T },
           { count:2, mode:'Hot',   type:'Battleship', mass:BS_HOT_T }],
          { roll:[2,'Cold','Battleship',BS_COLD_T,2,'Hot','Battleship',BS_HOT_T],
            crit:[4,'Cold','Battleship',BS_COLD_T] },
          { roll:[4,'Hot','Battleship',BS_HOT_T],
            crit:[2,'Cold','Battleship',BS_COLD_T,2,'Hot','Battleship',BS_HOT_T] }
        );
        break;

      case 'yellow': // 3000G
        html += renderStableBlock(
          '3000G Wormhole',
          [{ count:5, mode:'Hot', type:'Battleship', mass:BS_HOT_T }],
          { roll:[1,'Hot','Battleship',BS_HOT_T,4,'Hot','Battleship',BS_HOT_T],
            crit:[1,'Hot','Battleship',BS_HOT_T,1,'Cold','Battleship',BS_COLD_T,2,'Hot','Battleship',BS_HOT_T] },
          { roll:[1,'Hot','Battleship',BS_HOT_T,5,'Hot','Battleship',BS_HOT_T],
            crit:[1,'Hot','Battleship',BS_HOT_T,1,'Cold','Battleship',BS_COLD_T,3,'Hot','Battleship',BS_HOT_T] }
        );
        break;

      case 'orange': // 3300G
        html += renderStableBlock(
          '3300G Wormhole',
          [{ count:1, mode:'Cold',  type:'Battleship', mass:BS_COLD_T },
           { count:5, mode:'Hot',   type:'Battleship', mass:BS_HOT_T }],
          { roll:[2,'Cold','Battleship',BS_COLD_T,4,'Hot','Battleship',BS_HOT_T],
            crit:[4,'Hot','Battleship',BS_HOT_T,1,'Cold','HIC',HIC_COLD_T] },
          { roll:[6,'Hot','Battleship',BS_HOT_T],
            crit:[1,'Cold','Battleship',BS_COLD_T,5,'Hot','Battleship',BS_HOT_T] }
        );
        break;

      default:
        html += `<p>⚠️ No stable‐state logic defined for this class.</p>`;
    }
  }

  html += '</div>';
  out.innerHTML = html;
}

// Renders the “Method Only” stable block
function renderStableBlock(title, initial, yesCase, noCase) {
  let s = `<h4>${title}</h4>
    <h4>Initial Check</h4>
    <ul>`;
  initial.forEach(j => {
    s += `<li>${j.count} ${j.mode} Jump${j.count>1?'s':''} 
           (${j.type}, ${j.mass.toLocaleString()} t each)</li>`;
  });
  s += `<li>🔍 Ask: Is the hole reduced?</li></ul>`;

  s += `<h4>If YES</h4><ul>`;
  chunkToLi('To Roll', yesCase.roll);
  chunkToLi('To Crit', yesCase.crit);
  s += `</ul>`;

  s += `<h4>If NO</h4><ul>`;
  chunkToLi('To Roll', noCase.roll);
  chunkToLi('To Crit', noCase.crit);
  s += `</ul><p><em>All ships end on the original side.</em></p>`;
  return s;
}

// Write a single li given [count,mode,type,mass]
function chunkToLi(label, arr) {
  let tmp = '';
  for (let i = 0; i < arr.length; i += 4) {
    const [count, mode, type, mass] = arr.slice(i,i+4);
    tmp += `<li>${label}: ${count} ${mode} Jump${count>1?'s':''} 
            (${type}, ${mass.toLocaleString()} t each)</li>`;
  }
  // inject into the current UL
  document.write(tmp);
}

init();
