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
app.all('/api/health', (req, res, next) => {
  res.json({
    success: true,
    status: 'alive',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.all('/api/root-health', (req, res, next) => {
  res.json({ success: true, message: 'ULTRA POS server is running' });
});

app.all('/api/ping', (req, res, next) => {
  res.send('pong');
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
 * usage: app.all('/api/xxx', requirePermission('expense.view'), handler)
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

// =========== Email 通知設定（使用 SendGrid HTTP API）===========
/**
 * 為什麼用 SendGrid 而不是 SMTP？
 * Render 免費版自 2025-09-26 起永久阻擋 SMTP 端口（25/465/587）
 * 唯一可行方案：用 HTTP API 發送
 * SendGrid：https://sendgrid.com（免費 100 封/天，無需域名）
 */

/** 從 Supabase settings 或 .env 讀取 Email 設定 */
async function getEmailSettings(restaurantId) {
  let apiKey = process.env.SENDGRID_API_KEY || process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY || '';
  let from = process.env.EMAIL_FROM || 'handmadetarohk813@gmail.com';
  let user = process.env.EMAIL_USER || '';
  let pass = process.env.EMAIL_PASS || '';
  let adminEmail = process.env.ADMIN_EMAIL || '';
  let adminEmail1 = '';
  let adminEmail2 = '';

  if (restaurantId) {
    try {
      const { data } = await supabaseAdmin
        .from('settings')
        .select('setting_key, setting_value')
        .eq('restaurant_id', restaurantId)
        .in('setting_key', ['sendgrid_api_key', 'resend_api_key', 'email_api_key', 'email_user', 'email_pass', 'admin_email', 'admin_email_1', 'admin_email_2', 'email_from']);

      if (data) {
        const getVal = (key) => data.find(s => s.setting_key === key)?.setting_value;
        if (getVal('sendgrid_api_key')) apiKey = getVal('sendgrid_api_key');
        if (getVal('resend_api_key') && !apiKey) apiKey = getVal('resend_api_key');
        if (getVal('email_api_key') && !apiKey) apiKey = getVal('email_api_key');
        if (getVal('email_user')) user = getVal('email_user');
        if (getVal('email_pass')) pass = getVal('email_pass');
        if (getVal('admin_email')) adminEmail = getVal('admin_email');
        if (getVal('admin_email_1')) adminEmail1 = getVal('admin_email_1');
        if (getVal('admin_email_2')) adminEmail2 = getVal('admin_email_2');
        if (getVal('email_from')) from = getVal('email_from');
      }
    } catch (err) {
      console.warn('⚠️ 無法從 Supabase 讀取 Email 設定，使用 .env 備用:', err.message);
    }
  }

  return { apiKey, from, user, pass, adminEmail, adminEmail1, adminEmail2 };
}

/** 通過 SendGrid 或 Resend HTTP API 發送郵件 */
async function sendEmailViaSendGrid(apiKey, from, to, subject, text) {
  const isResend = apiKey.startsWith('re_');
  const toList = Array.isArray(to) ? to : [to];

  if (isResend) {
    // Resend API: https://resend.com/docs/api-reference/emails/send-email
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from.includes('<') ? from : `ULTRA POS <${from}>`,
        to: toList,
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const data = await res.text();
      throw new Error(`Resend API 錯誤 [${res.status}]: ${data}`);
    }
    const data = await res.json();
    return { id: data.id || 'resend-' + Date.now() };
  }

  // SendGrid API: https://docs.sendgrid.com/api-reference
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: toList.map(email => ({ email })), subject }],
      from: { email: from },
      content: [{ type: 'text/plain', value: text }],
    }),
  });
  if (!res.ok) {
    const data = await res.text();
    throw new Error(`SendGrid API 錯誤 [${res.status}]: ${data}`);
  }
  return { id: 'sendgrid-' + Date.now() };
}

/** 發送 Email 通知到一個或多個管理員 */
/**
 * 通知類型對應 notify_rule_{type}_recipient 設定：
 * - 'order'     → 訂貨通知
 * - 'expense'   → 支出/結算通知
 * - 'cash_diff' → 現金差異通知
 * 接收人可設：admin1 / admin2 / all
 *
 * ⚠️ 為了相容 Resend 免費版（每個呼叫只能送給一個收件人），
 *    此函數會對每個管理員信箱分別呼叫一次 API。
 */
async function sendEmailNotification(adminEmails, subject, body, restaurantId, type = '') {
  const config = await getEmailSettings(restaurantId);
  if (!config.apiKey) {
    throw new Error('請先設定 API Key（Resend 或 SendGrid）');
  }

  // 取得收件人陣列（去重複）
  const getRecipients = async () => {
    // 如有指定收件人則直接使用
    if (adminEmails) {
      return [...new Set(adminEmails.split(/[,;]/).map(s => s.trim()).filter(Boolean))];
    }

    // 從 DB 讀取通知規則
    let rule = 'all';
    if (restaurantId && type) {
      try {
        const { data } = await supabaseAdmin
          .from('settings')
          .select('setting_value')
          .eq('restaurant_id', restaurantId)
          .eq('setting_key', `notify_rule_${type}_recipient`)
          .single();
        if (data) rule = data.setting_value;
      } catch { /* 使用預設值 */ }
    }

    // 根據規則決定收件信箱
    let targetEmail = '';
    if (rule === 'admin1' && config.adminEmail1) {
      targetEmail = config.adminEmail1;
    } else if (rule === 'admin2' && config.adminEmail2) {
      targetEmail = config.adminEmail2;
    } else {
      targetEmail = [config.adminEmail1, config.adminEmail2].filter(Boolean).join(',');
    }

    let emails = targetEmail.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    // 如果 adminEmail1/adminEmail2 都空的，改用 adminEmail（ADMIN_EMAIL .env 備用）
    if (emails.length === 0 && config.adminEmail) {
      emails = config.adminEmail.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    }
    return [...new Set(emails)];
  };

  const recipients = await getRecipients();
  if (recipients.length === 0) throw new Error('請先設定管理員信箱 (ADMIN_EMAIL 或 admin_email_1 / admin_email_2)');

  // 對每個收件人個別發送（Resend 免費版限制一次只能送一個收件人）
  const results = [];
  let lastError = null;
  for (const email of recipients) {
    try {
      const result = await sendEmailViaSendGrid(config.apiKey, config.from, [email], subject, body);
      results.push({ email, success: true, id: result.id });
      console.log(`✅ Email 發送成功 → ${email}`);
    } catch (err) {
      lastError = err;
      results.push({ email, success: false, error: err.message });
      console.error(`❌ Email 發送失敗 → ${email}: ${err.message}`);
    }
  }

  // 如果全部失敗則拋錯，部分成功則回傳結果
  const successCount = results.filter(r => r.success).length;
  if (successCount === 0 && lastError) throw lastError;
  return { results, successCount, totalCount: recipients.length };
}

app.post('/api/whatsapp/notify-order', async (req, res) => {
  try {
    const { employeeName, items, restaurant_id } = req.body;
    const { sender, admin } = await getWhatsAppSettings(restaurant_id);
    const wacliPath = process.env.WACLI_PATH || 'wacli';
    const numbers = parseNumbers(admin);

    const itemList = items.map(i => `• ${i.name} × ${i.quantity}`).join('\n');
    const subject = `🔔 新訂貨通知 - ${employeeName}`;
    const body = `新訂貨通知\n\n員工：${employeeName}\n\n項目：\n${itemList}\n\n請登入系統處理。`;
    const truncatedMsg = body.length > 1000 ? body.slice(0, 997) + '...' : body;

    const results = { email: null, whatsapp: null };

    // 優先使用 Email 通知
    try {
      const config = await getEmailSettings(restaurant_id);
      if (config.apiKey) {
        await sendEmailNotification('', subject, body, restaurant_id, 'order');
        results.email = 'success';
        console.log(`✅ Email 訂貨通知已發送`);
      }
    } catch (emailErr) {
      console.warn('⚠️ Email 發送失敗，嘗試 WhatsApp:', emailErr.message);
      results.email = emailErr.message;
    }

    // 備用：WhatsApp 通知（如果 Email 失敗或未配置）
    if (numbers.length > 0 && results.email !== 'success') {
      let successCount = 0;
      for (const num of numbers) {
        const result = sendWhatsApp(wacliPath, num, truncatedMsg, sender);
        if (result.status === 0) successCount++;
        else console.error(`❌ WhatsApp 發送給 ${num} 失敗:`, result.stderr || result.stdout);
      }
      results.whatsapp = `${successCount}/${numbers.length}`;
      console.log(`✅ WhatsApp 通知已發送給 ${successCount}/${numbers.length} 人`);
    }

    const hasSuccess = results.email === 'success' || (results.whatsapp && !results.whatsapp.startsWith('0/'));
    res.json({ success: hasSuccess, results, message: '通知處理完成' });
  } catch (error) {
    console.error('❌ 通知發送失敗:', error.message);
    res.json({ success: false, message: error.message });
  }
});

// 更新系統設置（支援單個或批量）
app.post('/api/settings/update', async (req, res) => {
  try {
    const { restaurant_id, settings } = req.body;
    if (!restaurant_id || !settings) {
      return res.status(400).json({ success: false, message: '缺少 restaurant_id 或 settings' });
    }
    const entries = Object.entries(settings);
    const results = [];
    for (const [key, value] of entries) {
      const { error } = await supabaseAdmin
        .from('settings')
        .upsert(
          { restaurant_id, setting_key: key, setting_value: String(value), updated_at: new Date().toISOString() },
          { onConflict: 'restaurant_id, setting_key' }
        );
      results.push({ key, success: !error, error: error?.message });
    }
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 診斷 Email 連線
app.all('/api/email/diagnose', async (req, res) => {
  const config = await getEmailSettings(req.query.restaurant_id);
  const diag = {
    config: {
      apiKeySet: !!config.apiKey,
      apiKeyPrefix: config.apiKey ? config.apiKey.substring(0, 8) + '****' : '(empty)',
      from: config.from,
      adminEmail: config.adminEmail,
    },
    env: {
      RESEND_API_KEY: process.env.RESEND_API_KEY ? 'set' : 'missing',
      EMAIL_USER: process.env.EMAIL_USER ? 'set' : 'missing',
      ADMIN_EMAIL: process.env.ADMIN_EMAIL ? 'set' : 'missing',
    },
    note: 'Render 免費版阻擋 SMTP 端口（25/465/587），必須使用 HTTP API（如 Resend）',
    tests: {},
  };
  if (!config.apiKey) {
    diag.tests.skipped = '缺少 SENDGRID_API_KEY，跳過 SendGrid API 測試';
    return res.json(diag);
  }
  try {
    const r = await fetch('https://api.sendgrid.com/v3/scopes', {
      headers: { 'Authorization': `Bearer ${config.apiKey}` }
    });
    diag.tests.sendgrid_api = r.ok ? '✅ SendGrid API 認證成功' : `❌ HTTP ${r.status}`;
  } catch (e) {
    diag.tests.sendgrid_api = '❌ ' + e.message;
  }
  res.json(diag);
});

// 測試 Email 發送（Resend HTTP API）
app.post('/api/email/test-send', async (req, res) => {
  const diag = { steps: [] };
  try {
    const { restaurant_id, admin_email } = req.body;
    const config = await getEmailSettings(restaurant_id);
    const to = admin_email || config.adminEmail;
    diag.steps.push(`apiKey: ${config.apiKey ? 'set' : 'missing'}, from: ${config.from}, to: ${to}`);

    if (!config.apiKey) {
      return res.json({
        success: false,
        message: '請先設定 SENDGRID_API_KEY（去 https://sendgrid.com 免費註冊，1 分鐘拿到）',
        diag
      });
    }
    if (!to) {
      return res.json({ success: false, message: '請先設定管理員信箱', diag });
    }

    const emails = (to || '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
    if (emails.length === 0) {
      return res.json({ success: false, message: '請填寫有效的管理員信箱', diag });
    }
    diag.steps.push(`調用 SendGrid HTTP API, 收件人: ${emails.join(', ')}...`);
    const result = await sendEmailViaSendGrid(
      config.apiKey,
      config.from,
      emails,
      '🧪 ULTRA POS Email 通知測試',
      `測試時間: ${new Date().toISOString()}\n\n如果你收到這封郵件，表示 Email 通知設定正確！\n\nULTRA POS 系統`
    );
    diag.steps.push('✅ SendGrid 接受請求 messageId=' + result.id);
    console.log(`✅ Email 測試發送成功 → ${emails.join(', ')} (${result.id})`);
    res.json({ success: true, message: `測試郵件已成功發送到 ${emails.join(', ')}，請檢查信箱`, diag, messageId: result.id });
  } catch (error) {
    diag.steps.push('❌ 失敗: ' + error.message);
    console.error('❌ Email 測試發送失敗:', error.message);
    res.json({ success: false, message: '發送失敗: ' + error.message, diag });
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

/** 全局 wacli 認證狀態（用於跨請求通信）
 *  - auth-phone 事件監聽器設為 true
 *  - auth-status 讀取並驗證
 *  - 解決 doctor 命令無法讀取到運行中進程認證狀態的問題
 */
const wacliGlobalAuth = {
  /** auth-phone 進程是否曾發送過 authenticated 事件 */
  eventFired: false,
  /** 記錄事件觸發時間（ms） */
  eventTimestamp: 0,
  /** 上一個排程 process 的 PID */
  processPid: 0,
};

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

/** 確保 wacli 默認帳戶存在（創建 if missing）- 使用 --no-auth 避免啟動認證流程 */
function ensureWacliAccount() {
  try {
    // 先檢查賬戶列表
    const listResult = spawnSync(wacliPath, ['accounts', 'list'], {
      encoding: 'utf-8', timeout: 10000, stdio: 'pipe',
    });
    if (listResult.status === 0 && listResult.stdout?.includes('default')) {
      return true; // 賬戶已存在
    }
    // 創建賬戶（使用 --no-auth 避免自動啟動認證）
    const result = spawnSync(wacliPath, ['accounts', 'add', 'default', '--no-auth'], {
      encoding: 'utf-8', timeout: 15000, stdio: 'pipe',
    });
    if (result.status === 0) {
      console.log('[wacli] ✅ 默認帳戶已創建');
      // 同時設為默認
      spawnSync(wacliPath, ['accounts', 'use', 'default'], {
        encoding: 'utf-8', timeout: 5000, stdio: 'pipe',
      });
      return true;
    }
    console.warn('[wacli] ⚠️ 帳戶創建失敗:', result.stderr?.slice(0, 200));
    return false;
  } catch (e) {
    console.warn('[wacli] ⚠️ 帳戶初始化跳過:', e.message);
    return false;
  }
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

    // 建立可寫入的 session 目錄（wacli 預設存在 ~/.wacli/accounts/）
    // 注意：wacli 沒有 --session-dir 參數，只能透過 --account 控制 storage 路徑
    let authProcess;
    try {
      authProcess = spawn(wacliActualPath, ['auth', '--events', '--qr-format', 'text', '--account', 'default'], {
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
    let stdoutBuf = '';

    // wacli 透過 stderr 輸出 --events JSON，事件名為 "qr"
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

    // 部分版本會從 stdout 輸出 QR
    authProcess.stdout?.on('data', (data) => {
      const chunk = data.toString();
      stdoutBuf += chunk;
    });

    authProcess.on('exit', (code, signal) => {
      console.log(`[wacli] 認證程序退出, code=${code}, signal=${signal}`);
      if (code !== 0 && code !== null) {
        stderrBuf += `\n[程序退出 code=${code}]`;
      }
      activeWacliAuth = null;
    });

    // 等待 QR Code（最多 10 秒）
    let elapsed = 0;
    while (elapsed < 10000 && !qrCode) {
      await new Promise(r => setTimeout(r, 200));
      elapsed += 200;
    }

    if (!qrCode) {
      try { authProcess.kill('SIGKILL'); } catch {}
      try { authProcess.kill(); } catch {}
      setTimeout(() => { activeWacliAuth = null; }, 100);
      const fullDebug = `stderr: ${stderrBuf.slice(0, 300)} | stdout: ${stdoutBuf.slice(0, 300)}`;
      const hint = stderrBuf.includes('chromium') || stderrBuf.includes('browser')
        ? 'wacli 需搭配瀏覽器環境，可能需要在 Render 安裝額外套件'
        : stderrBuf.includes('connect') || stderrBuf.includes('ECONNREFUSED')
        ? '伺服器無法連接到 WhatsApp，請檢查 Render 網絡設定是否允許對外連接'
        : (stderrBuf || stdoutBuf || 'wacli 未輸出 QR Code，可能是版本問題或網絡限制');
      const msg = `無法取得 QR Code (${hint})`;
      console.error('[wacli]', msg, fullDebug);
      return res.json({ success: false, message: msg, debug: fullDebug });
    }

    const qrUrl = `https://web.whatsapp.com/?code=${qrCode}`;
    const qrPng = await QRCode.toDataURL(qrUrl, { width: 300, margin: 2 });
    res.json({ success: true, authenticated: false, qrImage: qrPng });
  } catch (error) {
    console.error('❌ WhatsApp 認證失敗:', error.message);
    res.json({ success: false, message: 'WhatsApp 認證失敗: ' + error.message });
  }
});

// =========== WhatsApp 手機配對碼認證（無需瀏覽器） ===========

/** 验证手机号格式：必须 + 开头，8-15 位数字 */
function validatePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return false;
  // 去掉空格
  const clean = phone.replace(/\s+/g, '');
  // 必须 + 开头，后面 8-15 位数字
  return /^\+[1-9]\d{7,14}$/.test(clean);
}

/** 清理已存在的 wacli 认证进程（防止进程冲突） */
function killExistingAuthProcess() {
  if (activeWacliAuth) {
    try {
      activeWacliAuth.kill('SIGTERM');
      // 1秒后强杀
      setTimeout(() => {
        try { activeWacliAuth?.kill('SIGKILL'); } catch {}
      }, 1000);
    } catch {}
    activeWacliAuth = null;
  }
}

/**
 * 手机配对码认证端点
 * Body: { phone: "+85298765432" }
 * 工作流程：
 * 1. 验证手机号格式
 * 2. 检查是否已认证
 * 3. 启动 wacli auth --phone 进程
 * 4. 监听 --events 输出，捕获 pair_code 事件
 * 5. 保留进程运行（用户需在手机输入配对码）
 * 6. 监听 authenticated 事件，自动清理
 */
app.post('/api/whatsapp/auth-phone', async (req, res) => {
  const { phone } = req.body;

  // 1. 验证手机号
  if (!validatePhoneNumber(phone)) {
    return res.json({
      success: false,
      message: '手機號格式錯誤，請使用國際格式例如：+85298765432'
    });
  }

  // 1.5 確保 wacli 默認帳戶存在（Render 重新部署時可能丟失）
  ensureWacliAccount();

  // 2. 设置 15 秒超时
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      killExistingAuthProcess();
      res.json({ success: false, message: '請求超時（15 秒），wacli 無響應' });
    }
  }, 15000);

  try {
    const wacliActualPath = checkWacliExists();
    console.log('[wacli-pairing] 使用路徑:', wacliActualPath, '手機:', phone);

    // 3. 先清理可能存在的旧进程
    killExistingAuthProcess();

    // 4. 检查是否已认证 - 使用 doctor 命令（包含 connection_state）
    let alreadyAuthenticated = false;
    try {
      const doctorResult = spawnSync(wacliActualPath, ['doctor', '--json'], {
        encoding: 'utf-8', timeout: 10000,
      });
      if (doctorResult.status === 0 && doctorResult.stdout) {
        try {
          const doctor = JSON.parse(doctorResult.stdout);
          alreadyAuthenticated = !!doctor.data?.authenticated;
          console.log(`[wacli-pairing] doctor 結果: authenticated=${alreadyAuthenticated}, connection_state=${doctor.data?.connection_state}`);
        } catch {}
      }
    } catch (e) {
      console.warn('[wacli-pairing] doctor 檢查失敗:', e.message);
    }

    // fallback: 使用 auth status
    if (!alreadyAuthenticated) {
      try {
        const statusResult = spawnSync(wacliActualPath, ['auth', 'status', '--json'], {
          encoding: 'utf-8', timeout: 10000,
        });
        if (statusResult.status === 0 && statusResult.stdout) {
          try {
            const status = JSON.parse(statusResult.stdout);
            alreadyAuthenticated = !!status.data?.authenticated;
          } catch {}
        }
      } catch (e) {
        console.warn('[wacli-pairing] auth status 檢查失敗:', e.message);
      }
    }

    // 4.5 檢查全局事件狀態（auth-phone 進程曾發出 authenticated 事件）
    if (!alreadyAuthenticated && wacliGlobalAuth.eventFired) {
      const since = Date.now() - wacliGlobalAuth.eventTimestamp;
      if (since < 120000) {  // 2 分鐘內的事件仍有效
        alreadyAuthenticated = true;
        console.log('[wacli-pairing] ✅ 根據全局事件判定已認證');
      }
    }

    // 5. 如果已认证，直接返回，不重置 session
    if (alreadyAuthenticated) {
      clearTimeout(timeout);
      return res.json({
        success: true,
        authenticated: true,
        message: '已認證，無需重新配對'
      });
    }

    // 6. 启动 wacli 配对码进程
    // 关键：必须先删除已存在的账户（accounts add 遇到已存在账户会失败）
    // 然后用 accounts add 创建新账户并触发认证
    // 注意：此操作会丢弃之前的 session，因此仅在未认证时才执行
    // 重置全局狀態（全新配對流程）
    wacliGlobalAuth.eventFired = false;
    wacliGlobalAuth.eventTimestamp = 0;
    wacliGlobalAuth.processPid = 0;
    const removeResult = spawnSync(wacliActualPath, ['accounts', 'remove', 'default'], {
      encoding: 'utf-8', timeout: 5000, stdio: 'pipe',
    });
    console.log('[wacli-pairing] 清理舊賬戶:', removeResult.stdout?.trim() || '無舊賬戶');

    let authProcess;
    try {
      // accounts add default: 创建账户 + 触发认证
      //   --phone: 使用手机配对码
      //   --events: 输出 NDJSON 事件流
      //   --follow: 配对后保持运行
      //   --idle-exit 0: 永不因空闲退出
      authProcess = spawn(
        wacliActualPath,
        ['accounts', 'add', 'default', '--phone', phone, '--events', '--follow', '--idle-exit', '0'],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: false,
        }
      );
      activeWacliAuth = authProcess;
      wacliGlobalAuth.processPid = authProcess.pid;
    } catch (spawnErr) {
      clearTimeout(timeout);
      console.error('[wacli-pairing] 啟動失敗:', spawnErr.message);
      const hint = spawnErr.message.includes('ENOENT')
        ? 'wacli 二進位檔不存在，請確認 Docker 建置時是否成功下載 wacli'
        : 'wacli 啟動失敗: ' + spawnErr.message;
      return res.json({
        success: false,
        message: `無法啟動 wacli (${hint})`,
        debug: spawnErr.message,
      });
    }

    // 6. 监听事件流
    let pairingCode = null;
    let stderrBuf = '';
    let stdoutBuf = '';
    let authenticated = false;
    let errorMessage = '';

    const handleEvent = (line) => {
      try {
        const evt = JSON.parse(line);
        // 实际输出示例来自 wacli v0.8.1 / v0.11.0：
        // {"event":"auth_starting","ts":1780906609217}
        // {"event":"warning","data":{"code":"sync_storage_uncapped",...},"ts":...}
        // {"event":"pair_code","data":{"code":"XXAD-FLEH","phone":"85298765432"},"ts":..."}
        if (evt.event === 'pair_code' && evt.data && evt.data.code) {
          pairingCode = evt.data.code;
          console.log('[wacli-pairing] 收到配對碼:', pairingCode);
        } else if (evt.event === 'authenticated') {
          authenticated = true;
          // 更新全局狀態，讓 auth-status 端點也能讀到
          wacliGlobalAuth.eventFired = true;
          wacliGlobalAuth.eventTimestamp = Date.now();
          console.log('[wacli-pairing] ✅ 認證成功 (全局狀態已更新)');
        } else if (evt.event === 'error' || evt.event === 'auth_error') {
          errorMessage = evt.data?.message || (typeof evt.data === 'string' ? evt.data : '') || '未知錯誤';
          console.error('[wacli-pairing] 認證錯誤:', errorMessage);
        }
      } catch (e) {
        // 非 JSON 行，忽略
      }
    };

    // wacli --events 默认从 stderr 输出 JSON
    authProcess.stderr?.on('data', (data) => {
      const chunk = data.toString();
      stderrBuf += chunk;
      const lines = chunk.split('\n').filter(Boolean);
      for (const line of lines) handleEvent(line);
    });

    // 部分版本可能从 stdout 输出
    authProcess.stdout?.on('data', (data) => {
      const chunk = data.toString();
      stdoutBuf += chunk;
      const lines = chunk.split('\n').filter(Boolean);
      for (const line of lines) handleEvent(line);
    });

    authProcess.on('exit', (code, signal) => {
      console.log(`[wacli-pairing] 進程退出, code=${code}, signal=${signal}`);
      activeWacliAuth = null;
    });

    // 7. 等待配对码（最多 30 秒，给 Render 慢启动留时间）
    let elapsed = 0;
    const pollInterval = 200;
    const maxWait = 30000;
    let lastLogTime = 0;
    while (elapsed < maxWait && !pairingCode && !authenticated && !errorMessage) {
      await new Promise(r => setTimeout(r, pollInterval));
      elapsed += pollInterval;
      // 每 2 秒输出一次进度
      if (elapsed - lastLogTime > 2000) {
        console.log(`[wacli-pairing] 等待配對碼中... (${Math.floor(elapsed/1000)}s)`);
        lastLogTime = elapsed;
      }
    }

    clearTimeout(timeout);

    // 8. 处理结果
    if (authenticated) {
      return res.json({
        success: true,
        authenticated: true,
        message: '認證成功！可設定發送號碼',
      });
    }

    if (errorMessage) {
      killExistingAuthProcess();
      return res.json({
        success: false,
        message: `配對失敗: ${errorMessage}`,
      });
    }

    if (!pairingCode) {
      killExistingAuthProcess();
      const fullDebug = `stderr: ${stderrBuf.slice(0, 300)} | stdout: ${stdoutBuf.slice(0, 300)}`;
      let hint = '';
      if (stderrBuf.includes('chromium') || stderrBuf.includes('browser')) {
        hint = 'wacli 底層仍依賴瀏覽器環境，建議改用 WhatsApp Cloud API';
      } else if (stderrBuf.includes('phone') && stderrBuf.includes('invalid')) {
        hint = '手機號無效，請確認格式正確（含國際區號）';
      } else if (stderrBuf.includes('connect') || stderrBuf.includes('ECONNREFUSED')) {
        hint = '伺服器無法連接到 WhatsApp 服務';
      } else if (stderrBuf.includes('unsupported') || stderrBuf.includes('--phone')) {
        hint = '您的 wacli 版本不支持 --phone 參數，請升級到 v0.6.0+';
      } else {
        hint = stderrBuf || stdoutBuf || 'wacli 未輸出配對碼';
      }
      return res.json({
        success: false,
        message: `無法取得配對碼 (${hint})`,
        debug: fullDebug,
      });
    }

    // 9. 成功：保留进程运行，进程会在用户完成配对后自动退出
    console.log('[wacli-pairing] ✅ 配對碼已返回，進程保持運行等待用戶輸入');
    res.json({
      success: true,
      authenticated: false,
      pairingCode,
      message: '請在 WhatsApp 手機版輸入配對碼',
    });

  } catch (error) {
    clearTimeout();
    killExistingAuthProcess();
    console.error('❌ WhatsApp 配對碼認證失敗:', error.message);
    res.json({ success: false, message: 'WhatsApp 配對碼認證失敗: ' + error.message });
  }
});

/** 取消正在进行的配对码认证（清理进程） */
app.post('/api/whatsapp/auth-cancel', async (req, res) => {
  try {
    killExistingAuthProcess();
    res.json({ success: true, message: '已取消認證' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

app.all('/api/whatsapp/auth-status', async (req, res) => {
  try {
    // 確保帳戶存在
    ensureWacliAccount();
    const actualPath = checkWacliExists();
    const diag = {
      wacliPath: actualPath,
      exists: false,
      execOk: false,
      version: '',
      connectionState: 'unknown',
      accounts: []
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
      // 列出所有賬戶
      const listResult = spawnSync(actualPath, ['accounts', 'list'], { encoding: 'utf-8', timeout: 5000 });
      if (listResult.stdout) {
        const lines = (listResult.stdout || '').split('\n').filter(l => l.includes('default') || l.includes('*'));
        diag.accounts = lines;
      }
    } catch {}

    // 1) 檢查全局事件狀態（auth-phone 進程曾發出 authenticated 事件）
    let authenticated = false;
    let connectionState = 'unknown';
    const processStillRunning = activeWacliAuth !== null
      && typeof activeWacliAuth.pid === 'number'
      && activeWacliAuth.pid === wacliGlobalAuth.processPid
      && wacliGlobalAuth.eventFired;
    if (processStillRunning) {
      authenticated = true;
      connectionState = 'connected';
      diag.connectionState = connectionState;
      diag.source = 'global_event';
    }

    // 2) 全局狀態確認後，仍用 doctor 確認實際連線狀態
    try {
      const doctorResult = spawnSync(actualPath, ['doctor', '--json'], { encoding: 'utf-8', timeout: 10000 });
      if (doctorResult.status === 0 && doctorResult.stdout) {
        try {
          const doctor = JSON.parse(doctorResult.stdout);
          if (doctor.data?.authenticated) {
            authenticated = true;
            connectionState = doctor.data?.connection_state || 'connected';
          }
          diag.connectionState = connectionState;
          diag.storeDir = doctor.data?.store_dir;
          diag.doctorOk = true;
        } catch {}
      }
    } catch (e) { diag.doctorError = e.message; }

    // 3) fallback: 使用 auth status
    if (!authenticated && !diag.doctorOk) {
      try {
        const statusResult = spawnSync(actualPath, ['auth', 'status', '--json'], { encoding: 'utf-8', timeout: 10000 });
        if (statusResult.status === 0 && statusResult.stdout) {
          try {
            const status = JSON.parse(statusResult.stdout);
            authenticated = !!status.data?.authenticated;
          } catch {}
        }
      } catch (e) { diag.authError = e.message; }
    }

    // 4) 後備：如果全局事件曾觸發但 doctor 沒看到，仍採信全局事件
    if (!authenticated && wacliGlobalAuth.eventFired) {
      const since = Date.now() - wacliGlobalAuth.eventTimestamp;
      if (since < 120000) {  // 2 分鐘內的事件仍然有效
        authenticated = true;
        connectionState = 'connected';
        diag.connectionState = connectionState;
        diag.source = 'global_event_fallback';
      }
    }

    if (authenticated) {
      // 認證成功後清理運行中的配對進程（不再需要）
      if (activeWacliAuth) {
        killExistingAuthProcess();
      }
      return res.json({
        success: true,
        authenticated: true,
        message: connectionState === 'connected' ? '已認證並連線' : '已認證',
        diag
      });
    }
    res.json({
      success: false,
      authenticated: false,
      message: `wacli 未認證 (連線狀態: ${connectionState})`,
      diag
    });
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
app.all('/api/ai/sessions', async (req, res) => {
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

app.all('/api/ai/sessions/:sessionId/messages', async (req, res) => {
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
app.all('/api/ai/knowledge', async (req, res) => {
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
app.all('/api/ai/config', async (req, res) => {
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
app.all('/api/ai/suggestions', async (req, res) => {
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

// =========== Debug：診斷 Email 設定（不顯示完整 key，只顯示前 8 碼）===========
app.get('/api/email/diag', async (req, res) => {
  try {
    const restaurantId = req.query.restaurant_id;
    const config = await getEmailSettings(restaurantId);
    const maskedKey = config.apiKey ? config.apiKey.substring(0, 8) + '...' + (config.apiKey.length > 12 ? config.apiKey.substring(config.apiKey.length - 4) : '') : '(未設定)';
    const isResend = config.apiKey?.startsWith('re_') || false;
    res.json({
      ok: true,
      apiKeySet: !!config.apiKey,
      apiKeyPrefix: config.apiKey?.substring(0, 3) || '',
      apiKeyMasked: maskedKey,
      provider: isResend ? 'Resend' : (config.apiKey ? 'SendGrid' : '未設定'),
      from: config.from,
      adminEmail1: config.adminEmail1 || '(未設定)',
      adminEmail2: config.adminEmail2 || '(未設定)',
      adminEmail: config.adminEmail || '(未設定)',
      envHasResend: !!process.env.RESEND_API_KEY,
      envHasSendgrid: !!process.env.SENDGRID_API_KEY,
      envEmailFrom: process.env.EMAIL_FROM || '(未設定)',
    });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// =========== 生產環境：提供前端靜態文件（不使用 express.static） ===========
const distPath = resolve(__dirname, 'dist');
const MIME_MAP = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' };
if (process.env.NODE_ENV === 'production' && existsSync(distPath)) {
  console.log('📁 提供靜態文件從:', distPath);
  // 靜態檔案服務（先於 SPA fallback）
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    const filePath = resolve(distPath, req.path.replace(/^\//, ''));
    if (!filePath.startsWith(distPath)) return next(); // 防止路徑穿越
    if (existsSync(filePath)) {
      const ext = filePath.substring(filePath.lastIndexOf('.'));
      res.type(MIME_MAP[ext] || 'application/octet-stream');
      return res.sendFile(filePath);
    }
    next();
  });
  // SPA fallback（非 API 的 GET 請求全部回傳 index.html）
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(resolve(distPath, 'index.html'));
    }
    next();
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
app.all('/api/settlements', requirePermission('expense.view'), async (req, res) => {
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
app.all('/api/settlements/monthly', requirePermission('expense.view'), async (req, res) => {
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
app.all('/api/settlements/range', requirePermission('expense.view'), async (req, res) => {
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
        PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium',
        CHROMIUM_PATH: '/usr/bin/chromium',
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
app.all('/api/attendance/today', async (req, res) => {
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
app.all('/api/attendance/store/ip', async (req, res) => {
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
        PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium',
        CHROMIUM_PATH: '/usr/bin/chromium',
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

  // 啟動時初始化 wacli 帳戶（確保 Dockerfile 中的初始化已生效）
  try {
    const initWacli = spawnSync('wacli', ['accounts', 'add', 'default'], {
      encoding: 'utf-8', timeout: 10000, stdio: 'pipe',
    });
    console.log(`   📱 wacli 帳戶初始化: ${initWacli.status === 0 || initWacli.stdout?.includes('already exists') ? '✅ 就緒' : '⚠️ 可能已存在'}`);
  } catch (e) {
    console.warn('   📱 wacli 帳戶初始化跳過（非致命）:', e.message);
  }
});

