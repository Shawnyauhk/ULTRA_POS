FROM node:22-alpine

WORKDIR /app

# 安裝系統依賴（curl 用於下載 wacli）
RUN apk add --no-cache curl ca-certificates

# 下載並安裝 wacli（從 GitHub releases）
RUN curl -fsSL https://github.com/openclaw/wacli/releases/latest/download/wacli_Linux_x86_64.tar.gz | tar xz -C /usr/local/bin && chmod +x /usr/local/bin/wacli

# 複製依賴文件
COPY package.json package-lock.json ./

# 安裝 Node 依賴
RUN npm install

# 複製源碼
COPY . .

# 構建前端
RUN npm run build

# 暴露端口
EXPOSE 8080

# 啟動服務
CMD ["node", "server.js"]
