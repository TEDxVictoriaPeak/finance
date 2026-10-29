// Regenerates google-sheets/Code.gs from the shared report builder.
// Run: node scripts/build-gs.mjs   (only needed if src/lib/pack.js changes)
import fs from 'fs'
const pack = fs.readFileSync('src/lib/pack.js', 'utf8').replace(/\n\/\/ Export for the website build[^\n]*\nexport \{[^}]*\}\n?/, '\n')
const sync = fs.readFileSync('google-sheets/sync.gs.part', 'utf8')
fs.writeFileSync('google-sheets/Code.gs',
  '// GENERATED FILE – copy ALL of this into Extensions › Apps Script › Code.gs\n' +
  '// Source: src/lib/pack.js + google-sheets/sync.gs.part (node scripts/build-gs.mjs)\n\n' + sync + '\n' + pack)
console.log('google-sheets/Code.gs written')
