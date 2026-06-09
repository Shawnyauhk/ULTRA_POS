const fs = require('fs');
const c = fs.readFileSync('./server.js', 'utf-8');
c.split('\n').forEach((l, i) => {
  const lc = l.toLowerCase();
  if ((lc.includes('sendgrid') || lc.includes('resend')) && !l.includes('user.email')) {
    console.log((i + 1) + ': ' + l);
  }
});
