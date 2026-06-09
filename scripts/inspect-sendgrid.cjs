const { execSync } = require('child_process');
const c = execSync('git show 5ca7a77:server.js', { encoding: 'utf-8' });
c.split('\n').forEach((l, i) => {
  const lower = l.toLowerCase();
  if ((lower.includes('sendgrid') || lower.includes('resend')) && !l.includes('user.email')) {
    console.log((i + 1) + ': ' + l);
  }
});
