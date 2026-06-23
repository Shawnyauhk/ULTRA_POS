const https = require('https');

// 測試 Render 上 server.js 的 /api/nvidia/chat/completions
const body = JSON.stringify({
  model: 'qwen/qwen3.5-122b-a10b',
  messages: [{ role: 'user', content: '用廣東話寫一個關於芋頭西米露的好評' }],
  max_tokens: 100,
  stream: false,
});

console.log('Testing Render NVIDIA proxy...');
const options = {
  hostname: 'ultra-pos-0i2f.onrender.com',
  path: '/api/nvidia/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
};

const req = https.request(options, (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', d.slice(0, 500));
  });
});
req.on('error', e => console.error('Error:', e.message));
req.setTimeout(30000, () => { req.destroy(); console.log('Timeout'); });
req.write(body);
req.end();
