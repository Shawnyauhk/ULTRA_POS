const https = require('https');
const API_KEY = 'rnd_Fc7YvGi4nFYY1EdrB3VXdvcOz7rQ';
const SID = 'srv-d8eiq1sp3tds738kin8g';

https.get(`https://api.render.com/v1/services/${SID}/env-vars`, {
  headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
}, (r) => {
  let d = '';
  r.on('data', c => d += c);
  r.on('end', () => {
    const j = JSON.parse(d);
    j.forEach(i => {
      const k = i.envVar?.key || i.key;
      const v = i.envVar?.value || i.value || '';
      if (k.includes('SENDGRID') || k.includes('EMAIL') || k === 'ADMIN_EMAIL' || k.includes('RESEND') || k.includes('POSPAL')) {
        const masked = k.includes('KEY') ? v.substring(0, 6) + '****' : v;
        console.log(k + ' = ' + masked);
      }
    });
  });
});
