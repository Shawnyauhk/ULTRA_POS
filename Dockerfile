FROM node:22-alpine

WORKDIR /app

# 複製依賴文件
COPY package.json package-lock.json ./

# 安裝依賴
RUN npm install

# 複製源碼
COPY . .

# 構建前端
RUN npm run build

# 暴露端口
EXPOSE 8080

# 啟動服務
CMD ["node", "server.js"]
