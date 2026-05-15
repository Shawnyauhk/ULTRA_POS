import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { spawnSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Setup multer for file uploads if needed
const upload = multer({ storage: multer.memoryStorage() });

// Supabase admin client (service role) for user management
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// 代理 Gemini AI 請求
app.post('/api/ai/parse-receipt', upload.single('receipt'), async (req, res) => {
  try {
    // 這裡整合 Gemini API 邏輯
    // 為了演示，返回模擬數據
    res.json({
      success: true,
      data: {
        date: new Date().toISOString().split('T')[0],
        amount: 150.50,
        merchant: '模擬商店',
        items: ['模擬商品 A', '模擬商品 B'],
        confidence: 0.95
      }
    });
  } catch (error) {
    console.error('AI 解析失敗:', error);
    res.status(500).json({ success: false, message: '解析失敗' });
  }
});

app.post('/api/ai/parse-settlement', upload.single('settlement'), async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        systemExpected: 5000,
        aiConfirmed: 4950,
        discrepancy: -50
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '結算解析失敗' });
  }
});

app.post('/api/ai/parse-attendance', upload.single('attendance'), async (req, res) => {
  try {
    res.json({
      success: true,
      data: [
        { name: 'John Doe', hours: 40 },
        { name: 'Jane Smith', hours: 35 }
      ]
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '考勤解析失敗' });
  }
});

// =========== Admin: 批量建立員工（使用 service_role 繞過 RLS） ===========
app.post('/api/admin/batch-create-employees', async (req, res) => {
  try {
    const { employees: empData } = req.body;
    if (!Array.isArray(empData) || empData.length === 0) {
      return res.status(400).json({ success: false, message: '請提供員工資料' });
    }

    const createdEmployees = [];
    for (const emp of empData) {
      const { data, error } = await supabaseAdmin
        .from('employees')
        .insert([{
          restaurant_id: emp.restaurant_id,
          name: emp.name,
          role: 'staff',
          hire_date: emp.hire_date || new Date().toISOString().split('T')[0],
          is_active: true,
          hourly_rate: emp.payType === 'hourly' ? emp.hourly_rate : undefined,
          monthly_salary: emp.payType === 'monthly' ? emp.monthly_salary : undefined,
        }])
        .select()
        .single();
      if (error) throw error;
      createdEmployees.push(data);
    }

    console.log(`✅ 批量建立 ${createdEmployees.length} 位員工成功`);
    res.json({ success: true, data: createdEmployees });
  } catch (error) {
    console.error('❌ 批量建立員工失敗:', error);
    res.status(500).json({ success: false, message: error.message || '建立失敗' });
  }
});

// =========== WhatsApp 訂貨通知 (wacli) ===========
app.post('/api/whatsapp/notify-order', async (req, res) => {
  try {
    const { employeeName, items } = req.body;
    const adminPhone = process.env.ADMIN_WHATSAPP;
    const wacliPath = process.env.WACLI_PATH || 'wacli';

    if (!adminPhone) {
      return res.json({ success: false, message: '未設定管理員 WhatsApp 號碼' });
    }

    // 組裝訊息
    const itemList = items.map(i => `• ${i.name} × ${i.quantity}`).join('\n');
    const message = `🔔 新訂貨通知\n\n員工：${employeeName}\n\n項目：\n${itemList}\n\n請登入系統處理。`;

    // 限制訊息長度
    const truncatedMsg = message.length > 1000 ? message.slice(0, 997) + '...' : message;

    const result = spawnSync(wacliPath, [
      'send', 'text',
      '--to', adminPhone,
      '--message', truncatedMsg
    ], { encoding: 'utf-8', timeout: 20000 });

    console.log('✅ WhatsApp 通知發送成功');
    res.json({ success: true });
  } catch (error) {
    console.error('❌ WhatsApp 發送失敗:', error.message);
    res.json({ success: false, message: error.message });
  }
});

// =========== AI 客服系統 API ===========

// NVIDIA NIM 配置
const NVIDIA_API_KEY = process.env.VITE_NVIDIA_NIM_API_KEY || '';
const NVIDIA_MODEL = process.env.VITE_NVIDIA_NIM_MODEL || 'qwen/qwen3.5-122b-a10b';
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

/**
 * 使用 NVIDIA NIM API 生成 AI 回覆
 */
async function generateAIResponse(messages) {
  const response = await fetch(NVIDIA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages,
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NVIDIA API 錯誤: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.reasoning_content ||
         data.choices?.[0]?.message?.content ||
         '';
}

/**
 * 查詢知識庫中相關的條目
 */
async function queryKnowledgeBase(restaurantId, userMessage) {
  const { data } = await supabaseAdmin
    .from('ai_knowledge_base')
    .select('question, answer')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true);

  if (!data || data.length === 0) return [];

  // 簡單關鍵詞匹配：找出知識庫中與用戶問題相關的條目
  const keywords = userMessage.toLowerCase().split(/[\s,，。？?！!、]+/).filter(k => k.length > 1);
  const matched = data.filter(entry => {
    const combined = (entry.question + entry.answer).toLowerCase();
    return keywords.some(k => combined.includes(k));
  });

  return matched.slice(0, 5);
}

/**
 * 獲取餐廳的 AI 配置
 */
async function getAIConfigs(restaurantId) {
  const { data } = await supabaseAdmin
    .from('ai_config')
    .select('config_key, config_value')
    .eq('restaurant_id', restaurantId);

  const configMap = {};
  if (data) {
    data.forEach(item => {
      configMap[item.config_key] = item.config_value;
    });
  }
  return configMap;
}

/**
 * 使用 AI 生成會話總結
 * 分析對話內容，提取議題、評價、意見
 */
async function generateSessionSummary(sessionId) {
  try {
    // 獲取該會話的所有訊息
    const { data: messages } = await supabaseAdmin
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (!messages || messages.length < 2) return null;

    const conversationText = messages.map(m =>
      `${m.role === 'user' ? '客人' : 'AI'}: ${m.content}`
    ).join('\n');

    const summaryResponse = await fetch(NVIDIA_API_URL, {
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
            content: '你是一個對話摘要助手。請分析以下客服對話，**只關注客人的發言**，用一句話精簡總結客人的核心需求（不超過30字）。\n\n' +
              '規則：\n' +
              '1. 只提取客人問了什麼、想要什麼\n' +
              '2. 不要提及AI客服的回覆\n' +
              '3. 不要加【議題】【評價】等標籤\n' +
              '4. 直接輸出一句話，例如：「客人詢問香蕉煎餅是否有售」\n\n' +
              '請直接輸出摘要句子，不要有任何前綴。'
          },
          { role: 'user', content: conversationText }
        ],
        max_tokens: 100,
        temperature: 0.3,
      }),
    });

    if (!summaryResponse.ok) return null;

    const data = await summaryResponse.json();
    const summary = data.choices?.[0]?.message?.reasoning_content ||
                    data.choices?.[0]?.message?.content ||
                    '';

    if (summary) {
      await supabaseAdmin
        .from('ai_sessions')
        .update({ summary: summary.trim() })
        .eq('id', sessionId);
      return summary.trim();
    }
  } catch (err) {
    console.warn(`⚠️ 生成總結失敗 (Session: ${sessionId.slice(0, 8)}...):`, err.message);
  }
  return null;
}

// =========== AI 客服聊天 API ===========
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, sessionId, restaurantId, customerName, history } = req.body;

    if (!message || !sessionId || !restaurantId) {
      return res.status(400).json({ success: false, message: '缺少必要參數' });
    }

    console.log(`💬 AI 客服收到訊息 (Session: ${sessionId.slice(0, 8)}...)`);

    // 1. 確保會話存在
    const { data: existingSession } = await supabaseAdmin
      .from('ai_sessions')
      .select('id')
      .eq('id', sessionId)
      .single();

    if (!existingSession) {
      await supabaseAdmin.from('ai_sessions').insert([{
        id: sessionId,
        restaurant_id: restaurantId,
        customer_name: customerName || '匿名客人',
        status: 'active',
        message_count: 0,
      }]);
    }

    // 2. 儲存用戶訊息
    await supabaseAdmin.from('chat_messages').insert([{
      session_id: sessionId,
      restaurant_id: restaurantId,
      role: 'user',
      content: message,
    }]);

    // 3. 查詢知識庫
    const knowledgeEntries = await queryKnowledgeBase(restaurantId, message);
    let knowledgeContext = '';
    if (knowledgeEntries.length > 0) {
      knowledgeContext = '\n\n以下是店舖知識庫中相關的資訊（請優先參考）：\n' +
        knowledgeEntries.map((e, i) =>
          `[知識 ${i + 1}]\n問題：${e.question}\n回答：${e.answer}`
        ).join('\n\n');
    }

    // 4. 獲取 AI 配置
    const aiConfigs = await getAIConfigs(restaurantId);
    const systemPrompt = aiConfigs.system_prompt || {};
    const businessHours = aiConfigs.business_hours || {};

    // 4.5 查詢實際產品列表（防止 AI 虛構產品）
    const { data: products } = await supabaseAdmin
      .from('products')
      .select('name')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'available')
      .order('name');

    const productList = products
      ? products.map(p => `• ${p.name}`).join('\n')
      : '（暫無產品資料）';

    // 5. 構建系統提示詞
    const systemMessage = {
      role: 'system',
      content: `你是「小幫手」，一間餐廳的AI客服助手。

${systemPrompt.prompt || ''}

語氣與風格：
${systemPrompt.tone_description || '親切友善'}

角色設定：
${systemPrompt.personality || '熱情好客的餐廳助手'}

語言：
${systemPrompt.language || '粵語口語（廣東話）'}

回覆風格：
${systemPrompt.response_style || '簡潔直接，回覆不超過100字'}

營業時間：
${businessHours.monday ? `營業時間：11:00-22:00（每天）` : ''}

【店舖產品清單】（只可推薦以下產品，嚴禁虛構不存在的產品）：
${productList}

重要規則：
1. 一定要用粵語口語回覆
2. 回覆要親切友善，適量使用表情符號
3. 如果客人問營業時間，根據營業時間資料回覆
4. 如果客人問菜單或產品，必須只推薦上面【產品清單】中有的產品，**嚴禁虛構不存在的產品名稱**
5. 如果不確定答案，誠實地說唔清楚，並建議客人打電話或到店查詢
6. 不要提供虛假或不實的資訊
7. 如果客人投訴或有不滿，先道歉並表示會轉告負責人
8. 客人問「有無XX產品」時，先查對產品清單，有就答有，無就答無
${knowledgeContext}`,
    };

    // 6. 構建對話歷史
    const historyMessages = (history || []).slice(-6).map(h => ({
      role: h.role,
      content: h.content,
    }));

    const aiMessages = [
      systemMessage,
      ...historyMessages,
      { role: 'user', content: message },
    ];

    // 7. 調用 NVIDIA API
    let reply;
    try {
      reply = await generateAIResponse(aiMessages);

      // 如果回覆為空，提供默認回覆
      if (!reply) {
        reply = '唔好意思，我暫時答唔到你呢個問題。你可以打俾我哋或者直接過嚟店舖查詢，我哋樂意幫你！😊';
      }
    } catch (aiError) {
      console.error('❌ AI 生成失敗:', aiError.message);
      reply = '唔好意思，系統暫時繁忙，請稍後再試。或者你可以直接打俾我哋查詢！📞';
    }

    // 8. 儲存 AI 回覆
    await supabaseAdmin.from('chat_messages').insert([{
      session_id: sessionId,
      restaurant_id: restaurantId,
      role: 'assistant',
      content: reply,
    }]);

    // 9. 更新會話訊息計數
    const { data: sessionData } = await supabaseAdmin
      .from('ai_sessions')
      .select('message_count')
      .eq('id', sessionId)
      .single();

    await supabaseAdmin
      .from('ai_sessions')
      .update({
        message_count: (sessionData?.message_count || 0) + 2,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    // 10. 每兩輪對話生成一次總結（節省 API 調用）
    const newCount = (sessionData?.message_count || 0) + 2;
    if (newCount >= 2 && newCount % 2 === 0) {
      generateSessionSummary(sessionId).catch(() => {});
    }

    console.log(`✅ AI 回覆完成 (Session: ${sessionId.slice(0, 8)}...)`);

    res.json({
      success: true,
      reply,
      sessionId,
    });
  } catch (error) {
    console.error('❌ AI 聊天錯誤:', error.message);
    res.status(500).json({ success: false, message: error.message || 'AI 聊天失敗' });
  }
});

// =========== 會話管理 API ===========
app.get('/api/ai/sessions', async (req, res) => {
  try {
    const { restaurant_id } = req.query;
    if (!restaurant_id) {
      return res.status(400).json({ success: false, message: '缺少 restaurant_id' });
    }

    const { data, error } = await supabaseAdmin
      .from('ai_sessions')
      .select('*')
      .eq('restaurant_id', restaurant_id)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    // 對沒有總結的活躍會話進行非同步回填
    if (data) {
      data.forEach(session => {
        if (!session.summary && session.message_count >= 2) {
          generateSessionSummary(session.id).catch(() => {});
        }
      });
    }

    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('❌ 獲取會話列表失敗:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/ai/sessions/:sessionId/messages', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('❌ 獲取會話訊息失敗:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/ai/sessions/:sessionId/close', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { error } = await supabaseAdmin
      .from('ai_sessions')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('❌ 關閉會話失敗:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 刪除會話（連同所有訊息）
app.delete('/api/ai/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // 先刪除所有相關訊息
    await supabaseAdmin.from('chat_messages').delete().eq('session_id', sessionId);

    // 再刪除會話
    const { error } = await supabaseAdmin.from('ai_sessions').delete().eq('id', sessionId);

    if (error) throw error;

    console.log(`🗑️ 已刪除會話 (Session: ${sessionId.slice(0, 8)}...)`);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ 刪除會話失敗:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========== 知識庫管理 API ===========
app.get('/api/ai/knowledge', async (req, res) => {
  try {
    const { restaurant_id } = req.query;
    if (!restaurant_id) {
      return res.status(400).json({ success: false, message: '缺少 restaurant_id' });
    }

    const { data, error } = await supabaseAdmin
      .from('ai_knowledge_base')
      .select('*')
      .eq('restaurant_id', restaurant_id)
      .order('category')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('❌ 獲取知識庫失敗:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/ai/knowledge', async (req, res) => {
  try {
    const { restaurant_id, category, question, answer } = req.body;
    if (!restaurant_id || !question || !answer) {
      return res.status(400).json({ success: false, message: '缺少必要參數' });
    }

    const { data, error } = await supabaseAdmin
      .from('ai_knowledge_base')
      .insert([{ restaurant_id, category: category || 'general', question, answer }])
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ 新增知識條目失敗:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/ai/knowledge', async (req, res) => {
  try {
    const { id, category, question, answer, is_active } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, message: '缺少知識條目 ID' });
    }

    const updateData = {};
    if (category !== undefined) updateData.category = category;
    if (question !== undefined) updateData.question = question;
    if (answer !== undefined) updateData.answer = answer;
    if (is_active !== undefined) updateData.is_active = is_active;
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('ai_knowledge_base')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ 更新知識條目失敗:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/ai/knowledge/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('ai_knowledge_base')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('❌ 刪除知識條目失敗:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========== AI 配置管理 API ===========
app.get('/api/ai/config', async (req, res) => {
  try {
    const { restaurant_id } = req.query;
    if (!restaurant_id) {
      return res.status(400).json({ success: false, message: '缺少 restaurant_id' });
    }

    const { data, error } = await supabaseAdmin
      .from('ai_config')
      .select('*')
      .eq('restaurant_id', restaurant_id);

    if (error) throw error;

    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('❌ 獲取 AI 配置失敗:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/ai/config', async (req, res) => {
  try {
    const { restaurant_id, config_key, config_value } = req.body;
    if (!restaurant_id || !config_key || !config_value) {
      return res.status(400).json({ success: false, message: '缺少必要參數' });
    }

    // Upsert: 如果存在則更新，否則新增
    const { data: existing } = await supabaseAdmin
      .from('ai_config')
      .select('id')
      .eq('restaurant_id', restaurant_id)
      .eq('config_key', config_key)
      .single();

    let result;
    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('ai_config')
        .update({ config_value, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from('ai_config')
        .insert([{ restaurant_id, config_key, config_value }])
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('❌ 更新 AI 配置失敗:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========== 對話建議 API（儲存建議並同步到知識庫） ===========
app.post('/api/ai/suggestions', async (req, res) => {
  try {
    const { restaurant_id, session_id, message_id, role, original_question, original_answer, suggested_answer, notes } = req.body;

    if (!restaurant_id || !session_id || !message_id || !suggested_answer) {
      return res.status(400).json({ success: false, message: '缺少必要參數' });
    }

    // 1. 儲存建議到 ai_suggestions 表
    const { data: suggestion, error: sugError } = await supabaseAdmin
      .from('ai_suggestions')
      .insert([{
        restaurant_id,
        session_id,
        message_id,
        role,
        original_question,
        original_answer,
        suggested_answer,
        notes: notes || null,
        status: 'approved',
      }])
      .select()
      .single();

    if (sugError) throw sugError;

    // 2. 自動同步到知識庫（作為問答對）
    // 如果是對 AI 回覆的修正，用原問題 + 修正後的答案
    // 如果是對客人提問的建議，用客人問題 + 建議答案
    const question = role === 'assistant'
      ? (original_question || '客人問題')
      : (original_question || '常見問題');

    const { error: kbError } = await supabaseAdmin
      .from('ai_knowledge_base')
      .insert([{
        restaurant_id,
        category: 'suggestion',
        question: question,
        answer: suggested_answer,
        is_active: true,
      }]);

    if (kbError) {
      console.warn('⚠️ 建議已儲存但同步知識庫失敗:', kbError.message);
    }

    console.log(`✅ 建議已儲存並同步到知識庫 (Message: ${message_id.slice(0, 8)}...)`);

    res.json({ success: true, data: suggestion });
  } catch (error) {
    console.error('❌ 儲存建議失敗:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 獲取某個會話的所有建議
app.get('/api/ai/suggestions', async (req, res) => {
  try {
    const { session_id, restaurant_id } = req.query;

    let query = supabaseAdmin.from('ai_suggestions').select('*');

    if (session_id) query = query.eq('session_id', session_id);
    if (restaurant_id) query = query.eq('restaurant_id', restaurant_id);

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('❌ 獲取建議列表失敗:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

const PORT = process.env.PORT || 3001;

// =========== 商家註冊 API（SaaS 多租戶） ===========
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, restaurantName, ownerName, phone } = req.body;

    // 驗證輸入
    if (!email || !password || !restaurantName) {
      return res.status(400).json({
        success: false,
        message: '請提供 email、密碼和餐廳名稱'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: '密碼長度至少 6 個字元'
      });
    }

    // 1. 建立 Supabase Auth 用戶
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return res.status(400).json({
        success: false,
        message: '建立帳號失敗: ' + authError.message
      });
    }

    const userId = authData.user.id;

    // 2. 建立餐廳記錄
    const { data: restaurant, error: restaurantError } = await supabaseAdmin
      .from('restaurants')
      .insert([{
        name: restaurantName,
      }])
      .select()
      .single();

    if (restaurantError) {
      // 回滾：刪除已建立的 Auth 用戶
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      return res.status(500).json({
        success: false,
        message: '建立餐廳失敗: ' + restaurantError.message
      });
    }

    const restaurantId = restaurant.id;

    // 3. 建立 owner 員工記錄
    const { data: employee, error: employeeError } = await supabaseAdmin
      .from('employees')
      .insert([{
        restaurant_id: restaurantId,
        name: ownerName || restaurantName + ' 管理員',
        phone: phone || null,
        email: email,
        role: 'owner',
        hire_date: new Date().toISOString().split('T')[0],
        is_active: true,
      }])
      .select()
      .single();

    if (employeeError) {
      // 回滾
      await supabaseAdmin.from('restaurants').delete().eq('id', restaurantId).catch(() => {});
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      return res.status(500).json({
        success: false,
        message: '建立員工記錄失敗: ' + employeeError.message
      });
    }

    // 4. 建立預設分類
    const defaultCategories = [
      '鎖匙扣', '格仔餅', '雞蛋仔', '小食', '豆花芋圓',
      '仙草芋圓', '新式糖水', '香蕉餅/蛋餅', '蒸點', '椰香西米露', '飲品'
    ];

    const { error: categoriesError } = await supabaseAdmin
      .from('categories')
      .insert(defaultCategories.map((name, idx) => ({
        restaurant_id: restaurantId,
        name,
        sort_order: idx + 1,
      })));

    if (categoriesError) {
      console.warn('建立預設分類失敗（非致命）:', categoriesError.message);
    }

    console.log(`✅ 新商家註冊成功: ${restaurantName} (${restaurantId})`);

    res.json({
      success: true,
      message: '註冊成功！請使用您的 email 和密碼登入系統。',
      data: {
        restaurant_id: restaurantId,
        restaurant_name: restaurantName,
      }
    });
  } catch (error) {
    console.error('❌ 註冊失敗:', error);
    res.status(500).json({
      success: false,
      message: '伺服器錯誤，請稍後再試'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
