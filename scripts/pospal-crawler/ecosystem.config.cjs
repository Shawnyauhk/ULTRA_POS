module.exports = {
  apps: [{
    name: 'pospal-crawler',
    script: './scheduler-launcher.cjs',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      RESTAURANT_ID: '00000000-0000-0000-0000-000000000001',
    },
    // 行程崩潰時自動重啟
    autorestart: true,
    // 日誌設定
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    merge_logs: true,
  }],
};
