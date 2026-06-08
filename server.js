import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import multer from 'multer';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync, mkdirSync, accessSync, constants } from 'fs';
import { spawnSync, spawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 全局錯誤處理：避免崩潰導致空響應
process.on('uncaughtException', (err) => {
  console.error('💥 未捕獲異常:', err.message, err.stack?.slice(0, 300));
});
process.on('unhandledRejection', (reason) => {
  console.error('💥 未處理的 Promise 拒絕:', reason);
});

// Setup multer for file uploads if needed
const upload = multer({ storage: multer.memoryStorage() });

// Supabase admin client (service role) for user management
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// =========== 健康檢查 + 保活端點 ===========
/**
 * Render 免費版 15 分鐘無訪問會休眠。
 * 此端點用來被外部定時任務（如 cron-job.org）每 5 分鐘呼叫一次，保持服務甦醒。
 */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'alive',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Root route for health check - 只在非 production 時回傳 JSON
// production 模式下由 static file middleware 提供前端頁面
app.get('/api/root-health', (req, res) => {
  res.json({ success: true, message: 'ULTRA POS server is running' });
});

// =========== 後端權限驗證中間件 ===========

/**
 * 從請求頭提取並驗證 Supabase JWT
 * 前端需在請求頭帶上 Authorization: Bearer <supabase_access_token>
 * 或從 user 物件取得 restaurant_id + role 進行權限檢查
 */
async function verifyAuth(req) {
  // 嘗試從 Authorization header 獲取 token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.slice(7);
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;
    
    // 查找該用戶的員工記錄（含角色）
    const phone = user.email?.replace('@ultrapos.com', '');
    if (!phone) return null;
    
    const { data: employee } = await supabaseAdmin
      .from('employees')
      .select('id, name, role, restaurant_id, is_active')
      .eq('phone', phone)
      .eq('is_active', true)
      .single();
    
    return employee;
  } catch {
    return null;
  }
}

/**
 * 權限檢查中間件工廠
 * usage: app.get('/api/xxx', requirePermission('expense.view'), handler)
 */
function requirePermission(requiredPermission) {
  return async (req, res, next) => {
    try {
      const employee = await verifyAuth(req);
      if (!employee) {
        return res.status(401).json({ success: false, message: '未授權，請先登入' });
      }

      // 從 restaurant_roles 取得該角色的自定義權限
      const { data: roleConfig } = await supabaseAdmin
        .from('restaurant_roles')
        .select('permissions')
        .eq('restaurant_id', employee.restaurant_id)
        .eq('role_name', employee.role)
        .single();

      let permissions = [];
      if (roleConfig?.permissions && roleConfig.permissions.length > 0) {
        permissions = roleConfig.permissions;
      } else {
        // 無自定義配置時回退到默認權限
        const DEFAULT_PERMISSIONS = {
          owner: ['dashboard.view', 'pos.create_order', 'pos.cancel_order', 'pos.refund',
            'product.view', 'product.manage', 'inventory.view', 'inventory.manage',
            'order.view', 'order.create', 'order.approve',
            'employee.view', 'employee.manage',
            'attendance.view', 'attendance.manage',
            'schedule.view', 'schedule.manage',
            'payroll.view', 'payroll.manage',
            'expense.view', 'expense.manage',
            'report.view', 'report.export',
            'ai.marketing', 'ai.customer_service', 'ai.knowledge_base',
            'review.view', 'review.manage',
            'setting.view', 'setting.manage'],
          manager: ['dashboard.view', 'pos.create_order', 'pos.cancel_order', 'pos.refund',
            'product.view', 'product.manage', 'inventory.view', 'inventory.manage',
            'order.view', 'order.create', 'order.approve',
            'employee.view',
            'attendance.view', 'attendance.manage',
            'schedule.view', 'schedule.manage',
            'payroll.view', 'payroll.manage',
            'expense.view', 'expense.manage',
            'report.view', 'report.export',
            'ai.marketing', 'ai.customer_service', 'ai.knowledge_base',
            'review.view', 'review.manage',
            'setting.view'],
          staff: ['dashboard.view', 'pos.create_order',
            'product.view', 'inventory.view',
            'order.view', 'order.create',
            'attendance.view', 'attendance.manage',
            'schedule.view', 'expense.view'],
        };
        permissions = DEFAULT_PERMISSIONS[employee.role] || [];
      }

      if (!permissions.includes(requiredPermission)) {
        return res.status(403).json({ success: false, message: '權限不足' });
      }

      // 將用戶信息附加到 req 供後續 handler 使用
      req.user = employee;
      next();
    } catch (err) {
      return res.status(500).json({ success: false, message: '驗證失敗: ' + err.message });
    }
  };
}

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
app.post('/api/admin/batch-create-employees', requirePermission('employee.manage'), async (req, res) => {
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

/**
 * 從 Supabase settings 或 .env 讀取 WhatsApp 號碼
 */
async function getWhatsAppSettings(restaurantId) {
  let sender = process.env.WHATSAPP_SENDER || '';
  let admin = process.env.ADMIN_WHATSAPP || '';

  if (restaurantId) {
    try {
      const { data } = await supabaseAdmin
        .from('settings')
        .select('setting_key, setting_value')
        .eq('restaurant_id', restaurantId)
        .in('setting_key', ['whatsapp_sender', 'whatsapp_admin']);

      if (data) {
        const senderRow = data.find(s => s.setting_key === 'whatsapp_sender');
        const adminRow = data.find(s => s.setting_key === 'whatsapp_admin');
        if (senderRow?.setting_value) sender = senderRow.setting_value;
        if (adminRow?.setting_value) admin = adminRow.setting_value;
      }
    } catch (err) {
      console.warn('⚠️ 無法從 Supabase 讀取 WhatsApp 設定，使用 .env 備用:', err.message);
    }
  }

  return { sender, admin };
}

/** 發送 WhatsApp 到單一號碼 */
function sendWhatsApp(wacliPath, target, message, sender) {
  const args = ['send', 'text', '--to', target, '--message', message];
  if (sender) args.splice(1, 0, '--from', sender);
  return spawnSync(wacliPath, args, { encoding: 'utf-8', timeout: 20000 });
}

/** 解析多行號碼（每行一個） */
function parseNumbers(str) {
  return (str || '').split('\n').map(s => s.trim()).filter(Boolean);
}

app.post('/api/whatsapp/notify-order', async (req, res) => {
  try {
    const { employeeName, items, restaurant_id } = req.body;
    const { sender, admin } = await getWhatsAppSettings(restaurant_id);
    const wacliPath = process.env.WACLI_PATH || 'wacli';
    const numbers = parseNumbers(admin);

    if (numbers.length === 0) {
      return res.json({ success: false, message: '未設定管理員 WhatsApp 號碼，請在設定頁面配置' });
    }

    const itemList = items.map(i => `• ${i.name} × ${i.quantity}`).join('\n');
    const message = `🔔 新訂貨通知\n\n員工：${employeeName}\n\n項目：\n${itemList}\n\n請登入系統處理。`;
    const truncatedMsg = message.length > 1000 ? message.slice(0, 997) + '...' : message;

    let successCount = 0;
    for (const num of numbers) {
      const result = sendWhatsApp(wacliPath, num, truncatedMsg, sender);
      if (result.status === 0) successCount++;
      else console.error(`❌ 發送給 ${num} 失敗:`, result.stderr || result.stdout);
    }

    console.log(`✅ WhatsApp 通知已發送給 ${successCount}/${numbers.length} 人`);
    res.json({ success: successCount > 0, message: `已發送給 ${successCount}/${numbers.length} 個管理員` });
  } catch (error) {
    console.error('❌ WhatsApp 發送失敗:', error.message);
    res.json({ success: false, message: error.message });
  }
});

// 測試 WhatsApp 發送
app.post('/api/whatsapp/test-send', async (req, res) => {
  try {
    const { restaurant_id, sender, admin } = req.body;
    const wacliPath = process.env.WACLI_PATH || 'wacli';
    const numbers = parseNumbers(admin);

    if (numbers.length === 0) {
      return res.json({ success: false, message: '請先填寫接收號碼' });
    }

    const message = '🧪 ULTRA POS WhatsApp 通知測試\n\n如果你收到這條訊息，表示 WhatsApp 通知設定正確！';

    let successCount = 0;
    for (const num of numbers) {
      const result = sendWhatsApp(wacliPath, num, message, sender);
      if (result.status === 0) successCount++;
      else console.error(`❌ 測試發送給 ${num} 失敗:`, result.stderr || result.stdout);
    }

    console.log(`✅ WhatsApp 測試發送成功 (${successCount}/${numbers.length})`);
    res.json({ success: successCount > 0, message: `測試訊息已發送給 ${successCount}/${numbers.length} 個號碼` });
  } catch (error) {
    console.error('❌ WhatsApp 測試發送失敗:', error.message);
    res.json({ success: false, message: error.message });
  }
});

// WhatsApp 認證（掃碼登入）
const wacliPath = process.env.WACLI_PATH || 'wacli';
let activeWacliAuth = null; // 保持 wacli 程序存活

/** 檢查 wacli 是否可執行（使用 fs 而非 shell，避免 Alpine 相容問題） */
function checkWacliExists() {
  const commonPaths = ['/usr/local/bin/wacli', '/usr/bin/wacli', '/app/wacli', wacliPath];
  for (const p of commonPaths) {
    try {
      if (existsSync(p)) {
        accessSync(p, constants.X_OK);
        return p;
      }
    } catch {}
  }
  return wacliPath;
}

app.post('/api/whatsapp/auth-qr', async (req, res) => {
  // 設定請求超時，防止掛死
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.json({ success: false, message: '請求超時（12 秒），wacli 無響應' });
    }
  }, 12000);

  // 確保超時後清理
  const cleanup = () => clearTimeout(timeout);

  try {
    // 先檢查 wacli 是否存在
    const wacliActualPath = checkWacliExists();
    console.log('[wacli] 使用路徑:', wacliActualPath);

    // 檢查是否已認證（如果 wacli 無法執行，這裡會報錯但被 catch）
    try {
      const statusResult = spawnSync(wacliActualPath, ['auth', 'status', '--json'], { encoding: 'utf-8', timeout: 10000 });
      if (statusResult.status === 0 && statusResult.stdout) {
        try {
          const status = JSON.parse(statusResult.stdout);
          if (status.success && status.data?.authenticated) {
            return res.json({ success: true, authenticated: true, message: '已認證，無需重新掃碼' });
          }
        } catch {}
      }
    } catch (e) {
      console.warn('[wacli] 認證狀態檢查失敗:', e.message);
    }

    // 建立可寫入的 session 目錄
    const sessionDir = resolve('/tmp', 'wacli-session');
    try { mkdirSync(sessionDir, { recursive: true }); } catch {}

    let authProcess;
    try {
      authProcess = spawn(wacliActualPath, ['auth', '--events', '--json', '--timeout', '120s', '--session-dir', sessionDir], {
        stdio: ['pipe', 'pipe', 'pipe'], // 同時捕獲 stdout 和 stderr
        detached: true,
      });
      authProcess.unref();
      activeWacliAuth = authProcess;
    } catch (spawnErr) {
      console.error('[wacli] 啟動失敗:', spawnErr.message);
      const hint = spawnErr.message.includes('ENOENT')
        ? 'wacli 二進位檔不存在，請確認 Docker 建置時是否成功下載 wacli'
        : 'wacli 啟動失敗: ' + spawnErr.message;
      return res.json({ success: false, message: `無法啟動 wacli (${hint})`, debug: spawnErr.message });
    }

    let qrCode = '';
    let stderrBuf = '';

    // wacli 透過 stderr 輸出 --events JSON，事件名為 "qr"（不是 "qr_code"）
    authProcess.stderr?.on('data', (data) => {
      const chunk = data.toString();
      stderrBuf += chunk;
      const lines = chunk.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const evt = JSON.parse(line);
          if (evt.event === 'qr' && evt.data) {
            qrCode = evt.data; // data 是字串，如 "1@abc123..."
          }
        } catch {}
      }
    });

    authProcess.on('exit', (code, signal) => {
      console.log(`[wacli] 認證程序退出, code=${code}, signal=${signal}`);
      if (code !== 0 && code !== null) {
        stderrBuf += `\n[程序退出 code=${code}]`;
      }
      activeWacliAuth = null;
    });

    // 等待 QR Code（最多 8 秒）
    let elapsed = 0;
    while (elapsed < 8000 && !qrCode) {
      await new Promise(r => setTimeout(r, 200));
      elapsed += 200;
    }

    if (!qrCode) {
      try { authProcess.kill('SIGKILL'); } catch {}
      try { authProcess.kill(); } catch {}
      setTimeout(() => { activeWacliAuth = null; }, 100);
      const hint = stderrBuf.includes('chromium') || stderrBuf.includes('browser')
        ? 'wacli 需搭配瀏覽器環境，可能需要在 Render 安裝額外套件'
        : stderrBuf.includes('connect') || stderrBuf.includes('ECONNREFUSED')
        ? '伺服器無法連接到 WhatsApp，請檢查 Render 網絡設定是否允許對外連接'
        : (stderrBuf || 'wacli 未輸出 QR Code，可能是版本問題或網絡限制');
      const msg = `無法取得 QR Code (${hint})`;
      console.error('[wacli]', msg, 'stderr:', stderrBuf.slice(0, 300));
      return res.json({ success: false, message: msg, debug: stderrBuf.slice(0, 500) });
    }

    const qrUrl = `https://web.whatsapp.com/?code=${qrCode}`;
    const qrPng = await QRCode.toDataURL(qrUrl, { width: 300, margin: 2 });
    res.json({ success: true, authenticated: false, qrImage: qrPng });
  } catch (error) {
    console.error('❌ WhatsApp 認證失敗:', error.message);
    res.json({ success: false, message: 'WhatsApp 認證失敗: ' + error.message });
  }
});

app.get('/api/whatsapp/auth-status', async (req, res) => {
  try {
    const actualPath = checkWacliExists();
    const diag = {
      wacliPath: actualPath,
      exists: false,
      execOk: false,
      version: ''
    };
    try {
      diag.exists = existsSync(actualPath);
      if (diag.exists) {
        accessSync(actualPath, constants.X_OK);
        diag.execOk = true;
      }
    } catch {}
    try {
      const verResult = spawnSync(actualPath, ['--version'], { encoding: 'utf-8', timeout: 5000 });
      diag.version = verResult.status === 0 ? (verResult.stdout || '').trim() : 'error: ' + (verResult.stderr || '').slice(0, 100);
    } catch (e) { diag.version = 'exception: ' + e.message; }
    try {
      const statusResult = spawnSync(actualPath, ['auth', 'status', '--json'], { encoding: 'utf-8', timeout: 10000 });
      if (statusResult.status === 0 && statusResult.stdout) {
        try {
          const status = JSON.parse(statusResult.stdout);
          if (status.success && status.data?.authenticated) {
            return res.json({ success: true, authenticated: true, message: '已認證，無需重新掃碼', diag });
          }
        } catch {}
      }
    } catch (e) { diag.authError = e.message; }
    res.json({ success: false, authenticated: false, message: 'wacli 未就緒', diag });
  } catch (error) {
    res.json({ success: false, authenticated: false, message: error.message });
  }
});

// =========== AI 客服系統 API ===========

// NVIDIA NIM 配置
const NVIDIA_API_KEY = process.env.VITE_NVIDIA_NIM_API_KEY || '';
const NVIDIA_MODEL = process.env.VITE_NVIDIA_NIM_MODEL || 'meta/llama-3.2-11b-vision-instruct';
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

app.put('/api/ai/knowledge', requirePermission('ai.knowledge_base'), async (req, res) => {
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

app.delete('/api/ai/knowledge/:id', requirePermission('ai.knowledge_base'), async (req, res) => {
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

app.put('/api/ai/config', requirePermission('ai.marketing'), async (req, res) => {
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

// =========== 生產環境：提供前端靜態文件 ===========
const distPath = resolve(__dirname, 'dist');
if (process.env.NODE_ENV === 'production' && existsSync(distPath)) {
  console.log('📁 提供靜態文件從:', distPath);
  app.use(express.static(distPath));

  // SPA fallback：所有非 API 請求都返回 index.html（包括根路徑）
  // Express 5.x + path-to-regexp v8：用正則表達式匹配所有路徑
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(resolve(distPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 8080;

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

// =========== 每日營業額結算 API ===========

/**
 * daily_settlements 表已通過 Supabase Migration 創建
 * 見: supabase/migrations/013_create_daily_settlements.sql
 */

// 查詢結算紀錄（單日）
app.get('/api/settlements', requirePermission('expense.view'), async (req, res) => {
  try {
    const { date, restaurant_id } = req.query;
    if (!date || !restaurant_id) {
      return res.status(400).json({ success: false, message: '缺少 date 或 restaurant_id' });
    }
    const { data, error } = await supabaseAdmin
      .from('daily_settlements')
      .select('*')
      .eq('restaurant_id', restaurant_id)
      .eq('settlement_date', date)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    res.json({ success: true, data: data || null });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 查詢結算紀錄（按月彙總）
app.get('/api/settlements/monthly', requirePermission('expense.view'), async (req, res) => {
  try {
    const { month, restaurant_id } = req.query;
    if (!month || !restaurant_id) {
      return res.status(400).json({ success: false, message: '缺少 month 或 restaurant_id' });
    }
    // month 格式: YYYY-MM
    const startDate = `${month}-01`;
    const endDate = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0)
      .toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('daily_settlements')
      .select('*')
      .eq('restaurant_id', restaurant_id)
      .gte('settlement_date', startDate)
      .lte('settlement_date', endDate)
      .order('settlement_date', { ascending: true });
    if (error) throw error;

    // 彙總所有數值欄位
    const sumFields = [
      'cash', 'unionpay', 'stored_value', 'octopus', 'foodpanda',
      'alipay_hk', 'wechat_hk', 'meituan_keeta', 'openrice',
      'booking_deposit', 'visit_card', 'shopping_card', 'prepaid_card',
      'payme', 'total_amount', 'actual_revenue', 'total_transactions',
    ];
    const monthly = { days: (data || []).length };
    for (const field of sumFields) {
      monthly[field] = (data || []).reduce((sum, row) => sum + (parseFloat(row[field]) || 0), 0);
    }
    monthly.settlement_month = month;

    res.json({ success: true, data: monthly, records: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 查詢結算紀錄（日期範圍）
app.get('/api/settlements/range', requirePermission('expense.view'), async (req, res) => {
  try {
    const { start, end, restaurant_id } = req.query;
    if (!start || !end || !restaurant_id) {
      return res.status(400).json({ success: false, message: '缺少 start/end/restaurant_id' });
    }
    const { data, error } = await supabaseAdmin
      .from('daily_settlements')
      .select('*')
      .eq('restaurant_id', restaurant_id)
      .gte('settlement_date', start)
      .lte('settlement_date', end)
      .order('settlement_date', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 提交/更新結算紀錄
app.post('/api/settlements', requirePermission('expense.manage'), async (req, res) => {
  try {
    const { restaurant_id, settlement_date, store_name, source, ...payments } = req.body;
    if (!restaurant_id || !settlement_date) {
      return res.status(400).json({ success: false, message: '缺少 restaurant_id 或 settlement_date' });
    }

    const settlementData = {
      restaurant_id,
      settlement_date,
      store_name: store_name || null,
      source: source || 'manual',
      synced_at: new Date().toISOString(),
      ...payments,
    };

    const { data, error } = await supabaseAdmin
      .from('daily_settlements')
      .upsert(settlementData, { onConflict: 'restaurant_id,settlement_date' })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 觸發 POSPAL 爬蟲同步
app.post('/api/settlements/sync', requirePermission('expense.manage'), async (req, res) => {
  try {
    const { restaurant_id, date } = req.body;
    if (!restaurant_id || !date) {
      return res.status(400).json({ success: false, message: '缺少 restaurant_id 或 date' });
    }

    // 執行爬蟲
    const { spawnSync } = await import('child_process');
    const crawlerPath = resolve(__dirname, 'scripts/pospal-crawler');
    
    const result = spawnSync('npx', ['tsx', 'crawler.ts', `--date=${date}`, '--url=business-summary'], {
      cwd: crawlerPath,
      stdio: 'pipe',
      shell: true,
      timeout: 120000,
      encoding: 'utf-8',
      env: {
        ...process.env,
        PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium-browser',
        CHROMIUM_PATH: '/usr/bin/chromium-browser',
        CRAWLER_HEADLESS: 'true',
      },
    });

    const output = (result.stdout || '') + (result.stderr || '');

    if (result.status !== 0) {
      // 解析 output 提取有用錯誤訊息
      const errMsg = output.includes('登入失敗') ? output.split('登入失敗')[1]?.split('\n')[0]?.trim() || output :
                     output.includes('密碼錯誤') ? 'POSPAL 密碼錯誤，請檢查 .env 中的 POSPAL_PASSWORD' :
                     output.includes('未授權') ? 'POSPAL 未授權，請在 POSPAL 後台確認帳號密碼是否正確或需重新登入' :
                     '爬蟲執行失敗: ' + output.slice(0, 500);
      return res.json({ success: false, message: errMsg, output });
    }

    // 從 logs/ 讀取爬蟲結果 JSON
    const logsDir = resolve(crawlerPath, 'logs');
    const jsonPath = resolve(logsDir, `${date}.json`);
    
    let crawlData;
    try {
      const jsonContent = readFileSync(jsonPath, 'utf-8');
      crawlData = JSON.parse(jsonContent);
    } catch {
      return res.json({ success: false, message: '找不到爬蟲結果檔案，請確認 POSPAL 帳號密碼是否正確', output });
    }

    if (!crawlData.success) {
      return res.json({ success: false, message: '爬取失敗: ' + (crawlData.error || 'POSPAL 頁面可能已變更，需更新爬蟲規則'), output });
    }

    // 構建資料庫記錄
    const paymentFields = {};
    const codeFieldMap = {
      cash: 'cash', octopus: 'octopus', foodpanda: 'foodpanda',
      payme: 'payme',
      alipay_hk: 'alipay_hk', wechat_hk: 'wechat_hk',
      meituan_keeta: 'meituan_keeta', openrice: 'openrice',
      booking_deposit: 'booking_deposit', visit_card: 'visit_card',
      shopping_card: 'shopping_card', prepaid_card: 'prepaid_card',
      unionpay: 'unionpay', stored_value: 'stored_value',
    };

    if (crawlData.payments && Array.isArray(crawlData.payments)) {
      for (const p of crawlData.payments) {
        const fieldName = codeFieldMap[p.code];
        if (fieldName) {
          paymentFields[fieldName] = p.amount;
        }
      }
    }

    // 從 payments 中查找 total_sales
    let totalSales = 0;
    if (crawlData.payments && Array.isArray(crawlData.payments)) {
      const totalPayment = crawlData.payments.find(p => p.code === 'total_sales');
      if (totalPayment) totalSales = totalPayment.amount;
    }

    const settlementRecord = {
      restaurant_id,
      settlement_date: date,
      store_name: crawlData.storeName || '',
      source: 'pospal_crawler',
      ...paymentFields,
      total_amount: crawlData.totalAmount || totalSales || 0,
      actual_revenue: crawlData.actualRevenue || totalSales || 0,
      total_transactions: crawlData.totalTransactions || 0,
      raw_json: JSON.stringify(crawlData),
      synced_at: new Date().toISOString(),
    };

    const { data: dbResult, error: dbError } = await supabaseAdmin
      .from('daily_settlements')
      .upsert(settlementRecord, { onConflict: 'restaurant_id,settlement_date' })
      .select()
      .single();

    if (dbError) {
      return res.json({ success: false, message: '資料庫寫入失敗: ' + dbError.message, output });
    }

    res.json({
      success: true,
      message: '同步完成，數據已寫入資料庫',
      data: dbResult,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========== AI 收據掃描 API ===========
app.use('/api/ocr', express.json({ limit: '10mb' }));

/**
 * 內部 OCR 調用函數，帶自動重試機制
 * @param {string} dataUrl - base64 圖片
 * @param {boolean} isHandwritten - 是否手寫模式
 * @param {number} maxRetries - 最大重試次數
 * @returns {Promise<{success: boolean, text?: string, error?: string}>}
 */
async function callNVIDIAOCR(dataUrl, isHandwritten, maxRetries = 3) {
  const prompt = isHandwritten
    ? `你是餐廳記賬本精確辨識助手。分析這張手寫記賬本圖片，**仔細查看每一個欄位**，提取每一筆支出記錄。

重要：每筆支出的日期可能不同（一頁記賬本包含多天的記錄），必須為每個項目提取對應的日期。

要求：
1. **每行嚴格格式**：日期: YYYY-MM-DD, 項目: XXX, 支出: $金額
2. **提取所有項目**：仔細查看圖片中每一個條目，不要遺漏任何一筆。同一天的項目必須逐一分開列出。圖片中通常有10-30筆支出。
3. 日期欄位是「日/月」格式（如 8/4 = 4月8日，9/4 = 4月9日，10/4 = 4月10日，11/4 = 4月11日）。請轉換為 YYYY-MM-DD 格式：8/4→2026-04-08，9/4→2026-04-09，10/4→2026-04-10，11/4→2026-04-11
4. **同一天的不同品項要分開列為多行**，共用同一個日期
5. 如只有日期和金額，無描述項目，則項目留空：日期: 2026-04-08, 項目: , 支出: $26
6. 所有支出金額以 $ 前綴
7. 不要輸出收入或結餘欄位的內容，只輸出支出記錄
8. 每筆一行，最後輸出：總支出: $總金額
9. **只回覆以下格式，不要其他文字**

範例輸出（同一張紙上多天的多筆記錄）：
日期: 2026-04-08, 項目: 快遞費, 支出: $26
日期: 2026-04-08, 項目: 菜，洋葱, 支出: $48
日期: 2026-04-08, 項目: 紅豆, 支出: $38
日期: 2026-04-09, 項目: 燒賣, 支出: $26
日期: 2026-04-09, 項目: 芋圓, 支出: $50
日期: 2026-04-10, 項目: 餐巾紙, 支出: $100
日期: 2026-04-10, 項目: 糯米粉, 支出: $83
日期: 2026-04-10, 項目: 糖, 支出: $170
日期: 2026-04-10, 項目: 油, 支出: $165
總支出: $706`
    : `你是收據結構化提取助手。分析收據圖片，嚴格按以下格式輸出，每行一個欄位：

【必輸欄位】
1. 日期: YYYY-MM-DD（必須單獨一行）
2. 供應商: XXX（必須單獨一行，只保留商號核心名稱，去掉「有限公司」「食品」「國際」「貿易」「企業」「股份」等後綴）
3. 品項: 品名1 $價格1, 品名2 $價格2, ...（所有品項用逗號分隔放在同一行，只保留核心品名，移除規格/包裝/重量）
4. 總價: $總金額（必須單獨一行，只輸出數字）

【可選欄位】
5. 發票: 編號（如有，單獨一行）

重要規則：
- 每個欄位必須獨立一行，以「欄位名:」開頭
- 品項欄位必須包含所有貨品，用逗號分隔
- 只輸出以上欄位，不要任何其他文字或 markdown 格式
- 不要輸出「**」「-」等符號

範例輸出：
日期: 2026-05-18
供應商: 炳記行
發票: INV-20260518
品項: 蛋 $270, 淡忌廉 $630, 椰漿 $280
總價: $1180`;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    // 每次嘗試都用 120 秒（手寫模式需要更多時間解析多筆）
    const timeoutMs = 120000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      console.log(`[OCR] 第 ${attempt}/${maxRetries} 次調用 NVIDIA API...`);

      const response = await fetch(NVIDIA_API_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        },
        body: JSON.stringify({
          model: NVIDIA_MODEL,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: dataUrl } },
                { type: 'text', text: prompt }
              ]
            }
          ],
          max_tokens: isHandwritten ? 768 : 512,
          temperature: 0.1,
        }),
      });

      clearTimeout(timeout);

      if (!response.ok) {
        let errorText = '';
        try { errorText = await response.text(); } catch {}

        // 504 不立即拋出，允許重試
        if (response.status === 504) {
          lastError = new Error(`NVIDIA API 504 Gateway Timeout (attempt ${attempt})`);
          console.warn(`[OCR] ⚠️ 504 超時，第 ${attempt} 次失敗`);
          if (attempt < maxRetries) {
            // 重試前等待 3 秒
            await new Promise(r => setTimeout(r, 3000));
            continue;
          }
          throw lastError;
        }

        throw new Error(`OCR API 錯誤: ${response.status} - ${errorText.slice(0, 200)}`);
      }

      // 安全解析響應
      let data;
      try {
        const raw = await response.text();
        if (!raw || raw.trim() === '') {
          throw new Error('NVIDIA API 返回空響應');
        }
        data = JSON.parse(raw);
      } catch (parseErr) {
        if (parseErr.message?.includes('API')) {
          lastError = parseErr;
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          throw parseErr;
        }
        throw new Error('NVIDIA API 響應解析失敗');
      }

      let text = data.choices?.[0]?.message?.reasoning_content ||
                 data.choices?.[0]?.message?.content || '';

      // 後端校正日期格式
      if (isHandwritten) {
        text = text.replace(/(\d{4})-(\d{2})-(\d{2})/g, (match, y, m, d) => {
          const mm = parseInt(m), dd = parseInt(d);
          if (mm > 12 && dd <= 12) return `${y}-${d}-${m}`;
          return match;
        });
      }

      console.log(`[OCR] ✅ 第 ${attempt} 次成功`);
      return { success: true, text };
    } catch (err) {
      clearTimeout(timeout);

      if (err.name === 'AbortError') {
        lastError = new Error(`請求超時 (${timeoutMs / 1000}s)，服務繁忙`);
        console.warn(`[OCR] ⚠️ 超時 (第 ${attempt} 次)`);
      } else {
        lastError = err;
      }

      if (attempt < maxRetries) {
        // 指數退避：2s, 4s, 8s...
        const backoffMs = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
        console.log(`[OCR] ⏳ ${backoffMs}ms 後重試...`);
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }
  }

  return { success: false, error: lastError?.message || '所有重試均失敗' };
}

app.post('/api/ocr/receipt', async (req, res) => {
  try {
    if (!NVIDIA_API_KEY) {
      return res.status(500).json({ success: false, message: 'NVIDIA API Key 未配置，请在 .env 中设置 VITE_NVIDIA_NIM_API_KEY' });
    }

    const { image, mode } = req.body;
    if (!image) {
      return res.status(400).json({ success: false, message: '請提供圖片' });
    }

    const isHandwritten = mode === 'handwritten';

    console.log(`[OCR] 開始處理圖片 (mode=${mode}, base64長度=${image.length})`);

    const result = await callNVIDIAOCR(image, isHandwritten, 3);

    if (!result.success) {
      return res.status(504).json({ success: false, message: result.error });
    }

    res.json({ success: true, data: { text: result.text } });
  } catch (error) {
    console.error('[OCR] 辨識失敗:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========== 打卡系統 API（動態 QR Code + IP 驗證）============

/**
 * 公司手機端：生成動態 QR Code Token
 * 每10秒調用一次，返回 token 和 QR Code Base64 圖片
 */
app.post('/api/attendance/device/generate-qrcode', async (req, res) => {
  try {
    const { restaurant_id, device_id } = req.body;
    if (!restaurant_id) {
      return res.status(400).json({ success: false, message: '缺少 restaurant_id' });
    }

    // 清理過期 token
    await supabaseAdmin
      .from('attendance_qrcode_tokens')
      .delete()
      .lt('expires_at', new Date().toISOString());

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10000).toISOString(); // 10秒過期

    // 獲取公司手機的 IP
    const deviceIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || '0.0.0.0';

    const { error } = await supabaseAdmin
      .from('attendance_qrcode_tokens')
      .insert([{
        restaurant_id,
        token,
        device_id: device_id || 'kiosk',
        device_ip: deviceIp,
        expires_at: expiresAt,
      }]);

    if (error) throw error;

    // 生成 QR Code 圖片（Base64 PNG）
    // QR Code 內容：系統網址 + token，員工掃碼後自動發送打卡請求
    const qrContent = `${process.env.APP_URL || 'https://ultra-pos.onrender.com'}/attendance?qrcode=${token}`;
    const qrDataUrl = await QRCode.toDataURL(qrContent, {
      width: 300,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });

    res.json({
      success: true,
      data: {
        token,
        qr_data_url: qrDataUrl,
        qr_content: qrContent,
        expires_at: expiresAt,
        device_ip: deviceIp,
      }
    });
  } catch (error) {
    console.error('[QRCode] 生成失敗:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 員工端：打卡（上班/下班）
 * 驗證 QR Code 有效性 + IP 是否與公司手機相同
 */
app.post('/api/attendance/clock', async (req, res) => {
  try {
    const { token, employee_id, clock_type, restaurant_id } = req.body;
    if (!token || !employee_id || !clock_type || !restaurant_id) {
      return res.status(400).json({ success: false, message: '缺少必要參數（token、employee_id、clock_type、restaurant_id）' });
    }

    // 驗證 token 是否有效
    const { data: tokens, error: tokenError } = await supabaseAdmin
      .from('attendance_qrcode_tokens')
      .select('*')
      .eq('token', token)
      .eq('restaurant_id', restaurant_id)
      .gt('expires_at', new Date().toISOString())
      .eq('used', false)
      .limit(1);

    if (tokenError) throw tokenError;
    if (!tokens || tokens.length === 0) {
      return res.status(403).json({ success: false, message: 'QR Code 已過期或無效，請重新掃描' });
    }

    const qrRecord = tokens[0];

    // 驗證 IP 是否與公司手機相同
    const employeeIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || '0.0.0.0';

    const deviceIp = qrRecord.device_ip;
    if (employeeIp !== deviceIp) {
      return res.status(403).json({
        success: false,
        message: '打卡失敗：您不在店鋪網絡中。請確保已連上店鋪 WiFi',
        debug: { employeeIp, deviceIp }
      });
    }

    // 標記 token 為已使用
    await supabaseAdmin
      .from('attendance_qrcode_tokens')
      .update({ used: true })
      .eq('id', qrRecord.id);

    const today = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toLocaleTimeString('zh-HK', { hour12: false, hour: '2-digit', minute: '2-digit' });

    // 取得員工資料
    const { data: employee } = await supabaseAdmin
      .from('employees')
      .select('name')
      .eq('id', employee_id)
      .single();

    if (clock_type === 'in') {
      // 檢查今日是否已打卡
      const { data: existing } = await supabaseAdmin
        .from('attendance')
        .select('id')
        .eq('employee_id', employee_id)
        .eq('date', today)
        .not('clock_in', 'is', null)
        .limit(1);

      if (existing && existing.length > 0) {
        return res.status(400).json({ success: false, message: '今日已上班打卡，請點擊下班打卡' });
      }

      const { data: record, error: insertError } = await supabaseAdmin
        .from('attendance')
        .insert([{
          employee_id,
          restaurant_id,
          date: today,
          clock_in: timeStr,
          clock_in_ip: employeeIp,
          verification_method: 'qrcode+ip',
        }])
        .select()
        .single();

      if (insertError) throw insertError;

      // 記錄審計日誌
      await supabaseAdmin
        .from('attendance_audit_logs')
        .insert([{
          attendance_id: record.id,
          employee_id,
          action: 'clock_in',
          ip_address: employeeIp,
          device_info: { method: 'qrcode+ip', token_id: qrRecord.id, device_ip: deviceIp },
          verification_result: { method: 'qrcode+ip', passed: true }
        }]).catch(() => {});

      res.json({ success: true, message: `${employee?.name || ''} 上班打卡成功！`, data: { clock_in: timeStr, method: 'qrcode+ip' } });
    } else if (clock_type === 'out') {
      // 查找今日上班記錄
      const { data: todayRecord } = await supabaseAdmin
        .from('attendance')
        .select('*')
        .eq('employee_id', employee_id)
        .eq('date', today)
        .not('clock_in', 'is', null)
        .is('clock_out', null)
        .order('clock_in', { ascending: false })
        .limit(1)
        .single();

      if (!todayRecord) {
        return res.status(400).json({ success: false, message: '未找到今日上班記錄，請先上班打卡' });
      }

      // 計算工時
      const [inH, inM] = (todayRecord.clock_in || '00:00').split(':').map(Number);
      const [outH, outM] = timeStr.split(':').map(Number);
      const workHours = Math.max(0, Math.round(((outH * 60 + outM) - (inH * 60 + inM)) / 60 * 100) / 100);

      const { error: updateError } = await supabaseAdmin
        .from('attendance')
        .update({
          clock_out: timeStr,
          work_hours: workHours,
          clock_out_ip: employeeIp,
        })
        .eq('id', todayRecord.id);

      if (updateError) throw updateError;

      // 記錄審計日誌
      await supabaseAdmin
        .from('attendance_audit_logs')
        .insert([{
          attendance_id: todayRecord.id,
          employee_id,
          action: 'clock_out',
          ip_address: employeeIp,
          device_info: { method: 'qrcode+ip', token_id: qrRecord.id, device_ip: deviceIp },
          verification_result: { method: 'qrcode+ip', passed: true }
        }]).catch(() => {});

      res.json({ success: true, message: `${employee?.name || ''} 下班打卡成功！工作 ${workHours} 小時`, data: { clock_out: timeStr, work_hours: workHours } });
    } else {
      res.status(400).json({ success: false, message: 'clock_type 必須為 in 或 out' });
    }
  } catch (error) {
    console.error('[Attendance] 打卡失敗:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 取得今日打卡記錄
 */
app.get('/api/attendance/today', async (req, res) => {
  try {
    const { restaurant_id } = req.query;
    if (!restaurant_id) return res.status(400).json({ success: false, message: '缺少 restaurant_id' });

    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabaseAdmin
      .from('attendance')
      .select('*, employee:employees(name, role)')
      .eq('date', today)
      .order('clock_in', { ascending: true });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========== 純 IP 打卡系統（無 QR Code）============

/**
 * 門店裝置上報公網 IP
 * 放在店裡的裝置（舊手機/平板）每幾分鐘調用一次
 */
app.post('/api/attendance/store/update-ip', async (req, res) => {
  try {
    const { restaurant_id, device_id, manual_ip } = req.body;
    if (!restaurant_id) {
      return res.status(400).json({ success: false, message: '缺少 restaurant_id' });
    }

    // manual_ip 來自手動填寫，否則從請求中自動獲取
    const publicIp = manual_ip
      ? manual_ip.trim()
      : (req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.socket.remoteAddress
        || '0.0.0.0');

    // 紀錄資料來源
    const source = manual_ip ? 'manual' : 'auto';

    const { error } = await supabaseAdmin
      .from('store_wifi_ip')
      .upsert([{
        restaurant_id,
        public_ip: publicIp,
        device_id: device_id || (manual_ip ? 'manual' : 'kiosk'),
        last_update: new Date().toISOString(),
      }], {
        onConflict: 'restaurant_id',
        ignoreDuplicates: false,
      });

    if (error) throw error;

    res.json({ success: true, data: { public_ip: publicIp, source, last_update: new Date().toISOString() } });
  } catch (error) {
    console.error('[StoreIP] 更新 IP 失敗:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 獲取門店當前存儲的 IP
 */
app.get('/api/attendance/store/ip', async (req, res) => {
  try {
    const { restaurant_id } = req.query;
    if (!restaurant_id) {
      return res.status(400).json({ success: false, message: '缺少 restaurant_id' });
    }

    const { data, error } = await supabaseAdmin
      .from('store_wifi_ip')
      .select('public_ip, last_update, device_id')
      .eq('restaurant_id', restaurant_id)
      .order('last_update', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, message: '門店 IP 尚未設定，請先讓打卡機上線' });
    }

    res.json({ success: true, data: data[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * 員工端：純 IP 打卡（無 QR Code）
 * 員工連上門店 WiFi 後，直接在手機打開頁面點擊按鈕打卡
 * 後端比對員工 IP 是否與門店 IP 相同
 */
app.post('/api/attendance/wifi-clock', async (req, res) => {
  try {
    const { employee_id, clock_type, restaurant_id } = req.body;
    if (!employee_id || !clock_type || !restaurant_id) {
      return res.status(400).json({ success: false, message: '缺少必要參數（employee_id、clock_type、restaurant_id）' });
    }

    // 獲取員工的 IP
    const employeeIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || '0.0.0.0';

    // 查詢門店最新存儲的 IP
    const { data: storeIps, error: ipError } = await supabaseAdmin
      .from('store_wifi_ip')
      .select('public_ip')
      .eq('restaurant_id', restaurant_id)
      .order('last_update', { ascending: false })
      .limit(1);

    if (ipError) throw ipError;

    if (!storeIps || storeIps.length === 0) {
      return res.status(403).json({
        success: false,
        message: '門店打卡機尚未上線，請稍後再試或使用 QR Code 打卡',
      });
    }

    const storeIp = storeIps[0].public_ip;

    // IP 比對
    if (employeeIp !== storeIp) {
      return res.status(403).json({
        success: false,
        message: '打卡失敗：您不在門店 WiFi 網絡中。請確保已連上門店 WiFi 後重試',
        debug: { employeeIp, storeIp }
      });
    }

    // 取得員工資料
    const { data: employee } = await supabaseAdmin
      .from('employees')
      .select('name')
      .eq('id', employee_id)
      .single();

    const today = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toLocaleTimeString('zh-HK', { hour12: false, hour: '2-digit', minute: '2-digit' });

    if (clock_type === 'in') {
      // 檢查是否已上班打卡
      const { data: existing } = await supabaseAdmin
        .from('attendance')
        .select('id')
        .eq('employee_id', employee_id)
        .eq('date', today)
        .not('clock_in', 'is', null)
        .limit(1);

      if (existing && existing.length > 0) {
        return res.status(400).json({ success: false, message: '今日已上班打卡，請點擊下班打卡' });
      }

      const { data: record, error: insertError } = await supabaseAdmin
        .from('attendance')
        .insert([{
          employee_id,
          restaurant_id,
          date: today,
          clock_in: timeStr,
          clock_in_ip: employeeIp,
          verification_method: 'ip',
        }])
        .select()
        .single();

      if (insertError) throw insertError;

      // 審計日誌
      await supabaseAdmin
        .from('attendance_audit_logs')
        .insert([{
          attendance_id: record.id,
          employee_id,
          action: 'clock_in',
          ip_address: employeeIp,
          device_info: { method: 'ip', store_ip: storeIp },
          verification_result: { method: 'ip', passed: true }
        }]).catch(() => {});

      res.json({ success: true, message: `${employee?.name || ''} 上班打卡成功！`, data: { clock_in: timeStr, method: 'ip' } });
    } else if (clock_type === 'out') {
      // 查找今日上班記錄
      const { data: todayRecord } = await supabaseAdmin
        .from('attendance')
        .select('*')
        .eq('employee_id', employee_id)
        .eq('date', today)
        .not('clock_in', 'is', null)
        .is('clock_out', null)
        .order('clock_in', { ascending: false })
        .limit(1)
        .single();

      if (!todayRecord) {
        return res.status(400).json({ success: false, message: '未找到今日上班記錄，請先上班打卡' });
      }

      // 計算工時
      const [inH, inM] = (todayRecord.clock_in || '00:00').split(':').map(Number);
      const [outH, outM] = timeStr.split(':').map(Number);
      const workHours = Math.max(0, Math.round(((outH * 60 + outM) - (inH * 60 + inM)) / 60 * 100) / 100);

      const { error: updateError } = await supabaseAdmin
        .from('attendance')
        .update({
          clock_out: timeStr,
          work_hours: workHours,
          clock_out_ip: employeeIp,
        })
        .eq('id', todayRecord.id);

      if (updateError) throw updateError;

      // 審計日誌
      await supabaseAdmin
        .from('attendance_audit_logs')
        .insert([{
          attendance_id: todayRecord.id,
          employee_id,
          action: 'clock_out',
          ip_address: employeeIp,
          device_info: { method: 'ip', store_ip: storeIp },
          verification_result: { method: 'ip', passed: true }
        }]).catch(() => {});

      res.json({ success: true, message: `${employee?.name || ''} 下班打卡成功！工作 ${workHours} 小時`, data: { clock_out: timeStr, work_hours: workHours } });
    } else {
      res.status(400).json({ success: false, message: 'clock_type 必須為 in 或 out' });
    }
  } catch (error) {
    console.error('[WiFiClock] 打卡失敗:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========== POSPAL 每日排程爬蟲 ===========
const POSPAL_RESTAURANT_ID = process.env.RESTAURANT_ID || '00000000-0000-0000-0000-000000000001';
const CRAWLER_DIR = resolve(__dirname, 'scripts/pospal-crawler');

async function runPospalCrawler(dateStr) {
  console.log(`[Crawler] 🔄 開始爬取 ${dateStr}...`);
  try {
    const result = spawnSync('npx', ['tsx', 'crawler.ts', `--date=${dateStr}`, '--url=business-summary'], {
      cwd: CRAWLER_DIR,
      stdio: 'pipe',
      shell: true,
      timeout: 120000,
      encoding: 'utf-8',
      env: {
        ...process.env,
        PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium-browser',
        CHROMIUM_PATH: '/usr/bin/chromium-browser',
        CRAWLER_HEADLESS: 'true',
      },
    });

    const jsonPath = resolve(CRAWLER_DIR, 'logs', `${dateStr}.json`);
    if (existsSync(jsonPath)) {
      const jsonData = JSON.parse(readFileSync(jsonPath, 'utf-8'));
      const { data, error } = await supabaseAdmin
        .from('daily_settlements')
        .upsert({
          restaurant_id: POSPAL_RESTAURANT_ID,
          settlement_date: dateStr,
          source: 'pospal_crawler',
          total_amount: jsonData.totalAmount || 0,
          actual_revenue: jsonData.actualRevenue || 0,
          total_transactions: jsonData.totalTransactions || 0,
          raw_json: JSON.stringify(jsonData),
          synced_at: new Date().toISOString(),
          ...(jsonData.payments || []).reduce((acc, p) => ({ ...acc, [p.code]: p.amount }), {}),
        }, { onConflict: 'restaurant_id,settlement_date' });
      if (error) throw error;
      console.log(`[Crawler] ✅ ${dateStr} 爬取完成並寫入資料庫`);
    }
  } catch (err) {
    console.error(`[Crawler] ❌ ${dateStr} 爬取失敗:`, err.message);
  }
}

// 啟動後延遲 30 秒再補爬最近 3 天（避免啟動時 Chromium 導致 OOM）
setTimeout(() => {
  (async () => {
    for (let i = 1; i <= 3; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      try {
        await runPospalCrawler(dateStr);
      } catch (err) {
        console.error(`[Crawler] ⏭️ 補爬 ${dateStr} 跳過:`, err.message);
      }
    }
  })();
}, 30000);

// 每日 23:50 自動爬取
try {
  const { default: cron } = await import('node-cron');
  cron.schedule('50 23 * * *', () => {
    const today = new Date().toISOString().split('T')[0];
    runPospalCrawler(today);
  });
  console.log('   🤖 POSPAL 每日爬蟲排程已啟動 (23:50)');
} catch (err) {
  console.warn('   ⚠️ node-cron 未安裝，POSPAL 自動爬蟲已跳過');
}

// Express 全局錯誤中介軟體（放在所有路由之後）
app.use((err, req, res, next) => {
  console.error('❌ Express 錯誤:', err.message, err.stack?.slice(0, 200));
  if (res.headersSent) return;
  res.status(500).json({ success: false, message: '伺服器內部錯誤: ' + err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ ULTRA POS 服務器啟動成功，端口: ${PORT}`);
  console.log(`   🔗 健康檢查: http://localhost:${PORT}/api/health`);
  console.log(`   ⏰ 保活機制: 請使用 cron-job.org 每 5 分鐘 ping /api/health`);
});

