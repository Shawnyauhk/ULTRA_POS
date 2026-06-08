import https from 'https';

const envVars = [
  { key: 'VITE_NVIDIA_NIM_API_KEY', value: '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' },
  { key: 'VITE_NVIDIA_NIM_MODEL', value: 'meta/llama-3.2-11b-vision-instruct' },
  { key: 'VITE_SUPABASE_URL', value: 'https://amiceplfaeofaofoveun.supabase.co' },
  { key: 'VITE_SUPABASE_ANON_KEY', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtaWNlcGxmYWVvZmFvZm92ZXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMjQ4ODksImV4cCI6MjA5MzgwMDg4OX0.XdDhi2eGCcMthUpoueCktsxaTV-t5z69iQZUi3t1xis' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtaWNlcGxmYWVvZmFvZm92ZXVuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODIyNDg4OSwiZXhwIjoyMDkzODAwODg5fQ.e9AZ-Ak_FGcETLSYr0Dqz2UY0tru7NFt3Fl5IuAtZQ4' },
  { key: 'POSPAL_USERNAME', value: 'kim3409' },
  { key: 'POSPAL_PASSWORD', value: '520520a' },
  { key: 'POSPAL_STORE_NAME', value: '家傳芋曉' },
  { key: 'NODE_ENV', value: 'production' },
  { key: 'PORT', value: '3001' }
];

const data = JSON.stringify(envVars);

const options = {
  hostname: 'api.render.com',
  port: 443,
  path: '/v1/services/srv-d8eiq1sp3tds738kin8g/env-vars',
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer rnd_Fc7YvGi4nFYY1EdrB3VXdvcOz7rQ',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', body);
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.write(data);
req.end();
