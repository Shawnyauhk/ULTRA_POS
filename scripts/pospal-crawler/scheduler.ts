/**
 * POSPAL 爬蟲定時排程器
 * 每天 23:50 自動執行，爬取當日營業數據並提交到資料庫
 *
 * 使用方式：
 *   npx tsx scheduler.ts                    # 立即執行並提交
 *   npx tsx scheduler.ts --dry-run          # 僅爬取不提交
 */
import cron from 'node-cron';
import { submitToDatabase } from './submitter.js';

// 餐廳 ID（硬編碼或從環境變數讀取）
const RESTAURANT_ID = process.env.RESTAURANT_ID || '';

const isDryRun = process.argv.includes('--dry-run');

async function runCrawlerAndSubmit() {
  console.log('[Scheduler] 開始排程任務...');
  
  // 動態導入 crawler（避免循環依賴）
  const { PospalCrawler } = await import('./crawler.js');
  
  const crawler = new PospalCrawler(false, 'business-summary');
  const result = await crawler.run();

  PospalCrawler.printResult(result);

  if (result.success && !isDryRun && RESTAURANT_ID) {
    console.log('[Scheduler] 提交到資料庫...');
    const submitResult = await submitToDatabase(RESTAURANT_ID, result);
    if (submitResult.success) {
      console.log('[Scheduler] ✅ 排程任務完成');
    } else {
      console.error('[Scheduler] ❌ 提交失敗:', submitResult.error);
    }
  } else if (!RESTAURANT_ID) {
    console.warn('[Scheduler] ⚠️ 未設定 RESTAURANT_ID，跳過資料庫提交');
  }
}

// 立即執行（測試用）
if (process.argv.includes('--now')) {
  runCrawlerAndSubmit().catch(console.error);
}

// 每天 23:50 執行（香港時間）
cron.schedule('50 23 * * *', () => {
  console.log('[Scheduler] ⏰ 定時任務觸發 (23:50)');
  runCrawlerAndSubmit().catch(console.error);
}, {
  timezone: 'Asia/Hong_Kong',
});

console.log('[Scheduler] 📅 排程器已啟動，將於每天 23:50 (HKT) 自動執行');
console.log('[Scheduler] 💡 使用 --now 立即執行，--dry-run 僅爬取不提交');
