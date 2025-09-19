const UA = { headers: { "User-Agent": "Mozilla/5.0 (GitHub Actions)" } };
const AGG_URL  = process.env.AGG_URL;
const PUSH_KEY = process.env.PUSH_KEY;
if (!AGG_URL || !PUSH_KEY) {
  console.error("Thiếu secrets AGG_URL / PUSH_KEY"); process.exit(1);
}

const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
async function j(url, tries=3) {
  let last;
  for (let i=0;i<tries;i++) {
    try {
      const r = await fetch(url, UA);
      if (!r.ok) throw new Error(`HTTP ${r.status} @ ${url}`);
      return await r.json();
    } catch(e){ last=e; await sleep(400*(i+1)); }
  }
  throw last;
}
const num=(x,d)=>{const n=Number(x);return Number.isFinite(n)?(d!=null?Number(n.toFixed(d)):n):null;};

async function main() {
  try {
    // OKX
    const [okxMark, okxFund, okxOI] = await Promise.all([
      j("https://www.okx.com/api/v5/public/mark-price?instType=SWAP&instId=BTC-USDT-SWAP"),
      j("https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP"),
      j("https://www.okx.com/api/v5/public/open-interest?instId=BTC-USDT-SWAP")
    ]);

    let mark = num(okxMark?.data?.[0]?.markPx, 2);
    const funding_rate_pct = num((okxFund?.data?.[0]?.fundingRate ?? 0) * 100, 4);
    const oi_btc = num(okxOI?.data?.[0]?.oi, 3);

    // Spot / Index
    let spot=null, index=null;
    try {
      const okxSpot = await j("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT");
      spot = num(okxSpot?.data?.[0]?.last, 2);
    } catch {}
    try {
      const okxIdx = await j("https://www.okx.com/api/v5/market/index-tickers?instId=BTC-USDT");
      index = num(okxIdx?.data?.[0]?.idxPx, 2);
    } catch {}

    // Fallback spot từ CoinGecko
    if (spot == null) {
      const cg = await j("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usdt");
      spot = num(cg?.bitcoin?.usdt, 2);
    }
    if (mark == null) mark = spot; // fallback an toàn

    const basis_bps      = (spot!=null && mark!=null) ? num(((mark-spot)/spot)*10000, 2) : null;
    let mark_index_bps   = null;
    if (index!=null && mark!=null) mark_index_bps = num(((mark-index)/index)*10000, 2);
    const oi_usd         = (mark!=null && oi_btc!=null) ? Math.round(mark*oi_btc) : null;

    const payload = {
      spot, mark, index,
      basis_bps, mark_index_bps,
      funding_rate_pct,
      oi_btc, oi_usd,
      source: "okx+coingecko",
      ts: Date.now()
    };
    console.log("Payload:", payload);

    if (payload.spot == null || payload.mark == null)
      throw new Error("Thiếu spot/mark sau khi lấy từ nguồn thay thế");

    const res = await fetch(`${AGG_URL.replace(/\/+$/,'')}/push`, {
      method: "POST",
      headers: { "Content-Type":"application/json", "X-API-KEY": PUSH_KEY },
      body: JSON.stringify(payload)
    });
    const txt = await res.text();
    console.log("Push:", res.status, txt);
    if (!res.ok) process.exit(1);
  } catch (e) {
    console.error("Fetcher error:", e.message);
    process.exit(1);
  }
}
main();
