#!/usr/bin/env node
/**
 * Z-Score Time Matrix — all window frequencies
 */

const Z_BUCKET_MS = 2_000;
const Z_HEAT_COLS = 48;

const WINDOWS = {
  "5s": 5_000,
  "30s": 30_000,
  "5m": 300_000,
  "1h": 3_600_000,
  "1d": 86_400_000,
};

function recordZBucket(row, z1, ts) {
  const bucketT = Math.floor(ts / Z_BUCKET_MS) * Z_BUCKET_MS;
  const val = Math.abs(z1 || 0);
  let maxT = 0;
  for (const t of row.keys()) if (t > maxT) maxT = t;
  if (bucketT < maxT) return;
  row.set(bucketT, { t: bucketT, v: val });
}

function zRowInWindow(row, windowMs, now) {
  const cutoff = now - windowMs;
  const out = [];
  for (const p of row.values()) if (p.t >= cutoff) out.push(p);
  out.sort((a, b) => a.t - b.t);
  return out;
}

function sampleZHeatRow(series, axis, cols = Z_HEAT_COLS) {
  const values = new Array(cols).fill(null);
  const sorted = [...(series || [])].sort((a, b) => a.t - b.t);
  if (!sorted.length) return values;

  const slotMs = axis.windowMs / cols;
  const endSlot = Math.floor(axis.tEnd / slotMs);
  const firstSlot = endSlot - cols + 1;

  for (let ci = 0; ci < cols; ci++) {
    const slotStart = (firstSlot + ci) * slotMs;
    const slotEnd = slotStart + slotMs;
    if (slotEnd <= axis.tStart || slotStart >= axis.tEnd) continue;
    let v = null;
    for (const p of sorted) {
      if (p.t < axis.tStart) continue;
      if (p.t < slotEnd) v = p.v;
      else break;
    }
    values[ci] = v;
  }
  return values;
}

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed += 1; console.log(`  ✓ ${msg}`); }
  else { failed += 1; console.error(`  ✗ ${msg}`); }
}

function seedRow(row, now, windowMs) {
  const start = now - windowMs;
  for (let t = start + Z_BUCKET_MS; t < now; t += Z_BUCKET_MS * 3) {
    recordZBucket(row, 0.3 + (t % 7) * 0.1, t);
  }
  recordZBucket(row, 4.5, now - Math.floor(windowMs * 0.35));
}

console.log("\n=== past stable within same wall slot (all windows) ===\n");
for (const [label, windowMs] of Object.entries(WINDOWS)) {
  const slotMs = windowMs / Z_HEAT_COLS;
  const now = 20_000_000;
  const row = new Map();
  seedRow(row, now, windowMs);
  const series = zRowInWindow(row, windowMs, now);

  const axis1 = { tStart: now - windowMs, tEnd: now, windowMs };
  const s1 = sampleZHeatRow(series, axis1);

  const advance = Math.min(1_000, Math.floor(slotMs / 4));
  const now2 = now + advance;
  if (Math.floor(now2 / slotMs) !== Math.floor(now / slotMs)) {
    console.log(`  ~ ${label}: skipped (advance crosses slot boundary)`);
    continue;
  }

  const series2 = zRowInWindow(row, windowMs, now2);
  const axis2 = { tStart: now2 - windowMs, tEnd: now2, windowMs };
  const s2 = sampleZHeatRow(series2, axis2);

  const past1 = s1.slice(0, -2);
  const past2 = s2.slice(0, -2);
  assert(JSON.stringify(past1) === JSON.stringify(past2), `${label}: past columns frozen within wall slot`);
}

console.log("\n=== hot spike scrolls left (5m) ===\n");
{
  const windowMs = WINDOWS["5m"];
  const hotT = 30_000_000;
  const row = new Map();
  recordZBucket(row, 0.2, hotT - 90_000);
  recordZBucket(row, 5.0, hotT);
  const now1 = hotT + 45_000;
  const axis1 = { tStart: now1 - windowMs, tEnd: now1, windowMs };
  const s1 = sampleZHeatRow(zRowInWindow(row, windowMs, now1), axis1);
  const c1 = s1.indexOf(5.0);

  const now2 = now1 + 12_500;
  const axis2 = { tStart: now2 - windowMs, tEnd: now2, windowMs };
  const s2 = sampleZHeatRow(zRowInWindow(row, windowMs, now2), axis2);
  const c2 = s2.indexOf(5.0);

  assert(c1 >= 0 && c2 >= 0, "5m: hot cell visible");
  assert(c2 < c1, "5m: hot cell moved left");
  assert(s2[c2] === 5.0, "5m: hot value unchanged");
}

console.log("\n=== closed engine buckets immutable ===\n");
{
  const row = new Map();
  const base = 40_000_000;
  recordZBucket(row, 1.0, base);
  recordZBucket(row, 2.0, base + Z_BUCKET_MS);
  const snap = new Map([...row.entries()]);
  recordZBucket(row, 9.0, base + Z_BUCKET_MS + 100);
  for (const [t, p] of snap) assert(row.get(t).v === p.v, `bucket ${t} frozen`);
}

console.log(`\nPassed: ${passed}  Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);