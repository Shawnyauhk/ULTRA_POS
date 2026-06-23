// 測試多個 NVIDIA 模型的可用性
const https = require('https');

async function testModel(modelName) {
  const postData = JSON.stringify({
    model: modelName,
    messages: [{ role: 'user', content: '用廣東話寫一句話讚好食' }],
    max_tokens: 50,
    stream: false
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'ultra-pos-0i2f.onrender.com',
      path: '/api/nvidia/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const status = res.statusCode;
        try {
          const j = JSON.parse(data);
          if (status === 200 && j.choices?.[0]?.message?.content) {
            resolve({ model: modelName, status: '✅', text: j.choices[0].message.content.substring(0, 80) });
          } else {
            resolve({ model: modelName, status: '❌', text: data.substring(0, 150) });
          }
        } catch (e) {
          resolve({ model: modelName, status: '❌', text: data.substring(0, 150) });
        }
      });
    });
    req.on('error', e => resolve({ model: modelName, status: '❌', text: e.message }));
    req.write(postData);
    req.end();
  });
}

(async () => {
  const models = [
    'qwen/qwen3.5-122b-a10b',           // 目前的 OCR / 視覺模型
    'meta/llama-3.1-70b-instruct',
    'meta/llama-3.1-8b-instruct',
    'mistralai/mistral-large-2-instruct',
    'nvidia/nemotron-3-ultra-550b-a55b',
    'google/gemma-4-31b-it',
    'qwen/qwen-2.5-72b-instruct',
  ];

  console.log('🧪 測試多個 NVIDIA 模型可用性...\n');
  for (const m of models) {
    const r = await testModel(m);
    console.log(`${r.status} ${r.model}`);
    console.log(`   ${r.text}\n`);
  }
})();
