const AGG_URL = process.env.AGG_URL;
const AGG_PUSH_KEY = process.env.AGG_PUSH_KEY;
if (!AGG_URL || !AGG_PUSH_KEY) { console.error('Missing AGG_URL or AGG_PUSH_KEY'); process.exit(1); }

async function main() {
  const url = `${AGG_URL.replace(/\/+$/,'')}/push`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'X-API-KEY': AGG_PUSH_KEY },
    body: JSON.stringify({}) // Worker tự fetch
  });
  const text = await res.text();
  console.log('HTTP status:', res.status);
  console.log('Body head:', text.slice(0, 300));
  if (!res.ok) process.exit(1);
}
main().catch(e => { console.error('Network/Fetch error:', e); process.exit(1); });
