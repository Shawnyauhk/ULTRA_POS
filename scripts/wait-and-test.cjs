const https = require('https');
const API_KEY = 'rnd_Fc7YvGi4nFYY1EdrB3VXdvcOz7rQ';
const SERVICE_ID = 'srv-d8eiq1sp3tds738kin8g';

function request(path) {
  return new Promise((resolve) => {
    https.get(`https://api.render.com/v1${path}`, {
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
    }, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
  });
}

async function main() {
  console.log('⏳ 等待部署完成...');
  const start = Date.now();
  let deployed = false;

  while (Date.now() - start < 300000) {
    const deploys = await request(`/services/${SERVICE_ID}/deploys?limit=1`);
    if (deploys && deploys.length > 0) {
      const status = deploys[0]?.deploy?.status;
      const elapsed = Math.round((Date.now() - start) / 1000);
      process.stdout.write(`\r[${elapsed}s] 狀態: ${status}    `);
      if (status === 'live') {
        deployed = true;
        console.log('\n✅ 部署完成！');
        break;
      }
      if (status === 'build_failed') {
        console.log('\n❌ 構建失敗');
        return false;
      }
    }
    await new Promise(r => setTimeout(r, 10000));
  }

  if (!deployed) {
    console.log('\n⏱ 等待超時');
    return false;
  }

  // Test email endpoint
  console.log('\n📧 測試 Email 發送...');
  try {
    const res = await fetch('https://ultra-pos-0i2f.onrender.com/api/email/test-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: 'test' }),
    });
    const result = await res.json();
    console.log('結果:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.log('❌ 請求失敗:', e.message);
  }
}

main().catch(e => console.error(e));
