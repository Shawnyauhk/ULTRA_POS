const https = require('https');
const b = JSON.stringify({ admin_email: 'Berryenna@yahoo.com.hk,shawnyauws@gmail.com' });
const o = {
  hostname: 'ultra-pos-0i2f.onrender.com',
  path: '/api/email/test-send',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) }
};
const r = https.request(o, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => console.log(d));
});
r.on('error', e => console.log('err:', e.message));
r.write(b);
r.end();
