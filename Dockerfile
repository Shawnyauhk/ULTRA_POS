# Render build cache refresh 2026-06-02
FROM node:22-alpine

WORKDIR /app

# 安裝系統依賴（含 Chromium for Puppeteer）
RUN apk add --no-cache curl ca-certificates chromium nss freetype freetype-dev harfbuzz ca-certificates libpng-dev

# 下載並安裝 wacli（WhatsApp CLI）
RUN curl -fsSLo /tmp/wacli.tar.gz https://github.com/openclaw/wacli/releases/download/v0.11.0/wacli_0.11.0_linux_amd64.tar.gz \
  && tar xzf /tmp/wacli.tar.gz -C /usr/local/bin \
  && chmod +x /usr/local/bin/wacli \
  && rm /tmp/wacli.tar.gz

# 複製依賴文件
COPY package.json package-lock.json ./
COPY scripts/pospal-crawler/package.json ./scripts/pospal-crawler/

# 安裝 Node 依賴（含 puppeteer + pospal-crawler）
RUN npm install
RUN cd scripts/pospal-crawler && npm install

# Puppeteer 使用系統 Chromium 而非自行下載
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

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
