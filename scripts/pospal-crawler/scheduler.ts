/**
 * POSPAL 爬蟲定時排程器（含開機補爬功能）
 *
 * 功能：
 * 1. 開機時自動檢查是否有漏掉的天數（從 last_sync.txt 記錄），依序補爬
 * 2. 每天 23:50 自動爬取當日數據
 * 3. 使用 last_sync.txt 記錄最後成功同步日期
 *
 * 使用方式：
 *   npx tsx scheduler.ts              # 正常啟動（檢查補爬 + 定時）
 *   npx tsx scheduler.ts --dry-run    # 僅爬取不提交
 *   npx tsx scheduler.ts --now        # 立即執行當日爬取
 */

import cron from 'node-cron';
import { submitToDatabase } from './submitter.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESTAURANT_ID = process.env.RESTAURANT_ID || '';
const LAST_SYNC_FILE = resolve(__dirname, 'last_sync.txt');
const isDryRun = process.argv.includes('--dry-run');

// ==================== 日期工具 ====================

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

/** 讀取最後成功同步日期 */
function getLastSyncDate(): string | null {
  try {
    if (existsSync(LAST_SYNC_FILE)) {
      return readFileSync(LAST_SYNC_FILE, 'utf-8').trim();
    }
  } catch {}
  return null;
}

/** 寫入最後成功同步日期 */
function saveLastSyncDate(date: string) {
  const dir = dirname(LAST_SYNC_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(LAST_SYNC_FILE, date, 'utf-8');
  console.log(`[Scheduler] 💾 已更新 last_sync: ${date}`);
}

/** 計算從 lastDate 隔天到昨天為止的所有漏掉天數 */
function getMissedDates(lastDate: string): string[] {
  const start = new Date(lastDate + 'T00:00:00');
  start.setDate(start.getDate() + 1);
  const yesterday = getYesterday();
  const end = new Date(yesterday + 'T00:00:00');

  const missed: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    missed.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return missed;
}

// ==================== 爬蟲執行器 ====================

/** 用 child_process 執行爬蟲（支援 --date 參數） */
async function runCrawler(dateStr: string): Promise<boolean> {
  return new Promise((resolvePromise) => {
    console.log(`[Scheduler] 📡 開始爬取 ${dateStr}...`);

    const args = [
      'tsx', 'crawler.ts',
      `--date=${dateStr}`,
      '--url=business-summary',
      ...(isDryRun ? ['--dry-run'] : []),
    ];

    const child = spawn('npx', args, {
      cwd: __dirname,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`[Scheduler] ✅ ${dateStr} 爬取完成`);
        resolvePromise(true);
      } else {
        console.error(`[Scheduler] ❌ ${dateStr} 爬取失敗 (exit code ${code})`);
        resolvePromise(false);
      }
    });

    child.on('error', (err) => {
      console.error(`[Scheduler] ❌ ${dateStr} 爬取錯誤:`, err.message);
      resolvePromise(false);
    });
  });
}

/** 提交某日的爬蟲結果到資料庫 */
async function submitCrawlResult(dateStr: string): Promise<boolean> {
  if (isDryRun) {
    console.log(`[Scheduler] 🏜️ --dry-run 模式，跳過提交`);
    return true;
  }

  if (!RESTAURANT_ID) {
    console.warn(`[Scheduler] ⚠️ 未設定 RESTAURANT_ID，跳過資料庫提交`);
    return false;
  }

  const logPath = resolve(__dirname, 'logs', `${dateStr}.json`);
  if (!existsSync(logPath)) {
    console.error(`[Scheduler] ❌ 找不到 ${dateStr} 的爬蟲結果檔: ${logPath}`);
    return false;
  }

  try {
    const content = readFileSync(logPath, 'utf-8');
    const result = JSON.parse(content);

    if (!result.success) {
      console.error(`[Scheduler] ❌ ${dateStr} 爬蟲結果標記為失敗，跳過提交`);
      return false;
    }

    const submitResult = await submitToDatabase(RESTAURANT_ID, result);
    if (submitResult.success) {
      console.log(`[Scheduler] ✅ ${dateStr} 提交成功`);
      return true;
    } else {
      console.error(`[Scheduler] ❌ ${dateStr} 提交失敗:`, submitResult.error);
      return false;
    }
  } catch (err) {
    console.error(`[Scheduler] ❌ ${dateStr} 提交時發生錯誤:`, err);
    return false;
  }
}

/** 完整的爬取 + 提交流程（針對指定日期） */
async function runCrawlerAndSubmitForDate(dateStr: string): Promise<boolean> {
  const crawlOk = await runCrawler(dateStr);
  if (!crawlOk) return false;

  const submitOk = await submitCrawlResult(dateStr);
  if (submitOk) {
    saveLastSyncDate(dateStr);
    return true;
  }
  return false;
}

// ==================== 主要邏輯 ====================

async function main() {
  console.log('[Scheduler] 🚀 排程器啟動中...');
  console.log(`[Scheduler] 📁 同步狀態檔: ${LAST_SYNC_FILE}`);

  // --- 步驟 1：檢查補爬 ---
  const lastSync = getLastSyncDate();
  if (lastSync) {
    const yesterday = getYesterday();
    if (lastSync >= yesterday) {
      console.log(`[Scheduler] ✅ 已是最新 (${lastSync})，無需補爬`);
    } else {
      const missed = getMissedDates(lastSync);
      if (missed.length > 0) {
        console.log(`[Scheduler] 🔍 發現 ${missed.length} 天未同步: ${missed.join(', ')}`);
        for (const dateStr of missed) {
          const ok = await runCrawlerAndSubmitForDate(dateStr);
          if (!ok) {
            console.warn(`[Scheduler] ⚠️ ${dateStr} 補爬失敗，繼續下一個`);
          }
        }
      }
    }
  } else {
    console.log('[Scheduler] 📋 首次執行，無上次同步記錄，跳過補爬');
    console.log('[Scheduler] 💡 可手動執行 npx tsx scheduler.ts --now 開始第一次同步');
  }

  // --- 步驟 2：註冊每日排程（23:50 HKT） ---
  cron.schedule('50 23 * * *', async () => {
    console.log('[Scheduler] ⏰ 每日排程觸發 (23:50 HKT)');
    const today = getToday();
    await runCrawlerAndSubmitForDate(today);
  }, {
    timezone: 'Asia/Hong_Kong',
  });

  console.log('[Scheduler] 📅 排程器就緒，每天 23:50 (HKT) 自動執行');
}

// === 立即執行模式（--now）===
if (process.argv.includes('--now')) {
  const today = getToday();
  runCrawlerAndSubmitForDate(today)
    .then((ok) => {
      console.log(`[Scheduler] 🏁 --now 執行${ok ? '成功 ✅' : '失敗 ❌'}`);
      process.exit(ok ? 0 : 1);
    })
    .catch((err) => {
      console.error('[Scheduler] 💥 --now 執行錯誤:', err);
      process.exit(1);
    });
} else {
  main().catch(console.error);
}
