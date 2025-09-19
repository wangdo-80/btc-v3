import fetch from "node-fetch";

async function main() {
  const aggUrl = process.env.AGG_URL;
  const pushKey = process.env.AGG_PUSH_KEY;

  try {
    // Lấy giá BTC spot từ Binance
    const r = await fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT");
    if (!r.ok) throw new Error("Binance API error " + r.status);
    const d = await r.json();

    // Tạo snapshot
    const snap = {
      price: Number(d.lastPrice),
      vol: Number(d.volume),
      change: Number(d.priceChangePercent),
      ts: Date.now(),
      source: "fetcher"
    };

    // Đẩy vào Worker
    const res = await fetch(`${aggUrl}/push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": pushKey
      },
      body: JSON.stringify(snap)
    });

    const out = await res.json();
    console.log("Pushed:", out);

  } catch (err) {
    console.error("Fetcher error:", err.message);
    process.exit(1);
  }
}

main();
