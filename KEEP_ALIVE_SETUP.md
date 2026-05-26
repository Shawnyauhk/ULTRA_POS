# ULTRA POS - Ping 保活設定指南

## 為什麼需要保活？

Render 免費版有 **15 分鐘無訪問自動休眠** 機制。休眠後，再次訪問需要等待 30-60 秒喚醒。
使用外部定時 Ping 服務，可以讓伺服器**永遠保持活躍，永不休眠**。

## 已實作部分

在 `server.js` 已添加：
- `GET /api/health` — 健康檢查端點，返回服務狀態、運行時間、時間戳
- 綁定 `0.0.0.0` — 確保 Render 及容器環境正常監聽

## Cron-job.org 設定（推薦，完全免費）

### 步驟 1：註冊

1. 前往 https://cron-job.org
2. 點擊 **Sign Up** 註冊帳戶（Email + 密碼）
3. 驗證 Email 後登入

### 步驟 2：創建定時任務

1. 登入後點擊 **Cronjobs** → **Create Cronjob**
2. 填寫以下設定：

| 設定項目 | 填寫內容 |
|---------|---------|
| **Title** | ULTRA POS Keep Alive |
| **URL** | `https://你的應用名稱.onrender.com/api/health` |
| **Schedule** | 每 5 分鐘（Every 5 minutes） |
| **Request Method** | GET |

3. 點擊 **Create** 儲存

### 步驟 3：驗證

- 在 Cronjob 列表中，你應該看到狀態為 **Active** 的任務
- 點擊任務可查看執行日誌
- 每 5 分鐘一次請求 = 每月約 8640 次請求，完全在免費額度內

## 替代方案：UptimeRobot（備選）

如果 cron-job.org 有問題，可使用 UptimeRobot：

1. 前往 https://uptimerobot.com
2. 註冊免費帳戶（可監控 50 個端點）
3. 添加監控：
   - Monitor Type: HTTP(s)
   - URL: `https://你的應用名稱.onrender.com/api/health`
   - Interval: 5 分鐘
   - 儲存

## 驗證保活是否正常

部署完成後，在瀏覽器直接訪問：
```
https://你的應用名稱.onrender.com/api/health
```

預期回應：
```json
{
  "success": true,
  "status": "alive",
  "uptime": 123.45,
  "timestamp": "2026-05-26T08:00:00.000Z"
}
```

## 常見問題

### Q: 用程式自保活可以嗎？
A: 不行。Render 休眠後程式完全停止，`setInterval` 不會執行。
**必須使用外部服務**（如 cron-job.org）才能喚醒。

### Q: 14 分鐘 Ping 一次夠嗎？
A: 建議 **5 分鐘** 最安全。Render 的休眠檢測是 15 分鐘，
5 分鐘間隔確保有足夠冗餘。
