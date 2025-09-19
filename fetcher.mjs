// fetcher.mjs
// Lấy dữ liệu BTC từ nhiều nguồn thay thế (OKX, Bybit, CoinGecko)
// rồi push về Worker

async function main() {
  const aggUrl = process.env.AGG_URL;
  const pushKey = process.env.PUSH_KEY;
  if (!aggUrl || !pushKey) {
    console.error("Thiếu AGG_URL hoặc PUSH_KEY trong secrets");
    process.exit(1);
  }

  const fetchJSON = async (url) => {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (GitHub Action)" }
    });
    if (!r.ok) throw new Error("HTTP " + r.status + " @ " + url);
    return r.json();
  };

  try {
    // Spot price từ CoinGecko (luôn sẵn)
    const cg = await fetchJSON("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usdt");
    const spot = cg.bitcoin.usdt;

    // Mark price từ OKX
    const okx = await fetchJSON("https://www.okx.com/api/v5/public/mark-price?instType=SWAP&instId=BTC-USDT-SWAP");
    const mark = Number(okx.data?.[0]?.markPx ?? spot);

    // Funding rate từ Bybit
    const bybit = await fetchJSON("https://api.bybit.com/v2/public/funding/prev-funding-rate?symbol=BTCUSDT");
    const funding = Number(bybit.result?.funding_rate ?? 0);

    // Open Interest từ OKX
    const oiOkx = await fetchJSON("https://www.okx.com/api/v5/public/open-interest?instId=BTC-USDT-SWAP");
    const oi = Number(oiOkx.data?.[0]?.oi ?? 0);

    const payload = {
      ts: Date.now(),
      spot: Number(spot),
      mark: mark,
      basis_bps: ((mark - spot) / spot) * 10000,
      funding: funding,
      oi: oi,
      source: "multi-source" // thay vì binance
    };

    console.log("Payload:", payload);

    // Push vào Worker
    const res = await fetch(aggUrl + "/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": pushKey
      },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    console.log("Push result:", res.status, text);

    if (!res.ok) process.exit(1);
  } catch (err) {
    console.error("Fetcher error:", err.message);
    process.exit(1);
  }
}

main();
