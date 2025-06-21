import { wormholes } from './data/wormholes.js';

// ────────────────────────────────────────────
// Jump‐mass constants in TONNES (match your JSON)
// ────────────────────────────────────────────
const JumpMass = {
  Battleship: { cold: 200_000, hot: 300_000 },
  Cruiser:    { cold:  36_000, hot: 126_000 },
  HIC:        { cold:     830, hot: 132_400 },
};

function init() {
  const typeSel = document.getElementById('wormhole-type');
  const genBtn  = document.getElementById('generate-btn');

  // Populate the type dropdown
  wormholes.forEach(w => {
    const o = document.createElement('option');
    o.value = w.type;
    o.textContent = `${w.type} – ${w.from||'?'} → ${w.to||'?'}`;
    typeSel.appendChild(o);
  });

  genBtn.addEventListener('click', generatePlan);
}

// Pick the largest ship whose jump‐mass ≤ maxIndividual
function getBestShipForJump(mode, maxIndividual) {
  for (const type of ['Battleship','Cruiser','HIC']) {
    const mass = JumpMass[type][mode];
    if (mass <= maxIndividual) {
      return { type, mass };
    }
  }
  return null;
}

// Determine class key by totalMass (tonnes)
function getClassKey(totalMass) {
  if (totalMass >= 3_300_000) return 'orange';
  if (totalMass >= 3_000_000) return 'yellow';
  if (totalMass >= 2_000_000) return 'green';
  if (totalMass >= 1_000_000) return 'blue';
  return null;
}

/**
 * Calculate the optimal collapse plan:
 * @param {number} totalMass       – wormhole.totalMass in t
 * @param {number} maxIndividual   – wormhole.maxIndividualMass in t
 * @param {'stable'|'unstable'|'critical'} status
 * @returns {object|null}
 */
function calculateOptimalCollapse(totalMass, maxIndividual, status) {
  // 1) define remaining‐mass threshold:
  //    stable → 50%; unstable/critical → 10%
  const threshold =
    status === 'stable'   ? totalMass * 0.50
  : status === 'unstable' ? totalMass * 0.10
  :                           totalMass * 0.10;

  // 2) critical: force HIC if it fits
  if (status === 'critical') {
    const inSh  = getBestShipForJump('cold', maxIndividual);
    const outSh = getBestShipForJump('hot',  maxIndividual);
    if (inSh?.type === 'HIC' && outSh?.type === 'HIC') {
      return { shipType:'HIC', trips:1, threshold };
    }
    return null;
  }

  // 3) otherwise build candidates for Battleship, Cruiser, HIC
  const candidates = [];
  for (const [type, m] of Object.entries(JumpMass)) {
    if (m.cold <= maxIndividual && m.hot <= maxIndividual) {
      // how many *return* (hot) jumps to exceed threshold?
      const trips = Math.ceil(threshold / m.hot);
      candidates.push({ type, trips });
    }
  }
  if (!candidates.length) return null;

  // 4) pick the candidate with fewest trips
  candidates.sort((a,b)=>a.trips-b.trips);
  return { shipType:candidates[0].type, trips:candidates[0].trips, threshold };
}

function generatePlan() {
  const typeVal  = document.getElementById('wormhole-type').value;
  const status   = document.getElementById('wormhole-status').value;
  const outputEl = document.getElementById('plan-output');

  outputEl.innerHTML = ''; // clear

  if (!typeVal) {
    outputEl.textContent = '❗ Please select a wormhole type.';
    return;
  }

  // find wormhole record
  const w = wormholes.find(w => w.type === typeVal);
  if (!w) {
    outputEl.textContent = '❗ Invalid wormhole selected.';
    return;
  }

  const { totalMass, maxIndividualMass } = w;
  const plan = calculateOptimalCollapse(totalMass, maxIndividualMass, status);

  // no valid plan?
  if (!plan) {
    outputEl.innerHTML = `
      <div class="plan-box warning">
        ⚠️ No safe collapse plan: no ship can perform a full cold→hot round‐trip under the 
        max individual limit of ${maxIndividualMass.toLocaleString()} t.
      </div>`;
    return;
  }

  // render the plan
  const { shipType, trips, threshold } = plan;
  const coldMass = JumpMass[shipType].cold;
  const hotMass  = JumpMass[shipType].hot;

  outputEl.innerHTML = `
    <div class="plan-box">
      <h3>${typeVal} — ${status.toUpperCase()}</h3>
      <ul>
        <li><strong>Ship Type:</strong> ${shipType}</li>
        <li><strong>Worst‐case Remaining:</strong> ~${Math.ceil(threshold).toLocaleString()} t</li>
        <li><strong>Cold Jump Mass:</strong> ${coldMass.toLocaleString()} t</li>
        <li><strong>Hot Jump Mass:</strong> ${hotMass.toLocaleString()} t</li>
        <li><strong>Round‐Trips Needed:</strong> ${trips}</li>
      </ul>
      <p>
        Execute <strong>${trips}</strong> cold <em>IN</em> jumps 
        followed by <strong>${trips}</strong> hot <em>OUT</em> jumps with your 
        ${shipType}. This will collapse the hole and leave all ships on the 
        original side.
      </p>
    </div>`;
}

init();
