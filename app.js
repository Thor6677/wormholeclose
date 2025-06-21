import { wormholes } from './data/wormholes.js';

// Jump masses (kg)
const BS_COLD   = 200_000_000;
const BS_HOT    = 300_000_000;
const CR_COLD   =  36_000_000;
const CR_HOT    = 126_000_000;
const HIC_COLD  =    830_000;
const HIC_HOT   = 132_400_000;

let maxMass = 0;
let maxIndMass = 0;

function init() {
  const typeSel = document.getElementById('wormhole-type');
  const genBtn  = document.getElementById('generate-btn');

  // Populate dropdown
  wormholes.forEach(w => {
    const o = document.createElement('option');
    o.value = w.type;
    o.textContent = `${w.type} – ${w.from || '?'} → ${w.to || '?'}`;
    typeSel.append(o);
  });

  // When type changes, store masses
  typeSel.addEventListener('change', () => {
    const w = wormholes.find(x => x.type === typeSel.value);
    if (w) {
      maxMass = w.totalMass;
      maxIndMass = w.maxIndividualMass;
    } else {
      maxMass = 0;
      maxIndMass = 0;
    }
  });

  genBtn.addEventListener('click', generatePlan);
}

// Helper: pick the largest ship that fits
function getShipForJump(jumpType) {
  // cold vs hot
  if (jumpType === 'cold') {
    if (BS_COLD <= maxIndMass)   return { name: 'Battleship', mass: BS_COLD };
    if (CR_COLD <= maxIndMass)   return { name: 'Cruiser',    mass: CR_COLD };
    if (HIC_COLD <= maxIndMass)  return { name: 'HIC',        mass: HIC_COLD };
  } else {
    if (BS_HOT <= maxIndMass)    return { name: 'Battleship', mass: BS_HOT };
    if (CR_HOT <= maxIndMass)    return { name: 'Cruiser',    mass: CR_HOT };
    if (HIC_HOT <= maxIndMass)   return { name: 'HIC',        mass: HIC_HOT };
  }
  return null; // nothing fits
}

// Classify wormhole by totalMass
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
    out.textContent = '❗ Cannot determine wormhole mass limits.';
    return;
  }

  const color = getColorCode();
  let html = `<div class="plan-box">
    <h3>${type} — ${status.toUpperCase()}</h3>`;

  // 1) CRITICAL
  if (status === 'critical') {
    const inShip  = getShipForJump('cold');
    const outShip = getShipForJump('hot');
    if (!inShip || !outShip) {
      html += `<p>⚠️ No ship can safely jump in/out under Critical constraints (max individual ${maxIndMass.toLocaleString()} kg).</p>`;
    } else {
      html += `
      <h4>Critical (&lt;10%)</h4>
      <ul>
        <li>${inShip.name} Cold jump IN (${inShip.mass.toLocaleString()} kg)</li>
        <li>${outShip.name} HOT jump OUT (${outShip.mass.toLocaleString()} kg) → collapse</li>
      </ul>
      <p><em>Repeat IN→OUT until popped; ends on same side.</em></p>`;
    }
  }

  // 2) UNSTABLE
  else if (status === 'unstable') {
    const rem = Math.floor(maxMass * 0.11);
    html += `<h4>Unstable (≈${rem.toLocaleString()} kg remaining)</h4>`;
    // Try battleship route first if safe
    if (rem >= BS_COLD && BS_COLD <= maxIndMass && BS_HOT <= maxIndMass) {
      html += `
      <ul>
        <li>Battleship Cold jump IN (${BS_COLD.toLocaleString()} kg)</li>
        <li>Battleship HOT jump OUT (${BS_HOT.toLocaleString()} kg) → collapse</li>
      </ul>
      <p><em>1 ship; ends on same side.</em></p>`;
    }
    // Else fallback to HIC if it fits
    else {
      const inShip  = getShipForJump('cold');
      const outShip = getShipForJump('hot');
      if (!inShip || !outShip) {
        html += `<p>⚠️ No ship can safely collapse this Unstable hole under the individual mass limit (${maxIndMass.toLocaleString()} kg).</p>`;
      } else {
        html += `
        <ul>
          <li>${inShip.name} Cold jump IN (${inShip.mass.toLocaleString()} kg)</li>
          <li>${outShip.name} HOT jump OUT (${outShip.mass.toLocaleString()} kg) → collapse</li>
        </ul>
        <p><em>1 ship; ends on same side.</em></p>`;
      }
    }
  }

  // 3) STABLE
  else {
    switch (color) {
      case 'blue': // 1000G
        html += `<h4>1000G Wormhole</h4>
        <h4>Initial Check</h4>
        <ul>`;
        // Cold IN
        {
          const ship = getShipForJump('cold');
          html += ship
            ? `<li>1 Cold Jump ( ${ship.name}, ${ship.mass.toLocaleString()} kg )</li>`
            : `<li>⚠️ No ship can make a Cold Jump (max ind ${maxIndMass.toLocaleString()} kg)</li>`;
        }
        // Hot IN
        {
          const ship = getShipForJump('hot');
          html += ship
            ? `<li>1 Hot Jump ( ${ship.name}, ${ship.mass.toLocaleString()} kg )</li>`
            : `<li>⚠️ No ship can make a Hot Jump</li>`;
        }
        html += `<li>🔍 Ask: Is the hole reduced?</li>
        </ul>`;

        // If YES
        html += `<h4>If YES</h4><ul>`;
        {
          const ship = getShipForJump('hot');
          html += ship
            ? `<li>To Roll: 2 Hot Jumps ( ${ship.name}, ${ship.mass.toLocaleString()} kg each )</li>`
            : `<li>⚠️ No ship can roll with Hot Jumps</li>`;
        }
        {
          const ship = getShipForJump('cold');
          html += ship
            ? `<li>To Crit: 2 Cold Jumps ( ${ship.name}, ${ship.mass.toLocaleString()} kg each )</li>`
            : `<li>⚠️ No ship can Crit with Cold Jumps</li>`;
        }
        html += `</ul>`;

        // If NO
        html += `<h4>If NO</h4><ul>`;
        {
          const ship = getShipForJump('hot');
          html += ship
            ? `<li>To Roll: 2 Hot Jumps ( ${ship.name}, ${ship.mass.toLocaleString()} kg each )</li>`
            : `<li>⚠️ No ship can roll with Hot Jumps</li>`;
        }
        {
          const coldShip = getShipForJump('cold');
          const hotShip  = getShipForJump('hot');
          if (coldShip && hotShip) {
            html += `<li>To Crit: 1 Cold Jump ( ${coldShip.name}, ${coldShip.mass.toLocaleString()} kg )
              + 1 Hot Jump ( ${hotShip.name}, ${hotShip.mass.toLocaleString()} kg )</li>`;
          } else {
            html += `<li>⚠️ Cannot find ships to perform Crit jumps</li>`;
          }
        }
        html += `</ul>
        <p><em>All ships end on the original side.</em></p>`;
        break;

      case 'green': // 2000G
        html += `<h4>2000G Wormhole</h4>
        <h4>Initial Check</h4>
        <ul>`;
        // 2 Cold IN
        {
          const ship = getShipForJump('cold');
          html += ship
            ? `<li>2 Cold Jumps ( ${ship.name}, ${ship.mass.toLocaleString()} kg each )</li>`
            : `<li>⚠️ No ship can make Cold Jumps</li>`;
        }
        // 2 Hot IN
        {
          const ship = getShipForJump('hot');
          html += ship
            ? `<li>2 Hot Jumps ( ${ship.name}, ${ship.mass.toLocaleString()} kg each )</li>`
            : `<li>⚠️ No ship can make Hot Jumps</li>`;
        }
        html += `<li>🔍 Ask: Is the hole reduced?</li>
        </ul>`;

        html += `<h4>If YES</h4><ul>`;
        {
          const coldShip = getShipForJump('cold');
          const hotShip  = getShipForJump('hot');
          if (coldShip && hotShip) {
            html += `<li>To Roll: 2 Cold + 2 Hot ( ${coldShip.name}/${hotShip.name} )</li>`;
          } else {
            html += `<li>⚠️ Cannot find ships for Roll</li>`;
          }
        }
        {
          const ship = getShipForJump('cold');
          html += ship
            ? `<li>To Crit: 4 Cold Jumps ( ${ship.name}, ${ship.mass.toLocaleString()} kg each )</li>`
            : `<li>⚠️ No ship can make Crit Cold Jumps</li>`;
        }
        html += `</ul>`;

        html += `<h4>If NO</h4><ul>`;
        {
          const ship = getShipForJump('hot');
          html += ship
            ? `<li>To Roll: 4 Hot Jumps ( ${ship.name}, ${ship.mass.toLocaleString()} kg each )</li>`
            : `<li>⚠️ No ship can make Roll Hot Jumps</li>`;
        }
        {
          const coldShip = getShipForJump('cold');
          const hotShip  = getShipForJump('hot');
          if (coldShip && hotShip) {
            html += `<li>To Crit: 2 Cold + 2 Hot ( ${coldShip.name}/${hotShip.name} )</li>`;
          } else {
            html += `<li>⚠️ Cannot find ships for Crit</li>`;
          }
        }
        html += `</ul>
        <p><em>All ships end on the original side.</em></p>`;
        break;

      case 'yellow': // 3000G
        html += `<h4>3000G Wormhole</h4>
        <h4>Initial Check</h4>
        <ul>`;
        {
          const ship = getShipForJump('hot');
          html += ship
            ? `<li>5 Hot Jumps ( ${ship.name}, ${ship.mass.toLocaleString()} kg each )</li>`
            : `<li>⚠️ No ship can make Hot Jumps</li>`;
        }
        html += `<li>🔍 Ask: Is the hole reduced?</li>
        </ul>`;

        html += `<h4>If YES</h4><ul>`;
        {
          const ship = getShipForJump('hot');
          html += ship
            ? `<li>To Roll: Return Hot + 4 Hot Jumps ( ${ship.name} )</li>`
            : `<li>⚠️ No ship for Roll</li>`;
        }
        {
          const coldShip = getShipForJump('cold');
          const hotShip  = getShipForJump('hot');
          if (coldShip && hotShip) {
            html += `<li>To Crit: Return Hot + Cold + 2 Hot ( ${hotShip.name}/${coldShip.name} )</li>`;
          } else {
            html += `<li>⚠️ No ships for Crit</li>`;
          }
        }
        html += `</ul>`;

        html += `<h4>If NO</h4><ul>`;
        {
          const ship = getShipForJump('hot');
          html += ship
            ? `<li>To Roll: Return Hot + 5 Hot Jumps ( ${ship.name} )</li>`
            : `<li>⚠️ No ship for Roll</li>`;
        }
        {
          const coldShip = getShipForJump('cold');
          const hotShip  = getShipForJump('hot');
          if (coldShip && hotShip) {
            html += `<li>To Crit: Return Hot + Cold + 3 Hot ( ${hotShip.name}/${coldShip.name} )</li>`;
          } else {
            html += `<li>⚠️ No ships for Crit</li>`;
          }
        }
        html += `</ul>
        <p><em>All ships end on the original side.</em></p>`;
        break;

      case 'orange': // 3300G
        html += `<h4>3300G Wormhole</h4>
        <h4>Initial Check</h4>
        <ul>`;
        {
          const coldShip = getShipForJump('cold');
          const hotShip  = getShipForJump('hot');
          html += (coldShip && hotShip)
            ? `<li>1 Cold + 5 Hot Jumps ( ${coldShip.name}/${hotShip.name} )</li>`
            : `<li>⚠️ No ships can perform initial jump</li>`;
        }
        html += `<li>🔍 Ask: Is the hole reduced?</li>
        </ul>`;

        html += `<h4>If YES</h4><ul>`;
        {
          const coldShip = getShipForJump('cold');
          const hotShip  = getShipForJump('hot');
          if (coldShip && hotShip) {
            html += `<li>To Roll: 2 Cold + 4 Hot ( ${coldShip.name}/${hotShip.name} )</li>`;
            html += `<li>To Crit: 4 Hot (${hotShip.name}) + HIC Cold (${HIC_COLD.toLocaleString()} kg) if needed</li>`;
          } else {
            html += `<li>⚠️ No ships for Roll/Crit</li>`;
          }
        }
        html += `</ul>`;

        html += `<h4>If NO</h4><ul>`;
        {
          const ship = getShipForJump('hot');
          html += ship
            ? `<li>To Roll: 6 Hot ( ${ship.name} )</li>`
            : `<li>⚠️ No ship for Roll</li>`;
        }
        {
          const coldShip = getShipForJump('cold');
          const hotShip  = getShipForJump('hot');
          if (coldShip && hotShip) {
            html += `<li>To Crit: Cold + 5 Hot ( ${coldShip.name}/${hotShip.name} )</li>`;
          } else {
            html += `<li>⚠️ No ships for Crit</li>`;
          }
        }
        html += `</ul>
        <p><em>All ships end on the original side.</em></p>`;
        break;

      default:
        html += `<p>⚠️ No stable‐state logic defined for this class.</p>`;
    }
  }

  html += '</div>';
  out.innerHTML = html;
}

init();
