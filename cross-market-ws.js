/** Multi-venue WebSocket overlay for Cross-Market monitor */

const XMWS = (() => {
  const STALE_MS = 30_000;
  const sockets = new Map();
  let active = false;
  let onTick = null;
  let staleTimer = null;

  function setHandler(fn) {
    onTick = fn;
  }

  function emit(exchange, price, source = "ws") {
    if (!active || !Number.isFinite(price) || price <= 0) return;
    onTick?.({ exchange, price, source, at: Date.now() });
  }

  function connectBinance() {
    const key = "Binance";
    if (sockets.has(key)) return;
    try {
      const ws = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@trade");
      ws.onmessage = (ev) => {
        const px = parseFloat(JSON.parse(ev.data).p);
        emit("Binance", px);
      };
      ws.onclose = () => {
        sockets.delete(key);
        if (active) setTimeout(connectBinance, 5000);
      };
      sockets.set(key, ws);
    } catch { /* optional */ }
  }

  function connectCoinbase() {
    const key = "Coinbase";
    if (sockets.has(key)) return;
    try {
      const ws = new WebSocket("wss://ws-feed.exchange.coinbase.com");
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "subscribe", product_ids: ["BTC-USD"], channels: ["ticker"] }));
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "ticker" && msg.price) emit("Coinbase", parseFloat(msg.price));
      };
      ws.onclose = () => {
        sockets.delete(key);
        if (active) setTimeout(connectCoinbase, 8000);
      };
      sockets.set(key, ws);
    } catch { /* optional */ }
  }

  function connectKraken() {
    const key = "Kraken";
    if (sockets.has(key)) return;
    try {
      const ws = new WebSocket("wss://ws.kraken.com");
      ws.onopen = () => {
        ws.send(JSON.stringify({ event: "subscribe", pair: ["XBT/USD"], subscription: { name: "ticker" } }));
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (Array.isArray(msg) && msg[1]?.c?.[0]) emit("Kraken", parseFloat(msg[1].c[0]));
      };
      ws.onclose = () => {
        sockets.delete(key);
        if (active) setTimeout(connectKraken, 8000);
      };
      sockets.set(key, ws);
    } catch { /* optional */ }
  }

  function connectOkx() {
    const key = "OKX";
    if (sockets.has(key)) return;
    try {
      const ws = new WebSocket("wss://ws.okx.com:8443/ws/v5/public");
      ws.onopen = () => {
        ws.send(JSON.stringify({ op: "subscribe", args: [{ channel: "tickers", instId: "BTC-USDT" }] }));
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        const px = parseFloat(msg?.data?.[0]?.last);
        if (px > 0) emit("OKX", px);
      };
      ws.onclose = () => {
        sockets.delete(key);
        if (active) setTimeout(connectOkx, 8000);
      };
      sockets.set(key, ws);
    } catch { /* optional */ }
  }

  function start() {
    if (active) return;
    active = true;
    connectBinance();
    connectCoinbase();
    connectKraken();
    connectOkx();
    if (staleTimer) clearInterval(staleTimer);
    staleTimer = setInterval(() => onTick?.({ type: "stale-check", at: Date.now() }), 5000);
  }

  function stop() {
    active = false;
    sockets.forEach((ws) => { try { ws.close(); } catch { /* ignore */ } });
    sockets.clear();
    if (staleTimer) clearInterval(staleTimer);
    staleTimer = null;
  }

  function isStale(lastTickAt) {
    return !lastTickAt || Date.now() - lastTickAt > STALE_MS;
  }

  return { start, stop, setHandler, isStale, STALE_MS };
})();

window.XMWS = XMWS;