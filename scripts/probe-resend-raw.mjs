// 模擬正式 test-send 端點的完整 payload
const r = await fetch('https://ultra-pos-0i2f.onrender.com/api/email/probe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    restaurant_id: 'test',
    body: {
      from: 'onboarding@resend.dev',
      to: ['shawnyauws@gmail.com'],
      bcc: ['Berryenna@yahoo.com.hk'],
      subject: '🧪 ULTRA POS Email 通知測試',
      text: '測試時間: ' + new Date().toISOString() + '\n收件人: Berryenna@yahoo.com.hk,shawnyauws@gmail.com\n\n如果你收到這封郵件，表示 Email 通知設定正確！\n\nULTRA POS 系統'
    }
  }),
});
console.log('Status:', r.status);
const data = await r.json();
console.log(JSON.stringify(data, null, 2));
