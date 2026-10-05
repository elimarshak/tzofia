# Tzofia: technical architecture research

Research date: 5 October 2026. Scope: form factor, map rendering, base maps, server side, security, existing open-source projects, running cost.

Method and limits of this document:

- Every key fact below carries the URL of the vendor's or project's own page and a short quote from it. Pages were read through a fetch tool that returns extracted text, so the three or four numbers that drive a purchase decision (Hetzner price, Supabase limits, Cloudflare prices) deserve one manual look before money is spent.
- Anything that could not be confirmed on a primary page is marked NOT VERIFIED and repeated in the last section.
- Lines marked "Calculation" are my own arithmetic from stated assumptions, not vendor facts.
- The choice and cost of the live data feeds themselves (aircraft, ships) is outside this file. It affects the architecture and is listed under open questions.

---

## 1. Form factor: web app, native app, or desktop only

### 1.1 What a web app (installed to the home screen) can do in 2026

| Topic | Fact | Source and quote |
|---|---|---|
| Web Push on iPhone | Works only for a web app added to the Home Screen, from iOS 16.4 | https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers.md : "Add web push to Home Screen web apps in iOS 16.4 or later" |
| Permission prompt on iPhone | Must follow a tap by the user | https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ : "in response to direct user interaction" |
| iPhone Focus modes | Web app notifications obey Focus, like any app | same page: "integrate with Focus, allowing users to precisely configure when or where" |
| Silent or data-only push on iPhone | Not allowed. Each push must show a notification or the permission is revoked | Apple page above: "Safari doesn't support invisible push notifications." and "Safari revokes the push notification permission for your site" |
| Apple developer account for web push | Not needed | Apple page above: "You don't need to join the Apple Developer Program" |
| Payload size on Apple web push | 4 KB | Apple page above: "The payload size is over the limit of 4 KB." |
| Push without a service worker | Declarative Web Push, iOS 18.4 and later | https://webkit.org/blog/16535/meet-declarative-web-push/ : "without requiring an installed service worker" |
| Push when the site is closed (Android, desktop) | Service worker is woken by the push | https://web.dev/articles/push-notifications-overview : "even when your website isn't open or the browser is closed" |
| Sending web push without a third-party vendor | Own server signs with a VAPID key pair and posts to the browser's push endpoint | Apple page above: "Prepare a ... (VAPID) key pair for your server"; library: https://github.com/web-push-libs/web-push |

### 1.2 Can a web app play a loud alarm that bypasses silent mode or Do Not Disturb?

Conclusion: no. The evidence, piece by piece:

- The web Notification interface has no sound field at all. The only audio control is `silent`, which can only make a notification quieter. https://developer.mozilla.org/en-US/docs/Web/API/Notification/silent : "if set to `null` (the default value), the device's default settings are respected."
- On iPhone, web app notifications are subject to Focus (quote in the table above), and only the native "critical" level is documented as bypassing the mute switch (section 1.3).
- Audio started by page code is blocked unless the user already interacted with the page, and by default not started in a background tab. https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay : "blocked if the playback is programmatically initiated in a tab which has not yet had any user interaction".
- So a web app can sound an alarm only while it is open in the foreground after the user tapped something, at the phone's current media volume. Whether the iPhone hardware mute switch silences such in-page audio: NOT VERIFIED on a primary page.

### 1.3 Native iPhone app: Critical Alerts

- What it gives: https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.critical-alerts.md : "play a sound even when the app is locked, muted, or a person uses Do Not Disturb". Also: "Your app can specify a custom sound and volume for critical alerts."
- What it needs: a special entitlement that Apple grants per app on request. Same page: "To request this entitlement for your app, fill out the request form".
- Approval criteria: the request form sits behind an Apple developer login, so the criteria Apple applies are NOT VERIFIED. Approval for a general OSINT map is not something to count on.
- Notification levels available without that entitlement: https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel.md : timeSensitive "breaks through system notification controls"; critical "bypasses the mute switch to play a sound". So Time Sensitive gets through Focus but is not documented to override the mute switch. Whether Time Sensitive still needs its own capability flag: NOT VERIFIED (the entitlement page returned 404).
- Expo supports the field: https://docs.expo.dev/push-notifications/sending-notifications/ lists `interruptionLevel` values "'active' | 'critical' | 'passive' | 'time-sensitive'". Expo's push relay limit, same page: "600 notifications per second per project".
- Cost of entry: https://developer.apple.com/programs/whats-included/ : "99 USD per membership year".

### 1.4 Native Android app: Do Not Disturb, alarm sound, full-screen alert

- Do Not Disturb has three levels. https://developer.android.com/develop/ui/compose/notifications : "Total silence: blocks all sounds and vibrations, including from alarms"; "Alarms only: blocks all sounds and vibrations, except from alarms."; "Priority only: users can configure which system-wide categories can interrupt them".
- A notification channel can pass Do Not Disturb, but the user decides. Same page: "overriding Do Not Disturb on a channel-by-channel basis".
- The app can set that flag itself only with a special user-granted access. Android source, https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/app/NotificationChannel.java : "Apps with Do Not Disturb policy access ... can set up their own channels this way" and otherwise "only modifiable by the system and the notification ranker".
- After a channel is created the user is in control. https://developer.android.com/develop/ui/views/notifications/channels : "you can't change the notification behaviors. The user has complete control".
- Loudest channel level: same page, "Urgent: Makes a sound and appears as a heads-up notification."
- Full-screen takeover of the lock screen (like an incoming call): restricted since Android 14. https://source.android.com/docs/core/permissions/fsi-limits : "can be granted only to apps that provide calling and alarm functionalities". For other apps Google Play revokes it by default; the user may switch it on by hand in settings (same page, "Manage full screen intents").
- Push in development: https://docs.expo.dev/versions/latest/sdk/notifications/ : "unavailable in Expo Go on Android from SDK 53", so a development build is needed.
- Cost of entry: https://support.google.com/googleplay/android-developer/answer/6112435 : "US$25 one-time registration fee".

### 1.5 Conclusion for the "very loud alert" requirement

1. A website or installed web app is the right vehicle for the map itself: one codebase for phone and desktop, no store review, instant updates. It can deliver ordinary push notifications on Android and, once added to the Home Screen, on iPhone.
2. A web app cannot deliver a loud alert that overrides silent mode or Do Not Disturb on either platform. That requirement needs a native app.
3. On Android a native app can get close without anyone's approval: an urgent channel, a custom alarm sound, and a one-time setup screen that asks the user to allow the channel to override Do Not Disturb. "Total silence" mode still blocks everything.
4. On iPhone only Critical Alerts override the mute switch and Focus, and Apple must approve the entitlement. Plan for Time Sensitive as the default and treat Critical Alerts as a request that may be refused.
5. Desktop only is not a fit: the owner's first requirement is that it works well on phones.
6. Suggested order: web app first; then a thin Expo app whose main job is alerts (it can show the same web map inside a web view or use MapLibre's native library, https://github.com/maplibre/maplibre-react-native , MIT).

---

## 2. Map rendering for many moving objects on a phone

### 2.1 Libraries

| Library | Licence | What the project's own pages say | Fit for Tzofia |
|---|---|---|---|
| MapLibre GL JS v5 | https://github.com/maplibre/maplibre-gl-js : "licensed under the 3-Clause BSD license" | Vector-tile map on the GPU (WebGL2). Large-data guide https://maplibre.org/maplibre-gl-js/docs/guides/large-data/ advises clustering ("reduces the number of features displayed on the map"), vector tiles ("specifically designed for efficient rendering") and trimming precision | Base map and event layers (polygons, lines, clustered points). Good phone gestures. |
| deck.gl | https://github.com/visgl/deck.gl : MIT | https://deck.gl/docs/developer-guide/performance : "renders fluidly at 60 FPS ... up to about 1M (one million) data items"; phones are "considerably more sensitive to memory pressure than laptops"; binary attributes mean "bypassing the CPU-bound attribute generation completely" | Aircraft and ship icon layers on top of MapLibre. 15 thousand aircraft is far below its documented range. |
| deck.gl with MapLibre | https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre : `MapLibreOverlay` "supports MapLibre GL JS v4.5.1, v5, and v6" | Either its own canvas above the map or drawn into MapLibre's context | The recommended pairing. |
| OpenLayers | https://openlayers.org/ : "released under the 2-clause BSD License" | "Leverages Canvas 2D, WebGL"; "Mobile support out of the box."; a WebGL layer exists "to render a large quantities of points" (https://openlayers.org/en/latest/examples/webgl-points-layer.html) | Proven for aircraft: tar1090 uses it. Raster-first; vector base maps and RTL labels are less natural than in MapLibre. |
| Leaflet | https://github.com/Leaflet/Leaflet : BSD-2-Clause, latest v1.9.4 (May 2023) | https://leafletjs.com/ : "about 42 KB of JS"; "mobile-friendly interactive maps" | Light and simple, but no GPU rendering in the core. Tens of thousands of moving icons need third-party plug-ins. Not recommended as the main engine. |
| CesiumJS | https://github.com/CesiumGS/cesium : Apache 2.0, "free for both commercial and non-commercial use" | "3D globes and 2D maps in a web browser"; "tuned for dynamic-data visualization". Does not require the vendor's cloud | True 3D globe, natural for satellites at altitude. Heaviest option. Documented phone performance figures: NOT VERIFIED. |

Globe view in MapLibre v5: the example page exists (https://maplibre.org/maplibre-gl-js/docs/examples/display-a-globe-with-a-vector-map/) but its text did not load, so the exact wording is NOT VERIFIED. World Monitor ships both a 3D globe and a flat map using "globe.gl + Three.js, deck.gl + MapLibre GL" (https://github.com/koala73/worldmonitor).

### 2.2 Hebrew and right-to-left labels

- MapLibre needs an add-on to draw Hebrew correctly. https://maplibre.org/maplibre-gl-js/docs/examples/add-support-for-right-to-left-scripts/ : for "right-to-left languages such as Arabic and Hebrew", loaded through `maplibregl.setRTLTextPlugin()` with lazy loading.
- The example loads the add-on from a public content network (unpkg). For minimal third-party dependence, copy that file to Tzofia's own hosting.
- Hebrew place names depend on the base map data, see section 3.

### 2.3 How real products do it

| Product | What is verified | Source |
|---|---|---|
| tar1090 (the open-source aircraft map used by hobbyists and aggregators) | OpenLayers build in the page (`libs/ol-custom-10.9.0.js`), zstd decompression in the browser (`libs/zstddec-tar1090-0.0.5.js`), one sprite image for all icons (`images/sprites.png`). Licence GPL v2 or later | https://raw.githubusercontent.com/wiedehopf/tar1090/master/html/index.html ; https://github.com/wiedehopf/tar1090/blob/master/LICENSE |
| readsb (the server behind tar1090) | Splits the world into indexed files for the map (`--write-json-globe-index`), a compact binary format (`--write-json-binCraft-only`), and an API filtered "by lat/lon/radius". Globe indexing suits "more than 500 concurrent planes". Licence GPL-3.0 | https://github.com/wiedehopf/readsb |
| globe.adsbexchange.com | Runs on tar1090 according to a trade blog (secondary source). A primary confirmation from ADS-B Exchange itself: NOT VERIFIED | https://www.rtl-sdr.com/adsbexchange-now-using-tar1090-historical-flight-tracks-military-aircraft-filters-and-more/ |
| Flightradar24 | Moved to GPU drawing and vector base maps in March 2025: "tens of thousands of moving aircraft icons"; "base maps are now rendered in vector format"; positions refresh went from 8 seconds to "approximately 2-3 seconds" | https://www.flightradar24.com/blog/inside-flightradar24/supercharging-flightradar24s-data-display/ |
| MarineTraffic | Level of detail by zoom: "When zoomed out, the display depicts an overview"; "When zoomed in enough, vessels are displayed as coloured icons." The exact tile mechanism behind it: NOT VERIFIED | https://support.marinetraffic.com/en/articles/9552654 |
| KeepTrack (satellites) | Own WebGL 2 code, orbit maths in background threads: "Orbit propagation runs in background threads"; claims "50,000+ satellites in real-time"; "Works on mobile, tablet, and desktop". Licence AGPL v3 or later | https://github.com/thkruz/keeptrack.space |
| Stuff in Space (satellites) | "A real-time interactive WebGL visualisation of objects in Earth orbit". No licence declared in the repository, last push January 2024. Without a licence the code may not be reused | https://github.com/jeyoder/ThingsInSpace ; https://api.github.com/repos/jeyoder/ThingsInSpace |

Lessons that repeat across all of them:

1. Draw moving objects on the GPU from one icon sprite sheet, never as page elements.
2. Send the phone only what its current view needs (world split into cells or tiles, or a query by area).
3. Use a compact binary or compressed format instead of plain text.
4. Zoomed out, show an overview (density or clusters); individual objects only when zoomed in.
5. For satellites, send orbital elements rarely and compute positions on the device. Library: https://github.com/shashwatak/satellite-js (MIT, "SGP4/SDP4 calculations, as callable javascript"). The source data changes slowly: https://celestrak.org/NORAD/documentation/gp-data-formats.php : "checks for new GP data once every 2 hours". CelesTrak blocks over-eager clients, so Tzofia's server must fetch once and serve its own copy.

---

## 3. Base maps with minimal dependence

| Option | Cost and limits | Dependence | Hebrew labels | Source and quote |
|---|---|---|---|---|
| OpenStreetMap's own tile servers | Free, no guarantee, may block | High and fragile. Not meant for a public product | Local names only | https://operations.osmfoundation.org/policies/tiles/ : "there is no SLA or guarantee"; "We may block access, without notice" |
| Protomaps base map as one PMTiles file, self-hosted | Free data; pay only storage and requests | Lowest. One file on own storage, no tile server process | Yes, verified: table row "Hebrew ... `name:he`" | https://docs.protomaps.com/ : "accessible via HTTP Range Requests"; https://docs.protomaps.com/basemaps/downloads : "A full planet file is roughly 120 gigabytes"; https://docs.protomaps.com/basemaps/localization : "Protomaps distributes a localized MapLibre style.json file" |
| Where to host that file | Cloudflare R2 has no traffic fee | One storage vendor, replaceable by any other object storage or the own server's disk | n/a | https://docs.protomaps.com/pmtiles/cloud-storage : "R2 is the recommended storage platform for PMTiles because it does not have bandwidth fees" |
| OpenFreeMap public instance | Free, no key, donation funded | Depends on one volunteer-run service; can be self-hosted later | Schema stores names per language (`name:xx`); a ready Hebrew style: NOT VERIFIED | https://openfreemap.org/ : "no limits on the number of map views or requests"; "no registration, no user database, no API keys, and no cookies"; https://openmaptiles.org/schema/ : "Language-specific values are in name:xx." |
| OpenFreeMap self-hosted | Own Ubuntu server, weekly planet builds | Low | as above | https://github.com/hyperknot/openfreemap : "The license of this project is MIT."; hardware needs not stated: NOT VERIFIED |
| MapTiler Cloud | Free plan for non-commercial use: "5k/month" sessions, "100k/month" requests. Flex "$30/month" with 25k sessions and 500k requests, then "$0.15/1k requests" | Vendor | Hebrew availability: NOT VERIFIED | https://www.maptiler.com/cloud/pricing/ |
| Stadia Maps | Free "200,000 credits/month", commercial use not allowed. Starter $20 for 1,000,000 credits. Standard $80 for 7,500,000 | Vendor | NOT VERIFIED | https://stadiamaps.com/pricing/ |
| Mapbox | Web: "Up to 50,000" map loads free, then "$5.00" per 1,000. Mobile: "Up to 25,000" monthly users free | Vendor, and its current web library is not open source (licence detail NOT VERIFIED here) | NOT VERIFIED | https://www.mapbox.com/pricing |

Recommendation for the base map: Protomaps PMTiles on own storage, drawn by MapLibre with the right-to-left add-on, Hebrew style by default and English style behind the language toggle. Attribution to OpenStreetMap is required (https://docs.protomaps.com/basemaps/downloads : "OpenStreetMap attribution required"). OpenFreeMap is a sensible stand-in during early development. Satellite imagery is a separate matter and needs its own source.

Calculation: 120 GB on R2 at "$0.015 / GB-month" with "10 GB-month / month" free is about 110 × 0.015 = 1.65 USD a month. Tile reads are Class B operations at "$0.36 / million requests", with "10 million requests / month" free (https://developers.cloudflare.com/r2/pricing/). A smaller file is possible by cutting the deepest zoom levels, since a tracking map rarely needs street-level detail.

---

## 4. Server side

### 4.1 Is a dedicated, always-on server required?

Yes, in practice some always-on process is required, because:

- Live ship data arrives as a stream that the server must stay connected to, and the provider forbids browsers from connecting directly. https://aisstream.io/documentation : "Direct browser connections are not permitted; proxy only the information your clients need." Limits there: "3 subscribed connections" per account; "no SLA or uptime guarantee".
- Aircraft data sources meter requests per account (example: https://openskynetwork.github.io/opensky-api/rest.html , 4,000 credits a day for a registered user, a global query costs 4 credits, time resolution 5 seconds). One server must fetch once and fan out to all visitors; visitors must never call the source.
- Alerts such as "rapid descent" need a process that watches every aircraft continuously, whether or not anyone has the site open.

### 4.2 Options compared

| Option | Verified capabilities and limits | Verified price | Verdict |
|---|---|---|---|
| A. Small always-on virtual server (Hetzner Cloud, Germany or Finland) | Full control: long-lived connections, memory, any software. Plans: CX23 2 vCPU / 4 GB; CX33 4 vCPU / 8 GB / 80 GB; CAX21 4 ARM vCPU / 8 GB; 20 TB traffic included (https://www.hetzner.com/cloud/cost-optimized) | After the 15 June 2026 increase, excluding VAT: CX23 €5.49, CX33 €8.49, CX43 €15.99, CAX11 €5.99, CAX21 €10.49, CPX22 €19.49, CCX13 (dedicated cores) €42.99. IPv4 address "€ 0.50/month" (https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/ ; https://docs.hetzner.com/cloud/servers/overview/) | Recommended core. Cheapest, most independent, portable to any other host. Needs basic server upkeep. |
| B. Cloudflare Workers + Durable Objects + R2 | Hibernating sockets keep phones connected at no running charge: "do not accrue during hibernation". A Durable Object can hold the outbound feed connection: "TCP sockets and outbound WebSockets also prevent eviction." Memory cap per instance: "up to 128 MB". Scheduled jobs: "15 min" maximum. Free plan CPU: "10 milliseconds of CPU time per invocation" | Paid plan "$5 USD per month" with "10 million included per month" requests. Durable Objects: "400,000 GB-s / month, + $12.50/million GB-s"; "1 million / month, + $0.15/million" requests; incoming socket messages billed at "a 20:1 ratio". R2 egress "Free" (https://developers.cloudflare.com/workers/platform/pricing/ ; https://developers.cloudflare.com/durable-objects/platform/pricing/ ; https://developers.cloudflare.com/durable-objects/platform/limits/ ; https://developers.cloudflare.com/workers/platform/limits/) | Workable alternative with no server to maintain and built-in global reach. More vendor-specific code, and the 128 MB memory cap forces the world state to be split across several objects. |
| C. Supabase alone | Functions are short-lived: wall clock "Free plan: 150s", "Paid plans: 400s", CPU "2s" per request, memory "256MB". Realtime caps: Pro 500 connections and 500 messages per second; Pro without spend cap 10,000 connections and 2,500 messages per second. Scheduler: "every second to once a year", "no more than 8 Jobs run concurrently", each job "no more than 10 minutes" | Pro "$25/month". Realtime: "$2.50 per 1 million messages"; "$10 per 1,000 peak connections". Egress 250 GB then "$0.09 per GB" (https://supabase.com/docs/guides/functions/limits ; https://supabase.com/docs/guides/realtime/limits ; https://supabase.com/docs/guides/cron ; https://supabase.com/pricing ; https://supabase.com/docs/guides/realtime/pricing) | Cannot carry continuous ingest of live aircraft and ships by itself. Good for slow layers and for accounts. See 4.3. |
| D. Fly.io | Always-on small machines, similar to A but managed | "shared-cpu-1x with 1GB RAM: $6.70/month"; "shared-cpu-2x with 2GB RAM: $13.39/month"; traffic "$0.02/GB" in Europe and North America; volume "$0.15/GB/month" (https://docs.fly.io/about/pricing) | Fine alternative to A if server upkeep is unwanted. Traffic is metered, unlike Hetzner's included 20 TB. |
| E. Cloudflare Containers | Containers that sleep when idle | Needs the $5 plan; "$0.000020 per additional vCPU-second"; egress "$0.025" per GB (https://developers.cloudflare.com/containers/pricing/) | An always-on container costs more than a Hetzner server. Calculation: 1 vCPU for a month is about 2.6 million seconds × 0.00002 = 52 USD before the included allowance. |

### 4.3 Can Supabase alone carry the live feeds?

No, for three verified reasons:

1. No persistent process. Edge Functions stop after 150 or 400 seconds (limits page above), and the documentation says of sockets inside functions: "The Function will shutdown when it reaches one of these limits" (https://supabase.com/docs/guides/functions/websockets). A feed connection would be torn down every few minutes.
2. Message arithmetic. Calculation: Realtime on the Pro plan allows 500 messages per second. Even with spend cap removed (2,500 per second) the billing is $2.50 per million messages. One message per second to each of only 200 viewers is about 518 million messages a month, roughly 1,280 USD. How exactly a broadcast to many subscribers is counted is NOT VERIFIED on the pricing page, so treat this as an order-of-magnitude warning, not a quote.
3. Database as a pipe. Writing every position into Postgres just to broadcast it loads the database for no benefit.

What Supabase remains good for in Tzofia: user accounts if alerts need them, storing alert subscriptions and push tokens, slow event layers that change every few minutes (earthquakes, fires, outages) fetched by scheduled jobs, and admin data. Because the owner already runs Supabase, this is a familiar place for the slow, relational part.

### 4.4 Patterns that keep the phone light

1. View-based subscription. The phone sends its map rectangle and zoom; the server sends only objects inside it. readsb does exactly this with an API "by lat/lon/radius" and a world index.
2. Level of detail by zoom. Whole-world view: clusters or a density picture built on the server. Regional view: individual icons. MarineTraffic and MapLibre's own guide both do this.
3. Changes only. After the first snapshot, send only objects that moved, appeared or disappeared since the last message.
4. Compact binary messages instead of text, compressed. tar1090 and readsb use a binary format plus zstd.
5. Motion on the device. Send position, speed and heading every few seconds and let the phone glide the icon in between. Flightradar24's own feed refreshes about every 2 to 3 seconds, so a smooth map does not require a faster server feed.
6. Dense, slowly changing layers (ship density, fire points, jamming grid) as vector tiles produced on the server and cached at the edge. A ready tile server: https://github.com/maplibre/martin (Apache 2.0 or MIT, serves PostGIS and PMTiles).
7. Satellites computed on the device from orbital elements refreshed every 2 hours, in a background thread.
8. Edge caching for everything that is the same for all visitors (event layers, satellite elements, base map). Third-party keys live only on the server; the browser talks only to Tzofia's own address.
9. Heavy work off the main thread on the phone. deck.gl's guidance: "use web workers to load data and generate attributes".

Calculation, message size: 12,000 aircraft × about 20 bytes each (identifier, position, altitude, speed, heading, flags) is about 240 KB for a full world snapshot before compression. A phone looking at one region gets a small fraction of that.

### 4.5 Track history storage

Calculation, data volume (assumptions stated, not vendor facts):

- Aircraft: 12,000 airborne × one stored point every 5 seconds = 12,000 × 17,280 = about 207 million points a day. At one point every 30 seconds: about 35 million a day.
- Ships: 100,000 active × one stored point every 2 minutes = about 72 million points a day.
- At 30 to 50 bytes a row uncompressed, 280 million rows a day is roughly 8 to 14 GB a day. Storing every raw point is therefore not viable on a small server; history must be thinned (store a point only when heading, altitude or speed changed meaningfully) and compressed.

| Store | Verified facts | Fit |
|---|---|---|
| Per-object trace files, as readsb does | `--write-globe-history` archives traces; writing full traces costs "roughly 100 IOPS" (https://github.com/wiedehopf/readsb) | Simplest for "show this aircraft's path". No extra database. Weak for questions across many objects. |
| ClickHouse | "column-oriented SQL database management system (DBMS) for online analytical processing"; Apache 2.0 (https://clickhouse.com/docs/intro ; https://github.com/ClickHouse/ClickHouse) | Best for billions of points and questions across all objects. One more system to run. Compression ratio on this data: NOT VERIFIED. |
| TimescaleDB on own Postgres | Two licences, Apache 2.0 and the vendor's own (https://github.com/timescale/timescaledb). Compression methods described at https://www.tigerdata.com/docs/learn/columnar-storage/compression-methods ("delta encoding, delta-of-delta, simple-8b, and run-length encoding"). Which features fall under which licence: NOT VERIFIED | Good middle ground if history lives beside PostGIS on the own server. |
| TimescaleDB on Supabase | "deprecated in projects using Postgres 17"; only the "Apache 2 Edition" (https://supabase.com/docs/guides/database/extensions/timescaledb) | Not an option going forward. |
| Plain Postgres with PostGIS on Supabase | Disk "8 GB included", then "$0.125 per GB"; smallest compute "~$10" with 1 GB memory (https://supabase.com/docs/guides/platform/compute-and-disk) | Fine for events and alerts. Too small and too costly for raw track history. |

Suggested order: launch with the last few hours of tracks held in server memory and thinned trace files on the server disk; add ClickHouse on the same or a second server only when longer history or cross-object search becomes a real need.

---

## 5. Security and safety for a public tool

### 5.1 Technical measures

| Measure | Detail | Source |
|---|---|---|
| Keys stay on the server | The browser calls only Tzofia's own address; the server holds provider keys and absorbs provider rate limits | aisstream requirement quoted in 4.1 |
| Protection in front of the server | Cloudflare free plan: "standard, unmetered DDoS protection (layers 3-7)", "Available on all plans" | https://developers.cloudflare.com/ddos-protection/ |
| Rate limiting at the edge | Free plan: 1 rule, counted by IP, 10 second window. Pro: 2 rules. Pro price "$20/mo billed annually, or $25/mo billed monthly" | https://developers.cloudflare.com/waf/rate-limiting-rules/ ; https://www.cloudflare.com/plans/ |
| Live connections through Cloudflare | "WebSockets are supported on all Cloudflare plans." Caveat: after connection "the WAF does not perform any further inspections", and connections drop when Cloudflare restarts servers, so the client must reconnect by itself and the own server must limit connections per address | https://developers.cloudflare.com/network/websockets/ |
| Content Security Policy | "mainly used as a defense against cross-site scripting (XSS) attacks"; recommended form: "nonce- or hash-based fetch directives" | https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP |
| Other response headers | Follow the OWASP Secure Headers project. Its header list did not load on the project page: exact list NOT VERIFIED here | https://owasp.org/www-project-secure-headers/ |
| No third-party scripts, fonts or trackers | Host the map library, the right-to-left add-on, fonts and icons on Tzofia's own address. This makes a strict policy possible and removes outside tracking | follows from the MapLibre example loading from a public network (section 2.2) |
| Supply chain | Pin exact versions with a lock file, few dependencies, verify with `npm audit signatures`. Provenance "does not guarantee the package has no malicious code" | https://docs.npmjs.com/generating-provenance-statements |
| Input validation | Every value from a visitor (map rectangle, zoom, layer names, search text) checked on the server against fixed ranges and lists; cap the size of an area request per zoom level so nobody can pull the whole world at full detail in a loop | own recommendation |
| Text from outside feeds | Callsigns, ship names, alert texts are untrusted input. Always insert as text, never as page markup | own recommendation |

### 5.2 Accounts or no accounts

- The map can and should work with no account, no cookies and no analytics that identify people. OpenFreeMap and ARGUS are precedents: "no registration, no user database, no API keys, and no cookies"; ARGUS: "no database, accounts, or tracking".
- Push alerts need a stored push address per device, not an identity. An anonymous random device identifier is enough for "alert me about this area".
- Accounts are justified only for paid tiers or saved watch lists across devices. If added, Supabase Auth is the tool the owner already uses.
- Logs: keep short-lived, no full addresses beyond what rate limiting needs. Exact retention is a decision for the owner.

### 5.3 What the established trackers restrict, and why it matters

- Flightradar24 hides some aircraft: "limited or blocked at the request of owners or operators"; "Military and government aircraft may also be blocked entirely."; others appear "anonymized by aircraft type" (https://support.fr24.com/support/solutions/articles/3000117426-why-does-it-say-that-a-flight-is-blocked-).
- The United States scheme behind that: vendors on the official feed "are bound by a Data Access User Agreement to filter any LADD participant from public display" (https://www.faa.gov/pilots/ladd).
- Flightradar24 forbids automated collection: access only "via a human-operated web browser or mobile application"; and states the data "is not related by any means to the safety of navigation" (https://www.flightradar24.com/terms-and-conditions).
- ADS-B Exchange (now under JETNET) forbids republishing: customers shall not "publish, resell, transmit, broadcast, distribute the Services or data" (https://www.jetnet.com/legal/terms-of-use). Its historic "unfiltered" policy statement: NOT VERIFIED (the old policy page returns 404).
- MarineTraffic terms: page refused the fetch (403). NOT VERIFIED.
- OpenSky terms of use: page did not load. NOT VERIFIED.

Consequences for Tzofia: (a) the map may only show data whose source licence permits public redisplay, which rules out scraping the commercial trackers; (b) a decision is needed on whether to hide or anonymise aircraft that the big trackers hide, since a tool that shows military and blocked aircraft in a conflict region carries real-world risk; (c) the same question applies to delaying or coarsening sensitive positions.

### 5.4 Responsible display of alerts

Own recommendations, based on the disclaimers the trackers themselves publish ("may contain errors, due to the intrinsic limitations of radio communications", Flightradar24 terms):

1. Every automatic alert carries a plain confidence label and the reason it fired (for example: descent rate above a threshold for N consecutive reports from M receivers).
2. Require confirmation over several consecutive reports before alerting. A single bad altitude value is common in this kind of data.
3. Word alerts as observations, not conclusions: "rapid descent detected", never "crash".
4. Show the data source and the time of the last report on every object and alert.
5. A permanent notice that the map is not for navigation or emergency decisions, and that official emergency instructions take precedence.
6. Loud alerts are opt-in, per area and per type, with a daily cap, to avoid alarm fatigue and panic.

---

## 6. Existing open-source projects to learn from

| Project | Licence | Stack | Does well | Does badly or risks |
|---|---|---|---|---|
| koala73/worldmonitor https://github.com/koala73/worldmonitor | "AGPL-3.0-only" | "Vanilla TypeScript, Vite, globe.gl + Three.js, deck.gl + MapLibre GL"; Vercel functions, a relay on Railway, Redis cache, installable web app | The closest match to Tzofia: many layers on one map, both globe and flat views, caching in three tiers, 86.7k stars. Its source list is a ready map of feeds: adsb.lol, OpenSky, CelesTrak, gpsjam.org, Cloudflare Radar, USGS, NASA FIRMS (https://www.worldmonitor.app/docs/data-sources) | Tracks only "~80-120 intelligence-relevant satellites", not the full catalogue. Depends on several hosted vendors. AGPL: reusing its code obliges publishing Tzofia's own source. Hebrew or right-to-left support: NOT VERIFIED. |
| BigBodyCobain/Shadowbroker https://github.com/bigbodycobain/shadowbroker | AGPL-3.0 | Next.js, MapLibre GL, Python FastAPI back end, Docker | Self-hosted in one command, 60+ feeds, ships over the aisstream stream, satellites from CelesTrak, clustering for dense layers, snapshot playback. 11.1k stars | Built for one operator on their own machine, not for a public audience: default back end memory 4 GB. Includes camera feeds and a "FlightRadar24" source, both of which raise licence and privacy questions for a public service. AGPL as above. |
| wiedehopf/tar1090 https://github.com/wiedehopf/tar1090 | GPL v2 or later | OpenLayers, jQuery, zstd, plain JavaScript | The reference for showing very many aircraft smoothly, including track history ("the last 8 hours of traces") | Aircraft only. Desktop-era interface, not Hebrew. GPL: derived code must stay GPL. |
| wiedehopf/readsb https://github.com/wiedehopf/readsb | GPL-3.0 | C | The reference server for merging many receiver feeds, world indexing, binary output, area queries, trace history | Aircraft only. Needs raw receiver feeds, which Tzofia will not have unless it joins or builds a receiver network. |
| thkruz/keeptrack.space https://github.com/thkruz/keeptrack.space | AGPL v3 or later | TypeScript, custom WebGL 2, background threads | Best open satellite viewer: full catalogue at speed | Satellites only, large specialised code base. AGPL as above. Better as a model than as a component. |
| jeyoder/ThingsInSpace https://github.com/jeyoder/ThingsInSpace | none declared | JavaScript, WebGL | Small, readable example of the technique | No licence, so not reusable. Last push January 2024. |
| katipally/argus https://github.com/katipally/argus | MIT | Next.js 16, React 19, MapLibre GL 5, satellite.js | Clean pattern: server routes as "normalizing proxies with caching and circuit breakers", no accounts, permissive licence | 1 star, 5 commits. Unproven. Use as a reading reference only. |
| keei/OsintBroker https://github.com/keei/OsintBroker | none formal ("educational and personal research purposes") | Next.js, MapLibre GL, FastAPI, SQLite | 28 switchable layers incl. jamming and outages | 0 stars, no real licence. Not reusable. |

Other hits from the search that were not examined: github.com/bjdubb/osiris, github.com/WilliamTaack/osiris-Palintir, github.com/JasonWilder117/ST-Osiris-OSINT. NOT VERIFIED.

Reading of the field: the two popular combined dashboards both chose MapLibre, one of them with deck.gl on top, and both are AGPL. The safest reuse is of ideas and of permissively licensed building blocks (MapLibre BSD, deck.gl MIT, satellite.js MIT, Protomaps BSD, Martin Apache/MIT), with Tzofia's own code written fresh.

---

## 7. Monthly running cost of the recommended setup

Prices as published on 5 October 2026. Hetzner prices exclude VAT. Live data feed subscriptions are not included (see open questions).

| Line | Minimal | Comfortable | Source |
|---|---|---|---|
| Server for ingest, live state and the connection gateway | Hetzner CX33, 4 vCPU / 8 GB: €8.49 | Hetzner CCX13, dedicated cores: €42.99 | https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/ |
| Public IPv4 address | €0.50 | €0.50 | https://docs.hetzner.com/cloud/servers/overview/ : "€ 0.50/month (excl. VAT)" |
| Cloudflare in front (DDoS protection, cache, 1 rate rule) | Free: $0 | Pro: $25 billed monthly | https://www.cloudflare.com/plans/ |
| Site files hosting | $0 | $0 | https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/ : "Requests to static assets are free and unlimited." |
| Base map file on R2 (120 GB planet) | about $1.65 (calculation in section 3) | same, plus $0.36 per million reads above 10 million | https://developers.cloudflare.com/r2/pricing/ |
| Supabase for accounts, alert subscriptions, slow layers | Free plan: $0 | Pro: $25 | https://supabase.com/pricing |
| Push sending | $0 with own VAPID keys or Expo's relay | $0 | Apple and Expo pages in section 1. Expo relay price not stated on its page: NOT VERIFIED |
| Apple developer membership (only once a native app exists) | $0 | $99 a year, about $8.25 a month | https://developer.apple.com/programs/whats-included/ |
| Google Play registration (only once a native app exists) | $0 | $25 once | https://support.google.com/googleplay/android-developer/answer/6112435 |
| Expo build service | Free: "15 Android and 15 iOS builds" a month | Starter "$19/month" | https://expo.dev/pricing |
| Domain name | NOT VERIFIED | NOT VERIFIED | |
| Server backups, extra disk for history | NOT VERIFIED (Hetzner price page did not render figures) | NOT VERIFIED | |

Calculation, totals: minimal about €9 plus $2, roughly 12 USD a month, web app only. Comfortable about €43.50 plus roughly $78, on the order of 125 to 130 USD a month with a dedicated-core server, Cloudflare Pro, Supabase Pro, Expo Starter and the Apple fee. A sensible starting point sits between: CX33, Cloudflare Free, R2, Supabase Pro only if accounts are needed, about 12 to 40 USD a month.

---

## Recommended architecture and why

### Recommended

1. Client: one web app, installable to the home screen, written in TypeScript. MapLibre GL JS for the base map and event layers, deck.gl on top for aircraft and ships, satellite.js in a background thread for satellites. Hebrew interface by default with a language toggle; MapLibre's right-to-left add-on and all fonts served from Tzofia's own address. Flat map first; globe view as a later addition.
2. Base map: Protomaps planet file on Cloudflare R2 (or on the server's own disk), Hebrew and English styles. No commercial map vendor.
3. Core server: one always-on Hetzner server running three small services in containers: (a) ingest workers that hold the feed connections and poll the slower sources, (b) an in-memory picture of the world with the alert rules, (c) a gateway that pushes view-based, changes-only, binary updates to phones over a live connection. Everything in portable containers so it can move to any host.
4. Edge: Cloudflare free plan in front for DDoS protection, caching of shared layers and one rate-limit rule. The origin server accepts traffic only from Cloudflare.
5. Supabase (already in the owner's toolbox): alert subscriptions, push addresses, optional accounts, slow event layers. Not in the live path.
6. Alerts: web push from the own server for ordinary notifications. A thin Expo app as stage two for the loud alert: Android urgent channel with a guided Do Not Disturb override; iPhone Time Sensitive by default and a Critical Alerts request to Apple.
7. History: last hours in memory and thinned trace files at launch; ClickHouse added when longer history is needed.

Why this shape:

- It meets "must not choke": the phone only ever receives what is in view, in compact form, and draws it on the GPU. The documented headroom of the drawing library (about a million items) is far above the 15 thousand aircraft and the visible share of ships.
- It meets "as close to real time as possible": a persistent server holds the feeds open and pushes changes within seconds. Flightradar24 itself refreshes about every 2 to 3 seconds.
- It meets "minimal dependence": the only parts that are not self-run are Cloudflare in front and the app stores' push services, and every building block is open source under a permissive licence.
- It meets "secure for the public": no keys in the browser, no third-party scripts, no accounts needed for the map, protection in front of the origin.
- It is honest about the loud alert: only a native app can do it, and on iPhone only with Apple's approval.

### Alternatives

- Alternative A, no server to maintain: Cloudflare Workers with Durable Objects instead of the Hetzner server. Verified as technically possible (outbound sockets keep an object alive, hibernating client sockets cost nothing while idle). Price starts at $5 a month. Trade-offs: 128 MB memory per instance forces splitting the world across objects, code is tied to one vendor, and debugging is harder for a solo developer. Choose this if server upkeep is the bigger worry than vendor lock-in.
- Alternative B, managed machine: Fly.io instead of Hetzner, from $6.70 a month for 1 GB. Same architecture, less upkeep, metered traffic.
- Alternative C, native first: build the whole product in Expo with MapLibre's native library. Best alert integration, but two store reviews, slower updates, and desktop users are left out. Not recommended as the first step.
- Alternative D, 3D globe first: CesiumJS instead of MapLibre plus deck.gl. Best for satellites, heaviest on phones. Consider only if the globe is the heart of the product.
- Alternative E, start from an existing project: fork World Monitor or Shadowbroker. Fastest to a demo, but AGPL obliges publishing Tzofia's source, neither is built around Hebrew, and Shadowbroker is designed for one operator, not a public audience.
- Not viable: Supabase alone for the live feeds (section 4.3); OpenStreetMap's public tile servers as the base map (section 3).

---

## Open questions / not verified

Decisions for the owner:

1. Data feeds. Which aircraft and ship sources may legally be shown on a public site, at what price, and with what refresh rate. This decides how "live" the map can be and may add the largest cost line. Not covered in this file.
2. Policy on blocked, military and government aircraft and on sensitive vessels: show, anonymise, delay or hide.
3. Whether Tzofia's own code will be open source. This decides whether AGPL projects can be used as a base.
4. Whether alerts need accounts or can stay anonymous per device.
5. How much track history is wanted (hours, days, years). This decides the storage design and disk cost.

Not verified on a primary source:

- Apple's approval criteria for the Critical Alerts entitlement (form is behind a login).
- Whether Time Sensitive notifications still require a separate capability (Apple page returned 404).
- Whether the iPhone mute switch silences audio played by an open web page.
- MapLibre GL JS globe projection wording and version (example page text did not load).
- Documented CesiumJS performance on phones.
- That globe.adsbexchange.com runs tar1090: only a secondary source (rtl-sdr.com) was found.
- ADS-B Exchange's historic "unfiltered data" policy (old page returns 404).
- MarineTraffic terms of use (403) and the exact mechanism behind its zoomed-out overview.
- OpenSky Network terms of use, in particular the limits on commercial use (page did not load).
- A ready Hebrew label style for OpenFreeMap; hardware needs for self-hosting OpenFreeMap.
- Hebrew label availability on MapTiler, Stadia and Mapbox; Mapbox library licence.
- Which TimescaleDB features fall under the vendor's own licence; ClickHouse compression ratio on position data.
- The exact header list of the OWASP Secure Headers project.
- How Supabase counts one broadcast delivered to many subscribers for billing.
- Expo push relay price; Hetzner backup, extra disk and extra traffic prices; domain name price.
- Current stock of Hetzner's cheapest plans: the plan page rendered without prices and the extraction reported products as "currently unavailable". Check in the Hetzner console before relying on CX33.
- The three "osiris" repositories found in search were not examined.
- World Monitor's Hebrew or right-to-left support.

---

## Sources

Form factor and alerts
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- https://webkit.org/blog/16535/meet-declarative-web-push/
- https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers.md
- https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.critical-alerts.md
- https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel.md
- https://developer.apple.com/programs/whats-included/
- https://developer.mozilla.org/en-US/docs/Web/API/Notification/silent
- https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
- https://web.dev/articles/push-notifications-overview
- https://source.android.com/docs/core/permissions/fsi-limits
- https://developer.android.com/develop/ui/views/notifications/channels
- https://developer.android.com/develop/ui/views/notifications/build-notification
- https://developer.android.com/develop/ui/compose/notifications
- https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/app/NotificationChannel.java
- https://docs.expo.dev/versions/latest/sdk/notifications/
- https://docs.expo.dev/push-notifications/sending-notifications/
- https://expo.dev/pricing
- https://support.google.com/googleplay/android-developer/answer/6112435
- https://github.com/web-push-libs/web-push
- https://github.com/maplibre/maplibre-react-native

Map rendering
- https://github.com/maplibre/maplibre-gl-js
- https://maplibre.org/maplibre-gl-js/docs/guides/large-data/
- https://maplibre.org/maplibre-gl-js/docs/examples/add-support-for-right-to-left-scripts/
- https://maplibre.org/maplibre-gl-js/docs/examples/display-a-globe-with-a-vector-map/
- https://github.com/visgl/deck.gl
- https://deck.gl/docs/developer-guide/performance
- https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre
- https://openlayers.org/
- https://openlayers.org/en/latest/examples/webgl-points-layer.html
- https://leafletjs.com/
- https://github.com/Leaflet/Leaflet
- https://github.com/CesiumGS/cesium
- https://www.flightradar24.com/blog/inside-flightradar24/supercharging-flightradar24s-data-display/
- https://support.marinetraffic.com/en/articles/9552654
- https://www.rtl-sdr.com/adsbexchange-now-using-tar1090-historical-flight-tracks-military-aircraft-filters-and-more/ (secondary)
- https://github.com/shashwatak/satellite-js
- https://celestrak.org/NORAD/documentation/gp-data-formats.php

Base maps
- https://operations.osmfoundation.org/policies/tiles/
- https://docs.protomaps.com/
- https://docs.protomaps.com/basemaps/downloads
- https://docs.protomaps.com/basemaps/localization
- https://docs.protomaps.com/pmtiles/cloud-storage
- https://openfreemap.org/
- https://github.com/hyperknot/openfreemap
- https://openmaptiles.org/schema/
- https://www.maptiler.com/cloud/pricing/
- https://stadiamaps.com/pricing/
- https://www.mapbox.com/pricing

Server side
- https://www.hetzner.com/cloud/cost-optimized
- https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/
- https://docs.hetzner.com/cloud/servers/overview/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/limits/
- https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/containers/pricing/
- https://supabase.com/pricing
- https://supabase.com/docs/guides/realtime/limits
- https://supabase.com/docs/guides/realtime/pricing
- https://supabase.com/docs/guides/functions/limits
- https://supabase.com/docs/guides/functions/background-tasks
- https://supabase.com/docs/guides/functions/websockets
- https://supabase.com/docs/guides/cron
- https://supabase.com/docs/guides/platform/compute-and-disk
- https://supabase.com/docs/guides/database/extensions/timescaledb
- https://docs.fly.io/about/pricing
- https://aisstream.io/documentation
- https://openskynetwork.github.io/opensky-api/rest.html
- https://clickhouse.com/docs/intro
- https://github.com/ClickHouse/ClickHouse
- https://github.com/timescale/timescaledb
- https://www.tigerdata.com/docs/learn/columnar-storage/compression-methods
- https://github.com/maplibre/martin

Security and safety
- https://www.cloudflare.com/plans/
- https://developers.cloudflare.com/ddos-protection/
- https://developers.cloudflare.com/waf/rate-limiting-rules/
- https://developers.cloudflare.com/network/websockets/
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP
- https://owasp.org/www-project-secure-headers/
- https://docs.npmjs.com/generating-provenance-statements
- https://www.flightradar24.com/terms-and-conditions
- https://support.fr24.com/support/solutions/articles/3000117426-why-does-it-say-that-a-flight-is-blocked-
- https://www.faa.gov/pilots/ladd
- https://www.jetnet.com/legal/terms-of-use

Open-source projects
- https://github.com/koala73/worldmonitor
- https://www.worldmonitor.app/docs/data-sources
- https://github.com/bigbodycobain/shadowbroker
- https://github.com/wiedehopf/tar1090
- https://github.com/wiedehopf/tar1090/blob/master/LICENSE
- https://raw.githubusercontent.com/wiedehopf/tar1090/master/html/index.html
- https://github.com/wiedehopf/readsb
- https://github.com/thkruz/keeptrack.space
- https://github.com/jeyoder/ThingsInSpace
- https://api.github.com/repos/jeyoder/ThingsInSpace
- https://github.com/katipally/argus
- https://github.com/keei/OsintBroker

Pages that failed to load (listed for completeness)
- https://www.adsbexchange.com/legal-and-privacy/ (404)
- https://opensky-network.org/about/terms-of-use (timeout)
- https://www.marinetraffic.com/en/p/terms (403)
- https://developer.apple.com/contact/request/notifications-critical-alerts-entitlement/ (login required)
- https://www.hetzner.com/cloud (prices did not render)
