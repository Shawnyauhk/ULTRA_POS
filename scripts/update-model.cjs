const https = require('https');
const API_KEY = 'rnd_Fc7YvGi4nFYY1EdrB3VXdvcOz7rQ';
const SID = 'srv-d8eiq1sp3tds738kin8g';

// 更新模型為純語言模型 (Llama-3.1-70b 比 vision 模型更適合文字生成)
const req = https.request({
  hostname: 'api.render.com',
  path: `/v1/services/${SID}/env-vars/VITE_NVIDIA_NIM_MODEL`,
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  }
}, (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', d.substring(0, 200));
  });
});

req.write(JSON.stringify({ value: 'meta/llama-3.1-70b-instruct' }));
req.end();
