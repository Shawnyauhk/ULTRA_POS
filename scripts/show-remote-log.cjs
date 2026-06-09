const { execSync } = require('child_process');
const out = execSync('git log origin/main --oneline -30', { encoding: 'utf-8' });
console.log(out);
console.log('\n--- LOCAL main ---');
const local = execSync('git log main --oneline -10', { encoding: 'utf-8' });
console.log(local);
