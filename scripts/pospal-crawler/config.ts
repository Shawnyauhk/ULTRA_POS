import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// 載入 .env 檔案（優先使用專案根目錄的 .env）
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });
// 也嘗試載入爬蟲目錄自己的 .env
dotenv.config({ path: resolve(__dirname, '.env') });

export const config = {
  pospal: {
    baseUrl: process.env.POSPAL_URL || 'https://beta32.pospal.cn',
    loginUrl: process.env.POSPAL_LOGIN_URL || 'https://beta32.pospal.cn/Login',
    targetUrl: process.env.POSPAL_TARGET_URL || 'https://beta32.pospal.cn/ReportV2/StorePaymentSummaryForCatering',
    username: process.env.POSPAL_USERNAME || '',
    password: process.env.POSPAL_PASSWORD || '',
    storeName: process.env.POSPAL_STORE_NAME || '',
  },
  supabase: {
    url: process.env.VITE_SUPABASE_URL || '',
    anonKey: process.env.VITE_SUPABASE_ANON_KEY || '',
  },
  notification: {
    adminWhatsApp: process.env.ADMIN_WHATSAPP || '',
    wacliPath: process.env.WACLI_PATH || 'wacli',
  },
  crawler: {
    headless: process.env.CRAWLER_HEADLESS !== 'false',
    debug: process.env.CRAWLER_DEBUG === 'true',
    maxRetries: 3,
    retryDelay: 5000,   // 初始重試延遲 (ms)
    timeout: 30000,      // 頁面載入超時 (ms)
    slowMo: parseInt(process.env.CRAWLER_SLOWMO || '50'), // 操作間延遲 (ms)
  },
};

/**
 * 檢查必要配置是否完整
 */
export function validateConfig(): string[] {
  const errors: string[] = [];
  if (!config.pospal.username) errors.push('缺少 POSPAL_USERNAME');
  if (!config.pospal.password) errors.push('缺少 POSPAL_PASSWORD');
  if (!config.supabase.url) errors.push('缺少 VITE_SUPABASE_URL');
  if (!config.supabase.anonKey) errors.push('缺少 VITE_SUPABASE_ANON_KEY');
  return errors;
}

/**
 * 支付方式中文名 → 英文代碼映射表
 * 根據 POSPAL 頁面上的顯示名稱進行匹配
 */
export const PAYMENT_MAP: Record<string, string> = {
  '現金支付': 'cash',
  '现金支付': 'cash',
  '現金': 'cash',
  '现金': 'cash',
  '銀聯支付': 'unionpay',
  '銀聯': 'unionpay',
  '儲值卡支付': 'stored_value',
  '儲值卡': 'stored_value',
  '預定金支付': 'booking_deposit',
  '预定金支付': 'booking_deposit',
  '次卡支付': 'visit_card',
  '購物卡支付': 'shopping_card',
  '购物卡支付': 'shopping_card',
  '預付卡支付': 'prepaid_card',
  '预付卡支付': 'prepaid_card',
  '八達通': 'octopus',
  'Foodpanda': 'foodpanda',
  'Payme': 'payme',
  'PayMe': 'payme',
  '支付寶香港': 'alipay_hk',
  '支付寶': 'alipay_hk',
  'WeChat 香港': 'wechat_hk',
  'Wechat香港': 'wechat_hk',
  'Wechat 香港': 'wechat_hk',
  'WeChat': 'wechat_hk',
  '微信支付': 'wechat_hk',
  '美團 KEETA': 'meituan_keeta',
  'KEETA': 'meituan_keeta',
  '美團': 'meituan_keeta',
  'Openrice': 'openrice',
  '總金額': 'total_amount',
  '總計': 'total_amount',
  '总金额': 'total_amount',
  '營業實收': 'actual_revenue',
  '营业实收': 'actual_revenue',
  '實收': 'actual_revenue',
  '總筆數': 'total_transactions',
  '总笔数': 'total_transactions',
  '筆數': 'total_transactions',
  '銷售合計': 'total_amount',
  '销售合计': 'total_amount',
};

/**
 * 支付方式中文顯示名稱列表（用於表格標題識別）
 */
export const PAYMENT_NAMES = Object.keys(PAYMENT_MAP);
