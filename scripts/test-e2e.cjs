// 端到端測試：模擬前端發送的好評生成請求
const https = require('https');

const postData = JSON.stringify({
  model: 'meta/llama-3.2-11b-vision-instruct',
  messages: [
    { role: 'system', content: '你是香港食客，用廣東話寫短評。' },
    { role: 'user', content: '你是香港食客，用廣東話為「芋頭西米露」寫一段好評。\n情境：朋友聚餐後寫的，語氣開心雀躍\n要求：粵語口語、描述味道口感、5星、30-80字、不用emoji\n\n直接回覆好評內容：' }
  ],
  max_tokens: 128,
  temperature: 0.9,
  top_p: 0.95,
  stream: false
});

const options = {
  hostname: 'ultra-pos-0i2f.onrender.com',
  path: '/api/nvidia/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('📤 發送測試請求...\n');
const req = https.request(options, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    if (res.statusCode === 200) {
      try {
        const j = JSON.parse(data);
        const text = j.choices?.[0]?.message?.content || '';
        console.log('✅ 成功！');
        console.log('─── 生成內容 ───');
        console.log(text);
        console.log('────────────────');
      } catch (e) {
        console.log('❌ 解析失敗:', e.message);
        console.log('Raw:', data.substring(0, 300));
      }
    } else {
      console.log('❌ 失敗:', data.substring(0, 300));
    }
  });
});
req.on('error', e => console.log('❌ 錯誤:', e.message));
req.write(postData);
req.end();
