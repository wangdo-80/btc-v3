// Fetcher KHÔNG dùng Binance fapi để tránh 451. Nguồn: OKX + CoinGecko.
// Schema push: { ts, data:{ spot, mark, index, basis_bps, mark_index_bps, funding_rate_pct, oi_btc, oi_usd, source, iso } }

const AGG_URL = process.env.AGG_URL;
const PUSH_KEY = process.env.PUSH_KEY;

if (!AGG_URL || !PUSH_KEY) {
  console.error("Missing secrets: AGG_URL or PUSH_KEY");
  process.exit(1);
}

// ---------- helpers ----------
async function jget(url, { tries = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(`${url} -> ${r.status}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
      await new Promise(rs => setTimeout(rs, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

// ---------- data sources (no API key) ----------
// 1) Spot từ CoinGecko (fallback OKX index)
async function getSpot() {
  try {
    const cg = await jget("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
    const v = safeNum(cg?.bitcoin?.usd);
    if (v) return { spot: v, source: "coingecko" };
  } catch {}
  try {
    // OKX index tickers
    const okx = await jget("https://www.okx.com/api/v5/market/index-tickers?instId=BTC-USDT");
    const d = okx?.data?.[0];
    const v = safeNum(d?.idxPx);
    if (v) return { spot: v, source: "okx-index" };
  } catch {}
  return { spot: undefined, source: "none" };
}

// 2) Mark từ OKX
async function getMark() {
  try {
    const okx = await jget("https://www.okx.com/api/v5/public/mark-price?instId=BTC-USDT-SWAP");
    const d = okx?.data?.[0];
    const mark = safeNum(d?.markPx);
    // một số bản OKX có cả indexPx
    const indexMaybe = safeNum(d?.indexPx);
    return { mark, indexMaybe, src: "okx" };
  } catch {
    return { mark: undefined, indexMaybe: undefined, src: "none" };
  }
}

// 3) Funding rate từ OKX
async function getFunding() {
  try {
    const okx = await jget("https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP");
    const d = okx?.data?.[0];
    // OKX trả fundingRate theo số thập phân (ví dụ 0.0001 = 0.01%)
    const fr = safeNum(d?.fundingRate);
    let pct;
    if (Number.isFinite(fr)) pct = fr * 100;
    return { funding_rate_pct: pct, src: "okx" };
  } catch {
    return { funding_rate_pct: undefined, src: "none" };
  }
}

// 4) Open interest từ OKX (nếu có)
async function getOI(markPrice) {
  try {
    // OKX OI cho SWAP
    const okx = await jget("https://www.okx.com/api/v5/public/open-interest?instId=BTC-USDT-SWAP");
    const d = okx?.data?.[0];
    const oi_btc = safeNum(d?.oi);         // số coin (contract size 1 BTC cho BTC-USDT-SWAP)
    let oi_usd;
    if (oi_btc && markPrice) oi_usd = oi_btc * markPrice;
    return { oi_btc, oi_usd, src: "okx" };
  } catch {
    return { oi_btc: undefined, oi_usd: undefined, src: "none" };
  }
}

// ---------- compose + push ----------
async function getData() {
  const ts = new Date().toISOString();

  const { spot, source: spotSrc } = await getSpot();
  const { mark, indexMaybe } = await getMark();
  const { funding_rate_pct } = await getFunding();
  const { oi_btc, oi_usd } = await getOI(mark);

  const index = indexMaybe ?? spot; // nếu OKX trả indexPx thì dùng, nếu không dùng spot làm proxy

  let basis_bps, mark_index_bps;
  if (mark && spot) basis_bps = ((mark - spot) / spot) * 1e4;
  if (mark && index) mark_index_bps = ((mark - index) / index) * 1e4;

  const data = {
    spot, mark, index,
    basis_bps, mark_index_bps,
    funding_rate_pct,
    oi_btc, oi_usd,
    source: `okx+${spotSrc}`,
    iso: ts
  };

  return data;
}

async function push(data) {
  const res = await fetch(`${AGG_URL.replace(/\/+$/,"")}/push`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-API-KEY": PUSH_KEY
    },
    body: JSON.stringify({ ts: new Date().toISOString(), data })
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("Push failed:", res.status, text);
    process.exit(1);
  }
  console.log("Pushed OK:", text);
}

getData()
  .then(push)
  .catch(e => {
    console.error("Fetcher error:", e?.message || e);
    // Không đẩy gì lên Aggregator để tránh snapshot rác
    process.exit(1);
  });
