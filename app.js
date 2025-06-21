import { wormholes } from './data/wormholes.js';

// ──────────────────────────────────────────
//   JUMP MASSES (all in same kg unit as JSON)
// ──────────────────────────────────────────
const BS_COLD   = 200_000;    // Battleship cold jump ~200 000 kg
const BS_HOT    = 300_000;    // Battleship hot jump  ~300 000 kg
const CR_COLD   =  36_000;    // Cruiser cold jump   ~36 000 kg
const CR_HOT    = 126_000;    // Cruiser hot jump    ~126 000 kg
const HIC_COLD  =     830;    // HIC cold jump        ~830 kg (entangled)
const HIC_HOT   = 132_400;    // HIC hot jump      ~132 400 kg

let maxMass       = 0;
let maxIndMass    = 0;

function init() {
  const typeSel  = document.getElementById('wormhole-type');
  const genBtn   = document.getElementById('generate-btn');

  // Populate wormhole dropdown
  wormholes.forEach(w => {
    const o = document.createElement('option');
    o.value = w.type;
    o.textContent = `${w.type} – ${w.from||'?'} → ${w.to||'?'}`;
    typeSel.append(o);
  });

  // When you pick a type, stash its mass limits
  typeSel.addEventListener('change', () => {
    const w = wormholes.find(x => x.type === typeSel.value);
    if (w) {
      maxMass    = w.totalMass;
      maxIndMass = w.maxIndividualMass;
    } else {
      maxMass = maxIndMass = 0;
    }
  });

  genBtn.addEventListener('click', generatePlan);
}

// Pick the largest ship that can fit under maxIndividualMass
function getShipForJump(kind /* 'cold'|'hot' */) {
  if (kind === 'cold') {
    if (BS_COLD   <= maxIndMass) return { name:'Battleship', mass:BS_COLD };
    if (CR_COLD   <= maxIndMass) return { name:'Cruiser',    mass:CR_COLD };
    if (HIC_COLD  <= maxIndMass) return { name:'HIC',        mass:HIC_COLD };
  } else {
    if (BS_HOT    <= maxIndMass) return { name:'Battleship', mass:BS_HOT };
    if (CR_HOT    <= maxIndMass) return { name:'Cruiser',    mass:CR_HOT };
    if (HIC_HOT   <= maxIndMass) return { name:'HIC',        mass:HIC_HOT };
  }
  return null;
}

// Classify by the JSON totalMass
function getColorCode() {
  if (maxMass >= 3_300_000) return 'orange'; // 3300G
  if (maxMass >= 3_000_000) return 'yellow'; // 3000G
  if (maxMass >= 2_000_000) return 'green';  // 2000G
  if (maxMass >= 1_000_000) return 'blue';   // 1000G
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
  if (!maxMass || !maxIndMass) {
    out.textContent = '❗ Could not read wormhole mass limits.';
    return;
  }

  const color = getColorCode();
  let html = `<div class="plan-box">
    <h3>${type} — ${status.toUpperCase()}</h3>`;

  // ─── CRITICAL
  if (status === 'critical') {
    const inShip  = getShipForJump('cold');
    const outShip = getShipForJump('hot');
    if (!inShip || !outShip) {
      html += `<p>⚠️ No ship can jump under Critical (<10%) mass limit of ${maxIndMass.toLocaleString()} kg.</p>`;
    } else {
      html += `
      <h4>Critical (&lt;10%)</h4>
      <ul>
        <li>${inShip.name} Cold jump IN (${inShip.mass.toLocaleString()} kg)</li>
        <li>${outShip.name} Hot jump OUT (${outShip.mass.toLocaleString()} kg) → collapse</li>
      </ul>
      <p><em>Repeat IN→OUT until popped; ends on same side.</em></p>`;
    }
  }

  // ─── UNSTABLE
  else if (status === 'unstable') {
    const rem = Math.floor(maxMass * 0.11);
    html += `<h4>Unstable (≈${rem.toLocaleString()} kg remaining)</h4>`;

    // If you can do a BS cold/hot pair under the individual limit, do that:
    if (BS_COLD <= rem && BS_COLD <= maxIndMass && BS_HOT <= maxIndMass) {
      html += `
      <ul>
        <li>Battleship Cold jump IN (${BS_COLD.toLocaleString()} kg)</li>
        <li>Battleship Hot jump OUT (${BS_HOT.toLocaleString()} kg) → collapse</li>
      </ul>
      <p><em>1 ship; ends on same side.</em></p>`;
    }
    // Otherwise pick the best single‐ship solution (Cruiser→HIC cascade):
    else {
      const inShip  = getShipForJump('cold');
      const outShip = getShipForJump('hot');
      if (!inShip || !outShip) {
        html += `<p>⚠️ No ship can collapse this Unstable hole under individual limit of ${maxIndMass.toLocaleString()} kg.</p>`;
      } else {
        html += `
        <ul>
          <li>${inShip.name} Cold jump IN (${inShip.mass.toLocaleString()} kg)</li>
          <li>${outShip.name} Hot jump OUT (${outShip.mass.toLocaleString()} kg) → collapse</li>
        </ul>
        <p><em>1 ship; ends on same side.</em></p>`;
      }
    }
  }

  // ─── STABLE
  else {
    switch (color) {
      case 'blue': // 1000G
        html += renderStableBlock(
          '1000G Wormhole',
          [{ count:1, mode:'Cold',  type:'Battleship', mass:BS_COLD },
           { count:1, mode:'Hot',   type:'Battleship', mass:BS_HOT }],
          [{ roll:[2,'Hot','Battleship',BS_HOT], crit:[2,'Cold','Battleship',BS_COLD] }],
          [{ roll:[2,'Hot','Battleship',BS_HOT], crit:[1,'Cold','Battleship',BS_COLD,1,'Hot','Battleship',BS_HOT] }]
        );
        break;

      case 'green': // 2000G
        html += renderStableBlock(
          '2000G Wormhole',
          [{ count:2, mode:'Cold',  type:'Battleship', mass:BS_COLD },
           { count:2, mode:'Hot',   type:'Battleship', mass:BS_HOT }],
          [{ roll:[2,'Cold','Battleship',BS_COLD,2,'Hot','Battleship',BS_HOT],
             crit:[4,'Cold','Battleship',BS_COLD] }],
          [{ roll:[4,'Hot','Battleship',BS_HOT],
             crit:[2,'Cold','Battleship',BS_COLD,2,'Hot','Battleship',BS_HOT] }]
        );
        break;

      case 'yellow': // 3000G
        html += renderStableBlock(
          '3000G Wormhole',
          [{ count:5, mode:'Hot', type:'Battleship', mass:BS_HOT }],
          [{ roll:[1,'Hot','Battleship',BS_HOT,4,'Hot','Battleship',BS_HOT],
             crit:[1,'Hot','Battleship',BS_HOT,1,'Cold','Battleship',BS_COLD,2,'Hot','Battleship',BS_HOT] }],
          [{ roll:[1,'Hot','Battleship',BS_HOT,5,'Hot','Battleship',BS_HOT],
             crit:[1,'Hot','Battleship',BS_HOT,1,'Cold','Battleship',BS_COLD,3,'Hot','Battleship',BS_HOT] }]
        );
        break;

      case 'orange': // 3300G
        html += renderStableBlock(
          '3300G Wormhole',
          [{ count:1, mode:'Cold',  type:'Battleship', mass:BS_COLD },
           { count:5, mode:'Hot',   type:'Battleship', mass:BS_HOT }],
          [{ roll:[2,'Cold','Battleship',BS_COLD,4,'Hot','Battleship',BS_HOT],
             crit:[4,'Hot','Battleship',BS_HOT,1,'Cold','HIC',HIC_COLD] }],
          [{ roll:[6,'Hot','Battleship',BS_HOT],
             crit:[1,'Cold','Battleship',BS_COLD,5,'Hot','Battleship',BS_HOT] }]
        );
        break;

      default:
        html += `<p>⚠️ No stable‐state logic for this wormhole class.</p>`;
    }
  }

  html += `</div>`;
  out.innerHTML = html;
}

// Utility: render your Method‐Only Stable block
function renderStableBlock(title, initialJumps, yesCases, noCases) {
  let s = `<h4>${title}</h4>
    <h4>Initial Check</h4>
    <ul>`;
  initialJumps.forEach(j => {
    s += `<li>${j.count} ${j.mode} Jump${j.count>1?'s':''}
           (${j.type}, ${j.mass.toLocaleString()} kg each)</li>`;
  });
  s += `<li>🔍 Ask: Is the hole reduced?</li></ul>`;

  const [yes, no] = [yesCases[0], noCases[0]];
  s += `<h4>If YES</h4><ul>`;
  yes.roll   .forEachChunk(c => s+=chunkToLi('Roll',c));
  yes.crit   .forEachChunk(c => s+=chunkToLi('Crit',c));
  s += `</ul>`;

  s += `<h4>If NO</h4><ul>`;
  no.roll    .forEachChunk(c => s+=chunkToLi('Roll',c));
  no.crit    .forEachChunk(c => s+=chunkToLi('Crit',c));
  s += `</ul><p><em>All ships end on the original side.</em></p>`;

  return s;
}

// Take an array like [2,'Hot','Battleship',300000,1,'Cold','Battleship',200000]
// and turn into a <li>
Array.prototype.forEachChunk = function(fn) {
  for (let i=0; i<this.length; i+=4) {
    fn(this.slice(i,i+4));
  }
};

function chunkToLi(kind, [count, mode, type, mass]) {
  return `<li>To ${kind}: ${count} ${mode} Jump${count>1?'s':''}
          (${type}, ${mass.toLocaleString()} kg each)</li>`;
}

init();
