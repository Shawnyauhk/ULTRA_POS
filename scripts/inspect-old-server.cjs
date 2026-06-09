const { execSync } = require('child_process');
const fs = require('fs');

const c = execSync('git show a2c6957:server.js', { encoding: 'utf-8' });
const lines = c.split('\n');
lines.forEach((l, i) => {
  const lower = l.toLowerCase();
  if (lower.includes('email') || lower.includes('nodemailer') || lower.includes('smtp')) {
    console.log((i + 1) + ': ' + l);
  }
});
