const https = require('https');

const apiKey = process.argv[2];
if (!apiKey) {
  console.error('请提供 API Key');
  process.exit(1);
}

function request(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.render.com',
      path: '/v1' + path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  try {
    console.log('=== /services 原始响应 ===');
    const data = await request('/services?limit=20');
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('错误:', e.message);
  }
})();
