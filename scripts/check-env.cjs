const https = require('https');
const API_KEY = 'rnd_Fc7YvGi4nFYY1EdrB3VXdvcOz7rQ';
const SERVICE_ID = 'srv-d8eiq1sp3tds738kin8g';

https.get(`https://api.render.com/v1/services/${SERVICE_ID}/env-vars`, {
  headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
}, (r) => {
  let d = '';
  r.on('data', c => d += c);
  r.on('end', () => {
    try {
      const j = JSON.parse(d);
      if (Array.isArray(j)) {
        j.forEach(item => {
          const key = item.envVar?.key || item.key;
          const val = item.envVar?.value || item.value;
          if (key && (key.startsWith('EMAIL_') || key === 'ADMIN_EMAIL')) {
            const masked = val.substring(0, 4) + '****' + val.substring(val.length - 4);
            console.log(`${key} = ${masked}`);
          }
        });
      } else {
        console.log(d.substring(0, 500));
      }
    } catch(e) { console.log('Error:', e.message); }
  });
});
