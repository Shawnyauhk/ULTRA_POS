// 從 Render 端探測 Resend 各種方案（使用服務器的真實 ENV）
async function probe(label, body) {
  process.stdout.write(label + ' ... ');
  try {
    const r = await fetch('https://ultra-pos-0i2f.onrender.com/api/email/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, body }),
    });
    const data = await r.json();
    console.log(JSON.stringify(data).substring(0, 250));
  } catch (e) {
    console.log('❌ ERR ' + e.message);
  }
}

async function main() {
  const shawn = 'shawnyauws@gmail.com';
  const berry = 'Berryenna@yahoo.com.hk';

  await probe('A_to_self', { from: 'onboarding@resend.dev', to: [shawn], subject: 'A', text: 'A' });
  await probe('B_bcc', { from: 'onboarding@resend.dev', to: [shawn], bcc: [berry], subject: 'B', text: 'B' });
  await probe('C_cc', { from: 'onboarding@resend.dev', to: [shawn], cc: [berry], subject: 'C', text: 'C' });
  await probe('D_both_to', { from: 'onboarding@resend.dev', to: [shawn, berry], subject: 'D', text: 'D' });
  await probe('E_replyTo', { from: 'onboarding@resend.dev', to: [berry], reply_to: [shawn], subject: 'E', text: 'E' });
}
main();
