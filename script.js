const defaultShips = [
  { name: 'Frigate', cold: 1000000, hot: 3000000 },
  { name: 'Destroyer', cold: 1500000, hot: 4500000 },
  { name: 'Cruiser', cold: 10000000, hot: 13000000 },
  { name: 'Battlecruiser', cold: 13000000, hot: 17000000 },
  { name: 'Battleship', cold: 100000000, hot: 130000000 },
  { name: 'Capital', cold: 1000000000, hot: 1300000000 }
];

function addRow(name, mass) {
  const tbody = document.querySelector('#shipTable tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" value="${name}"></td>
    <td><input type="number" value="${mass}"></td>
    <td><input type="number" value="0"></td>
    <td><button class="remove">Remove</button></td>
  `;
  tbody.appendChild(tr);
  tr.querySelector('.remove').addEventListener('click', () => tbody.removeChild(tr));
}

function init() {
  defaultShips.forEach(ship => {
    addRow(`${ship.name} (Cold)`, ship.cold);
    addRow(`${ship.name} (Hot)`, ship.hot);
  });
}

document.getElementById('addShip').addEventListener('click', () => addRow('Custom', 0));

document.getElementById('compute').addEventListener('click', () => {
  const whMass = parseFloat(document.getElementById('whMass').value);
  if (!whMass) return;

  let remaining = whMass;
  const unstable = whMass / 2;
  const critical = whMass * 0.1;
  let step = 0;
  let output = '';

  const rows = document.querySelectorAll('#shipTable tbody tr');
  rows.forEach(row => {
    const name = row.children[0].querySelector('input').value;
    const mass = parseFloat(row.children[1].querySelector('input').value);
    let count = parseInt(row.children[2].querySelector('input').value);
    if (!mass || !count) return;

    for (let i = 0; i < count; i++) {
      step += 1;
      remaining -= mass;
      output += `Step ${step}: ${name} jumped (${mass.toLocaleString()} kg) - Remaining: ${remaining.toLocaleString()} kg\n`;

      if (remaining < unstable && remaining + mass >= unstable) {
        output += `--> Wormhole becomes Unstable after step ${step}\n`;
      }
      if (remaining < critical && remaining + mass >= critical) {
        output += `--> Wormhole becomes Critical after step ${step}\n`;
      }
      if (remaining <= 0) {
        output += `--> Wormhole Collapses after step ${step}\n`;
        remaining = 0;
        break;
      }
    }
  });

  if (remaining > 0) {
    output += `Wormhole remaining mass: ${remaining.toLocaleString()} kg (not collapsed)\n`;
  }

  document.getElementById('output').textContent = output;
});

init();
