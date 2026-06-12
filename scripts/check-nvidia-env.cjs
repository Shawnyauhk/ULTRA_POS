const https = require('https');
const API_KEY = 'rnd_Fc7YvGi4nFYY1EdrB3VXdvcOz7rQ';
const SID = 'srv-d8eiq1sp3tds738kin8g';

https.get(`https://api.render.com/v1/services/${SID}/env-vars`, {
  headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
}, (r) => {
  let d = '';
  r.on('data', c => d += c);
  r.on('end', () => {
    try {
      const j = JSON.parse(d);
      if (Array.isArray(j)) {
        console.log('Total env vars:', j.length);
        j.forEach(i => {
          const k = (i.envVar && i.envVar.key) || i.key;
          const v = (i.envVar && i.envVar.value) || i.value || '';
          if (k && (k.includes('NVIDIA') || k.includes('SENDGRID'))) {
            const masked = v ? v.substring(0, 10) + '...(' + v.length + ')' : '(empty)';
            console.log(`  ${k} = ${masked}`);
          }
        });
      } else {
        console.log('Unexpected response:', d.substring(0, 500));
      }
    } catch (e) {
      console.log('Parse error:', e.message);
      console.log('Data:', d.substring(0, 500));
    }
  });
}).on('error', e => console.log('Request error:', e.message));
