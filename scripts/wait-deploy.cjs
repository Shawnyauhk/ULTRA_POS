const https = require('https');
const opts = {
  headers: {
    'Accept': 'application/json',
    'Authorization': 'Bearer rnd_Fc7YvGi4nFYY1EdrB3VXdvcOz7rQ'
  }
};

async function check() {
  return new Promise((resolve) => {
    https.get('https://api.render.com/v1/services/srv-d8eiq1sp3tds738kin8g/deploys?limit=3', opts, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try {
          const j = JSON.parse(d);
          resolve(j[0]?.deploy || {});
        } catch { resolve({}); }
      });
    });
  });
}

async function waitForDeploy() {
  console.log('等待 Render 部署完成...');
  const start = Date.now();
  while (Date.now() - start < 300000) {
    const deploy = await check();
    const status = deploy.status || 'unknown';
    const elapsed = Math.round((Date.now() - start) / 1000);
    const commitMsg = deploy.commit?.message || '?';
    process.stdout.write(`\r[${elapsed}s] ${status} - ${commitMsg}  `);
    if (status === 'live') {
      console.log('\n✅ 部署完成！');
      console.log('ID:', deploy.id);
      console.log('Commit:', commitMsg);
      console.log('URL:', 'https://ultra-pos-0i2f.onrender.com');
      return true;
    }
    if (status === 'failed' || status === 'deactivated') {
      console.log(`\n❌ 部署 ${status}`);
      return false;
    }
    await new Promise(r => setTimeout(r, 10000));
  }
  console.log('\n⏱ 等待超时');
  return false;
}

waitForDeploy().catch(e => console.error(e));
