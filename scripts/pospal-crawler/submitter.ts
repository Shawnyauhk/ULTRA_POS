import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import type { CrawlResult } from './crawler.js';

const supabase = createClient(config.supabase.url, config.supabase.anonKey);

/**
 * 提交爬蟲結果到 Supabase 資料庫
 */
export async function submitToDatabase(
  restaurantId: string,
  result: CrawlResult
): Promise<{ success: boolean; error?: string }> {
  if (!result.success) {
    return { success: false, error: '爬蟲未成功執行，跳過提交' };
  }

  try {
    // 構建提交數據
    const paymentData: Record<string, any> = {};
    for (const p of result.payments) {
      paymentData[p.code] = p.amount;
    }

    const payload = {
      restaurant_id: restaurantId,
      settlement_date: result.date,
      store_name: result.storeName || config.pospal.storeName,
      source: 'pospal_crawler',
      raw_json: JSON.stringify(result),
      synced_at: new Date().toISOString(),
      ...paymentData,
      total_amount: result.totalAmount || 0,
      actual_revenue: result.actualRevenue || 0,
      total_transactions: result.totalTransactions || 0,
    };

    const { data, error } = await supabase
      .from('daily_settlements')
      .upsert(payload, { onConflict: 'restaurant_id,settlement_date' })
      .select()
      .single();

    if (error) throw error;

    console.log(`[Submitter] ✅ 已提交到資料庫: ${result.date}`);
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Submitter] ❌ 提交失敗: ${msg}`);
    return { success: false, error: msg };
  }
}
