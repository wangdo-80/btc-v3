const AGG_URL = process.env.AGG_URL;
const PUSH_KEY = process.env.PUSH_KEY;
if (!AGG_URL || !PUSH_KEY) { console.error("Missing AGG_URL/PUSH_KEY"); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function jget(u, tries=3) {
  let e;
  for (let i=0;i<tries;i++){
    try {
      const r = await fetch(u, { headers:{accept:"application/json"} });
      if (!r.ok) throw new Error(`${u} -> ${r.status}`);
      return await r.json();
    } catch(err){ e=err; await sleep(400*(i+1)); }
  }
  throw e;
}
const num = v => (Number.isFinite(+v) ? +v : undefined);

async function getSpot() {
  try {
    const cg = await jget("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
    const v = num(cg?.bitcoin?.usd); if (v) return {spot:v, src:"coingecko"};
  } catch {}
  try {
    const okx = await jget("https://www.okx.com/api/v5/market/index-tickers?instId=BTC-USDT");
    const v = num(okx?.data?.[0]?.idxPx); if (v) return {spot:v, src:"okx-index"};
  } catch {}
  return {spot:undefined, src:"none"};
}
async function getMarkIdx() {
  try {
    const o = await jget("https://www.okx.com/api/v5/public/mark-price?instId=BTC-USDT-SWAP");
    const d = o?.data?.[0]||{};
    return { mark:num(d.markPx), index:num(d.indexPx) };
  } catch { return { mark:undefined, index:undefined }; }
}
async function getFunding() {
  try {
    const o = await jget("https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP");
    const fr = num(o?.data?.[0]?.fundingRate);
    return { funding_rate_pct: fr!=null ? fr*100 : undefined };
  } catch { return { funding_rate_pct: undefined }; }
}
async function getOI(mark) {
  try {
    const o = await jget("https://www.okx.com/api/v5/public/open-interest?instId=BTC-USDT-SWAP");
    const oi_btc = num(o?.data?.[0]?.oi);
    const oi_usd = (oi_btc && mark) ? oi_btc*mark : undefined;
    return { oi_btc, oi_usd };
  } catch { return { oi_btc: undefined, oi_usd: undefined }; }
}

async function buildData(){
  const ts = new Date().toISOString();
  const s = await getSpot();
  const {mark, index} = await getMarkIdx();
  const f = await getFunding();
  const oi = await getOI(mark);

  const basis_bps = (mark && s.spot) ? ((mark - s.spot)/s.spot)*1e4 : undefined;
  const mark_index_bps = (mark && index) ? ((mark - index)/index)*1e4 : undefined;

  return {
    spot: s.spot, mark, index,
    basis_bps, mark_index_bps,
    funding_rate_pct: f.funding_rate_pct,
    oi_btc: oi.oi_btc, oi_usd: oi.oi_usd,
    source: `okx+${s.src}`, iso: ts
  };
}

async function push(data){
  const res = await fetch(`${AGG_URL.replace(/\/+$/,'')}/push`, {
    method:"POST",
    headers:{ "content-type":"application/json", "X-API-KEY":PUSH_KEY },
    body: JSON.stringify({ ts:new Date().toISOString(), data })
  });
  const t = await res.text();
  if (!res.ok) { console.error("Push failed", res.status, t); process.exit(1); }
  console.log("Pushed OK:", t);
}

buildData().then(push).catch(e=>{ console.error(e); process.exit(1); });
