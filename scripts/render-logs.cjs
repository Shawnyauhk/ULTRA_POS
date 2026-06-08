#!/usr/bin/env node
/**
 * Render 日志查看工具
 *
 * 用法：
 *   node scripts/render-logs.cjs <API_KEY> [SERVICE_ID] [options]
 *
 * 步骤：
 *   1. 登录 https://dashboard.render.com/u/api
 *   2. 创建 API Key 并复制
 *   3. 找到您的 Service ID (在 dashboard URL 中 srv-xxxxx)
 *   4. 运行: node scripts/render-logs.cjs rnd_xxxxx srv-xxxxx --follow
 *
 * 选项：
 *   --follow    持续跟踪日志（每 5 秒刷新）
 *   --since N   最近 N 分钟的日志（默认 10）
 *   --filter X  过滤包含 X 的日志
 *   --list      列出所有服务
 *   --deploys   列出部署历史
 */

const https = require('https');

const API_BASE = 'api.render.com';
const args = process.argv.slice(2);
const follow = args.includes('--follow');
const listMode = args.includes('--list');
const deploysMode = args.includes('--deploys');
const sinceIdx = args.indexOf('--since');
const filterIdx = args.indexOf('--filter');
const since = sinceIdx > -1 ? parseInt(args[sinceIdx + 1]) : 10;
const filter = filterIdx > -1 ? args[filterIdx + 1] : null;

const positional = args.filter(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
const [apiKey, serviceId] = positional;

if (!apiKey) {
  console.error('❌ 请提供 API Key');
  console.error('   获取方式: https://dashboard.render.com/u/api');
  console.error('   用法: node scripts/render-logs.cjs <API_KEY> [SERVICE_ID]');
  process.exit(1);
}

function request(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: API_BASE,
      path: '/v1' + path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function listServices() {
  console.log('📋 列出所有服务...\n');
  const data = await request('/services?limit=20');
  if (Array.isArray(data)) {
    data.forEach(s => {
      console.log(`  ${s.id.padEnd(35)} ${s.name} (${s.type})`);
      console.log(`  ${''.padEnd(35)} URL: ${s.serviceDetails?.url || 'N/A'}`);
    });
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

async function listDeploys() {
  if (!serviceId) {
    console.error('❌ 需要提供 SERVICE_ID');
    process.exit(1);
  }
  console.log(`📋 服务 ${serviceId} 的部署历史...\n`);
  const data = await request(`/services/${serviceId}/deploys?limit=10`);
  if (Array.isArray(data)) {
    data.forEach(d => {
      const time = new Date(d.createdAt).toLocaleString('zh-HK');
      const status = d.status === 'live' ? '✅' : d.status === 'build_failed' ? '❌' : '⏳';
      console.log(`  ${status} ${d.id}  ${time}  ${d.status}`);
    });
  }
}

async function fetchLogs() {
  if (!serviceId) {
    console.error('❌ 需要提供 SERVICE_ID');
    process.exit(1);
  }
  const startTime = new Date(Date.now() - since * 60 * 1000).toISOString();
  const path = `/logs?startTime=${encodeURIComponent(startTime)}&resource=${serviceId}&limit=200`;
  const data = await request(path);
  if (Array.isArray(data)) {
    data.forEach(log => {
      const time = new Date(log.timestamp).toLocaleTimeString('zh-HK');
      const text = log.text || '';
      if (filter && !text.includes(filter)) return;
      console.log(`[${time}] ${text}`);
    });
  } else if (data && data.logs) {
    data.logs.forEach(log => {
      const time = new Date(log.timestamp).toLocaleTimeString('zh-HK');
      const text = log.text || log.message || '';
      if (filter && !text.includes(filter)) return;
      console.log(`[${time}] ${text}`);
    });
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

(async () => {
  try {
    if (listMode) {
      await listServices();
    } else if (deploysMode) {
      await listDeploys();
    } else {
      await fetchLogs();
      if (follow) {
        console.log('\n⏳ 持续跟踪日志 (Ctrl+C 退出)...\n');
        setInterval(async () => {
          console.log(`\n--- ${new Date().toLocaleTimeString('zh-HK')} ---`);
          try { await fetchLogs(); } catch (e) { console.error(e.message); }
        }, 5000);
      }
    }
  } catch (e) {
    console.error('❌ 请求失败:', e.message);
    process.exit(1);
  }
})();
