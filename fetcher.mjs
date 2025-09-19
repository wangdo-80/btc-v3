// Node 20 có fetch builtin
const AGG_URL = process.env.AGG_URL;
const AGG_PUSH_KEY = process.env.AGG_PUSH_KEY;

if (!AGG_URL || !AGG_PUSH_KEY) {
  console.error('Missing AGG_URL or AGG_PUSH_KEY');
  process.exit(1);
}

async function main() {
  const url = `${AGG_URL.replace(/\/+$/,'')}/push`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'X-API-KEY': AGG_PUSH_KEY },
    body: JSON.stringify({}) // không gửi payload, Worker sẽ tự fetch & tính
  });
  const txt = await resp.text();
  if (!resp.ok) {
    console.error('Push failed:', resp.status, txt);
    process.exit(1);
  }
  console.log('Push ok:', txt.slice(0,200));
}

main().catch(e => { console.error(e); process.exit(1); });
