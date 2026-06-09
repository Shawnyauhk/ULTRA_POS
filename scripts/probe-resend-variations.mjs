// 探測 Resend 對 text 內容的過濾
async function test(label, body) {
  process.stdout.write(label + ' ... ');
  try {
    const r = await fetch('https://ultra-pos-0i2f.onrender.com/api/email/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: 'test', body }),
    });
    const data = await r.json();
    console.log(`[${data.status || '???'}] ${(data.response || data.error || 'OK').substring(0, 150)}`);
  } catch (e) {
    console.log('ERR ' + e.message);
  }
}

const shawn = 'shawnyauws@gmail.com';
const berry = 'Berryenna@yahoo.com.hk';

// 1) text 全英文
await test('1_english_text', { from: 'onboarding@resend.dev', to: [shawn], bcc: [berry], subject: 'B', text: 'plain english text' });
// 2) text 包含中文
await test('2_chinese_text', { from: 'onboarding@resend.dev', to: [shawn], bcc: [berry], subject: 'B', text: '中文測試文字' });
// 3) subject 包含 emoji
await test('3_emoji_subject', { from: 'onboarding@resend.dev', to: [shawn], bcc: [berry], subject: '🧪 Test', text: 'text' });
// 4) subject 中文
await test('4_chinese_subject', { from: 'onboarding@resend.dev', to: [shawn], bcc: [berry], subject: '測試', text: 'text' });
// 5) 完整原版
await test('5_full_chinese', { from: 'onboarding@resend.dev', to: [shawn], bcc: [berry], subject: '🧪 ULTRA POS Email 通知測試', text: '測試時間: 2026-06-09T05:29:50.160Z\n收件人: Berryenna@yahoo.com.hk,shawnyauws@gmail.com\n\n如果你收到這封郵件，表示 Email 通知設定正確！\n\nULTRA POS 系統' });
