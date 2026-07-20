/**
 * Cross-Market Anomaly Engine
 *
 * Formulas:
 *   z-score(x) = (x - μ) / σ  over rolling window W
 *   premium% = (localUsd - refUsd) / refUsd × 100
 *   deviationσ = (venueUsd - vwapUsd) / σ_vwap
 *   anomaly if: |z_1m| ≥ zThresh OR |premiumΔ_60s| ≥ premMoveThresh
 *              OR |deviationσ| ≥ devSigmaThreshold
 *
 * Propagation:
 *   Cluster events within [clusterMin, clusterMax] seconds.
 *   origin = earliest timestamp in cluster.
 *   delay(origin → venue) = t_venue - t_origin (seconds).
 *   spreadVelocity = median(delays) across followers.
 */

const XMEngine = (() => {
  const DEFAULTS = {
    zThreshold: 2.0,
    premMoveThreshold: 1.5,
    devSigmaThreshold: 2.0,
    clusterMinSec: 10,
    clusterMaxSec: 45,
    alertDedupMs: 300_000,
    historyMax: 20_000,
    historyMaxAgeMs: 86_400_000,
    zTimeBuckets: 24,
    zBucketMs: 2_000,
  };

  const state = {
    venueHistory: new Map(),
    volumeHistory: new Map(),
    premiumHistory: new Map(),
    zTimeMatrix: new Map(),
    events: [],
    alerts: [],
    lastAlertKey: new Map(),
    settings: { ...DEFAULTS },
  };

  function mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function stddev(arr) {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(v) || 0;
  }

  function median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function zScore(value, arr) {
    const σ = stddev(arr);
    if (σ < 1e-9) return 0;
    return (value - mean(arr)) / σ;
  }

  function percentile(arr, p) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const idx = Math.min(s.length - 1, Math.max(0, Math.floor((p / 100) * s.length)));
    return s[idx];
  }

  function pruneByAge(buf, maxAgeMs) {
    const cutoff = Date.now() - maxAgeMs;
    while (buf.length && buf[0].t < cutoff) buf.shift();
  }

  function pushHistory(map, key, point) {
    if (!map.has(key)) map.set(key, []);
    const buf = map.get(key);
    buf.push(point);
    pruneByAge(buf, state.settings.historyMaxAgeMs);
    while (buf.length > state.settings.historyMax) buf.shift();
  }

  function valueAtOrBefore(buf, targetTs) {
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].t <= targetTs) return buf[i].v;
    }
    return buf[0]?.v;
  }

  function returns(buf, steps) {
    if (buf.length <= steps) return [];
    const out = [];
    for (let i = steps; i < buf.length; i++) {
      const a = buf[i - steps]?.v;
      const b = buf[i]?.v;
      if (a > 0 && b > 0) out.push((b - a) / a * 100);
    }
    return out;
  }

  function pruneZRow(row, maxAgeMs, now = Date.now()) {
    const cutoff = now - maxAgeMs;
    for (const t of row.keys()) {
      if (t < cutoff) row.delete(t);
    }
  }

  function recordZBucket(exchange, z1, ts) {
    if (!exchange) return;
    if (!state.zTimeMatrix.has(exchange)) state.zTimeMatrix.set(exchange, new Map());
    const row = state.zTimeMatrix.get(exchange);
    const bucketMs = state.settings.zBucketMs || 2_000;
    const bucketT = Math.floor(ts / bucketMs) * bucketMs;
    const val = Math.abs(z1 || 0);

    let maxT = 0;
    for (const t of row.keys()) {
      if (t > maxT) maxT = t;
    }
    if (bucketT < maxT) return;

    row.set(bucketT, { t: bucketT, v: val });
    pruneZRow(row, state.settings.historyMaxAgeMs, ts);
  }

  function detectVenueAnomalies(venue, priceUsd, ts, changedVenue) {
    const key = venue.exchange || venue;
    const buf = state.venueHistory.get(key) || [];
    const last = buf[buf.length - 1];
    const eps = Math.max(0.05, priceUsd * 1e-7);
    const venueChanged = !changedVenue || changedVenue === key;
    const priceChanged = !last || Math.abs(last.v - priceUsd) > eps;

    if (!venueChanged || !priceChanged) {
      return {
        key,
        z1: venue.z1m ?? 0,
        z5: venue.z5m ?? 0,
        anomalies: [],
      };
    }

    pushHistory(state.venueHistory, key, { t: ts, v: priceUsd });
    const r1 = returns(buf, 1);
    const r5 = returns(buf, 5);
    const z1 = r1.length ? zScore(r1[r1.length - 1], r1.slice(-30)) : 0;
    const z5 = r5.length ? zScore(r5[r5.length - 1], r5.slice(-12)) : 0;
    const anomalies = [];
    const { zThreshold } = state.settings;

    if (venue.volume != null && venue.volume > 0) {
      pushHistory(state.volumeHistory, key, { t: ts, v: venue.volume });
      const vbuf = state.volumeHistory.get(key) || [];
      const volReturns = returns(vbuf, 1);
      if (volReturns.length) {
        const vz = zScore(volReturns[volReturns.length - 1], volReturns.slice(-20));
        if (Math.abs(vz) >= zThreshold) {
          anomalies.push({ type: "volume_burst", z: vz, severity: Math.abs(vz) >= 3 ? "high" : "medium" });
        }
      }
    }

    if (Math.abs(z1) >= zThreshold) {
      anomalies.push({ type: "return_1m", z: z1, severity: Math.abs(z1) >= 3 ? "high" : "medium" });
    }
    if (Math.abs(z5) >= zThreshold) {
      anomalies.push({ type: "return_5m", z: z5, severity: Math.abs(z5) >= 3 ? "high" : "medium" });
    }
    recordZBucket(key, z1, ts);
    return { key, z1, z5, anomalies };
  }

  function detectPremiumAnomalies(premiums, refUsd, ts) {
    const out = [];
    Object.entries(premiums || {}).forEach(([id, p]) => {
      if (!p || p.pct == null) return;
      pushHistory(state.premiumHistory, id, { t: ts, v: p.pct });
      const buf = state.premiumHistory.get(id) || [];
      if (buf.length < 2) return;

      const past = valueAtOrBefore(buf, ts - 60_000);
      const now = buf[buf.length - 1].v;
      const delta60 = past != null ? now - past : 0;

      const deltas = [];
      for (let i = 1; i < buf.length; i++) deltas.push(buf[i].v - buf[i - 1].v);
      const p95 = percentile(deltas.map(Math.abs), 95);
      const hitMove = Math.abs(delta60) >= state.settings.premMoveThreshold;
      const hitP95 = Math.abs(delta60) >= p95 && p95 > 0.3;

      if (hitMove || hitP95) {
        out.push({
          type: id === "upbit" || id === "bithumb"
            ? "kimchi_premium"
            : id === "coinbase"
              ? "coinbase_premium"
              : "premium_spike",
          premiumId: id,
          label: p.label,
          pct: p.pct,
          delta60,
          severity: Math.abs(delta60) >= 2.5 ? "high" : "medium",
        });
      }
    });
    return out;
  }

  function venuePremiumId(exchange) {
    return String(exchange || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  }

  function premiumDelta60(premiumId, ts) {
    const buf = state.premiumHistory.get(premiumId) || [];
    if (buf.length < 2) return 0;
    const past = valueAtOrBefore(buf, ts - 60_000);
    const now = buf[buf.length - 1].v;
    return past != null ? now - past : 0;
  }

  function attachAnomalyScores(venues, snap, ts) {
    const vwap = snap.vwapUsd || snap.referenceUsd;
    const usd = venues.map((v) => v.priceUsd).filter((x) => x > 0);
    const σ = stddev(usd);
    const { premMoveThreshold } = state.settings;

    venues.forEach((v) => {
      if (!v?.priceUsd) {
        v.devSigma = 0;
        v.premDelta60 = 0;
        v.anomalyScore = 0;
        return;
      }
      const zCombined = Math.max(Math.abs(v.z1m || 0), Math.abs(v.z5m || 0));
      const devSigma = σ > 0 ? (v.priceUsd - vwap) / σ : 0;
      v.devSigma = Math.round(devSigma * 100) / 100;

      const premId = venuePremiumId(v.exchange);
      const delta60 = premiumDelta60(premId, ts);
      v.premDelta60 = Math.round(delta60 * 100) / 100;
      const premSpike = Math.abs(delta60) / (premMoveThreshold || 1.5);

      v.anomalyScore = Math.round(Math.max(zCombined, premSpike, Math.abs(devSigma)) * 100) / 100;
    });
  }

  function detectCrossDeviation(venues, vwapUsd) {
    if (!vwapUsd) return [];
    const usd = venues.map((v) => v.priceUsd).filter((x) => x > 0);
    const σ = stddev(usd);
    const out = [];
    venues.forEach((v) => {
      if (!v.priceUsd) return;
      const devσ = σ > 0 ? (v.priceUsd - vwapUsd) / σ : 0;
      if (Math.abs(devσ) >= state.settings.devSigmaThreshold) {
        out.push({
          type: "cross_divergence",
          exchange: v.exchange,
          devSigma: devσ,
          priceUsd: v.priceUsd,
          severity: Math.abs(devσ) >= 3 ? "high" : "medium",
        });
      }
    });
    return out;
  }

  function logEvent(evt) {
    state.events.push(evt);
    while (state.events.length > 500) state.events.shift();
  }

  function clusterPropagation() {
    const now = Date.now();
    const windowMs = state.settings.clusterMaxSec * 1000;
    const recent = state.events.filter((e) => now - e.ts <= windowMs);
    if (recent.length < 2) return null;
    recent.sort((a, b) => a.ts - b.ts);
    const origin = recent[0];
    const edges = [];
    recent.slice(1).forEach((e) => {
      const delaySec = (e.ts - origin.ts) / 1000;
      if (delaySec >= state.settings.clusterMinSec) {
        edges.push({
          from: origin.venue || origin.premiumId || "origin",
          to: e.venue || e.premiumId || "?",
          delaySec: Math.round(delaySec),
        });
      }
    });
    if (!edges.length) return null;
    const delays = edges.map((e) => e.delaySec).filter((d) => d > 0);
    const avgDelay = delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : 0;
    const spreadVelocity = delays.length ? Math.round(median(delays)) : 0;
    return {
      origin: origin.venue || origin.premiumId || origin.type,
      edges,
      avgDelaySec: Math.round(avgDelay),
      spreadVelocity,
      eventCount: recent.length,
    };
  }

  function shouldAlert(key) {
    const last = state.lastAlertKey.get(key) || 0;
    if (Date.now() - last < state.settings.alertDedupMs) return false;
    state.lastAlertKey.set(key, Date.now());
    return true;
  }

  function pushAlert(alert) {
    state.alerts.unshift(alert);
    while (state.alerts.length > 80) state.alerts.pop();
  }

  function ingestSnapshot(snap, opts = {}) {
    const ts = Date.now();
    const venues = snap.venues || [];
    const ref = snap.referenceUsd;
    const vwap = snap.vwapUsd || ref;
    const changedVenue = opts.changedVenue || null;
    const newEvents = [];
    const newAlerts = [];

    venues.forEach((v) => {
      if (!v.priceUsd) return;
      const { key, z1, z5, anomalies } = detectVenueAnomalies(v, v.priceUsd, ts, changedVenue);
      v.z1m = Math.round(z1 * 100) / 100;
      v.z5m = Math.round(z5 * 100) / 100;
      anomalies.forEach((a) => {
        const evt = { ts, venue: key, type: a.type, z: a.z, severity: a.severity };
        logEvent(evt);
        newEvents.push(evt);
        const akey = `${key}:${a.type}`;
        if (a.severity === "high" && shouldAlert(akey)) {
          const alert = {
            ts, severity: a.severity, title: `${key} ${a.type.replace(/_/g, " ")}`,
            body: `z=${a.z.toFixed(2)} · $${v.priceUsd?.toLocaleString()}`,
            venue: key, type: a.type,
          };
          pushAlert(alert);
          newAlerts.push(alert);
        }
      });
    });

    const premAnoms = detectPremiumAnomalies(snap.premiums, ref, ts);
    premAnoms.forEach((a) => {
      const evt = { ts, premiumId: a.premiumId, venue: a.label, type: a.type, delta: a.delta60, severity: a.severity };
      logEvent(evt);
      newEvents.push(evt);
      const akey = `prem:${a.premiumId}`;
      if (a.severity === "high" && shouldAlert(akey)) {
        const alert = {
          ts, severity: a.severity, title: `${a.label} premium spike`,
          body: `${a.pct >= 0 ? "+" : ""}${a.pct?.toFixed(2)}% · Δ60s ${a.delta60 >= 0 ? "+" : ""}${a.delta60?.toFixed(2)}%`,
          venue: a.premiumId, type: a.type,
        };
        pushAlert(alert);
        newAlerts.push(alert);
      }
    });

    detectCrossDeviation(venues, vwap).forEach((a) => {
      const evt = { ts, venue: a.exchange, type: a.type, devSigma: a.devSigma, severity: a.severity };
      logEvent(evt);
      newEvents.push(evt);
      const akey = `${a.exchange}:cross_divergence`;
      if (a.severity === "high" && shouldAlert(akey)) {
        const alert = {
          ts, severity: a.severity, title: `${a.exchange} cross divergence`,
          body: `devσ=${a.devSigma.toFixed(2)} · $${a.priceUsd?.toLocaleString()}`,
          venue: a.exchange, type: a.type,
        };
        pushAlert(alert);
        newAlerts.push(alert);
      }
    });

    attachAnomalyScores(venues, snap, ts);

    const propagation = clusterPropagation();
    return {
      venues,
      propagation,
      newEvents,
      newAlerts,
      alerts: state.alerts,
      events: state.events.slice(-40),
    };
  }

  function premiumSparkline(id, n = 24) {
    const buf = state.premiumHistory.get(id) || [];
    return buf.slice(-n).map((p) => p.v);
  }

  function premiumSeriesIds() {
    return [...state.premiumHistory.keys()].sort();
  }

  function filterWindow(buf, windowMs) {
    if (!windowMs || windowMs <= 0) return buf;
    const cutoff = Date.now() - windowMs;
    const timed = buf.filter((p) => typeof p === "object" && p != null && p.t != null);
    if (!timed.length) return buf.slice(-Math.min(buf.length, 120));
    return timed.filter((p) => p.t >= cutoff);
  }

  function zRowValues(row) {
    return row.map((p) => (typeof p === "object" && p != null ? p.v : p));
  }

  function premiumTimeline(ids, windowMs) {
    const want = ids || premiumSeriesIds();
    const out = {};
    want.forEach((id) => {
      const buf = filterWindow(state.premiumHistory.get(id) || [], windowMs);
      if (buf.length) out[id] = buf.map((p) => ({ t: p.t, v: p.v }));
    });
    return out;
  }

  function zRowInWindow(row, windowMs, now = Date.now()) {
    const cutoff = now - windowMs;
    const out = [];
    for (const p of row.values()) {
      if (p.t >= cutoff) out.push(p);
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  function zTimeMatrix(windowMs, now = Date.now()) {
    const out = {};
    state.zTimeMatrix.forEach((row, ex) => {
      const filtered = zRowInWindow(row, windowMs, now);
      if (filtered.length) out[ex] = zRowValues(filtered);
    });
    return out;
  }

  function zTimeMatrixTimed(windowMs, now = Date.now()) {
    const out = {};
    state.zTimeMatrix.forEach((row, ex) => {
      const filtered = zRowInWindow(row, windowMs, now);
      if (filtered.length) out[ex] = filtered.map((p) => ({ t: p.t, v: p.v }));
    });
    return out;
  }

  function setSettings(next) {
    state.settings = { ...state.settings, ...next };
  }

  function getSettings() {
    return { ...state.settings };
  }

  return {
    ingestSnapshot,
    premiumSparkline,
    premiumTimeline,
    premiumSeriesIds,
    zTimeMatrix,
    zTimeMatrixTimed,
    setSettings,
    getSettings,
    getAlerts: () => state.alerts,
    getEvents: () => state.events,
  };
})();

window.XMEngine = XMEngine;