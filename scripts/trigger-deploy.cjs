const https = require('https');
const API_KEY = 'rnd_Fc7YvGi4nFYY1EdrB3VXdvcOz7rQ';
const SERVICE_ID = 'srv-d8eiq1sp3tds738kin8g';

const body = JSON.stringify({});

const opts = {
  hostname: 'api.render.com',
  path: `/v1/services/${SERVICE_ID}/deploys`,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  },
};

const req = https.request(opts, (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      const j = JSON.parse(d);
      console.log('Deploy ID:', j.deploy?.id || j.id || '?');
      console.log('Status:', j.deploy?.status || j.status || '?');
      console.log('✅ 手動部署已觸發！');
    } catch {
      console.log('Response:', d.substring(0, 200));
    }
  });
});
req.on('error', (e) => console.error('Error:', e.message));
req.write(body);
req.end();
