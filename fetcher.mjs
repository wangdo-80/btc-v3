// Fetch từ OKX + CoinGecko, rồi push sang Worker

const UA = { headers: { "User-Agent": "Mozilla/5.0 (GitHub Actions)" } };

const AGG_URL  = process.env.AGG_URL;
const PUSH_KEY = process.env.PUSH_KEY;
if (!AGG_URL || !PUSH_KEY) {
  console.error("Thiếu secrets AGG_URL / PUSH_KEY");
  process.exit(1);
}

async function j(url) {
  const r = await fetch(url, UA);
  if (!r.ok) throw new Error(`HTTP ${r.status} @ ${url}`);
  return r.json();
}

function num(x, d=8) { const n = Number(x); return Number.isFinite(n) ? Number(n.toFixed(d)) : null; }

async function main() {
  try {
    // --- OKX: mark price & funding & OI & index ---
    // Mark price (BTC-USDT-SWAP)
    const okxMark = await j("https://www.okx.com/api/v5/public/mark-price?instType=SWAP&instId=BTC-USDT-SWAP");
    const mark = num(okxMark?.data?.[0]?.markPx);

    // Funding rate (per 8h), trả về ~0.0003 (=> 0.03%)
    const okxFund = await j("https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP");
    const fundingRatePct = num((okxFund?.data?.[0]?.fundingRate ?? 0) * 100, 4); // thành %

    // Open interest (hợp đồng), OKX trả "oi"
    const okxOI = await j("https://www.okx.com/api/v5/public/open-interest?instId=BTC-USDT-SWAP");
    const oi_contracts = num(okxOI?.data?.[0]?.oi, 3);

    // Index price (đại diện spot tham chiếu)
    let indexPx = null;
    try {
      const okxIdx = await j("https://www.okx.com/api/v5/market/index-tickers?instId=BTC-USDT");
      indexPx = num(okxIdx?.data?.[0]?.idxPx, 2);
    } catch {}

    // Spot price: ưu tiên OKX spot ticker, fallback CoinGecko
    let spot = null;
    try {
      const okxSpot = await j("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT");
      spot = num(okxSpot?.data?.[0]?.last, 2);
    } catch {}
    if (!spot) {
      const cg = await j("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usdt");
      spot = num(cg?.bitcoin?.usdt, 2);
    }

    // Mark-index basis bps (tuỳ chọn)
    const basis_bps       = (spot && mark)  ? num(((mark-spot)/spot)*10000, 2) : null;
    const mark_index_bps  = (indexPx && mark) ? num(((mark-indexPx)/indexPx)*10000, 2) : null;

    // Ước lượng OI USD (nếu có mark)
    const oi_usd = (mark && oi_contracts) ? Math.round(mark * oi_contracts) : null;

    const payload = {
      ts: Date.now(),
      spot, mark, index: indexPx,
      basis_bps, mark_index_bps,
      funding_rate_pct: fundingRatePct,
      oi_btc: oi_contracts,   // đơn vị hợp đồng; để trống nếu muốn chính xác BTC
      oi_usd,
      source: "okx+coingecko"
    };

    console.log("Payload:", payload);

    // Validate tối thiểu
    if (typeof payload.spot !== "number" || typeof payload.mark !== "number") {
      throw new Error("Thiếu spot/mark sau khi lấy từ nguồn thay thế");
    }

    // Push sang Worker
    const res = await fetch(`${AGG_URL.replace(/\/+$/,'')}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": PUSH_KEY },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    console.log("Push result:", res.status, text);
    if (!res.ok) process.exit(1);
  } catch (e) {
    console.error("Fetcher error:", e.message);
    process.exit(1);
  }
}

main();
