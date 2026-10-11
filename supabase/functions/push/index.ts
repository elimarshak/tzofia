// Tzofia: phone alerts sent from the site (Web Push).
//   GET                                  -> { key }: the site's public key, which browsers need to subscribe
//   POST { action: 'subscribe', sub, topics, lang }   -> saves the subscription and sends a confirmation alert
//   POST { action: 'unsubscribe', endpoint }          -> removes the subscription
//   POST { action: 'dispatch' }                       -> sends the alerts waiting in ingest.push_queue
// The key pair is created here on first use and kept in a private table; it never leaves the server except for
// the public half. Subscriptions are accepted only for the browsers' own push services.
import postgres from "npm:postgres@3.4.5";
import webpush from "npm:web-push@3.6.7";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const ORIGINS = ["https://elimarshak.github.io", "https://openeye.co.il", "https://www.openeye.co.il"];
const SITE = "https://elimarshak.github.io/tzofia/";
const TOPICS = ["skies"];
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];

const TEXT = {
  he: { title: "OPENEYE: ההתרעות הופעלו", body: "מעכשיו תגיע לכאן התרעה כשהשמיים מעל אחת המדינות באזור מתרוקנים." },
  en: { title: "OPENEYE: alerts are on", body: "From now on, an alert will arrive here when the skies over a country in the region empty out." },
};

function headers(req: Request) {
  const o = req.headers.get("origin") ?? "";
  return { "Content-Type": "application/json", "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", Vary: "Origin" };
}

async function keys() {
  let [k] = await sql`select public_key, private_key from ingest.push_keys where id = 1`;
  if (!k) {
    const v = webpush.generateVAPIDKeys();
    await sql`insert into ingest.push_keys (id, public_key, private_key) values (1, ${v.publicKey}, ${v.privateKey}) on conflict (id) do nothing`;
    [k] = await sql`select public_key, private_key from ingest.push_keys where id = 1`;
  }
  return k as { public_key: string; private_key: string };
}

type Sub = { endpoint: string; p256dh: string; auth: string };
async function send(s: Sub, payload: unknown, k: { public_key: string; private_key: string }) {
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload),
      { vapidDetails: { subject: SITE, publicKey: k.public_key, privateKey: k.private_key }, TTL: 3 * 3600, urgency: "high" });
    await sql`update ingest.push_subs set last_ok = now(), fails = 0 where endpoint = ${s.endpoint}`;
    return true;
  } catch (e: any) {
    // 404 / 410: the browser dropped this subscription, so it is removed; anything else is counted and retried next time
    if (e?.statusCode === 404 || e?.statusCode === 410) await sql`delete from ingest.push_subs where endpoint = ${s.endpoint}`;
    else await sql`update ingest.push_subs set fails = fails + 1 where endpoint = ${s.endpoint}`;
    console.log("push failed", e?.statusCode, String(e?.body ?? e).slice(0, 200));
    return false;
  }
}

Deno.serve(async (req) => {
  const h = headers(req);
  const reply = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: h });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  try {
    const k = await keys();
    if (req.method === "GET") return reply({ key: k.public_key });
    const b = await req.json().catch(() => ({}));
    if (b.action === "subscribe") {
      const s = b.sub ?? {}, endpoint = String(s.endpoint ?? ""), p256dh = String(s.keys?.p256dh ?? ""), auth = String(s.keys?.auth ?? "");
      let host = "";
      try { const u = new URL(endpoint); if (u.protocol === "https:") host = u.hostname; } catch { /* not a URL */ }
      if (!host || !PUSH_HOSTS.some((r) => r.test(host)) || endpoint.length > 1000 || !p256dh || p256dh.length > 200 || !auth || auth.length > 100)
        return reply({ error: "bad subscription" }, 400);
      const topics = (Array.isArray(b.topics) ? b.topics : []).filter((x: unknown) => TOPICS.includes(String(x)));
      const lang = b.lang === "en" ? "en" : "he";
      await sql`insert into ingest.push_subs (endpoint, p256dh, auth, topics, lang) values (${endpoint}, ${p256dh}, ${auth}, ${topics}, ${lang})
                on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, topics = excluded.topics, lang = excluded.lang`;
      const ok = await send({ endpoint, p256dh, auth }, { ...TEXT[lang], url: SITE, tag: "welcome" }, k);
      return reply({ ok: true, confirmed: ok });
    }
    if (b.action === "unsubscribe") {
      await sql`delete from ingest.push_subs where endpoint = ${String(b.endpoint ?? "")}`;
      return reply({ ok: true });
    }
    if (b.action === "dispatch") {
      const queue = await sql`select id, topic, payload from ingest.push_queue where sent_at is null and created_at > now() - interval '2 hours' order by id`;
      let total = 0;
      for (const q of queue) {
        const subs = await sql`select endpoint, p256dh, auth, lang from ingest.push_subs where ${q.topic} = any(topics) and fails < 20`;
        let n = 0;
        for (const s of subs) if (await send(s as unknown as Sub, { ...(q.payload[s.lang] ?? q.payload.he), url: q.payload.url ?? SITE, tag: q.payload.tag }, k)) n++;
        await sql`update ingest.push_queue set sent_at = now(), sent_count = ${n} where id = ${q.id}`;
        total += n;
      }
      return reply({ alerts: queue.length, delivered: total });
    }
    return reply({ error: "unknown action" }, 400);
  } catch (e) {
    return reply({ error: String(e).slice(0, 200) }, 500);
  }
});
