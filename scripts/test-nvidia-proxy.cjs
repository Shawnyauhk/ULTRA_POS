const http = require('http');

// Test through local Vite proxy
const body = JSON.stringify({
  model: 'meta/llama-3.2-11b-vision-instruct',
  messages: [{ role: 'user', content: '用廣東話寫一個關於芋頭西米露的好評' }],
  max_tokens: 200,
  stream: false,
});

console.log('Testing via LOCAL VITE PROXY (localhost:5173)...');
console.log('Target: /api/nvidia/chat/completions');
console.log('Body length:', body.length);

const options = {
  hostname: 'localhost',
  port: 5173,
  path: '/api/nvidia/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('\n=== VITE PROXY RESPONSE ===');
    console.log('Status:', res.statusCode);
    try {
      const json = JSON.parse(data);
      if (json.choices && json.choices[0]) {
        console.log('Generated text:', json.choices[0].message?.content?.slice(0, 200));
      } else if (json.error) {
        console.log('Error:', JSON.stringify(json.error).slice(0, 500));
      } else if (json.message) {
        console.log('Server msg:', json.message);
        console.log('Full response:', JSON.stringify(json).slice(0, 500));
      } else {
        console.log('Response:', JSON.stringify(json).slice(0, 500));
      }
    } catch(e) {
      console.log('Raw body:', data.slice(0, 500));
    }
  });
});

req.on('error', (e) => console.error('Request error:', e.message));
req.setTimeout(15000, () => { req.destroy(); console.error('Timeout!'); });
req.write(body);
req.end();
