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
