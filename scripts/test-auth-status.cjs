const https = require('https');

const url = 'https://ultra-pos-0i2f.onrender.com/api/whatsapp/auth-status';
const start = Date.now();

const req = https.get(url, { timeout: 60000 }, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('--- /api/whatsapp/auth-status ---');
    console.log('HTTP Status:', res.statusCode);
    console.log('Content-Type:', res.headers['content-type']);
    console.log('Time:', ((Date.now() - start) / 1000).toFixed(2) + 's');
    console.log('Body (first 500 chars):');
    console.log(data.substring(0, 500));
  });
});

req.on('error', (e) => {
  console.error('ERROR:', e.message);
});

req.on('timeout', () => {
  console.log('TIMEOUT after', ((Date.now() - start) / 1000).toFixed(2) + 's');
  req.destroy();
});
