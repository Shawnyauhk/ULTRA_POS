#!/usr/bin/env node
/**
 * POSPAL 餐飲營業額爬蟲工具
 *
 * 功能：
 * 1. 自動登入 POSPAL 後台
 * 2. 設置日期篩選，點擊查詢
 * 3. 提取 StorePaymentSummaryForCatering 頁面的支付明細數據
 * 4. 只提取非零數據，過濾掉零值
 * 5. 輸出結果到終端 + 保存到 logs/
 *
 * 使用方式：
 *   npx tsx crawler.ts                    # 爬取昨天的數據（預設頁面）
 *   npx tsx crawler.ts --date=2026-05-16  # 爬取指定日期
 *   npx tsx crawler.ts --date=today       # 爬取今天的數據
 *   npx tsx crawler.ts --debug            # 顯示瀏覽器視窗（除錯模式）
 *   npx tsx crawler.ts --url=business-summary  # 爬取「門店銷售匯總」頁面
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config, validateConfig, PAYMENT_MAP } from './config.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// 應用 Stealth 插件（偽裝瀏覽器指紋，繞過反爬）
puppeteer.use(StealthPlugin());

const __dirname = dirname(fileURLToPath(import.meta.url));

// ==================== 類型定義 ====================

interface PaymentEntry {
  name: string;       // 支付方式名稱（中文）
  code: string;       // 支付方式代碼（英文）
  amount: number;     // 金額
  isSummary?: boolean; // 是否為匯總行（總金額、實收等）
}

interface CrawlResult {
  success: boolean;
  date: string;
  storeName?: string;
  payments: PaymentEntry[];
  totalAmount?: number;
  actualRevenue?: number;
  totalTransactions?: number;
  rawHtml?: string;
  error?: string;
  duration: number;
}

/**
 * POSPAL 頁面表格欄位索引映射
 * 基於「门店支付汇总」頁面結構（餐飲版）
 * 
 * 表格欄位順序（從第 1 列開始計）:
 * 0: 操作圖標(設置)
 * 1: 店名
 * 2: 門店編號(隱藏)
 * 3: 營業實收
 * 4: 總金額
 * 5: 總筆數
 * 6: 現金支付-金額
 * 7: 現金支付-筆數
 * 8: 銀聯支付-金額
 * 9: 銀聯支付-筆數
 * 10: 儲值卡支付-本金
 * 11: 儲值卡支付-贈金
 * 12: 儲值卡支付-金額   ← 我們要的
 * 13: 儲值卡支付-筆數
 * 14: 預定金支付-金額
 * 15: 預定金支付-筆數
 * 16: 次卡支付-金額
 * 17: 次卡支付-筆數
 * 18: 購物卡支付-金額
 * 19: 購物卡支付-筆數
 * 20: 預付卡支付-金額
 * 21: 預付卡支付-筆數
 */
const COLUMN_MAP: Record<string, number> = {
  'realAmount': 3,        // 營業實收
  'totalAmount': 4,       // 總金額
  'totalRecord': 5,       // 總筆數
  '现金支付_amount': 6,   // 現金支付-金額
  '银联支付_amount': 8,   // 銀聯支付-金額
  '储值卡支付_amount': 12,// 儲值卡支付-金額
  '预定金支付_amount': 14,// 預定金支付-金額
  '次卡支付_amount': 16,  // 次卡支付-金額
  '购物卡支付_amount': 18,// 購物卡支付-金額
  '预付卡支付_amount': 20,// 預付卡支付-金額
};

// ==================== 報表類型 ====================

type ReportType = 'payment-summary' | 'business-summary';

interface ReportPage {
  name: string;
  url: string;
  pathCheck: string;
}

// ==================== 日誌工具 ====================

const LOG_PREFIX = '[POSPAL Crawler]';

function log(...args: unknown[]) {
  console.log(`${LOG_PREFIX}`, ...args);
}

function logError(...args: unknown[]) {
  console.error(`${LOG_PREFIX} ❌`, ...args);
}

function logSuccess(...args: unknown[]) {
  console.log(`${LOG_PREFIX} ✅`, ...args);
}

function logWarn(...args: unknown[]) {
  console.warn(`${LOG_PREFIX} ⚠️`, ...args);
}

// ==================== 日期工具 ====================

function getTargetDate(): string {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith('--date=')) {
      const dateStr = arg.split('=')[1];
      if (dateStr === 'today') {
        return new Date().toISOString().split('T')[0];
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
      }
      logWarn(`無效的日期格式: ${dateStr}，使用默認日期`);
    }
  }
  // 默認：爬取昨天
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

function getTargetReport(): ReportType {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith('--url=')) {
      const type = arg.split('=')[1];
      if (type === 'business-summary') return 'business-summary';
    }
  }
  return 'payment-summary';
}

const REPORT_PAGES: Record<ReportType, ReportPage> = {
  'payment-summary': {
    name: '门店支付汇总',
    url: 'https://beta32.pospal.cn/ReportV2/StorePaymentSummaryForCatering',
    pathCheck: 'StorePaymentSummaryForCatering',
  },
  'business-summary': {
    name: '门店销售汇总',
    url: 'https://beta32.pospal.cn/Extension/ZhengZhong/BusinessSummary',
    pathCheck: 'BusinessSummary',
  },
};

function isDebugMode(): boolean {
  return process.argv.includes('--debug');
}

/**
 * 將 YYYY-MM-DD 轉換為 POSPAL 格式 YYYY.MM.DD
 */
function formatPospalDate(dateStr: string): string {
  return dateStr.replace(/-/g, '.');
}

// ==================== 主爬蟲邏輯 ====================

class PospalCrawler {
  private browser: import('puppeteer').Browser | null = null;
  private page: import('puppeteer').Page | null = null;
  private debug: boolean;
  private reportType: ReportType;

  constructor(debug = false, reportType: ReportType = 'payment-summary') {
    this.debug = debug;
    this.reportType = reportType;
  }

  private get reportPage(): ReportPage {
    return REPORT_PAGES[this.reportType];
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async run(dateStr?: string): Promise<CrawlResult> {
    const startTime = Date.now();
    const targetDate = dateStr || getTargetDate();

    log('='.repeat(60));
    log(`開始爬取 POSPAL 營業額數據`);
    log(`報表頁面: ${this.reportPage.name} (${this.reportType})`);
    log(`目標日期: ${targetDate}`);
    log(`除錯模式: ${this.debug ? '是' : '否'}`);
    log('='.repeat(60));

    try {
      await this.launchBrowser();
      await this.login();
      const postLoginUrl = this.page ? await this.page.url() : '';
      log(`登入後 URL: ${postLoginUrl}`);

      // 如果登入後未在目標頁面，則導航到目標頁面
      if (!postLoginUrl.includes(this.reportPage.pathCheck)) {
        await this.navigateToTarget();
      }

      // 設置日期篩選
      await this.setDateFilter(targetDate);

      // 點擊查詢按鈕
      await this.clickQueryButton();

      // 提取數據
      const result = await this.extractData(targetDate);
      this.saveResult(result, targetDate);

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      result.duration = parseFloat(duration);
      logSuccess(`爬蟲執行完成，耗時 ${duration} 秒`);

      return result;
    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(`爬蟲執行失敗: ${errorMessage}`);
      await this.captureErrorScreenshot(targetDate);
      return {
        success: false,
        date: targetDate,
        payments: [],
        error: errorMessage,
        duration: parseFloat(duration),
      };
    } finally {
      await this.closeBrowser();
    }
  }

  private async launchBrowser(): Promise<void> {
    log('正在啟動瀏覽器...');

    this.browser = await puppeteer.launch({
      headless: this.debug ? false : true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--lang=zh-CN',
      ],
      defaultViewport: { width: 1920, height: 1080 },
    });

    const pages = await this.browser.pages();
    this.page = pages[0];
    await this.page.setDefaultTimeout(config.crawler.timeout);
    await this.page.setDefaultNavigationTimeout(config.crawler.timeout);

    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    });

    logSuccess('瀏覽器啟動完成');
  }

  private async login(): Promise<void> {
    if (!this.page) throw new Error('頁面未初始化');

    log('正在登入 POSPAL...');

    // 直接導航到目標頁面（如果已經有 Cookie 可能直接登入）
    await this.page.goto(this.reportPage.url, {
      waitUntil: 'networkidle2',
      timeout: config.crawler.timeout,
    });
    await this.sleep(2000);

    const currentUrl = this.page.url();
    log(`當前 URL: ${currentUrl}`);

    // 檢查是否真的在目標頁面上（路徑包含對應的路徑，且不在 ReturnUrl 參數中）
    const isOnTargetPage = (): boolean => {
      const pathCheck = this.reportPage.pathCheck;
      try {
        const url = new URL(this.page ? this.page.url() : '');
        return url.pathname.includes(pathCheck);
      } catch {
        return currentUrl.includes(pathCheck) && 
               !currentUrl.includes('ReturnUrl=');
      }
    };

    if (isOnTargetPage()) {
      logSuccess('已經在目標頁面，使用現有 Cookie');
      return;
    }

    // 否則需要重新登入
    log('需要重新登入...');
    await this.page.goto(config.pospal.loginUrl, {
      waitUntil: 'networkidle2',
    });
    await this.sleep(2000);

    if (this.debug) {
      await this.page.screenshot({ path: resolve(__dirname, 'logs', '_debug_login_page.png') });
    }

    // 查找並填入帳號（POSPAL signin 頁面使用 id 選擇器）
    const usernameField = await this.findAndFill('#txt_userName', config.pospal.username);
    if (!usernameField) {
      // 備用選擇器
      const altSelectors = [
        'input[type="text"]', 'input[name="username"]',
        'input[id*="user"]', 'input[placeholder*="账号"]',
        'input[placeholder*="帳號"]',
      ];
      let found = false;
      for (const sel of altSelectors) {
        const el = await this.findAndFill(sel, config.pospal.username);
        if (el) { found = true; break; }
      }
      if (!found) {
        const html = (await this.page.content()).substring(0, 5000);
        logWarn('無法找到帳號輸入框，頁面 HTML:');
        console.log(html);
        throw new Error('無法找到帳號輸入框');
      }
    }

    await this.sleep(300);

    // 查找並填入密碼
    let passwordField = await this.findAndFill('#txt_password', config.pospal.password);
    if (!passwordField) {
      passwordField = await this.findAndFill('input[type="password"]', config.pospal.password);
    }
    if (!passwordField) {
      throw new Error('無法找到密碼輸入框');
    }

    await this.sleep(300);

    // POSPAL 登入頁面沒有提交按鈕，直接按 Enter 提交
    log('按下 Enter 提交登入...');
    await this.page.keyboard.press('Enter');

    log('等待登入完成...');
    await this.sleep(3000);

    // 等待跳轉
    try {
      await this.page.waitForFunction(
        () => !window.location.href.includes('/Login'),
        { timeout: 20000 }
      );
      logSuccess('登入成功！');
    } catch {
      const errorMsg = await this.checkPageForError();
      if (errorMsg) throw new Error(`登入失敗: ${errorMsg}`);
      logWarn('登入後 URL: ' + this.page.url());
    }

    const cookies = await this.page.cookies();
    log(`Cookie 共 ${cookies.length} 條`);

    if (this.debug) {
      await this.page.screenshot({ path: resolve(__dirname, 'logs', '_debug_post_login.png') });
    }
  }

  private async navigateToTarget(): Promise<void> {
    if (!this.page) return;
    log(`導航到${this.reportPage.name}頁面...`);
    await this.page.goto(this.reportPage.url, {
      waitUntil: 'networkidle2',
      timeout: config.crawler.timeout,
    });
    await this.sleep(3000);
    log(`當前 URL: ${this.page.url()}`);

    if (this.debug) {
      await this.page.screenshot({ path: resolve(__dirname, 'logs', `_debug_target_${this.reportType}.png`), fullPage: true });
    }
  }

  /**
   * 設置日期篩選
   * 模擬真實用戶操作：
   * 1. 點擊起始日期輸入框打開日曆 → 選擇目標日期 → 日曆關閉
   * 2. 點擊結束日期輸入框打開日曆 → 選擇目標日期 → 日曆關閉
   * 3. 兩個日期都設為同一天
   */
  private async setDateFilter(dateStr: string): Promise<void> {
    if (!this.page) return;

    const pospalDate = formatPospalDate(dateStr);
    const dayNum = parseInt(dateStr.split('-')[2], 10);
    log(`設置日期篩選為: ${pospalDate}`);

    // 點擊日曆中的具體日期
    const clickDateInPicker = async (): Promise<boolean> => {
      return await this.page!.evaluate((day: number) => {
        // 查找日曆中該日期的可點擊元素
        const selectors = ['td a', 'td span', 'a', 'span', 'td'];
        for (const sel of selectors) {
          const elements = document.querySelectorAll(sel);
          for (const el of elements) {
            if (el.textContent?.trim() === String(day)) {
              // 確保在日曆範圍內且可點擊
              const isInCalendar = !!el.closest('.ui-datepicker, .ui-datepicker-calendar, [class*="datepicker"]');
              const isDisabled = el.classList.contains('ui-datepicker-unselectable') ||
                                el.getAttribute('aria-disabled') === 'true';
              if (isInCalendar && !isDisabled) {
                (el as HTMLElement).click();
                return true;
              }
            }
          }
        }
        return false;
      }, dayNum);
    };

    const getDateInputs = async () => {
      return await this.page!.$$('#dateTimeRangeBox input.timeInput');
    };

    let inputs = await getDateInputs();

    // 1. 設置起始日期
    if (inputs.length >= 1) {
      await inputs[0].click();
      await this.sleep(600);
      if (await clickDateInPicker()) {
        logSuccess(`起始日期已設為 ${dayNum} 日`);
      }
      await this.sleep(400);
    }

    // 2. 設置結束日期
    inputs = await getDateInputs();
    if (inputs.length >= 2) {
      await inputs[1].click();
      await this.sleep(600);
      if (await clickDateInPicker()) {
        logSuccess(`結束日期已設為 ${dayNum} 日`);
      }
      await this.sleep(400);
    }

    // 3. 點擊頁面空白處確保日曆關閉
    await this.page.evaluate(() => {
      document.body.click();
    });
    await this.sleep(300);

    // 4. 驗證日期設置
    const currentValue = await this.page.evaluate(() => {
      const inputs = document.querySelectorAll('#dateTimeRangeBox input.timeInput');
      return inputs.length >= 2 ? `${inputs[0].value} - ${inputs[1].value}` : null;
    });
    log(`當前日期範圍: ${currentValue}`);

    // 5. 如果設置失敗，使用強制方案
    if (!currentValue || !currentValue.includes(pospalDate)) {
      logWarn('日曆點擊未生效，使用強制設置...');
      await this.page.evaluate((date) => {
        const inputs = document.querySelectorAll('#dateTimeRangeBox input.timeInput');
        if (inputs.length >= 2) {
          inputs[0].removeAttribute('readonly');
          inputs[0].value = `${date} 00:00`;
          inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
          inputs[1].removeAttribute('readonly');
          inputs[1].value = `${date} 23:59`;
          inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, pospalDate);
    }
  }

  /**
   * 點擊查詢按鈕，等待 AJAX 數據載入
   */
  private async clickQueryButton(): Promise<void> {
    if (!this.page) return;

    log('點擊「查詢」按鈕...');

    const queryBtn = await this.page.$('.submitBtn');
    if (!queryBtn) {
      logWarn('找不到查詢按鈕！');
      return;
    }

    await queryBtn.click();
    log('已點擊查詢，等待數據載入...');

    // 等待數據載入
    await this.sleep(3000);

    // 等待載入動畫消失或表格出現
    try {
      await this.page.waitForFunction(() => {
        // 檢查是否有載入動畫
        const loading = document.querySelector('.loading, .ajax-loading, .loading-mask');
        if (loading) return false;

        // 檢查表格是否已有資料
        const table = document.querySelector('#mainTable');
        if (!table) return false;

        const rows = table.querySelectorAll('tbody tr');
        return rows.length > 0;
      }, { timeout: 20000 });
      logSuccess('數據已載入');
    } catch {
      logWarn('等待數據載入超時，嘗試繼續...');
    }

    await this.sleep(1000);

    if (this.debug) {
      await this.page.screenshot({ path: resolve(__dirname, 'logs', '_debug_after_query.png'), fullPage: true });
    }
  }

  /**
   * 從渲染完成的表格提取數據
   */
  private async extractData(dateStr: string): Promise<CrawlResult> {
    if (!this.page) throw new Error('頁面未初始化');

    if (this.reportType === 'business-summary') {
      return this.extractBusinessSummary(dateStr);
    }
    return this.extractPaymentSummary(dateStr);
  }

  /**
   * 從「门店支付汇总」頁面提取（StorePaymentSummaryForCatering）
   * 表格結構：
   *   3=營業實收, 4=總金額, 5=總筆數
   *   6=現金, 8=銀聯, 12=儲值卡, 14=預定金, 16=次卡, 18=購物卡, 20=預付卡
   */
  private async extractPaymentSummary(dateStr: string): Promise<CrawlResult> {
    if (!this.page) throw new Error('頁面未初始化');

    log('正在提取營業額數據（门店支付汇总）...');

    const html = await this.page.content();

    if (this.debug) {
      writeFileSync(
        resolve(__dirname, 'logs', `_debug_page_after_query_${dateStr}.html`),
        html, 'utf-8'
      );
    }

    const tableData = await this.page.evaluate(() => {
      const result = {};
      const table = document.querySelector('#mainTable');
      if (!table) return result;

      const tbody = table.querySelector('tbody');
      if (!tbody) return result;

      const rows = tbody.querySelectorAll('tr');
      if (rows.length === 0) return result;

      const cells = rows[0].querySelectorAll('td');

      const indices: Record<string, number> = {
        '营业实收': 3, '总金额': 4, '总笔数': 5,
        '现金支付': 6, '银联支付': 8, '储值卡支付': 12,
        '预定金支付': 14, '次卡支付': 16,
        '购物卡支付': 18, '预付卡支付': 20,
      };

      for (const [name, idx] of Object.entries(indices)) {
        if (cells[idx]) {
          const text = cells[idx].textContent?.trim() || '';
          if (text && text !== '小计' && text !== '小計') {
            result[name] = text;
          }
        }
      }
      if (cells[1]) result['店名'] = cells[1].textContent?.trim() || '';

      return result;
    });

    return this.parseTableData(tableData, dateStr, html);
  }

  /**
   * 從「门店销售汇总」頁面提取（ZhengZhong/BusinessSummary）
   *
   * POSPAL 的表格欄位是動態的——沒有資料的支付方式不會顯示欄位，
   * 因此不能使用固定欄位索引，改為：
   * 1. 讀取 thead 中的欄位標題
   * 2. 用 PAYMENT_MAP 動態對應支付方式
   * 3. 從對應的 td 取值
   */
  private async extractBusinessSummary(dateStr: string): Promise<CrawlResult> {
    if (!this.page) throw new Error('頁面未初始化');

    log('正在提取營業額數據（门店销售汇总）...');

    const html = await this.page.content();

    if (this.debug) {
      writeFileSync(
        resolve(__dirname, 'logs', `_debug_business_summary_${dateStr}.html`),
        html, 'utf-8'
      );
    }

    // 動態提取：讀取標題行 → 對應支付方式 → 讀取數值
    const tableData = await this.page.evaluate(() => {
      const r = {};

      // 找到 #mainTable
      const table = document.querySelector('table#mainTable');
      if (!table) return r;

      const thead = table.querySelector('thead');
      if (!thead) return r;
      const headerRow = thead.querySelector('tr');
      if (!headerRow) return r;
      const headerCells = headerRow.querySelectorAll('th');

      const tbody = table.querySelector('tbody');
      if (!tbody) return r;
      const rows = tbody.querySelectorAll('tr');
      if (rows.length === 0) return r;

      // 找到第一個有效資料行（跳過「儲值卡充值」行和「總計」行）
      let dataRow: Element | null = null;
      for (let ri = 0; ri < rows.length; ri++) {
        const cells = rows[ri].querySelectorAll('td');
        if (cells.length < 3) continue;
        const c0 = (cells[0].textContent || '').trim();
        const c2text = (cells[2] ? cells[2].textContent || '' : '').trim();
        // 跳過儲值卡充值和總計行
        if (c2text.includes('儲值卡充值') || c2text.includes('储值卡充值')) continue;
        if (c0 === '总计' || c0 === '總計') continue;
        // 門店名必須有效
        const c1 = (cells[1] ? cells[1].textContent || '' : '').trim();
        if (c1 && c1 !== '-') {
          dataRow = rows[ri];
          break;
        }
      }
      if (!dataRow) return r;

      const dataCells = dataRow.querySelectorAll('td');

      // 標題行第 2 欄（col 2）通常為空，但存放銷售/儲值卡
      // 後面才是支付方式欄位
      if (dataCells[2]) {
        const sp = dataCells[2].querySelector('span');
        let v = sp ? (sp.textContent || '').trim() : (dataCells[2].textContent || '').trim();
        v = v.replace(/^[^0-9.\-]+/, '') || '0';
        r['销售合计'] = v;
      }

      // 門店名
      if (dataCells[1]) {
        r['店名'] = (dataCells[1].textContent || '').trim();
      }

      // 從 col 3 開始，動態對應標題行 → 支付方式
      // col 0=区域, col 1=门店, col 2=销售/储值卡
      for (let ci = 3; ci < headerCells.length && ci < dataCells.length; ci++) {
        const headerText = (headerCells[ci].textContent || '').trim();
        if (!headerText) continue;

        const sp = dataCells[ci].querySelector('span');
        let rawVal = sp ? (sp.textContent || '').trim() : (dataCells[ci].textContent || '').trim();
        const numVal = rawVal.replace(/^[^0-9.\-]+/, '') || '0';

        // 用 PAYMENT_MAP 查找對應的支付方式代碼
        // 如果 headerText 不在 PAYMENT_MAP 中，用 headerText 作為 key 讓 mapPaymentName 處理
        r[headerText] = numVal;
      }

      return r;
    });

    return this.parseTableData(tableData, dateStr, html);
  }

  /**
   * 解析表格數據為統一格式
   */
  private async parseTableData(
    tableData: Record<string, string>,
    dateStr: string,
    html: string
  ): Promise<CrawlResult> {
    const payments: PaymentEntry[] = [];
    let totalAmount: number | undefined;
    let actualRevenue: number | undefined;
    let totalTransactions: number | undefined;

    log('');
    log('  提取到的數據:');
    log('  ' + '─'.repeat(40));

    for (const [name, value] of Object.entries(tableData)) {
      let amount = parseAmount(value);
      if (amount === null) {
        const numMatch = value.match(/[\d,.-]+/);
        if (numMatch) amount = parseAmount(numMatch[0]);
      }

      if (amount === null || amount === undefined) {
        log(`  📝 ${name.padEnd(14)} = ${value} (無法解析)`);
        continue;
      }

      if (amount === 0) {
        log(`  跳過零值: ${name} = $0`);
        continue;
      }

      const code = mapPaymentName(name);
      const isSummary = code === 'total_amount' || code === 'actual_revenue' || code === 'total_transactions';

      if (!isSummary && amount > 0) {
        payments.push({ name, code, amount });
        log(`  💰 ${name.padEnd(14)} = $${amount.toLocaleString()}`);
      } else if (isSummary) {
        if (code === 'total_amount') totalAmount = amount;
        else if (code === 'actual_revenue') actualRevenue = amount;
        else if (code === 'total_transactions') totalTransactions = Math.round(amount);
        log(`  📊 ${name.padEnd(14)} = $${amount.toLocaleString()}`);
      } else {
        // 非匯總的零值不記錄
      }
    }

    log('  ' + '─'.repeat(40));

    logSuccess(`提取完成！${payments.length} 筆支付記錄`);
    if (totalAmount !== undefined) log(`總金額: ${totalAmount}`);
    if (actualRevenue !== undefined) log(`營業實收: ${actualRevenue}`);

    return {
      success: true,
      date: dateStr,
      storeName: tableData['店名'] || config.pospal.storeName,
      payments,
      totalAmount,
      actualRevenue,
      totalTransactions,
      rawHtml: html,
      duration: 0,
    };
  }

  private saveResult(result: CrawlResult, dateStr: string): void {
    const logsDir = resolve(__dirname, 'logs');
    if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });

    const jsonPath = resolve(logsDir, `${dateStr}.json`);
    writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf-8');
    logSuccess(`📁 JSON: ${jsonPath}`);

    const reportPath = resolve(logsDir, `${dateStr}_report.txt`);
    writeFileSync(reportPath, this.formatReport(result), 'utf-8');
    logSuccess(`📄 報告: ${reportPath}`);
  }

  private formatReport(result: CrawlResult): string {
    const lines: string[] = [];
    const sep = '─'.repeat(56);

    lines.push('POSPAL 營業額結算報告');
    lines.push(sep);
    lines.push(`日期:      ${result.date}`);
    lines.push(`門店:      ${result.storeName || 'N/A'}`);
    lines.push(`狀態:      ${result.success ? '✅ 成功' : '❌ 失敗'}`);
    if (result.error) lines.push(`錯誤:      ${result.error}`);
    lines.push(`執行時間:  ${result.duration.toFixed(1)} 秒`);
    lines.push('');

    if (result.success && result.payments.length > 0) {
      lines.push(`支付明細:`);
      lines.push(sep);
      lines.push(`  支付方式`.padEnd(24) + `金額 (HKD)`);
      lines.push(sep);
      for (const p of result.payments) {
        lines.push(`  ${p.name.padEnd(22)} $${p.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      }
      lines.push(sep);
      if (result.totalAmount !== undefined) {
        lines.push(`  ${'總金額'.padEnd(22)} $${result.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      }
      if (result.actualRevenue !== undefined) {
        lines.push(`  ${'營業實收'.padEnd(22)} $${result.actualRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      }
      if (result.totalTransactions !== undefined) {
        lines.push(`  ${'總筆數'.padEnd(22)} ${result.totalTransactions}`);
      }
      lines.push(sep);
    }

    return lines.join('\n');
  }

  private async captureErrorScreenshot(dateStr: string): Promise<void> {
    if (!this.page) return;
    try {
      const logsDir = resolve(__dirname, 'logs');
      if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
      await this.page.screenshot({ path: resolve(logsDir, `_error_${dateStr}.png`), fullPage: true });
      logWarn(`📸 錯誤截圖已保存`);
    } catch { }
  }

  private async closeBrowser(): Promise<void> {
    if (this.browser) {
      try { await this.browser.close(); } catch { }
      this.browser = null;
      this.page = null;
    }
  }

  // ==================== 輔助方法 ====================

  /**
   * 查找元素並填入文字
   */
  private async findAndFill(selector: string, value: string): Promise<boolean> {
    if (!this.page) return false;
    try {
      const el = await this.page.$(selector);
      if (el) {
        await el.click();
        await this.page.type(selector, value, { delay: 50 });
        log(`✅ 已填入（${selector}）`);
        return true;
      }
    } catch { }
    return false;
  }

  /**
   * 檢查頁面是否有錯誤提示
   */
  private async checkPageForError(): Promise<string | null> {
    if (!this.page) return null;
    try {
      const text = await this.page.evaluate(() => document.body?.innerText || '');
      const keywords = ['密码错误', '账号不存在', '验证码', '驗證碼', '錯誤', 'error', '未授權', '未授权', '無權限', '无权限'];
      for (const kw of keywords) {
        if (text.includes(kw)) return `頁面顯示「${kw}」`;
      }
    } catch { }
    return null;
  }

  static printResult(result: CrawlResult): void {
    // 失敗時輸出精簡格式，避免冗餘裝飾線污染日誌
    if (!result.success) {
      console.log(`\n[POSPAL Crawler Result] date=${result.date} status=fail error=${(result.error || 'unknown').replace(/\n/g, ' | ')} duration=${result.duration.toFixed(1)}s`);
      return;
    }
    console.log('');
    console.log('='.repeat(60));
    console.log('  POSPAL 營業額結算結果');
    console.log('='.repeat(60));
    console.log(`  日期:          ${result.date}`);
    console.log(`  門店:          ${result.storeName || 'N/A'}`);
    console.log(`  狀態:          ✅ 成功`);
    console.log(`  耗時:          ${result.duration.toFixed(1)} 秒`);

    if (result.payments.length > 0) {
      console.log('');
      console.log('  ┌──────────────────────────────┬──────────────────┐');
      console.log('  │ 支付方式                       │ 金額 (HKD)       │');
      console.log('  ├──────────────────────────────┼──────────────────┤');

      for (const p of result.payments) {
        const amt = `$${p.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        console.log(`  │ ${p.name.padEnd(28)} │ ${amt.padStart(16)} │`);
      }

      console.log('  ├──────────────────────────────┼──────────────────┤');
      if (result.totalAmount !== undefined) {
        const amt = `$${result.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        console.log(`  │ ${'總金額'.padEnd(28)} │ ${amt.padStart(16)} │`);
      }
      if (result.actualRevenue !== undefined) {
        const amt = `$${result.actualRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        console.log(`  │ ${'營業實收'.padEnd(28)} │ ${amt.padStart(16)} │`);
      }
      if (result.totalTransactions !== undefined) {
        console.log(`  │ ${'總筆數'.padEnd(28)} │ ${String(result.totalTransactions).padStart(16)} │`);
      }
      console.log('  └──────────────────────────────┴──────────────────┘');
    }

    console.log('='.repeat(60));
    console.log('');
  }
}

// ==================== 工具函數 ====================

function parseAmount(str: string): number | null {
  const cleaned = str
    .replace(/[$,￥\s]/g, '')
    .replace(/^HK\$/i, '')
    .replace(/^HKD/i, '')
    .replace(/,/g, '')
    .trim();

  const negativeMatch = cleaned.match(/^\(([\d.]+)\)$/);
  if (negativeMatch) return -parseFloat(negativeMatch[1]);

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function mapPaymentName(name: string): string {
  if (PAYMENT_MAP[name]) return PAYMENT_MAP[name];
  for (const [cn, en] of Object.entries(PAYMENT_MAP)) {
    if (name.includes(cn) || cn.includes(name)) return en;
  }
  return `unknown_${name}`;
}

// ==================== 主入口 ====================

async function main() {
  const errors = validateConfig();
  if (errors.length > 0) {
    logError('配置錯誤:');
    errors.forEach(e => logError(`  - ${e}`));
    process.exit(1);
  }

  const reportType = getTargetReport();
  const crawler = new PospalCrawler(isDebugMode(), reportType);
  const result = await crawler.run();
  PospalCrawler.printResult(result);

  if (!result.success) process.exit(1);
}

main().catch(error => {
  logError('未預期的錯誤:', error);
  process.exit(1);
});
