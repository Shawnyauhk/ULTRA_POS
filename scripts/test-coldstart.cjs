// 模拟 Render 冷启动：先打 / 看 HTML，再打 /api/ 看 JSON
const https = require('https');

function get(url) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.get(url, { timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({
        status: res.statusCode,
        ct: res.headers['content-type'],
        ms: Date.now() - start,
        bodyStart: data.substring(0, 80),
        ok: res.statusCode === 200
      }));
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
  });
}

(async () => {
  console.log('=== 1) 直接访问 /api/whatsapp/auth-status (容器已醒) ===');
  const r1 = await get('https://ultra-pos-0i2f.onrender.com/api/whatsapp/auth-status');
  console.log(JSON.stringify(r1, null, 2));
  console.log();
  console.log('=== 2) 头部 GET / (触发冷启动会返回什么?) ===');
  const r2 = await get('https://ultra-pos-0i2f.onrender.com/');
  console.log('status=' + r2.status + ' ct=' + r2.ct);
  console.log('body preview:', r2.bodyStart);
  console.log();
  console.log('=== 3) 再次访问 /api/whatsapp/auth-status ===');
  const r3 = await get('https://ultra-pos-0i2f.onrender.com/api/whatsapp/auth-status');
  console.log(JSON.stringify(r3, null, 2));
})();
