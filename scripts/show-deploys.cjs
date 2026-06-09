const https = require('https');
const API_KEY = 'rnd_Fc7YvGi4nFYY1EdrB3VXdvcOz7rQ';
const SERVICE_ID = 'srv-d8eiq1sp3tds738kin8g';

https.get(`https://api.render.com/v1/services/${SERVICE_ID}/deploys?limit=10`, {
  headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
}, (r) => {
  let d = '';
  r.on('data', c => d += c);
  r.on('end', () => {
    const j = JSON.parse(d);
    console.log('渲染部署歷史 (時間為香港時間):');
    console.log('============================');
    j.forEach(dp => {
      const t = new Date(dp.deploy.createdAt).toLocaleString('zh-HK');
      const status = dp.deploy.status;
      const msg = (dp.deploy.commit?.message || '?').substring(0, 60);
      console.log(`${t}  ${status.padEnd(20)}  ${msg}`);
    });
  });
});
