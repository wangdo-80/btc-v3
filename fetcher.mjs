// fetcher.mjs
// Lấy dữ liệu từ Binance và đẩy vào Worker Aggregator

async function main() {
  const aggUrl = process.env.AGG_URL;
  const pushKey = process.env.PUSH_KEY;
  if (!aggUrl || !pushKey) {
    console.error("Thiếu AGG_URL hoặc PUSH_KEY trong secrets");
    process.exit(1);
  }

  // Hàm fetch JSON từ Binance
  const fetchJSON = async (url) => {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (GitHub Action)" }
    });
    if (!res.ok) throw new Error("HTTP " + res.status + " @ " + url);
    return res.json();
  };

  try {
    // Endpoint Binance
    const [spot, mark, funding, oi] = await Promise.all([
      fetchJSON("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"),
      fetchJSON("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT"),
      fetchJSON("https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1"),
      fetchJSON("https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=5m&limit=1")
    ]);

    const payload = {
      ts: Date.now(),
      spot: Number(spot.price),
      mark: Number(mark.markPrice),
      basis_bps: ((mark.markPrice - spot.price) / spot.price) * 10000,
      funding: Number(funding[0]?.fundingRate ?? 0),
      oi: Number(oi[0]?.sumOpenInterest ?? 0),
      source: "fetcher"
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
