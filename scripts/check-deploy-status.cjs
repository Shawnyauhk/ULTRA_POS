const https = require('https');
const API_KEY = 'rnd_Fc7YvGi4nFYY1EdrB3VXdvcOz7rQ';
const SERVICE_ID = 'srv-d8eiq1sp3tds738kin8g';

https.get(`https://api.render.com/v1/services/${SERVICE_ID}/deploys?limit=3`, {
  headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
}, (r) => {
  let d = '';
  r.on('data', c => d += c);
  r.on('end', () => {
    const j = JSON.parse(d);
    // Check if there's a new in-progress deploy
    const inProgress = j.find(dp => dp.deploy && (dp.deploy.status === 'build_in_progress' || dp.deploy.status === 'created'));
    if (inProgress) {
      console.log('🔨 新的部署正在構建中...');
      console.log(inProgress.deploy.commit?.message || '?');
    } else {
      console.log('✅ 當前最新部署已 live');
      console.log('狀態:', j[0]?.deploy?.status);
      console.log('消息:', j[0]?.deploy?.commit?.message?.substring(0, 60) || '?');
    }
  });
});
