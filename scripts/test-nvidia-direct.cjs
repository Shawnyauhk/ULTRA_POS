const https = require('https');

const API_KEY = process.env.VITE_NVIDIA_NIM_API_KEY || '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';
const API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

const body = JSON.stringify({
  model: 'qwen/qwen3.5-122b-a10b',
  messages: [{ role: 'user', content: '用廣東話寫一個關於芋頭西米露的好評' }],
  max_tokens: 200,
  stream: false,
});

console.log('Testing NVIDIA API directly...');
console.log('Model: meta/llama-3.2-11b-vision-instruct');
console.log('API Key length:', API_KEY.length);
console.log('Body:', body.substring(0, 100) + '...');

const url = new URL(API_URL);
const options = {
  hostname: url.hostname,
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Length': Buffer.byteLength(body),
  },
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('\n=== RESPONSE ===');
    console.log('Status:', res.statusCode);
    try {
      const json = JSON.parse(data);
      if (json.choices && json.choices[0]) {
        console.log('Generated text:', json.choices[0].message?.content || json.choices[0].text || '(empty)');
      } else if (json.error) {
        console.log('Error:', JSON.stringify(json.error));
      } else {
        console.log('Response:', JSON.stringify(json).slice(0, 500));
      }
    } catch(e) {
      console.log('Body:', data.slice(0, 500));
    }
  });
});

req.on('error', (e) => console.error('Request error:', e.message));
req.setTimeout(30000, () => { req.destroy(); console.error('Timeout!'); });
req.write(body);
req.end();
