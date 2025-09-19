import fetch from "node-fetch";

async function fetchData() {
  // dùng nhiều nguồn để giảm lỗi
  const sources = {
    spot: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    perp: "https://api.bybit.com/v2/public/tickers?symbol=BTCUSDT"
  };

  const spotRes = await fetch(sources.spot).then(r => r.json());
  const perpRes = await fetch(sources.perp).then(r => r.json());

  const spot = spotRes.bitcoin.usd;
  const mark = parseFloat(perpRes.result[0].last_price);

  const snap = {
    ts: new Date().toISOString(),
    spot,
    mark,
    basis: ((mark - spot) / spot) * 10000, // bps
    funding: parseFloat(perpRes.result[0].funding_rate || 0),
    oi: parseFloat(perpRes.result[0].open_interest || 0)
  };

  // push lên worker
  const resp = await fetch(process.env.AGG_URL + "/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": process.env.PUSH_KEY
    },
    body: JSON.stringify(snap)
  });

  if (!resp.ok) {
    throw new Error(`Push failed ${resp.status}`);
  }
  console.log("Pushed:", snap);
}

await fetchData();
