#!/usr/bin/env node
/**
 * Render 日志查看工具 (v2)
 * 用法:
 *   node scripts/render-logs-v2.cjs <API_KEY> [SERVICE_ID] [--filter X] [--since N] [--follow]
 */

const https = require('https');

const args = process.argv.slice(2);
const follow = args.includes('--follow');
const sinceIdx = args.indexOf('--since');
const filterIdx = args.indexOf('--filter');
const since = sinceIdx > -1 ? parseInt(args[sinceIdx + 1]) : 10;
const filter = filterIdx > -1 ? args[filterIdx + 1] : null;

const positional = args.filter(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
const [apiKey, serviceId] = positional;

if (!apiKey || !serviceId) {
  console.error('❌ 用法: node scripts/render-logs-v2.cjs <API_KEY> <SERVICE_ID> [--filter X] [--since 10] [--follow]');
  process.exit(1);
}

function request(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.render.com',
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
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchLogs({ ownerId } = {}) {
  const startTime = new Date(Date.now() - since * 60 * 1000).toISOString();
  // Render API: ?ownerId=ws-xxx&resource=svc-xxx&startTime=&direction=backward
  const path = `/logs?ownerId=${ownerId}&resource=${serviceId}&startTime=${encodeURIComponent(startTime)}&limit=100&direction=backward${filter ? `&text=${encodeURIComponent('*' + filter + '*')}` : ''}`;
  const data = await request(path);

  // 响应结构: { logs: [...], hasMore: bool, nextCursor: ... }
  const logs = data?.logs || data;
  if (Array.isArray(logs)) {
    // backward 模式下返回的是最新的在前
    logs.reverse().forEach(log => {
      const time = new Date(log.timestamp || log.createdAt).toLocaleTimeString('zh-HK');
      const text = log.text || log.message || '';
      if (filter && !text.includes(filter)) return;
      console.log(`[${time}] ${text.trim()}`);
    });
  } else {
    console.log(JSON.stringify(data, null, 2).slice(0, 2000));
  }
}

(async () => {
  try {
    // 自动获取 ownerId
    const svcData = await request(`/services/${serviceId}`);
    const ownerId = svcData?.owner?.id || svcData?.ownerId || process.env.RENDER_OWNER_ID;
    if (!ownerId) {
      console.error('❌ 无法获取 ownerId，请设置 RENDER_OWNER_ID 环境变量');
      console.error('   或手动从服务响应中获取');
      process.exit(1);
    }
    console.log(`📋 查看 ${serviceId} (owner: ${ownerId}) 最近 ${since} 分钟的日志 (filter: ${filter || 'none'})...\n`);

    const fetchWithOwner = () => fetchLogs({ ownerId });
    await fetchWithOwner();
    if (follow) {
      console.log('\n⏳ 持续跟踪 (Ctrl+C 退出)...\n');
      setInterval(async () => {
        try {
          console.log(`\n--- ${new Date().toLocaleTimeString('zh-HK')} ---`);
          await fetchWithOwner();
        } catch (e) { console.error(e.message); }
      }, 5000);
    }
  } catch (e) {
    console.error('❌ 请求失败:', e.message);
    process.exit(1);
  }
})();
