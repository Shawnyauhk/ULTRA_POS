# Render build cache refresh 2026-06-02
FROM node:22-slim

WORKDIR /app

# 安裝系統依賴（含 Chromium for Puppeteer + glibc 支援 wacli）
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    chromium \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdbus-1-3 libgdk-pixbuf2.0-0 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 \
    libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    libfreetype6 libharfbuzz0b libpng-dev \
    && rm -rf /var/lib/apt/lists/*

# 下載並安裝 wacli（WhatsApp CLI）
RUN curl -fsSLo /tmp/wacli.tar.gz https://github.com/openclaw/wacli/releases/download/v0.11.0/wacli_0.11.0_linux_amd64.tar.gz \
  && tar xzf /tmp/wacli.tar.gz -C /usr/local/bin \
  && chmod +x /usr/local/bin/wacli \
  && rm /tmp/wacli.tar.gz

# 初始化 wacli 默認帳戶（防止運行時報 "account config not found"）
RUN wacli accounts add default 2>/dev/null; exit 0

# wacli 存儲目錄（用環境變數指定，確保位置固定）
ENV WACLI_STORE_DIR=/app/.wacli

# 複製依賴文件
COPY package.json package-lock.json ./
COPY scripts/pospal-crawler/package.json ./scripts/pospal-crawler/

# 安裝 Node 依賴（含 puppeteer + pospal-crawler）
RUN npm install
RUN cd scripts/pospal-crawler && npm install

# Puppeteer 使用系統 Chromium 而非自行下載
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium

# 複製源碼
COPY . .

# ===== 在建置時注入 VITE 環境變數（Render Dashboard 會提供）=====
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# 構建前端
RUN npm run build

# 暴露端口
EXPOSE 8080

# 啟動服務
CMD ["node", "server.js"]
