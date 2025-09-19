import fetch from "node-fetch";

async function main() {
  const aggUrl = process.env.AGG_URL;
  const pushKey = process.env.AGG_PUSH_KEY;

  try {
    // Gọi Binance Vision Data API (không bị 451)
    const r = await fetch("https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT");
    if (!r.ok) throw new Error("Binance API error " + r.status);
    const d = await r.json();

    const snap = {
      price: Number(d.lastPrice),
      vol: Number(d.volume),
      change: Number(d.priceChangePercent),
      ts: Date.now(),
      source: "fetcher"
    };

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
