const { spawn } = require('child_process');
const path = require('path');

const cwd = __dirname;
const child = spawn(
  path.resolve(__dirname, 'node_modules', '.bin', 'tsx.cmd'),
  [path.resolve(__dirname, 'scheduler.ts')],
  { cwd, stdio: 'inherit', shell: true }
);

child.on('close', (code) => process.exit(code ?? 0));
child.on('error', (err) => { console.error(err); process.exit(1); });
