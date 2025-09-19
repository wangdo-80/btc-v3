// Node 20 có fetch builtin – không cần node-fetch
const AGG_URL = process.env.AGG_URL;
const AGG_PUSH_KEY = process.env.AGG_PUSH_KEY;

if (!AGG_URL || !AGG_PUSH_KEY) {
  console.error('Missing AGG_URL or AGG_PUSH_KEY');
  process.exit(1);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function jfetch(u) {
  const r = await fetch(u, { headers: { 'User-Agent': 'btc-hourly-fetcher/1.0' } });
  if (!r.ok) throw new Error(`GET ${u} -> ${r.status}`);
  return r.json();
}

async function main() {
  // Lấy prev để tính delta chuẩn phía Worker (Worker cũng tự tính lại)
  let prev;
  try {
    const prevRes = await jfetch(`${AGG_URL.replace(/\/+$/,'')}/snapshot`);
    prev = prevRes?.data || null;
  } catch (e) {
    console.warn('Snapshot precheck failed (continue anyway):', e.message);
  }

  // Kéo dữ liệu Binance
  const [spot, prem, oi] = await Promise.all([
    jfetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'),
    jfetch('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT'),
    jfetch('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT'),
  ]);

  const spotPrice = Number(spot?.price || NaN);
  const markPrice = Number(prem?.markPrice || NaN);
  const indexPrice = Number(prem?.indexPrice || NaN);
  const fundingRate = Number(prem?.lastFundingRate || NaN);
  const oiBtc = Number(oi?.openInterest || NaN);
  const oiUsd = oiBtc * (isFinite(markPrice) ? markPrice : spotPrice);

  const basisBps = isFinite(markPrice) && isFinite(spotPrice)
    ? ((markPrice - spotPrice) / spotPrice) * 10000
    : NaN;
  const markIndexBps = isFinite(markPrice) && isFinite(indexPrice)
    ? ((markPrice - indexPrice) / indexPrice) * 10000
    : NaN;

  const payload = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    spot: spotPrice,
    mark: markPrice,
    index: indexPrice,
    basis_bps: Number.isFinite(basisBps) ? Number(basisBps.toFixed(2)) : null,
    mark_index_bps: Number.isFinite(markIndexBps) ? Number(markIndexBps.toFixed(2)) : null,
    funding_rate_pct: Number.isFinite(fundingRate) ? Number((fundingRate*100).toFixed(4)) : null,
    oi_btc: Number.isFinite(oiBtc) ? Number(oiBtc.toFixed(3)) : null,
    oi_usd: Number.isFinite(oiUsd) ? Math.round(oiUsd) : null,
    source: 'fetcher'
  };

  const pushUrl = `${AGG_URL.replace(/\/+$/,'')}/push`;
  const resp = await fetch(pushUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': AGG_PUSH_KEY,
      'User-Agent': 'btc-hourly-fetcher/1.0'
    },
    body: JSON.stringify({ data: payload })
  });

  const txt = await resp.text();
  if (!resp.ok) {
    console.error('Push failed:', resp.status, txt);
    process.exit(1);
  }
  console.log('Push ok:', txt);
}

main().catch(async (e) => {
  console.error('Fatal:', e);
  await sleep(100); // flush logs
  process.exit(1);
});
