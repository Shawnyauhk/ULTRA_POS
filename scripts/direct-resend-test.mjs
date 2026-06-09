// 直接呼叫 Resend API 測試（從我們的服務器看實際配置）
const r = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer re_Nc4QnD6J_6QGbRKZT5oZzaVHrVHVXkWYU',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: 'onboarding@resend.dev',
    to: ['shawnyauws@gmail.com'],
    bcc: ['Berryenna@yahoo.com.hk'],
    subject: '🧪 ULTRA POS Email 通知測試',
    text: '測試時間: ' + new Date().toISOString() + '\n收件人: Berryenna@yahoo.com.hk,shawnyauws@gmail.com\n\n如果你收到這封郵件，表示 Email 通知設定正確！\n\nULTRA POS 系統',
  }),
});
console.log('Status:', r.status);
const txt = await r.text();
console.log('Response:', txt.substring(0, 500));
