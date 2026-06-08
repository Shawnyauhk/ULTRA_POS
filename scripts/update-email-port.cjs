const https = require('https');
const API_KEY = 'rnd_Fc7YvGi4nFYY1EdrB3VXdvcOz7rQ';
const SERVICE_ID = 'srv-d8eiq1sp3tds738kin8g';

const updates = [
  { key: 'EMAIL_PORT', value: '587' },
  { key: 'EMAIL_SECURE', value: 'false' },
];

let done = 0;
function updateEnv(key, value) {
  const body = JSON.stringify({ value });
  const opts = {
    hostname: 'api.render.com',
    path: `/v1/services/${SERVICE_ID}/env-vars/${key}`,
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  };
  const req = https.request(opts, (r) => {
    let d = '';
    r.on('data', c => d += c);
    r.on('end', () => {
      done++;
      console.log(`${key} → ${value}: ${r.statusCode === 200 ? '✅' : '❌ ' + r.statusCode}`);
      if (done === updates.length) {
        console.log('\n✅ 端口更新完成，請觸發重新部署');
      }
    });
  });
  req.write(body);
  req.end();
}

updates.forEach(u => updateEnv(u.key, u.value));
