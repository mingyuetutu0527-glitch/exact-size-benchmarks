/* Attach to an already-running headless Chrome and run bench.html's runAll().
 * Usage: node _bl/run.js <port> <out.csv>
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.argv[2] || '9444';
const OUT = process.argv[3] || path.resolve(__dirname, 'bench.csv');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(d)); }).on('error', reject);
  });
}

(async () => {
  const list = JSON.parse(await get('http://127.0.0.1:' + PORT + '/json/list'));
  const target = list.find(t => t.type === 'page' && t.url.includes('bench.html'));
  if (!target) throw new Error('bench page not found; urls=' + list.map(t => t.url).join(' | '));

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
  };

  await send('Runtime.enable');
  const t0 = Date.now();
  const res = await send('Runtime.evaluate', {
    expression: 'runAll()', awaitPromise: true, returnByValue: true, timeout: 3600000
  });
  if (res.exceptionDetails) console.error('EXC ' + JSON.stringify(res.exceptionDetails).slice(0, 600));
  const csv = res.result && res.result.value;
  if (!csv) throw new Error('no csv');
  fs.writeFileSync(OUT, csv + '\n', 'utf8');
  console.log('wrote ' + OUT + ' rows=' + (csv.split('\n').length - 1) + ' in ' + Math.round((Date.now() - t0) / 1000) + 's');
  ws.close();
  process.exit(0);
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
