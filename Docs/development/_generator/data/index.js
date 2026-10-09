/* Loads phase data files p01..p12 in order, skipping any not yet authored. */
const fs = require('fs');
const path = require('path');

const phases = [];
for (let i = 1; i <= 12; i++) {
  const f = path.join(__dirname, 'p' + String(i).padStart(2, '0') + '.js');
  if (fs.existsSync(f)) phases.push(require(f));
}
if (!phases.length) throw new Error('no phase data files found');
module.exports = phases;
