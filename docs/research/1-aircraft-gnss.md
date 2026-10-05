# Tzofia research 1: aircraft tracking and GNSS interference

Research date: 5 October 2026. Every claim below carries the URL it was read from and a short exact quote. Anything I could not read on the provider's own page is marked NOT VERIFIED. No numbers were filled in from memory.

Method note: pages were read with WebFetch. Several provider pages are rendered by JavaScript or block automated readers, so their body text could not be read (Flightradar24 API portal, OpenSky terms-of-use page, RapidAPI listing, airplanes.live terms-of-use page). Those gaps are listed in the last section, with what a person needs to open in a browser to close them.

---

## Bottom line

1. Only one live source is both free and openly licensed for a public app without owning a receiver: adsb.lol (data under ODbL, the OpenStreetMap licence). It has no "whole world in one call" endpoint, only radius queries of up to 250 nautical miles, and its operator asks production users to contact him first.
2. airplanes.live and adsb.fi offer the same data format and are also free without a receiver, but both state non-commercial use only. A public journalistic app needs their written permission.
3. OpenSky is free for research and non-commercial use, gives a global snapshot, but lacks the integrity fields (NIC, NACp) and the ADS-B emergency field, and treats a site with advertising as commercial.
4. ADS-B Exchange, FlightAware and Flightradar24 all restrict showing or redistributing their data to the public unless a commercial agreement allows it.
5. For GNSS interference, gpsjam.org publishes its daily per-hexagon counts as CSV files (verified reachable), and the same calculation can be reproduced live from the `nic` and `nac_p` fields that adsb.lol returns.

---

## Part A - live aircraft position sources

### A.0 Comparison table

| Source | Receiver needed? | Global snapshot | Radius query | Rate limit | Price | Public-app terms | Military / LADD / PIA |
|---|---|---|---|---|---|---|---|
| adsb.lol | No (may change) | No | Yes, radius in nm | "dynamic" | Free | ODbL open data; contact for production | Not filtered; dedicated endpoints |
| airplanes.live | No (may change) | No | Yes, max 250 nm | 1 request/second | Free | "Non-Commercial Use" | Not filtered; dedicated endpoints |
| adsb.fi | No for public endpoints; yes for snapshot | Feeders only | Yes, max 250 nm | 1 request/second | Free | "personal, non-commercial use only" | `/v2/mil` exists; LADD/PIA NOT VERIFIED |
| OpenSky | No | Yes (4 credits) | Bounding box | 4,000 credits/day registered | Free | Research and non-commercial; commercial needs licence | "not being filtered" |
| ADSBHub | Yes, mandatory | TCP stream | No | n/a | Free | Commercial and publishing allowed | NOT VERIFIED |
| ADS-B Exchange Community API (RapidAPI) | No | NOT VERIFIED | Yes | 10,000 requests/month | $10/month | Non-commercial; no public dissemination | "unfiltered" |
| ADS-B Exchange enterprise | No | Yes | Yes | Contract | Not published, annual commitment | Contract | "unfiltered" |
| FlightAware AeroAPI | No | No | Search queries | 10 result sets/min (Personal) | $0 / $100 / $1,000 per month minimum | B2C from Standard tier up | Blocked aircraft hidden |
| FlightAware Firehose | No | Stream | n/a | Contract | Per customer | Contract | NOT VERIFIED |
| Flightradar24 API | No | Bounds queries | Bounds | NOT VERIFIED | From $9/month | Raw redistribution prohibited | Blocks LADD, some military |
| AirNav Radar API | No | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | From $119.95/month | NOT VERIFIED | NOT VERIFIED |

### A.1 adsb.lol

- What it is: a community aggregator of ADS-B receivers that publishes everything as open data. Home page description: "open data, unfiltered flight tracking" (https://adsb.lol/).
- Licence: "The license for the API as well as all data ADSB.lol makes public is ODbL" (https://api.adsb.lol/api/openapi.json). The historical archive repository states the same: "This database is made available under the Open Database License" (https://github.com/adsblol/globe_history). The API source code itself is BSD-3-Clause (https://github.com/adsblol/api). I did not fetch the ODbL licence text itself; its attribution and share-alike conditions must be read before launch.
- Price: "You can use the API for free." (https://api.adsb.lol/api/openapi.json).
- Authentication and feeding: none today. "In the future, you will require an API key which you can get by feeding" (same URL). This is the main risk for a builder without a receiver.
- Production use: "If you want to use the API for production purposes, please contact me" (same URL).
- Rate limit: "Rate limits are dynamic based on the environment load." (https://github.com/adsblol/api). No number is published.
- Endpoints (https://api.adsb.lol/api/openapi.json): `/v2/point/{lat}/{lon}/{radius}`, `/v2/lat/{lat}/lon/{lon}/dist/{radius}`, `/v2/closest/{lat}/{lon}/{radius}`, `/v2/hex/{icao_hex}`, `/v2/callsign/{callsign}`, `/v2/reg/{registration}`, `/v2/type/{aircraft_type}`, `/v2/sqk/{squawk}`, `/v2/mil`, `/v2/ladd`, `/v2/pia`. There is no global snapshot endpoint in the specification. The maximum radius is NOT VERIFIED for adsb.lol (the two sister services state 250 nm).
- Military / LADD / PIA: not filtered, and exposed as their own endpoints: "Returns all military registered aircraft", "Returns all aircrafts on LADD filter", "Returns all aircraft with PIA addresses" (same URL).
- Compatibility: "It is a drop-in replacement." for the ADS-B Exchange RapidAPI format (https://github.com/adsblol/api).
- Fields in the response schema (same openapi URL): `alt_baro`, `alt_geom`, `baro_rate`, `geom_rate`, `squawk`, `emergency`, `nic`, `nic_baro`, `rc`, `nac_p`, `nac_v`, `sil`, `sil_type`, `gva`, `sda`, `rssi`, `seen`, `seen_pos`, `type`, `mlat`, `tisb`, `dbFlags`, `gpsOkBefore`, `gpsOkLat`, `gpsOkLon`, `lastPosition`, plus speed, heading and autopilot fields. All eleven fields named in the brief are present.
- Latency: NOT VERIFIED (no figure published). The `seen` and `seen_pos` fields give the age of each record per aircraft, so latency can be measured rather than assumed.

### A.2 airplanes.live

- What it is: "Airplanes.live is a community-run ADS-B aggregator." (https://airplanes.live/).
- Base address: "http://api.airplanes.live/v2/" (https://airplanes.live/api-guide/).
- Endpoints (same URL): `/hex/`, `/callsign/`, `/reg/`, `/type/`, `/squawk/`, `/mil`, `/ladd`, `/pia`, `/point/[lat]/[lon]/[radius]`. Radius: "up to 250 nm". No global snapshot endpoint.
- Rate limit: "rate limited to 1 request per second" (same URL).
- Terms as shown on the API guide: "No SLA No Uptime Guarantee Non-Commercial Use" (same URL). The full terms-of-use page (https://airplanes.live/terms-of-use/) returned no body text to the reader, so the exact definition of non-commercial and any rule about showing the data on a third-party site are NOT VERIFIED.
- Feeding: "Access does not currently require a feeder. That might change in the future." (same URL).
- Filtering: "Airplanes.live will never filter or obfuscate aircraft data." and "the military and special-interest traffic other trackers hide" (https://airplanes.live/).
- Fields: the field page says the output is the readsb aircraft list (https://airplanes.live/rest-api-adsb-data-field-descriptions/); definitions are in A.10 below.
- Latency: NOT VERIFIED.
- Related: the ADSB One API, same format, was run by the same organisation and "was archived by the owner on Apr 29, 2026" (https://github.com/ADSB-One/api). Do not build on it.

### A.3 adsb.fi

- Source of everything below: https://github.com/adsbfi/opendata
- Public endpoints: `/v2/hex/[hex]`, `/v2/callsign/[callsign]`, `/v2/registration/[reg]`, `/v2/sqk/[squawk]`, `/v2/mil`, `/v3/lat/[lat]/lon/[lon]/dist/[dist]` with distance up to 250 NM.
- Global snapshot: `/v2/snapshot`, for feeders only, refreshed twice per minute and tied to the feeder's IP address.
- Rate limit: "Public endpoints are rate limited to 1 request per second".
- Terms: "adsb.fi open data is for personal, non-commercial use only." and "You may not license, sell, rent, or lease any part of the data." and "You must cite adsb.fi and include a link to our home page."
- Warranty: "provided as-is, without any warranty".
- LADD / PIA filtering and latency: NOT VERIFIED.

### A.4 OpenSky Network

- Authentication: "Basic authentication with username and password is no longer accepted." Only the OAuth2 client-credentials flow; tokens last 30 minutes (https://openskynetwork.github.io/opensky-api/rest.html).
- Credits per day (same URL): anonymous 400; registered user 4,000; active feeder (at least 30% uptime in the month) 8,000; licensed user 14,400 per hour. A `/states/all` call costs 1 credit for an area of 25 square degrees or less and 4 credits for more than 400 square degrees or the whole world. Arithmetic from those figures: 4,000 credits buy 1,000 global snapshots per day, about one every 86 seconds.
- Time resolution (same URL): anonymous users get 10-second resolution; authenticated users "Time resolution is 5 seconds".
- Fields (same URL): `vertical_rate`, `squawk`, `spi`, `position_source` (0 ADS-B, 1 ASTERIX, 2 MLAT, 3 FLARM), `category`, barometric and geometric altitude. The documented state vector has no NIC, NACp, SIL, GVA, RSSI or ADS-B `emergency` field. This makes OpenSky unsuitable for computing GNSS interference from the live API.
- Licence: "retrieve live airspace information for research and non-commerical purposes" (https://openskynetwork.github.io/opensky-api/index.html). "Commercial entities must contact us for a license, no matter the intended use case." (https://opensky-network.org/about/faq). The same FAQ counts as commercial use, in the reader's summary, "advertisements on a web page/application using the API". A public site must "credit us by referencing us as the data source".
- Publication: "you should cite the original OpenSky paper" for any publication "including web pages" (https://openskynetwork.github.io/opensky-api/index.html).
- Hosting warning: "we may block AWS and other hyperscalers due to generalized abuse" (same URL). A server-side poller on a large cloud provider may be blocked.
- Filtering: military aircraft "are not being filtered" (https://opensky-network.org/about/faq).
- Coverage: "the best coverage in Europe and the US" (same URL). Coverage over Israel and the eastern Mediterranean is NOT VERIFIED.
- The full terms-of-use page (https://opensky-network.org/about/terms-of-use) could not be read by the tool. NOT VERIFIED beyond the quotes above.

### A.5 ADSBHub

- Source: https://www.adsbhub.org/howtogetdata.php
- Feeding is mandatory: "Every ADSBHub user has to share data feed at least one ADS-B station."
- Delivery: a TCP stream at host data.adsbhub.org, port 5002, in "SBS (30003) format". That format is line-based text; whether it carries NIC, NACp, emergency or RSSI is NOT VERIFIED.
- Terms: "Everybody is allowed to publish the data for free or to use it for commercial purposes."
- Verdict: the most permissive terms of all, but unusable without a receiver.

### A.6 ADS-B Exchange (owned by JETNET)

- Community API, sold through RapidAPI: "$10/mo." for "10,000 requests", "500ms updates", "Query by location, hex, callsign, squawk, and more" (https://www.adsbexchange.com/api-lite/).
- Its scope: "built for non-commercial use—perfect for side projects, research, and experiments" (same URL).
- Data use policy, updated June 13, 2025: "users are prohibited from broadcasting, sharing, disseminating" the data "to the public or any unauthorized third parties" (https://support.adsbexchange.com/hc/en-us/articles/37364077703693-What-is-ADS-B-Exchange-s-data-use-policy).
- JETNET terms, last modified July 6, 2026: customers may not "publish, resell, transmit, broadcast, distribute the Services or data" without written authorisation (https://www.jetnet.com/legal/terms-of-use).
- Commercial use: "Commercial (for profit or non-profit organization) use requires written authorization" (https://adsbexchange.com/?p=19798).
- Enterprise products: "Ultra-low-latency global aircraft positions delivered every 250 milliseconds"; "ongoing subscription services with minimum annual commitments" (https://www.adsbexchange.com/data/). No price is published.
- Filtering: the data page describes "unfiltered aircraft data" (same URL).
- The RapidAPI listing itself (https://rapidapi.com/adsbx/api/adsbexchange-com1) returned no body text; further tiers, overage prices and the exact endpoint list are NOT VERIFIED.
- Verdict: the $10 plan cannot legally feed a public map. A public app needs an enterprise contract.

### A.7 FlightAware AeroAPI and Firehose

- AeroAPI tiers (https://www.flightaware.com/commercial/aeroapi/): Personal "No minimum", Standard "$100/month", Premium "$1,000/month". Rate limits: Personal "10 result sets/minute", Standard "5 result sets/second", Premium "100 result sets/second". Pricing unit: "one set equaling 15 records".
- Personal tier use: "for personal or academic purposes only", with "up to $5 free per month" (same URL). B2C use is allowed from Standard upward; B2B only on Premium (same URL, per the reader's summary of the tier table).
- Per-query prices for position and search calls: NOT VERIFIED (the documentation portal returned only navigation).
- Firehose: "An enterprise-grade, real-time data feed of global aircraft ADS-B positions"; "Total monthly pricing is established on a per customer basis" (https://www.flightaware.com/commercial/firehose/).
- Blocked aircraft: "only available to the aircraft owner/operator" (https://www.flightaware.com/about/faq/).
- Latency on the public site: "30 seconds delayed from real-time", and a map position "may lag real-time by 1-2 minutes" (same URL). Whether these figures apply to AeroAPI or Firehose is NOT VERIFIED.
- Integrity fields (NIC, NACp) in AeroAPI: NOT VERIFIED.
- Verdict: AeroAPI is a query service priced per result, not a firehose of all aircraft. A whole-region live map is a Firehose contract.

### A.8 Flightradar24 official API

- Plans: "three different subscription plans: Explorer, Essential, Advanced" (https://support.fr24.com/support/solutions/articles/3000128167-what-different-types-of-api-subscriptions-are-available-, modified 16 September 2024).
- Price verified for one plan only: Explorer at "$9 a month", normally 30,000 credits per month, per the Flightradar24 blog post dated 30 October 2025 (https://www.flightradar24.com/blog/b2b/how-to-get-started-with-the-flightradar24-api/). Essential and Advanced prices, credit cost per call and rate limits are NOT VERIFIED, because the pricing page (https://fr24api.flightradar24.com/subscriptions-and-credits) is rendered by JavaScript and returned no text.
- Live queries: "using geographical boundaries, callsigns, aircraft registrations, or airport pairs" (same blog URL).
- Terms, last updated June 23rd, 2026 (https://www.flightradar24.com/terms-and-conditions): "prohibited from reselling, transferring, redistributing, lending, leasing, sublicensing or manipulating raw data"; commercial use and derivative works are "permitted at each subscription level", subject (per the reader's summary) to the product adding significant value and the data not being the main selling point; users must "clearly reference and credit Flightradar24"; cached data must be deleted after the time documented per endpoint.
- Commercial use: "Yes, the API can be used for commercial purposes." (https://support.fr24.com/support/solutions/articles/3000128176-can-the-api-be-used-for-commercial-purposes-).
- Filtering: flights may be blocked "through third-party services, such as the FAA's LADD"; the same article says military and government aircraft may be blocked entirely (https://support.fr24.com/support/solutions/articles/3000117426-why-does-it-say-that-a-flight-is-blocked-). For an intelligence-oriented map this is a real loss.
- NIC, NACp, emergency fields in the API: NOT VERIFIED.

### A.9 Other sources found

- AirNav Radar API: "10,000 credits" at "$119.95 / mo", "50,000 credits" at "$299.95 / mo", "250,000 credits" at "$999.95 / mo", with "a 14 day trial" (https://en.airnavradar.com/api/pricing). Terms on public display, filtering and fields: NOT VERIFIED.
- Wingbits: a commercial receiver network that states it offers "a dedicated GPS jamming data stream" (https://wingbits.ai/gps-jamming). Its aircraft-position API terms and price: NOT VERIFIED.
- adsb.lol historical archive: daily dumps, "all the data known to ADSB.lol, uploaded daily", combining adsb.lol, FlyItalyADSB and TheAirTraffic (https://github.com/adsblol/globe_history). Useful for back-testing detection rules on real past events at no cost.

### A.10 Field definitions (readsb format, used by adsb.lol, airplanes.live, adsb.fi)

All quotes from https://github.com/wiedehopf/readsb/blob/dev/README-json.md

| Field | Definition quoted |
|---|---|
| `baro_rate` | "Rate of change of barometric altitude, feet/minute" |
| `geom_rate` | "Rate of change of geometric (GNSS / INS) altitude, feet/minute" |
| `squawk` | "Mode A code (Squawk), encoded as 4 octal digits" |
| `emergency` | "ADS-B emergency/priority status, a superset of the 7x00 squawks" |
| `alt_baro` | barometric altitude in feet "OR 'ground' as a string" |
| `nic` | "Navigation Integrity Category" |
| `rc` | "Radius of Containment, meters; a measure of position integrity" |
| `nac_p` | "Navigation Accuracy for Position" |
| `sil` | "Source Integrity Level" |
| `gva` | "Geometric Vertical Accuracy" |
| `rssi` | "recent average RSSI (signal power), in dbFS" |
| `seen` | seconds since "a message was last received from this aircraft" |
| `seen_pos` | "how long ago (in seconds before 'now') the position was last updated" |
| `gpsOkBefore` | "aircraft lost GPS / GPS heavily degraded, it was working well before" |
| `lastPosition` | last known position "when the regular lat and lon are older than 60 seconds" |

- Values of `emergency` (same URL): none, general, lifeguard, minfuel, nordo, unlawful, downed, reserved.
- Values of `type` (same URL): adsb_icao, adsb_icao_nt, adsr_icao, tisb_icao, adsc, mlat, other, mode_s, adsb_other, adsr_other, tisb_other, tisb_trackfile.
- Missing data: "Fields will be omitted if data is not available." (same URL). A missing `baro_rate` is therefore not a zero, and code must treat it as unknown.

### A.11 Which sources a non-feeder can realistically use for a public app

- Usable now, free, openly licensed: adsb.lol, subject to ODbL conditions and to contacting the operator for production use.
- Usable now technically, but only with written permission for a public non-personal app: airplanes.live, adsb.fi.
- Usable for a non-commercial site without advertising, with attribution, limited fields: OpenSky.
- Needs a commercial contract or paid tier that explicitly covers public display: ADS-B Exchange enterprise, FlightAware (AeroAPI Standard or above, or Firehose), Flightradar24 API (subscription, raw redistribution prohibited), AirNav Radar.
- Not usable without a receiver: ADSBHub, adsb.fi global snapshot.

---

## Part B - detecting an aircraft in distress in real time

### B.1 Signals that exist in the data

1. Emergency squawk codes. "7500 for hijacking, 7600 for radio failure and 7700 for general emergencies" (abstract of the OpenSky Report 2020, https://research.ibm.com/publications/opensky-report-2020-analysing-in-flight-emergencies-using-big-data).
2. The ADS-B `emergency` field, which is "a superset of the 7x00 squawks" and adds values such as minfuel, lifeguard and downed (https://github.com/wiedehopf/readsb/blob/dev/README-json.md). Checking both the squawk and this field catches cases one of them misses.
3. Vertical rate, in two independent forms: `baro_rate` and `geom_rate` (same URL). Agreement between the two is a cheap sanity check; this is my reading of the field definitions, not a documented rule.
4. Loss of signal at altitude: `seen` and `seen_pos` give the age of the last message and last position, and `lastPosition` appears "when the regular lat and lon are older than 60 seconds" (same URL).
5. Query by squawk directly: `/v2/sqk/7700` on adsb.lol and adsb.fi, `/squawk/7700` on airplanes.live (URLs in A.1 to A.3). Three calls per cycle (7500, 7600, 7700) give world-wide emergency squawks without a global snapshot.

### B.2 How often it happens, and how rarely it is a crash

- Flightradar24 counted, over roughly December 2022 to March 2024: "the number of 7700 events per week averaged 36", maximum 67 in one week, minimum 19, and a single-day maximum of 18 on 12 October 2023 (https://www.flightradar24.com/blog/aviation-news/aviation-safety/are-flights-squawking-7700-more-often/, updated 24 January 2025).
- The same post: 7700 "only indicates a problem in need to immediate attention, not necessarily one that is an immediate danger".
- A pilot writing for Flightradar24: "Ninety-nine percent of the 'emergencies' observed on websites like FlightRadar24 are very benign events." (https://www.flightradar24.com/blog/squawking-7700-in-flight-emergencies-from-a-pilots-perspective/, updated 24 January 2025).
- Serious events can show no 7700 at all: the same Flightradar24 post notes Alaska Airlines 1282 never squawked 7700.
- Academic base: the OpenSky Report 2020 analysed "more than 800 trajectories" broadcasting 7700 "over a two-year period" (https://research.ibm.com/publications/opensky-report-2020-analysing-in-flight-emergencies-using-big-data). The labelled dataset is public: "Reference datasets for in-flight emergency situations", flights between 1 January 2018 and 29 January 2020, with causes and outcomes taken from Twitter and The Aviation Herald, licence "Other (Non-Commercial)" (https://zenodo.org/record/3937482). The share of those flights that diverted, and the paper's own data-cleaning rules, are NOT VERIFIED because I could not open the full paper.

### B.3 Emergency descents that end safely

- Standard procedure after loss of cabin pressure is a fast descent to "the higher of 10,000 feet or MSA" (https://skybrary.aero/index.php/Emergency_Descent:_Guidance_for_Controllers).
- The squawk can come late: setting 7700 "may be delayed" because "it is often the final item" of the drill (same URL).
- Consequence for detection: a fast descent that levels off near 10,000 feet is the expected signature of a handled emergency, not of a crash. A sourced numeric descent rate for such descents: NOT VERIFIED (the Skybrary page gives no rate).

### B.4 A real crash in ADS-B data

- China Eastern MU5735, Flightradar24 post of 21 March 2022: the aircraft "began a rapid descent from 29,100 feet", reached "7425 ft AMSL before recovering to 8600 ft AMSL", and the last message was received "at an altitude of 3225 ft AMSL" at 06:22:35 UTC (https://www.flightradar24.com/blog/flight-tracking-news/major-incident/china-eastern-airlines-flight-5735-crashes-en-route-to-guangzhou/). The vertical rate values are only in chart images on that page, so the rate in feet per minute is NOT VERIFIED.
- What this shows: the data ended above ground level, because terrestrial receivers lose line of sight at low altitude. "Last signal at altitude" is therefore a normal property of every low-altitude track near the edge of coverage, and cannot be treated as a crash signal on its own.

### B.5 Existing open-source projects and their thresholds

| Project | What it does | Thresholds documented | Source |
|---|---|---|---|
| tar1090 (the map behind adsb.lol, airplanes.live, adsb.fi) | Colours rows for emergency squawks: `squawk7500:"#ff5555"`, `squawk7600:"#00ffff"`, `squawk7700:"#ffff00"`. Position timeout `seenTimeout = 58` seconds; `mlatTimeout = 30` seconds. Filters by source type and by database flag "military". | No descent or crash detection documented. | https://github.com/wiedehopf/tar1090/blob/master/html/config.js and https://github.com/wiedehopf/tar1090/blob/master/README-query.md |
| plane-notify (Jxck-S) | "Notify if configured planes have taken off or landed". Repository is tagged emergency-squawk. | Takeoff/landing algorithm is in a separate PseudoCode.md that I could not open. NOT VERIFIED. | https://github.com/Jxck-S/plane-notify |
| Plane-Alert, part of docker-planefence | Alerts on listed aircraft and on squawks (parameter `PA_SQUAWKS`), to Mastodon, Discord, Telegram, BlueSky, RSS, MQTT. | How long a squawk must persist before alerting: NOT VERIFIED. | https://github.com/sdr-enthusiasts/docker-planefence |
| adsb-anomaly (Rust) | Flags timing, signal, identity and physics anomalies. | "Vertical rate limits: 5000fpm maximum"; "Speed limits: 800kt civilian maximum"; "Position jump detection: >5km in <1s"; statistical "3.0σ threshold with 100+ sample requirement". No false-positive rate published. | https://docs.rs/adsb-anomaly |
| Emergency Squawk Radar (Jasper Bernaers) | World map of 7500/7600/7700 from OpenSky, refreshed every 60 seconds. | No numeric thresholds. | https://jasperbernaers.com/emergency-squawk-radar/ |

I found no maintained open-source project whose documented purpose is real-time crash detection with published, validated thresholds. The 5,000 feet-per-minute figure above is one hobby project's anomaly limit, not an aviation standard, and must not be presented as one.

### B.6 Documented false-positive sources

- Wrong code dialled: "7500 is extremely uncommon — pilots occasionally dial the wrong code accidentally" (https://jasperbernaers.com/emergency-squawk-radar/).
- Benign 7700s: the 99% statement quoted in B.2.
- Coverage edges: "Aircraft over remote oceans, polar regions, or areas with sparse receiver coverage may not appear." (same Bernaers URL).
- Faulty avionics: Stanford researchers observed "flights with NIC always equal to zero" caused by "incorrect operation of the on-board ADS-B system" (https://web.stanford.edu/group/scpnt/gpslab/pubs/papers/Liu_ION_ITM_2022_ADSB.pdf). The same kind of faulty unit can also report nonsense rates; that extension is my inference, not a quote.
- Lower-quality position sources: tar1090 styles MLAT positions differently and waits `mlatTimeout = 30` seconds "before accepting MLAT position after receiving more reliable position data" (reader's rendering of the config comment, https://github.com/wiedehopf/tar1090/blob/master/html/config.js). The `type` field lets the app exclude `mlat`, `tisb_*` and `mode_s` records from descent logic.
- Military, aerobatic and training flights producing extreme vertical rates: widely assumed, but I found no primary source that quantifies it. NOT VERIFIED.
- Missing fields treated as zero: see A.10, "Fields will be omitted if data is not available."

### B.7 What a defensible detector looks like (design conclusions drawn from the sources above)

These are conclusions, not quoted rules, and each needs back-testing on the adsb.lol historical archive before any public alert is shown:

1. Tier 1, factual and safe to publish: an aircraft is squawking 7700/7600/7500 or its `emergency` field is not "none". Publish it as "declared emergency", never as "crash".
2. Tier 2, internal flag only: high sustained descent on both `baro_rate` and `geom_rate`, from an `adsb_icao` source, with normal `nic`, continuing below roughly the 10,000-foot level where emergency descents are expected to stop (B.3).
3. Tier 3, internal flag only: signal lost while tier 2 was active, in an area where other aircraft at the same altitude are still being received at that moment.
4. Thresholds for tiers 2 and 3 must be set from back-testing, because no sourced standard exists (B.5).

---

## Part C - GNSS jamming and spoofing maps

### C.1 gpsjam.org (John Wiseman)

- Data source: "GPSJAM aggregates those position reports from airplanes.live" and "from ADS-B Exchange" (https://gpsjam.org/faq).
- Colours (same URL): green where "more than 98% of all aircraft" reported good accuracy; yellow "between 2% and 10%"; red "more than 10% of aircraft reported low navigation accuracy".
- Formula (same URL): `percent_bad_aircraft = 100 * (num_bad_aircraft - 1) / (num_good_aircraft + num_bad_aircraft)`. The reason for subtracting one: "to limit possible false positives".
- Time step: 24-hour aggregates, updated shortly after midnight UTC (same URL). It is not a live map.
- Caveat stated by the author: "the data doesn't tell me what's causing the low accuracy" (same URL).
- Empty areas: no aircraft with ADS-B flew there, "or there were no receivers feeding data" (same URL).
- Exact definition of a "bad" aircraft (which NIC or NACp value): NOT VERIFIED. The FAQ does not state it, and the author's original thread could not be opened.
- Downloadable data, verified by fetching the files directly:
  - Index: https://gpsjam.org/data/manifest.csv with columns `date,suspect,num_bad_aircraft_hexes,source`, from 2022-02-14 to 2026-10-04. The `source` column changes from "adsbexchange" to "merged" in late August 2026.
  - Daily file: https://gpsjam.org/data/2026-10-04-h3_4.csv with columns `hex,count_good_aircraft,count_bad_aircraft`. The `hex` values are H3 cell identifiers; the file name indicates resolution 4.
- Licence and API: none stated on the FAQ or About pages (https://gpsjam.org/faq, https://gpsjam.org/about). The files are reachable, but permission to republish them is NOT VERIFIED. Contact given on the site: John Wiseman, jjwiseman@gmail.com.

### C.2 ZHAW and SkAI Data Services tracker (now GPSwise)

- Announcement of 12 April 2024: "a GPS spoofing tracker that allows spoofed aircraft to be identified and displayed" on a world map in real time, built by SkAI Data Services with the Centre for Aviation at ZHAW, using "ADS-B data obtained via the OpenSky Network" (https://www.zhaw.ch/en/about-us/news/news-releases/news-detail/event-news/live-gps-spoofing-tracker).
- The original address https://spoofing.skai-data-services.com/ now redirects to https://gpswise.aero/ (redirect observed on 5 October 2026).
- GPSwise describes itself as "Real-time GPS spoofing and jamming detection" with "live maps, alerts, analytics, API access, and private deployments" (https://gpswise.aero/). Operator: SkAI Data Services.
- Coverage caveat from OPSGROUP, 7 May 2024: "the receiver network doesn't quite have the same coverage as other ADS-B websites" (https://ops.group/blog/where-is-the-spoofing-today/).
- Detection algorithm, API documentation, price and terms: NOT VERIFIED (not published on the pages the tool could read; the site needs JavaScript).

### C.3 Flightradar24 GPS jamming map

- Method: "derived from NIC (navigation integrity category) values"; "We mark regions as affected if a significant number of flights in that area report lowered NIC values." (https://support.fr24.com/support/solutions/articles/3000125401-gps-jamming-what-is-it-and-where-can-i-see-the-updated-map-).
- Update: "the data on this page is updated every 6 hours" (same URL). The blog adds a choice of "six (6) hours or 24 hours" resolution (https://www.flightradar24.com/blog/inside-flightradar24/gps-jamming-map/, published 19 March 2024, updated 2 July 2024).
- Limit: calculated only "where there are an adequate number of flights" and of Flightradar24 receivers (same blog URL).
- Exact NIC threshold and minimum flight count: not disclosed. An API or download for this layer: NOT VERIFIED; none is mentioned on either page.

### C.4 Wingbits GPS jamming page

- Rule: "A report with NACp below 7 is counted as degraded" (https://wingbits.ai/gps-jamming).
- Freshness shown on 5 October 2026: "refreshed every 10 minutes" (same URL).
- Caveats: "Degraded NACp can also reflect older avionics; a single aircraft with bad GPS is not jamming." and "No data means no coverage — not that GPS works." (same URL).
- Product: "a dedicated GPS jamming data stream" (same URL). Price and terms: NOT VERIFIED.

### C.5 Computing interference yourself from ADS-B fields

Inputs available for free in adsb.lol responses: `nic`, `rc`, `nac_p`, `sil`, `type`, `gpsOkBefore`, `gpsOkLat`, `gpsOkLon`, `lastPosition` (A.1, A.10).

Documented thresholds:

| Indicator | Threshold | Source |
|---|---|---|
| NIC | "the aircraft's NIC value must be ≥ 7 (containment radius less than 0.2 nautical miles)" under normal conditions; multiple points "with NIC values less than 7" indicate a possible interference source | Stanford GPS Lab, Liu et al., ION ITM 2022, https://web.stanford.edu/group/scpnt/gpslab/pubs/papers/Liu_ION_ITM_2022_ADSB.pdf |
| NACp | "A report with NACp below 7 is counted as degraded" | Wingbits, https://wingbits.ai/gps-jamming |
| Share of aircraft per cell | more than 10% bad is red, 2% to 10% yellow, after subtracting one bad aircraft | gpsjam, https://gpsjam.org/faq |
| Receiver's own verdict | `gpsOkBefore`: "aircraft lost GPS / GPS heavily degraded, it was working well before" | readsb, https://github.com/wiedehopf/readsb/blob/dev/README-json.md |

A reproducible recipe built only from those sources:

1. Poll radius queries over the region of interest and keep, per aircraft, only records whose `type` is a true ADS-B source. MLAT and TIS-B positions are computed on the ground and carry no aircraft GPS quality; this exclusion follows from the `type` definitions and is my inference, not a quoted rule.
2. Mark an aircraft "bad" in a time window if it reported `nic` below 7 or `nac_p` below 7, or carries `gpsOkBefore`.
3. Assign each aircraft to H3 cells at resolution 4, matching gpsjam's files, so results can be checked against gpsjam's daily CSV for the same day.
4. Apply the gpsjam formula per cell, including the minus one.
5. Show empty cells as "no data", never as "clean".

Documented caveats:

- Cause is unknown: "the data doesn't tell me what's causing the low accuracy" (https://gpsjam.org/faq).
- Old or faulty avionics produce permanent low values (Wingbits and Stanford quotes above). Mitigation: only count an aircraft as bad if it also reported good values in the same flight, which is exactly what `gpsOkBefore` encodes.
- Satellite geometry can lower NACp without any interference; the Czech Technical University method compares NACp with the expected HDOP from GPS almanac data to separate the two (Pleninger, Topkova, Steiner, The Aeronautical Journal, 2024, https://www.cambridge.org/core/journals/aeronautical-journal/article/gnss-interference-detection-methodology-utilising-adsb-nacp-indicator-and-gps-almanac-data/72FEBF7BFE1541D7BF146B14BFAA4AB8). The paper's numeric thresholds: NOT VERIFIED (abstract only).
- Uneven coverage biases the picture: "This imbalanced data distribution might leads to some biased prediction." (Stanford paper).
- Jamming versus spoofing: NIC and NACp drops indicate degraded or lost GPS. Spoofing, where the aircraft reports a confident but false position, is a different detection problem; the ZHAW/SkAI tracker addresses it, but its method is unpublished on the pages read (C.2). A sourced open method for spoofing detection: NOT VERIFIED.
- OpenSky's live API cannot be used for this, because its state vectors carry no NIC or NACp (A.4).

---

## Recommended choice and why

1. Live positions: build on adsb.lol first. It is the only source that is free, needs no receiver today, publishes military, LADD and PIA aircraft, returns every field needed for both distress and GNSS logic, and states an open licence (ODbL) for all its public data. Write to the operator before launch, as he asks, and build the fetcher so that the base address is a setting: airplanes.live and adsb.fi use the same format and can serve as fallback once they grant permission.
2. Ask airplanes.live and adsb.fi in writing for permission to use their API in a public journalistic app. Their published terms say non-commercial only, so written permission is the only safe basis.
3. Plan for a receiver anyway. adsb.lol says a feeder key will be required in future, adsb.fi gives its global snapshot only to feeders, and ADSBHub's commercially free stream is feeder-only. A receiver hosted by a volunteer would remove the single biggest dependency. This is a recommendation, not a sourced cost estimate.
4. Emergencies: poll the three squawk endpoints world-wide every cycle and show them as "declared emergency". Keep descent-based and signal-loss flags internal until thresholds are back-tested on the adsb.lol archive, because no validated public thresholds exist.
5. GNSS interference: compute it live from `nic`, `nac_p` and `gpsOkBefore` using the gpsjam formula, and validate daily against gpsjam's CSV. Ask John Wiseman for permission before republishing his files.
6. Do not rely on OpenSky as the main feed (non-commercial licence, no integrity fields, cloud IP blocking), on the ADS-B Exchange $10 plan (public dissemination prohibited), or on Flightradar24 (blocks military and LADD aircraft, forbids raw redistribution).

## Open questions / not verified

1. adsb.lol: maximum radius per query, actual rate limit in numbers, real latency, and whether the operator approves this production use. Action: email the operator; measure `seen_pos` in a test.
2. ODbL obligations (attribution wording, share-alike for a derived database): licence text not fetched in this research.
3. airplanes.live terms-of-use page body (https://airplanes.live/terms-of-use/): unreadable by the tool. Needs a browser.
4. OpenSky terms-of-use page (https://opensky-network.org/about/terms-of-use): unreadable by the tool. Needs a browser. Also whether a non-profit journalistic site without advertising counts as non-commercial.
5. Flightradar24 API: prices and credits for Essential and Advanced, credit cost per live call, rate limits, available fields. Page https://fr24api.flightradar24.com/subscriptions-and-credits needs a browser.
6. ADS-B Exchange: RapidAPI plan details beyond the $10 tier; enterprise price (not published, sales contact only).
7. FlightAware: per-query AeroAPI prices; Firehose price, latency and treatment of blocked aircraft.
8. AirNav Radar and Wingbits: terms for public display, filtering, fields, Wingbits prices.
9. Coverage quality of each community network over Israel, Lebanon, Syria, Jordan, Egypt, Cyprus and the eastern Mediterranean: no source read; must be measured.
10. gpsjam: exact NIC/NACp rule for a "bad" aircraft; licence for the CSV files.
11. GPSwise (ZHAW/SkAI): algorithm, API, price, terms.
12. OpenSky Report 2020: share of 7700 flights that diverted and the paper's data-cleaning rules (full text not opened).
13. Plane-Alert squawk persistence setting and plane-notify landing logic: documentation files not opened.
14. Numeric descent rates for emergency descents and for known crashes: no primary source with numbers was read.
15. Quantified false-alarm contribution of military, aerobatic and training flights: no primary source found.

## Sources

Aircraft position providers
- https://adsb.lol/
- https://api.adsb.lol/api/openapi.json
- https://github.com/adsblol/api
- https://github.com/adsblol/globe_history
- https://airplanes.live/
- https://airplanes.live/api-guide/
- https://airplanes.live/rest-api-adsb-data-field-descriptions/
- https://airplanes.live/terms-of-use/ (body unreadable)
- https://github.com/ADSB-One/api
- https://github.com/adsbfi/opendata
- https://openskynetwork.github.io/opensky-api/rest.html
- https://openskynetwork.github.io/opensky-api/index.html
- https://opensky-network.org/about/faq
- https://opensky-network.org/about/terms-of-use (unreadable)
- https://www.adsbhub.org/howtogetdata.php
- https://www.adsbexchange.com/data/
- https://www.adsbexchange.com/api-lite/
- https://adsbexchange.com/?p=19798
- https://support.adsbexchange.com/hc/en-us/articles/37364077703693-What-is-ADS-B-Exchange-s-data-use-policy
- https://www.jetnet.com/legal/terms-of-use
- https://rapidapi.com/adsbx/api/adsbexchange-com1 (body unreadable)
- https://www.flightaware.com/commercial/aeroapi/
- https://www.flightaware.com/commercial/firehose/
- https://www.flightaware.com/about/faq/
- https://www.flightaware.com/aeroapi/portal/documentation (navigation only)
- https://support.fr24.com/support/solutions/articles/3000128167-what-different-types-of-api-subscriptions-are-available-
- https://support.fr24.com/support/solutions/articles/3000128176-can-the-api-be-used-for-commercial-purposes-
- https://support.fr24.com/support/solutions/articles/3000117426-why-does-it-say-that-a-flight-is-blocked-
- https://www.flightradar24.com/blog/b2b/how-to-get-started-with-the-flightradar24-api/
- https://www.flightradar24.com/blog/b2b/flightradar24-api/
- https://www.flightradar24.com/terms-and-conditions
- https://fr24api.flightradar24.com/subscriptions-and-credits (body unreadable)
- https://en.airnavradar.com/api/pricing

Field definitions and map software
- https://github.com/wiedehopf/readsb/blob/dev/README-json.md
- https://github.com/wiedehopf/tar1090
- https://github.com/wiedehopf/tar1090/blob/master/html/config.js
- https://github.com/wiedehopf/tar1090/blob/master/README-query.md

Distress detection
- https://www.flightradar24.com/blog/aviation-news/aviation-safety/are-flights-squawking-7700-more-often/
- https://www.flightradar24.com/blog/squawking-7700-in-flight-emergencies-from-a-pilots-perspective/
- https://www.flightradar24.com/blog/flight-tracking-news/major-incident/china-eastern-airlines-flight-5735-crashes-en-route-to-guangzhou/
- https://research.ibm.com/publications/opensky-report-2020-analysing-in-flight-emergencies-using-big-data
- https://zenodo.org/record/3937482
- https://skybrary.aero/index.php/Emergency_Descent:_Guidance_for_Controllers
- https://github.com/Jxck-S/plane-notify
- https://github.com/sdr-enthusiasts/docker-planefence
- https://docs.rs/adsb-anomaly
- https://jasperbernaers.com/emergency-squawk-radar/
- https://research.tudelft.nl/en/publications/detecting-events-in-aircraft-trajectories-rule-based-and-data-dri (read, no emergency thresholds)

GNSS interference
- https://gpsjam.org/faq
- https://gpsjam.org/about
- https://gpsjam.org/data/manifest.csv
- https://gpsjam.org/data/2026-10-04-h3_4.csv
- https://www.zhaw.ch/en/about-us/news/news-releases/news-detail/event-news/live-gps-spoofing-tracker
- https://spoofing.skai-data-services.com/ (redirects)
- https://gpswise.aero/
- https://ops.group/blog/where-is-the-spoofing-today/
- https://www.flightradar24.com/blog/inside-flightradar24/gps-jamming-map/
- https://support.fr24.com/support/solutions/articles/3000125401-gps-jamming-what-is-it-and-where-can-i-see-the-updated-map-
- https://wingbits.ai/gps-jamming
- https://web.stanford.edu/group/scpnt/gpslab/pubs/papers/Liu_ION_ITM_2022_ADSB.pdf
- https://www.cambridge.org/core/journals/aeronautical-journal/article/gnss-interference-detection-methodology-utilising-adsb-nacp-indicator-and-gps-almanac-data/72FEBF7BFE1541D7BF146B14BFAA4AB8
- https://simonwillison.net/2022/Jul/20/how-john-wiseman-tracks-worldwide-gps-interference (secondary, no thresholds)
