import fetch from "node-fetch";

async function fetchJson(url) {
  try {
    const resp = await fetch(url, { timeout: 5000 });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} @ ${url}`);
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON @ ${url} → ${text.slice(0, 100)}`);
    }
  } catch (e) {
    console.error("fetchJson error:", e.message);
    return null;
  }
}

async function fetchData() {
  // thử nhiều nguồn
  const sources = {
    spot: [
      "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usdt"
    ],
    mark: [
      "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT",
      "https://www.okx.com/api/v5/market/index-tickers?instId=BTC-USDT-SWAP"
    ],
    oi: [
      "https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT"
    ]
  };

  const result = {};
  // Spot price
  for (let url of sources.spot) {
    const data = await fetchJson(url);
    if (data) {
      result.spot = data.price || data.bitcoin?.usdt;
      break;
    }
  }
  // Mark price
  for (let url of sources.mark) {
    const data = await fetchJson(url);
    if (data) {
      result.mark = data.markPrice || data.data?.[0]?.idxPx;
      break;
    }
  }
  // OI
  for (let url of sources.oi) {
    const data = await fetchJson(url);
    if (data) {
      result.openInterest = data.openInterest;
      break;
    }
  }

  return result;
}

(async () => {
  const data = await fetchData();
  console.log("Fetched:", data);

  const body = {
    ts: new Date().toISOString(),
    data
  };

  const resp = await fetch(process.env.AGG_URL + "/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": process.env.PUSH_KEY
    },
    body: JSON.stringify(body)
  });

  const txt = await resp.text();
  console.log("Push result:", txt);
})();
