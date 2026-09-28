/**
 * Does tcp_slow_start_after_idle actually cost anything here?
 *
 *   node test/idle-test.mjs https://app.theautoloom.in <asset-path>
 *
 * The earlier benchmarks fired requests back to back, which is exactly the
 * case this setting does not touch. It matters when a connection sits idle —
 * somebody reading a page — and the kernel throws away the congestion window
 * it had learned. The next click then re-ramps from scratch, which at 318ms is
 * several visible round trips.
 *
 * So: warm one connection, hold it open doing nothing, then pull a real asset
 * down it and time that. Compared against the same pull with no pause.
 */
import http2 from 'node:http2';

const origin = process.argv[2] ?? 'https://app.theautoloom.in';
const asset = process.argv[3];
if (!asset) {
  console.error('usage: node test/idle-test.mjs <origin> <asset-path>');
  process.exit(2);
}

function fetchOn(session, path) {
  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint();
    let bytes = 0;
    const req = session.request({ ':path': path });
    req.on('data', (c) => (bytes += c.length));
    req.on('end', () => resolve({ ms: Number(process.hrtime.bigint() - started) / 1e6, bytes }));
    req.on('error', reject);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(idleSeconds) {
  const session = http2.connect(origin);
  await new Promise((r, j) => { session.once('connect', r); session.once('error', j); });
  await fetchOn(session, '/');            // warm the window
  if (idleSeconds) await sleep(idleSeconds * 1000);
  const got = await fetchOn(session, asset);
  session.close();
  return got;
}

for (const idle of [0, 5, 10]) {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    try {
      const r = await run(idle);
      runs.push(r.ms);
    } catch (e) {
      console.log(`  idle ${idle}s: failed — ${String(e).slice(0, 60)}`);
    }
    await sleep(500);
  }
  if (runs.length) {
    const med = runs.sort((a, b) => a - b)[Math.floor(runs.length / 2)];
    console.log(`  after ${String(idle).padStart(2)}s idle: ${runs.map((m) => Math.round(m) + 'ms').join('  ')}   median ${Math.round(med)}ms`);
  }
}
