#!/usr/bin/env node
const https = require('https');

const API_KEY = 'rnd_Fc7YvGi4nFYY1EdrB3VXdvcOz7rQ';
const SERVICE_ID = 'srv-d8eiq1sp3tds738kin8g';

const envVars = [
  { key: 'VITE_NVIDIA_NIM_API_KEY', value: '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' },
  { key: 'EMAIL_USER', value: 'handmadetarohk813@gmail.com' },
  { key: 'EMAIL_PASS', value: 'aivc hozo vkqm ejsg' },
  { key: 'ADMIN_EMAIL', value: 'Berryenna@yahoo.com.hk,shawnyauws@gmail.com' },
  { key: 'EMAIL_HOST', value: 'smtp.gmail.com' },
  { key: 'EMAIL_PORT', value: '465' },
  { key: 'EMAIL_SECURE', value: 'true' },
  { key: 'EMAIL_FROM', value: 'ULTRA POS' },
];

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.render.com',
      path: '/v1' + path,
      method,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data: data.substring(0, 200) }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('📤 逐一设置环境变量...\n');
  for (const ev of envVars) {
    process.stdout.write(`   ${ev.key}... `);
    const res = await request('PUT', `/services/${SERVICE_ID}/env-vars/${ev.key}`, { value: ev.value });
    console.log(res.status === 200 ? '✅' : `❌ (${res.status}: ${JSON.stringify(res.data).substring(0, 80)})`);
  }
  console.log('\n✅ 所有环境变量设置完成！');
  console.log('⏳ Render 会自动触发重新部署...');
}

main().catch(e => console.error('错误:', e.message));
