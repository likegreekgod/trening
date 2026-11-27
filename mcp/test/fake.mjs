// Atrapa Google (token) i Apps Script (/exec) do testu całego łańcucha: node test/fake.mjs 8798
import http from 'node:http';
const port = Number(process.argv[2] || 8798), b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const idt = () => b64({ alg: 'none' }) + '.' + b64({ email: 'trener@example.com', email_verified: true, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'test.apps.googleusercontent.com' }) + '.sig';
const calls = [];
http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const send = o => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/token') { const p = new URLSearchParams(body); calls.push(['token', p.get('grant_type')]); return send({ id_token: idt(), refresh_token: p.get('grant_type') === 'authorization_code' ? 'rt-1' : undefined }); }
    if (req.url === '/exec') { const j = JSON.parse(body); calls.push(['exec', j.fn, j.src, j.token ? 'token' : 'brak']);
      if (j.fn === 'trPulpit') return send({ ok: true, result: { today: '2026-11-27', clients: [], dzis: [{ id: 'ania', name: 'Ania', week: 3, day: 'B', title: 'Dół', st: 'wait', sets: 10, done: 0 }], agent: [], agentAuto: [], blocks: [], replies: [] } });
      if (j.fn === 'trPrzesun') return send({ ok: true, result: { date: j.args[1].date, n: 4 } });
      return send({ ok: false, error: 'Nieznana funkcja: ' + j.fn }); }
    if (req.url === '/calls') return send(calls);
    res.writeHead(404); res.end();
  });
}).listen(port);
