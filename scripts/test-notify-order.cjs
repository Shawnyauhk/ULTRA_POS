const https = require('https');
const b = JSON.stringify({ employeeName: 'TEST_用戶', items: [{ name: '測試商品', quantity: 2 }], restaurant_id: 'test' });
const o = {
  hostname: 'ultra-pos-0i2f.onrender.com',
  path: '/api/whatsapp/notify-order',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) }
};
const r = https.request(o, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const j = JSON.parse(d);
    console.log('success:', j.success);
    console.log('results:', JSON.stringify(j.results));
    if (j.results && j.results.email !== 'success') console.log('error:', j.message);
    else console.log('Email OK');
  });
});
r.on('error', e => console.log('err:', e.message));
r.write(b);
r.end();
