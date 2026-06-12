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
        console.log('--- All env var keys ---');
        j.forEach(i => {
          const k = (i.envVar && i.envVar.key) || i.key;
          const v = (i.envVar && i.envVar.value) || i.value || '';
          console.log(`  ${k} = ${v ? '(' + v.length + ' chars)' : '(empty)'}`);
        });
      }
    } catch (e) {
      console.log('Parse error:', e.message);
    }
  });
}).on('error', e => console.log('Request error:', e.message));
