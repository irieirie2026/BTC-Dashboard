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

  function emit(exchange, price, source = "ws", extra = {}) {
    if (!active || !Number.isFinite(price) || price <= 0) return;
    onTick?.({ exchange, price, source, at: Date.now(), ccy: extra.ccy });
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

  function connectBitstamp() {
    const key = "Bitstamp";
    if (sockets.has(key)) return;
    try {
      const ws = new WebSocket("wss://ws.bitstamp.net");
      ws.onopen = () => {
        ws.send(JSON.stringify({ event: "bts:subscribe", data: { channel: "live_trades_btcusd" } }));
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg?.event === "trade" || msg?.data?.price) {
          const px = parseFloat(msg.data?.price ?? msg.price);
          if (px > 0) emit("Bitstamp", px);
        }
      };
      ws.onclose = () => {
        sockets.delete(key);
        if (active) setTimeout(connectBitstamp, 8000);
      };
      sockets.set(key, ws);
    } catch { /* optional */ }
  }

  function connectGemini() {
    const key = "Gemini";
    if (sockets.has(key)) return;
    try {
      const ws = new WebSocket("wss://api.gemini.com/v1/marketdata/btcusd?heartbeat=true&trades=true");
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "trade" && msg.events) {
          for (const e of msg.events) {
            if (e.type === "trade" && e.price) {
              emit("Gemini", parseFloat(e.price));
              break;
            }
          }
        }
      };
      ws.onclose = () => {
        sockets.delete(key);
        if (active) setTimeout(connectGemini, 8000);
      };
      sockets.set(key, ws);
    } catch { /* optional */ }
  }

  function connectBybit() {
    const key = "Bybit";
    if (sockets.has(key)) return;
    try {
      const ws = new WebSocket("wss://stream.bybit.com/v5/public/spot");
      ws.onopen = () => {
        ws.send(JSON.stringify({ op: "subscribe", args: ["tickers.BTCUSDT"] }));
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        const px = parseFloat(msg?.data?.lastPrice);
        if (px > 0) emit("Bybit", px);
      };
      ws.onclose = () => {
        sockets.delete(key);
        if (active) setTimeout(connectBybit, 8000);
      };
      sockets.set(key, ws);
    } catch { /* optional */ }
  }

  function connectBithumb() {
    const key = "Bithumb";
    if (sockets.has(key)) return;
    try {
      const ws = new WebSocket("wss://pubwss.bithumb.com/pub/ws");
      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: "ticker",
          symbols: ["BTC_KRW"],
          tickTypes: ["24H"],
        }));
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          const px = parseFloat(msg?.content?.closePrice ?? msg?.content?.close_price);
          if (px > 0) emit("Bithumb", px, "ws", { ccy: "KRW" });
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        sockets.delete(key);
        if (active) setTimeout(connectBithumb, 8000);
      };
      sockets.set(key, ws);
    } catch { /* optional */ }
  }

  function connectUpbit() {
    const key = "Upbit";
    if (sockets.has(key)) return;
    try {
      const ws = new WebSocket("wss://api.upbit.com/websocket/v1");
      ws.onopen = () => {
        ws.send(JSON.stringify([
          { ticket: "xm-upbit-btc" },
          { type: "ticker", codes: ["KRW-BTC"] },
        ]));
      };
      ws.onmessage = async (ev) => {
        try {
          const text = typeof ev.data === "string" ? ev.data : await new Response(ev.data).text();
          const msg = JSON.parse(text);
          const px = parseFloat(msg.trade_price);
          if (px > 0) emit("Upbit", px, "ws", { ccy: "KRW" });
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        sockets.delete(key);
        if (active) setTimeout(connectUpbit, 8000);
      };
      sockets.set(key, ws);
    } catch { /* optional */ }
  }

  function connectCryptoCom() {
    const key = "Crypto.com";
    if (sockets.has(key)) return;
    try {
      const ws = new WebSocket("wss://stream.crypto.com/exchange/v1/market/BTC_USDT");
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          const px = parseFloat(
            msg?.result?.data?.[0]?.a
            ?? msg?.result?.data?.a
            ?? msg?.result?.data?.k
            ?? msg?.result?.data?.last,
          );
          if (px > 10_000) emit("Crypto.com", px);
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        sockets.delete(key);
        if (active) setTimeout(connectCryptoCom, 8000);
      };
      sockets.set(key, ws);
    } catch { /* optional */ }
  }

  function connectHtx() {
    const key = "HTX";
    if (sockets.has(key)) return;
    try {
      const ws = new WebSocket("wss://api.htx.com/ws");
      ws.onopen = () => {
        ws.send(JSON.stringify({ sub: "market.btcusdt.ticker", id: "xm-htx-btc" }));
      };
      ws.onmessage = async (ev) => {
        try {
          let text = ev.data;
          if (text instanceof Blob) {
            text = await new Response(text).text();
          }
          const msg = JSON.parse(text);
          const px = parseFloat(msg?.tick?.close ?? msg?.tick?.lastPrice);
          if (px > 10_000) emit("HTX", px);
        } catch { /* ignore gzip/binary frames */ }
      };
      ws.onclose = () => {
        sockets.delete(key);
        if (active) setTimeout(connectHtx, 8000);
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
    connectBitstamp();
    connectGemini();
    connectBybit();
    connectUpbit();
    connectBithumb();
    connectCryptoCom();
    connectHtx();
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