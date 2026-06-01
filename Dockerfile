FROM node:22-alpine

WORKDIR /app

# 安裝系統依賴（curl 用於下載 wacli）
RUN apk add --no-cache curl ca-certificates

# 下載並安裝 wacli（從 GitHub releases）
RUN curl -fsSLo /tmp/wacli.tar.gz https://github.com/openclaw/wacli/releases/download/v0.11.0/wacli_0.11.0_linux_amd64.tar.gz \
  && tar xzf /tmp/wacli.tar.gz -C /usr/local/bin \
  && chmod +x /usr/local/bin/wacli \
  && rm /tmp/wacli.tar.gz

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
