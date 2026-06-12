const https = require('https');

const API_KEY = 'rnd_Fc7YvGi4nFYY1EdrB3VXdvcOz7rQ';
const SID = 'srv-d8eiq1sp3tds738kin8g';

const options = {
  hostname: 'api.render.com',
  path: '/v1/services/' + SID + '/deploys?limit=3',
  headers: {
    'Authorization': 'Bearer ' + API_KEY,
    'Accept': 'application/json',
  },
};

https.get(options, (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Raw:', d.slice(0, 1500));
    try {
      const parsed = JSON.parse(d);
      console.log('\nParsed keys:', Object.keys(parsed).join(', '));
      if (Array.isArray(parsed)) {
        console.log('Array length:', parsed.length);
        parsed.forEach((item, i) => {
          console.log('\n--- Item ' + i + ' ---');
          console.log(JSON.stringify(item, null, 2).slice(0, 600));
        });
      }
    } catch(e) {
      console.log('Parse error:', e.message);
    }
  });
}).on('error', e => console.error('Error:', e.message));
