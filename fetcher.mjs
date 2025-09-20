// Public endpoints, no API key
const AGG_URL = process.env.AGG_URL;
const PUSH_KEY = process.env.PUSH_KEY;

if (!AGG_URL || !PUSH_KEY) {
  console.error("Missing AGG_URL or PUSH_KEY");
  process.exit(1);
}

async function jget(u) {
  const r = await fetch(u, { headers: { "accept": "application/json" } });
  if (!r.ok) throw new Error(`${u} -> ${r.status}`);
  return r.json();
}

async function getData() {
  // Spot: CoinGecko fallback → Binance
  let spot;
  try {
    const cg = await jget("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
    spot = Number(cg?.bitcoin?.usd);
  } catch (_) {}
  if (!spot) {
    const bn = await jget("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
    spot = Number(bn.price);
  }

  // Mark + Index + Funding: Binance futures premiumIndex
  const pi = await jget("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT");
  const mark = Number(pi.markPrice);
  const index = Number(pi.indexPrice);
  const funding_rate_pct = Number(pi.lastFundingRate) * 100; // chuyển % (vd 0.01% = 0.01)

  // Open Interest (contracts) → ơ USD & BTC
  const oi = await jget("https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT");
  const oi_contracts = Number(oi.openInterest); // số BTC trên Binance USDT-M là số coin
  const oi_btc = oi_contracts; // hợp đồng BTCUSDT kích thước 1 BTC
  const oi_usd = oi_btc * mark;

  // Basis
  const basis_bps = ((mark - spot) / spot) * 1e4;
  const mark_index_bps = ((mark - index) / index) * 1e4;

  const iso = new Date().toISOString();

  return {
    spot, mark, index,
    basis_bps, mark_index_bps,
    funding_rate_pct,
    oi_btc, oi_usd,
    source: "binance+coingecko",
    iso
  };
}

async function push(data) {
  const res = await fetch(`${AGG_URL.replace(/\/+$/,"")}/push`, {
    method: "POST",
    headers: { "content-type":"application/json", "X-API-KEY": PUSH_KEY },
    body: JSON.stringify({ ts: new Date().toISOString(), data })
  });
  const t = await res.text();
  if (!res.ok) {
    console.error("Push failed", res.status, t);
    process.exit(1);
  }
  console.log("Pushed:", t);
}

getData().then(push).catch(e => { console.error(e); process.exit(1); });
