const https = require('https');
const API_KEY = 'rnd_Fc7YvGi4nFYY1EdrB3VXdvcOz7rQ';
const SERVICE_ID = 'srv-d8eiq1sp3tds738kin8g';

const startTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
const path = `/logs?startTime=${encodeURIComponent(startTime)}&resource=${SERVICE_ID}&limit=100`;

https.get(`https://api.render.com/v1${path}`, {
  headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
}, (r) => {
  let d = '';
  r.on('data', c => d += c);
  r.on('end', () => {
    try {
      const j = JSON.parse(d);
      if (Array.isArray(j)) {
        j.forEach(log => {
          const t = new Date(log.timestamp).toLocaleTimeString('zh-HK');
          const text = (log.text || '').trim();
          if (text.includes('email') || text.includes('Email') || text.includes('EMAIL') || text.includes('test-send')) {
            console.log(`[${t}] ${text}`);
          }
        });
      } else if (j.logs) {
        j.logs.forEach(log => {
          const t = new Date(log.timestamp).toLocaleTimeString('zh-HK');
          const text = (log.text || log.message || '').trim();
          if (text.toLowerCase().includes('email') || text.includes('test-send')) {
            console.log(`[${t}] ${text}`);
          }
        });
      }
    } catch (e) {
      console.log('Parse error:', e.message);
      console.log(d.substring(0, 500));
    }
  });
});
