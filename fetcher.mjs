import fetch from "node-fetch";

const AGG_URL = process.env.AGG_URL;   // Worker URL, vd: https://btc-v3.yourid.workers.dev
const PUSH_KEY = process.env.PUSH_KEY;

async function main() {
  // 1. Lấy dữ liệu từ Binance
  const spot = await (await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT")).json();
  const mark = await (await fetch("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT")).json();
  const oi   = await (await fetch("https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT")).json();

  const snap = {
    ts: Date.now(),
    spot: Number(spot.price),
    mark: Number(mark.markPrice),
    basis: Number(mark.lastFundingRate),
    oi: Number(oi.openInterest),
    source: "fetcher"
  };

  // 2. Push về Worker
  const res = await fetch(`${AGG_URL}/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": PUSH_KEY
    },
    body: JSON.stringify(snap)
  });

  console.log("Push result:", await res.text());
}

main().catch(err => {
  console.error("Fetcher error", err);
  process.exit(1);
});
