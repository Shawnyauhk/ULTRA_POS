const https = require('https');
const opts = {
  headers: {
    'Accept': 'application/json',
    'Authorization': 'Bearer rnd_Fc7YvGi4nFYY1EdrB3VXdvcOz7rQ'
  }
};
https.get('https://api.render.com/v1/services/srv-d8eiq1sp3tds738kin8g/deploys?limit=3', opts, (r) => {
  let d = '';
  r.on('data', c => d += c);
  r.on('end', () => {
    console.log('Status:', r.statusCode);
    console.log('Body length:', d.length);
    console.log('Body:', d.substring(0, 2000));
  });
});
