const https = require('https');
const b = JSON.stringify({ employeeName: '真實測試', items: [{ name: '商品A', quantity: 1 }], restaurant_id: '00000000-0000-0000-0000-000000000001' });
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
    console.log(d);
  });
});
r.on('error', e => console.log('err:', e.message));
r.write(b);
r.end();
