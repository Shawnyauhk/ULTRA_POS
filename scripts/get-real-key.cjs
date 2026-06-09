// 從 Render 環境拿真實 Key
const r = await fetch('https://ultra-pos-0i2f.onrender.com/api/email/probe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    restaurant_id: 'test',
    body: { from: 'onboarding@resend.dev', to: ['test@test.com'], subject: 'getkey', text: 'getkey' }
  }),
});
console.log('Status:', r.status);
const txt = await r.text();
console.log('Response:', txt);
