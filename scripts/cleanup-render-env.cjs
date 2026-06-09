const https = require('https');
const API_KEY = 'rnd_Fc7YvGi4nFYY1EdrB3VXdvcOz7rQ';
const SERVICE_ID = 'srv-d8eiq1sp3tds738kin8g';

// 刪除不再需要的舊 SMTP 環境變量
const toDelete = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_SECURE', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_FROM'];

function delEnv(key) {
  const opts = {
    hostname: 'api.render.com',
    path: `/v1/services/${SERVICE_ID}/env-vars/${key}`,
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Accept': 'application/json',
    },
  };
  const req = https.request(opts, (r) => {
    console.log(`刪除 ${key}: ${r.statusCode === 200 || r.statusCode === 404 ? '✅' : '❌ ' + r.statusCode}`);
  });
  req.on('error', e => console.log(`❌ ${key}: ${e.message}`));
  req.end();
}

toDelete.forEach(delEnv);
