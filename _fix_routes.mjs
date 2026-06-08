import { readFileSync, writeFileSync } from 'fs';
let c = readFileSync('server.js', 'utf8');
c = c.replace(/app\.get\('\/api\//g, "app.all('/api/");
writeFileSync('server.js', c, 'utf8');
console.log('Done');
