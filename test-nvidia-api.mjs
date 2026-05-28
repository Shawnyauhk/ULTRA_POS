// NVIDIA NIM API 测试脚本
const NVIDIA_API_KEY = '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';
const NVIDIA_MODEL = 'meta/llama-3.2-11b-vision-instruct';
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

async function testNVIDIAAPI() {
  console.log('🔄 测试 NVIDIA NIM API...\n');
  
  try {
    const response = await fetch(NVIDIA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages: [
          {
            role: 'system',
            content: '你是一個活潑的香港食客，用廣東話寫評論。'
          },
          {
            role: 'user',
            content: `你是一個香港食客。請為「奶茶」寫一個自然的Google好評，風格如下：
- 使用廣東話口語（粵語）
- 包含食物味道、口感的描述
- 自然的5星評價
- 長度約50-100字
- 不要使用emoji，只用文字

請直接回覆好評內容，不要有任何其他文字。`
          }
        ],
        max_tokens: 256,
        temperature: 0.8
      })
    });

    console.log(`📊 HTTP Status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ API 錯誤: ${errorText}`);
      return;
    }

    const data = await response.json();
    console.log('\n✅ API 連接成功！\n');
    console.log('📦 完整回應:');
    console.log(JSON.stringify(data, null, 2));
    
    // 尝试多种可能的路径获取内容
    const content = 
      data.choices?.[0]?.message?.content ||
      data.choices?.[0]?.text ||
      data.output?.text ||
      data.output?.choices?.[0]?.message?.content ||
      '無法解析回應';
    
    console.log('\n🤖 AI 回覆:');
    console.log('─'.repeat(50));
    console.log(content);
    console.log('─'.repeat(50));
    
  } catch (error) {
    console.log(`❌ 連接失敗: ${error instanceof Error ? error.message : error}`);
  }
}

testNVIDIAAPI();
