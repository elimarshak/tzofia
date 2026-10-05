# Tzofia research 3: escalation indicators (other than aircraft positions and ships)

Research date: 5 October 2026.

## How to read this file

- Every key claim carries the provider's own URL and a short exact quote.
- "NOT VERIFIED" means I could not confirm the point from the provider's own page. It does not mean the point is false.
- "Secondary source" means the claim comes from someone other than the provider (a wrapper's README, a competitor's page, a news site). Treat it as a lead, not as a fact.
- Method limits of this research session: pages were read through a fetch tool that returns a summary of the page. Direct requests from this machine to the live data endpoints (Home Front Command, IODA API, USGS feed and others) were blocked by the work environment's network proxy, so live endpoint behaviour (response shape, geo-blocking) was not tested here. Those points are listed under "Open questions".
- GPS jamming is not covered here because it is derived from aircraft position data, which is another research topic.

---

## 1. Airspace closures and NOTAMs

### 1.1 FAA NOTAM (old api.faa.gov and the new NOTAM Management Service, NMS)

- Status: the FAA is replacing its old NOTAM systems with NMS. The FAA page says it plans to "deploy the operational service by late Spring 2026, after which USNS and FNS will be sunset" (https://www.faa.gov/about/initiatives/notam). Whether the sunset has already happened by October 2026: NOT VERIFIED.
- Access: not self-service. The FAQ says "Please contact us to request access to the new NMS-API" (https://www.faa.gov/about/initiatives/notam/faqs). The contact address shown on the FAA pages is 7-AWA-NAIMES@faa.gov.
- Old developer portal: api.faa.gov now redirects to portal.apic4e.faa.gov, which did not render any content in the fetch (https://portal.apic4e.faa.gov/s). Whether the old NOTAM API there still issues keys: NOT VERIFIED.
- Price, rate limit, redistribution terms, data format, coverage of non-US (international) NOTAMs: NOT VERIFIED. No public technical documentation was found. A third-party API directory states "No OpenAPI, schema or endpoint documentation is published to unauthenticated visitors" (secondary source, https://apis.io/apis/faa/faa-nms-api/).
- Reliability note: access depends on a manual approval by a US agency, and the system is in the middle of a migration.

### 1.2 ICAO API Data Service

- What it is: a paid API catalogue run by ICAO. The NOTAM items are "Stored NOTAMs", "Realtime NOTAMs", "NOTAM Criticality" and "NOTAM Decoder" (https://icao.int/safety/iStars/Pages/Get-NOTAM-Data.aspx).
- Source and latency: the data comes from the US Defense Internet NOTAM Service. Stored NOTAMs are refreshed every 3 hours, the realtime endpoint reads live (same page). So ICAO is a reseller of US-collected data, not an independent source.
- Authentication: API key. "To access our APIs, you need to request an API key" (same page).
- Price: "Up to 100 free calls can be made, after which booster packs must be installed" (same page). A booster pack of 2,000 calls costs USD 550.00 (https://store.icao.int/en/icao-api-service-plans-booster-pack-for-2k-calls). At that price, polling 10 flight information regions every 10 minutes would use 1,440 calls a day, which is about USD 396 a day. It is not practical for continuous polling.
- Redistribution terms: NOT VERIFIED (the store page says some purchases "may need a licensing agreement"; the Terms and Conditions document was not read).

### 1.3 EUROCONTROL

- European AIS Database (EAD). Israel's NOTAMs are produced in this system: the Israel Airports Authority "will progressively decommission its existing systems to rely exclusively on EAD" (https://www.eurocontrol.int/news/israel-airports-authority-entrusts-eurocontrol-provision-aeronautical-information-services, dated 5 November 2020).
  - EAD Basic: free with registration, but explicitly not the live data. "This tool is not connected to the EAD operational database" and "the information displayed shall not be used for operational purposes" (https://www.ead.eurocontrol.int/cms-eadbasic/opencms/en/ead-solutions/ead-basic/). Rules on automated access and republication: NOT VERIFIED.
  - MyEAD (system-to-system) and EAD Pro: for aviation clients. A company that makes money from EAD data is a "Type 3" client and pays service charges plus royalties; data providers "retain full control of – and intellectual property rights over – the information they input" (https://www.eurocontrol.int/service/european-ais-database). Exact prices: NOT VERIFIED (price list is separate).
- Network Manager B2B web services: not open to a journalist or a public site. Eligible bodies are "air navigation service providers (ANSP), aircraft operators (AO), airports, ground handling agents" and similar (https://www.eurocontrol.int/service/network-manager-business-business-b2b-web-services). Certificates: first two free, then EUR 200 each.
- Public Network Operations Portal (headline news and network situation): NOT VERIFIED (not fetched).

### 1.4 EASA Conflict Zone Information Bulletins (CZIB)

- What it is: official European recommendations to airlines about dangerous airspace. Each bulletin has a number, an issue date, a validity date and a list of affected flight information regions.
- Current example read in full: CZIB 2026-03-R14, issued 28/02/2026, "Valid until: 08/07/2026", recommends to "Not operate within the affected airspace of Iran, Iraq, Lebanon" and to exercise caution over Israel, Jordan and the Gulf states (https://www.easa.europa.eu/en/print/pdf/node/143294/278079). Whether a later revision exists: NOT VERIFIED.
- Feed or API: none found on the landing page (https://www.easa.europa.eu/en/domains/air-operations/czibs). RSS availability and reuse terms: NOT VERIFIED.
- Latency: CZIBs are advisory documents issued or revised after events (the bulletin above carries the same date as the 28 February 2026 strikes). They are a slow confirmation signal, not an early signal.

### 1.5 safeairspace.net (OPSGROUP)

- What it is: a "Conflict Zone & Risk Database" run by "OPSGROUP, an independent membership organization with 7000 members" (https://safeairspace.net/). It gathers per-country risk levels and the warnings issued by EASA, France, UK, Germany, Italy, Canada and the US.
- Licence: "Creative Commons Attribution-NonCommercial 4.0" (https://safeairspace.net/ and https://safeairspace.net/Iran/). Reuse with credit is allowed for a non-commercial site. If Tzofia carries ads or paid tiers, permission from OPSGROUP is needed.
- API or feed: none mentioned. Only email subscription and a PDF briefing.
- Example of content: Iran is rated "One - Do Not Fly" (https://safeairspace.net/Iran/).

### 1.6 Israel (Civil Aviation Authority and Israel Airports Authority)

- Israel's NOTAMs are issued through EUROCONTROL's EAD (see 1.3). A public Israeli web page or feed that lists current LLLL NOTAMs: NOT VERIFIED (not found in two searches).
- Practical lesson from a documented case: on 25 March 2026 the Israel Airports Authority had to clarify that a new NOTAM was only a technical extension of existing restrictions and that the airspace status had not changed (secondary source, Israeli aviation news site, https://www.ias.co.il/?p=186221). A NOTAM being re-issued is therefore not by itself a new closure. The parser must compare the content with the NOTAM it replaces.

### 1.7 Open NOTAM parsers and datasets

- Open-source parsers found by search, not individually reviewed: PyNotam (https://github.com/slavak/PyNotam), a Ruby "notam" gem (https://www.rubydoc.info/gems/notam), and "@squawk/notams" on npm. Licences and maintenance state: NOT VERIFIED.
- A free, open, global, real-time NOTAM dataset: none found.

### 1.8 How fast were closures published as NOTAMs (documented cases)

Case A, 13 June 2025 (Israeli strikes on Iran). Source: Flightradar24 blog, https://www.flightradar24.com/blog/flight-tracking-news/airspace-closures-following-israeli-strikes-on-iran/
- Traffic reacted first: "diversions away from Tehran were noted at 00:06 UTC".
- The NOTAMs quoted in the article are replacement NOTAMs with these start-of-validity times on 13 June: Jordan A0268/25 at 11:24 UTC, Iraq A0375/25 at 11:55, Syria A0123/25 at 12:40, Iran A1894/25 at 13:15 ("TEHRAN OIIX FIR CLSD"), Israel A0572/25 at 14:13.
- The issue time of the very first closure NOTAM of each country that night: NOT VERIFIED (the article shows only the later replacements).

Case B, 28 February 2026 (US and Israeli strikes on Iran). Source: Flightradar24 live blog, https://www.flightradar24.com/blog/live/israel-launches-pre-emptive-strikes-on-iran-airspace-closures-going-into-place/
- 06:45 UTC: Israel announces strikes.
- About 07:05 UTC: flights are leaving Iraqi airspace, and "no official NOTAM has been posted yet".
- About 07:15 UTC: "airspace in Iran, Iraq, Jordan, and Israel is mostly empty".
- By 09:09 UTC: NOTAMs closing the Bahrain and Doha regions are in place.

What these two cases show: in both, the sky emptied within about 20 to 30 minutes of the first strikes, and the formal NOTAM came later (in one documented instance, after the traffic had already left). A NOTAM closing airspace before an attack was not documented in either case. So NOTAMs confirm and give the legal detail and duration; they did not give advance warning in these cases.

### 1.9 Inferring closures from traffic itself

- Academic basis: Tanner and Strohmeier, "Anomalies in the Sky: Experiments with traffic densities and airport runway use" (OpenSky workshop 2019), used OpenSky ADS-B data and measured regional traffic density with the Gini index to find unusual patterns (https://easychair.org/publications/paper/cZL9).
- Practitioner basis: Flightradar24's own live reporting in Case B judged closure from the map being "mostly empty" before any NOTAM existed.
- Known weaknesses (my assessment, not from a source): night-time traffic is naturally thin, receiver coverage over Iran, Iraq and Syria is patchy, and a receiver outage looks the same as an empty sky. A baseline per region per hour of week is needed, and receiver health must be checked separately.

---

## 2. Internet outages

### 2.1 IODA (Georgia Tech, formerly CAIDA)

- What it measures: three independent signals. BGP routing from "~500 monitors participating in the RouteViews and RIPE RIS projects", background traffic to an unused address block ("UCSD Network Telescope"), and active probing of "a large fraction of the (routable) IPv4 address space" (https://www.caida.org/projects/ioda/).
- Granularity: "country-level, regional, and network-level insights" (https://ioda.inetintel.cc.gatech.edu/reports/inside-our-new-brochure-journalists-guide-to-ioda-2/). This is the only free source found that gives province-level series as well as country and network.
- Latency: described as "near-realtime" (CAIDA page). The exact delay in minutes: NOT VERIFIED.
- Access: "Python notebooks, API, or CSV downloads" (journalists' guide page). The API host is api.ioda.inetintel.cc.gatech.edu/v2 and the code is public ("Symfony project that implements the IODA public API", https://github.com/orgs/InetIntel/repositories).
- Authentication, rate limits, licence of the data, required citation: NOT VERIFIED. The API host could not be reached from this session and the repositories show licence "Other".
- Useful detail: IODA itself ingests Google's traffic data through a script that reads "the Google Transparency Report API" (same GitHub page), so IODA also carries the Google signal.

### 2.2 Cloudflare Radar

- Price: free. Licence: "Data available via Radar API endpoints is made available under the CC BY-NC 4.0 license" (https://developers.cloudflare.com/radar/). Non-commercial only, with credit. A site with ads or subscriptions needs Cloudflare's permission.
- Authentication: a free Cloudflare account and a token with "Account > Radar" read permission; base address https://api.cloudflare.com/client/v4/radar/ (https://developers.cloudflare.com/radar/get-started/first-request/). Rate limits: NOT VERIFIED (not stated on the pages read).
- Two relevant endpoints:
  - GET /radar/traffic_anomalies: "signals that might indicate an outage", "automatically detected by Radar and manually verified by our team" (https://developers.cloudflare.com/api/resources/radar/subresources/traffic_anomalies/methods/get/). This is the early signal.
  - GET /radar/annotations/outages: confirmed outages, with fields for scope, cause, type, locations and networks (https://developers.cloudflare.com/api/resources/radar/subresources/annotations/subresources/outages/methods/get/). This is the curated confirmation, so slower.
- Granularity: outages "may be sub-national or national in geographic scope, or may impact one or more ASNs" (https://developers.cloudflare.com/radar/glossary/). Filtering by network number is documented. A filter by country on the anomalies endpoint: NOT VERIFIED on the page read.
- Detection logic stated by Cloudflare: "an anomalous drop in traffic as compared to historical traffic patterns and trends" (glossary).
- Latency in minutes: NOT VERIFIED.

### 2.3 NetBlocks

- No public API found (https://netblocks.org/api returns 404). Content is "Copyright © All rights reserved" (https://netblocks.org/about). The data usage policy page gives no reuse licence (https://netblocks.org/data-usage-policy).
- Use: read their public posts as a human-verified confirmation and link to them. Do not copy charts.

### 2.4 RIPEstat and RIPE Atlas

- RIPEstat Data API: free, no key. Limit of "8 concurrent requests from one IP address"; users above 1,000 requests a day are asked to register by email. Address pattern https://stat.ripe.net/data/<endpoint>/data.json. "RIPEstat Service Terms and Conditions apply" (https://stat.ripe.net/docs/data-api/ripestat-data-api). Useful endpoints: routing status, BGP updates, country network lists. Republication terms: NOT VERIFIED (terms page not read).
- RIPE Atlas: has a REST API and a streaming API for measurement results and probe status (https://atlas.ripe.net/docs/apis/). Cost in credits, key rules and terms: NOT VERIFIED. Idea worth testing: the share of probes in a country that are disconnected is a direct, fast outage signal.

### 2.5 OONI (censorship measurements)

- Licence: "Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License" (https://raw.githubusercontent.com/ooni/license/master/data/LICENSE.md).
- Access: API at https://api.ooni.io/, free. Freshness: raw files are "uploaded to the S3 bucket once every hour", while measurements are "made immediately available on OONI Explorer" (https://docs.ooni.org/data/). The API "implements rate limiting" and is not for bulk download (same page).
- What it is good for: blocking of specific sites and apps (for example a messaging app blocked in Iran), not total outages. Measurements depend on volunteers running the probe, so coverage in a crisis is uneven.

### 2.6 Google Transparency Report (traffic)

- The page is a JavaScript application and returned no content (https://transparencyreport.google.com/traffic/overview). Official API, download and terms: NOT VERIFIED. Google's help page says "The historical disruptions section of the report has been paused" (https://support.google.com/transparencyreport/answer/7381677?hl=en-GB).
- Practical route: take the Google signal through IODA (see 2.1).

### 2.7 Kentik

- Kentik publishes written analyses of outages (for example https://kentik.com/analysis/internet-blackout-in-syria-due-to-student-exams/). A public API or free feed: NOT VERIFIED (none found).

### 2.8 ThousandEyes outage map

- Public map of "ongoing and recently detected outages", refreshed every 5 minutes, focused on providers, cloud and applications (https://www.thousandeyes.com/outages/). No public API mentioned. Terms: NOT VERIFIED. It is aimed at corporate service outages, not at country shutdowns.

### 2.9 Summary table

| Source | Country | Province | Network | Near-real-time machine feed | Licence for a public site |
|---|---|---|---|---|---|
| IODA | yes | yes | yes | yes (API) | NOT VERIFIED |
| Cloudflare Radar | yes | partly (in outage records) | yes | yes (API, free token) | CC BY-NC 4.0 |
| RIPEstat | yes | no | yes | yes (API, no key) | NOT VERIFIED |
| OONI | yes | no | yes | yes (API) | CC BY-NC-SA 4.0 |
| NetBlocks | yes | sometimes | sometimes | no | all rights reserved |
| ThousandEyes | no (provider view) | no | yes | no | NOT VERIFIED |
| Kentik | case by case | case by case | yes | no | NOT VERIFIED |

---

## 3. Israel Home Front Command (Pikud HaOref) alerts

- There is no documented official public API. The endpoints below are the ones the Home Front Command's own website and app use, as recorded in the configuration file of the main open-source wrapper (https://raw.githubusercontent.com/eladnava/pikud-haoref-api/master/config.js):
  - Live alerts: https://www.oref.org.il/warningMessages/alert/Alerts.json
  - Recent history: https://www.oref.org.il/warningMessages/alert/History/AlertsHistory.json
  - City and district list (four languages): https://alerts-history.oref.org.il/Shared/Ajax/GetDistricts.aspx?lang=he
  - Zone name files: https://www.oref.org.il/districts/cities_heb.json (also _eng, _rus, _arb)
- Request details from the wrapper's code: it sends a Referer header of the oref.org.il site and "X-Requested-With: XMLHttpRequest", adds a timestamp to defeat caching, and decodes the answer manually because it arrives as UTF-16-LE or UTF-8 with a byte order mark (https://raw.githubusercontent.com/eladnava/pikud-haoref-api/master/lib/alerts.js).
- Geo-blocking: "This API is only accessible from within Israel. Either run the script on an Israeli machine, or use a proxy" (secondary source, wrapper README, https://github.com/eladnava/pikud-haoref-api). Consistent with this, both the history file and the Home Front Command terms page returned HTTP 403 to the fetch tool used here, which runs outside Israel. A server located in Israel is required.
- Polling: the README's example polls every 5,000 ms and adds that with several simultaneous alerts it is "best to poll for new alerts every second or two" (same README). There is no official guidance. One server polling and fanning out to all users is the considerate design; users' browsers must never poll the Home Front Command directly.
- Alert categories in the wrapper: missiles, hostile aircraft intrusion, terrorist infiltration, earthquake, tsunami, hazardous materials, radiological event, news flash, and drill versions of each (README).
- Wrapper licence: "Apache 2.0". It ships cities.json and polygons.json, and credits "the developers of the Tzofar app for the map polygon data" (README). So the polygons are not the Home Front Command's own publication, and their reuse terms follow Tzofar, see next point.
- Tzofar / Tzeva Adom (tzevaadom.co.il): a volunteer service with app, site, Telegram and more, no public API offered (https://www.tzevaadom.co.il/en/systems/). Its terms forbid building on it: "No unauthorized use may be made of Tzofar's systems, servers, interfaces, API, endpoints", including "operation of any service, application, website, bot or other system based on them", without "prior express written authorization of the Tzofar Operators" (https://www.tzevaadom.co.il/en/terms/). Do not use its endpoints or polygons without written permission.
- Home Front Command's own terms of use: NOT VERIFIED (page returned 403 from outside Israel). Needs to be read from an Israeli connection before launch.
- World Monitor (see section 7) lists "Israel Home Front Command (OREF/Pikud HaOref)" as a source, so there is a public precedent for showing it on a map.

---

## 4. Earthquakes and explosions

### 4.1 USGS real-time feeds

- Feeds: GeoJSON files such as all_hour, 4.5_day, significant_hour under https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/ , "Updated every minute", no key (https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php).
- Latency outside the US: it "takes 20 minutes (on average) to process and post", with "an additional delay of up to 60 seconds" from caching (https://www.usgs.gov/faqs/how-quickly-earthquake-information-posted-usgs-website-and-sent-out-earthquake-notification).
- Explosions: every event has a "type" field, and the query service has an eventtype filter: "Limit to events of a specific type" (https://earthquake.usgs.gov/fdsnws/event/1/). The full list of type values (explosion, nuclear explosion, quarry blast and so on): NOT VERIFIED on the pages read. Query limit: 20,000 results per request.
- Licence: NOT VERIFIED on the page read (the page points to USGS legal notices).
- Sensitivity: outside the US the global catalogue mostly carries magnitude 4 and above (general knowledge, NOT VERIFIED here). Conventional strikes are far below that. USGS is useful for large events only (a nuclear test, a very large depot explosion).

### 4.2 EMSC SeismicPortal

- Push feed: wss://www.seismicportal.eu/standing_order/websocket , JSON messages on every new or updated event, "(near) realtime notification" (https://www.seismicportal.eu/realtime.html).
- Licence: "Data received via the websocket protocol is distributed under the CC BY 4.0 license" (same page). This is the cleanest licence of the group: commercial use allowed with credit.
- Explosion flag in the message: NOT VERIFIED. Latency in minutes: NOT VERIFIED.

### 4.3 GFZ GEOFON

- Offers event lists in "fdsnws-event text" and "QuakeML"; warns that "automatically determined earthquake parameters may be erroneous" (https://geofon.gfz.de/eqinfo/). Other pages are closed to automated reading by the site's robots rules. Licence and latency: NOT VERIFIED.

### 4.4 Geological Survey of Israel

- Public pages exist for recent, felt and historical earthquakes (https://eq.gsi.gov.il/en/earthquake/lastEarthquakes.php). The page is built in the browser and returned no content to the fetch. Machine feed, explosion marking, latency and terms: NOT VERIFIED. This needs a browser check, because a national network is the only one of the four that could plausibly register regional blasts.

---

## 5. Fires and thermal anomalies: NASA FIRMS

- Access: free key called MAP_KEY, obtained by email sign-up. Limit: "5000 transactions / 10-minute interval"; big requests count as several transactions (https://firms.modaps.eosdis.nasa.gov/api/map_key/).
- Endpoints: "area" (bounding box, date, sensor) and "country", both returning CSV; also "data_availability" and "kml_fire_footprints" (https://firms.modaps.eosdis.nasa.gov/api/).
- Latency for the Middle East: the standard product is near-real-time, which NASA defines as "1 to 3 hours" after observation (https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/data-latency). Bellingcat describes the same thing as data "within three hours" of capture (https://bellingcat.com/resources/2022/10/04/scorched-earth-using-nasa-fire-data-to-monitor-war-zones).
- The very fast products do not cover the region: ultra-real-time has "latency of less than 60 seconds" but only for the "continental United States (CONUS)" plus Puerto Rico and Hawaii (https://www.earthdata.nasa.gov/learn/articles/firms-urt-data).
- VIIRS versus MODIS resolution (375 m against 1 km), number of passes per day, and the geostationary products (which satellites, how often, whether they cover Israel and Iran): NOT VERIFIED from NASA pages in this session. The FAQ page returned headings only.
- Data policy and required credit line: NOT VERIFIED.
- Documented conflict use: Bellingcat's guide uses FIRMS to verify "fighting, attacks, troop movements and scorched-earth tactics". The Economist's Ukraine war-fire model is the best-known statistical use (referenced via https://smallwarsjournal.com/2026/03/25/fire-detection-as-a-proxy-for-combat-the-economist/ , secondary, not read in full).
- Documented weaknesses (Bellingcat, same URL): "not all fires and thermal anomalies shown in war zones represent military activity"; industrial heat such as cement kilns registers as a hotspot; "Thick cloud cover, heavy smoke" hide fires; "Fires can burn between satellite observations"; minimum detectable size is "typically between 100 and 1,000 meters squared"; "Bright, reflective surfaces, such as metallic structures" cause false readings.
- Consequence for Tzofia: FIRMS is an after-the-fact layer (hours), and it needs a mask of permanent heat sources (oil and gas flares in Iraq, Iran and the Gulf, cement and steel plants) plus a seasonal farm-burning baseline before any anomaly is shown.

---

## 6. Conflict event data and news signals

### 6.1 ACLED

- Access is tiered by organisation. Open tier: "Aggregated Data" only, no API. Research tier: "Aggregated Data + Event Data (lagged)" with API. Partner: "Disaggregated Event Data (weekly)". Enterprise: "Unlimited Event Data (weekly, expedited)" (https://acleddata.com/myacled-faqs). Prices: NOT VERIFIED (on request). Length of the "lagged" delay: NOT VERIFIED.
- Terms block the Tzofia use case: users may not create "any dataset, product, or platform that competes with, or creates a functional substitute for, any of ACLED's content", and may not use it to "train, test, develop, or improve any machine learning (ML) models" of that kind (https://acleddata.com/content-usage-terms).
- Even at best it is weekly. Not a real-time source.

### 6.2 GDELT

- Licence: "available for unlimited and unrestricted use for any academic, commercial, or governmental use of any kind without fee", with the condition that "any use or redistribution of the data must include a citation to the GDELT Project and a link" (https://www.gdeltproject.org/about.html).
- Update rate: GDELT 2.0 covers 65 translated languages, "updating every 15 minutes"; also in Google BigQuery (https://www.gdeltproject.org/data.html).
- API: DOC 2.0 at https://api.gdeltproject.org/api/v2/doc/doc , searches "a rolling window of the last 3 months of coverage", modes include article list and volume timeline, outputs JSON, CSV, RSS (https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/). Rate limits: NOT VERIFIED (not stated).
- Weakness (my assessment): it is machine-coded news, so it measures media attention, with duplicates and geocoding errors. Good for "volume of coverage of X is abnormal", poor as a list of confirmed events.

### 6.3 UCDP

- API is "free of charge", needs a token sent as "x-ucdp-access-token", obtained by contacting the maintainer and describing the project; quota "5,000 requests per day" (https://ucdp.uu.se/apidocs/).
- Candidate events are released monthly (latest v26.0.8) and quarterly (same page). Useful for historical context layers, not for live alerts. Licence text: NOT VERIFIED.

### 6.4 Liveuamap API

- The provider's API page returned HTTP 403, so price and terms are NOT VERIFIED from the primary source.
- Secondary source (a competitor's comparison page): Pro "$150/month for 200 requests/day", Enterprise "from $1,000/month for 1,500 requests/day" (https://www.worldmonitor.app/compare/worldmonitor-vs-liveuamap/).

### 6.5 Telegram public channels

- Web preview: https://t.me/s/<channel> returns the recent posts of a public channel without login. Tested on one channel: about 19 recent posts with message numbers came back (https://t.me/s/idfofficial). There is no documented rate limit or guarantee for this page.
- Terms are restrictive. Telegram "firmly prohibits the scraping, indexing, harvesting, aggregation or use of data obtained from its platform" for AI and machine learning, and states that "Access to user-generated content for any purpose other than ordinary, legitimate, and intended use of the Telegram platform as its user is prohibited" (https://telegram.org/tos/content-licensing). The general terms add: "Telegram additionally prohibits data scraping as part of its Content Licensing and AI Scraping Terms" (https://telegram.org/tos).
- API terms (MTProto, the full client interface): the same ban on using platform data to "train, fine-tune or otherwise engage in the development" of AI models; violations get a 10-day period to fix before access is cut (https://core.telegram.org/api/terms).
- Bot API: bots receive "all messages from channels where they are a member" only (https://core.telegram.org/bots/faq). A bot cannot join a channel by itself; the channel's owner must add it. So the Bot API reads only channels whose owners cooperate. Sending limits: about 30 messages per second in bulk, 20 per minute in a group (same page).
- Conclusion: the only route clearly inside the terms is channels that add Tzofia's bot voluntarily, or showing a link or Telegram's own embed of a post. Automated reading of other people's channels, and especially passing their text through an AI model, conflicts with the quoted terms.

### 6.6 US State Department

- Travel advisories RSS: https://travel.state.gov/_res/rss/TAsTWs.xml (https://travel.state.gov/content/travel/en/rss.html). No API mentioned.
- Embassy security alerts: listed publicly on the OSAC site with dated entries, for example Jordan on 3/31/2026: "Seek overhead cover and shelter in place immediately" (https://www.osac.gov/Pages/ContentReports.aspx?cid=13). Whether this list has a feed, and its reuse terms: NOT VERIFIED.
- Value: embassy alerts such as shelter orders or staff departures are a strong, official, dated signal.

### 6.7 UK Foreign Office travel advice

- Machine-readable and free: any GOV.UK page is available as JSON by adding /api/content/ ; "does not require authentication"; "a maximum limit of 10 requests per second per client"; content under "Open Government Licence v3.0, except where otherwise stated" (https://content-api.publishing.service.gov.uk/).
- Tested: https://www.gov.uk/api/content/foreign-travel-advice/israel returns JSON with an alert_status field (values such as "avoid_all_travel_to_parts") and a dated change history. This is the best-structured official advisory source found: the alert level per country is a field, and a change of level is detectable.

### 6.8 Maritime security advisories

- US MARAD: public list of advisories with numbers and validity dates, for example "2026-011-Persian Gulf, Strait of Hormuz and Gulf of Oman-Iranian Attacks on Commercial Vessels" (https://www.maritime.dot.gov/msci-advisories). No feed or API mentioned, only email subscription.
- UKMTO: site published under the Open Government Licence: "you can reproduce information from the site as long as you obey the terms of that licence" (https://www.ukmto.org/terms-and-conditions). The recent-incidents page returned "0 reports" to the fetch because it loads in the browser (https://www.ukmto.org/recent-incidents). Machine feed: NOT VERIFIED.
- US NGA navigational warnings: a JSON endpoint answers without a key: https://msi.nga.mil/api/publications/broadcast-warn?status=active&output=json (fields include navArea, msgNumber, text, issueDate, authority). Caution: the fetch tool reported the newest item as dated May 2024, which may be an artefact of the tool reading only part of a long list or may mean the endpoint is stale. Freshness is NOT VERIFIED and must be tested directly. Coverage of the Red Sea, Gulf and Mediterranean (which belong to navigational areas coordinated by other countries) through NGA's own long-range warnings: NOT VERIFIED.

### 6.9 Oil price and currency feeds usable free

- US EIA open data API: "provided free of charge", needs registration for a key (https://www.eia.gov/opendata/). Daily Brent and WTI spot series, rate limits, and the reuse policy text: NOT VERIFIED. EIA prices are daily and published with a delay, so they are context, not a live signal.
- FRED API: free with a key, but for third-party series "you must contact the data owner" before any use beyond personal, and a notice is required: "This product uses the FRED® API but is not endorsed or certified" (https://fred.stlouisfed.org/docs/api/terms_of_use.html). Brent on FRED is such a third-party series, so it is not safe for a public site.
- Frankfurter (exchange rates): no key, "There are no quotas", "Rates update daily", sourced from central banks; "The rates themselves fall under each provider's terms" (https://frankfurter.dev/). Inclusion of the shekel: NOT VERIFIED.
- Bank of Israel official rates interface: exists according to a Bank of Israel document (https://www.boi.org.il/media/upqgqpuv/extracting-representative-exchange-rates-from-the-new-series-database.pdf), not read. NOT VERIFIED.
- A free feed of oil or shekel prices that is both intraday and licensed for public display: none found. Daily is what is available free.

---

## 7. Methodologies for combining indicators, and existing dashboards

### 7.1 Published methodologies

- ViEWS (Uppsala University and PRIO): an ensemble of machine-learning models forecasting political violence months ahead (the 2020 revision covered January 2020 to December 2022), evaluated against out-of-sample forecasts for 2015 to 2017 (https://www.prio.org/publications/13335). It is a slow, structural forecast, not a real-time alarm.
- ACLED CAST: "forecasts the number of political violence events" per country for the next six four-week periods (https://acleddata.com/conflict-alert-system). Method and accuracy are behind registration: NOT VERIFIED.
- Traffic-density anomaly detection from ADS-B (Tanner and Strohmeier 2019, see 1.9).
- Fire detections as a proxy for combat (The Economist, Ukraine), see section 5.
- A published, validated method that fuses real-time open signals (airspace, internet, alerts, fires) into one short-term war-warning index: none found. World Monitor's "Country Instability Index" is the closest public example, but its formula is not described on the pages read (see 7.3).

### 7.2 Documented weaknesses and false alarms

- Pizza index: an X account "created August 2024" watches Google Maps busyness near the Pentagon. Criticism recorded: "confirmation bias", with the question "How often do they have absolutely nothing to do with geopolitics?" (https://en.wikipedia.org/wiki/Pentagon_pizza_theory, secondary). An expert quoted by Washingtonian: "I wouldn't say it's reliable" (https://washingtonian.com/2025/06/26/did-busy-pizza-shops-really-predict-us-airstrikes-on-iran/).
- NOTAM misreading: the 25 March 2026 Israeli case in 1.6, where a routine extension was read publicly as a possible closure.
- NOTAM lag: Case B in 1.8, where the sky emptied before the NOTAM.
- Fires: the Bellingcat list in section 5.
- Internet: Cloudflare separates unverified "anomalies" from confirmed "outages" for the same reason, and Kentik documents shutdowns with a harmless cause, such as "Internet blackout in Syria due to student exams" (https://kentik.com/analysis/internet-blackout-in-syria-due-to-student-exams/).
- Design lessons that follow (my assessment):
  1. Show each signal separately with its source and time. Do not publish one fused "war probability" number, because no validated method exists and one false alarm on a public Israeli site is costly.
  2. Give every signal a baseline for that place and hour, and show deviation from it.
  3. Mark the confidence level: unverified machine signal, or confirmed by an official or human-verified source.
  4. Keep a public log of past alerts including the false ones.
  5. Count signals as independent only when they really are (three sites quoting the same NOTAM are one signal).

### 7.3 Existing public dashboards

- World Monitor (koala73). "Real-time global intelligence dashboard"; licence "AGPL-3.0-only" (https://github.com/koala73/worldmonitor). Under AGPL, reusing its code in a public web service obliges publishing Tzofia's own source under the same licence. Reading it for ideas carries no obligation.
  - Sources it lists (https://www.worldmonitor.app/docs/data-sources): conflict from ACLED, UCDP, GDELT and LiveUAMap; NOTAM closures from ICAO; jamming from gpsjam.org; internet outages from Cloudflare Radar only; fires from NASA FIRMS and NASA EONET; earthquakes from USGS and GDACS; "Israel Home Front Command (OREF/Pikud HaOref)"; "Curated Telegram OSINT channels"; markets from FRED, ECB, Yahoo Finance, Polymarket.
  - It has a "Country Instability Index (CII)" for 31 countries and "cross-stream correlation" of signals (README). Formula: NOT VERIFIED.
  - Business model per its own site: free dashboard, paid API "from $99.99/mo" (https://www.worldmonitor.app/compare/worldmonitor-vs-liveuamap/).
  - Gaps visible from its source list, where Tzofia could be better: no IODA (so no province-level outage view), no traffic-derived closure detection described, NOTAMs only through the costly ICAO route, global and not Israel-first, and no visible false-alarm log. Whether it holds permissions for ACLED, Telegram and FRED content: NOT VERIFIED.
- Liveuamap: human-curated conflict event map, paid API (see 6.4). Terms: NOT VERIFIED.
- safeairspace.net: airspace risk only, CC BY-NC 4.0 (see 1.5).
- Cloudflare Radar outage centre and IODA dashboard: internet only (see section 2).
- Pentagon Pizza Report: single novelty indicator (see 7.2).
- "GlobalSecurity monitors": no specific product identified. NOT VERIFIED.

---

## Recommended choice and why (per item)

1. Airspace closures. Primary signal: Tzofia's own detection of emptied airspace from aircraft position data, because in both documented cases traffic emptied before or without a NOTAM. Confirmation layer: NOTAM text, by applying to the FAA for NMS API access (free of charge is NOT VERIFIED) and by reading EASA bulletins and safeairspace.net (credit, non-commercial). Not recommended: ICAO API for polling (USD 550 per 2,000 calls), EUROCONTROL B2B (not eligible).
2. Internet outages. Use IODA and Cloudflare Radar together: IODA for province-level and three independent measurement methods, Cloudflare for its verified/unverified split. Add RIPEstat as a keyless third check on routing. Both main sources restrict or may restrict commercial use, so decide early whether Tzofia is non-commercial or ask for permission.
3. Home Front Command alerts. Poll the Home Front Command's own endpoints from one server inside Israel, cache, and serve users from Tzofia's server. Build the polygon layer from an independently licensed source or get written permission from Tzofar; do not use Tzofar endpoints. Read the Home Front Command terms from Israel before launch.
4. Earthquakes and explosions. EMSC websocket as the main feed (push, CC BY 4.0), USGS as backup. Treat this layer as "large events only". Check the Geological Survey of Israel site in a browser for a regional feed.
5. Fires. NASA FIRMS area endpoint with the free key, shown as a delayed layer (1 to 3 hours) with a mask of permanent industrial heat sources. Not an early-warning input.
6. News and event signals. GDELT for coverage-volume anomalies (free, commercial use allowed with credit). UK Foreign Office JSON for official advisory level changes. US State Department RSS and OSAC embassy alerts as official signals. MARAD and UKMTO for the maritime side. Skip ACLED (terms forbid a substitute platform, weekly at best). Telegram only through channels that add Tzofia's bot or through links and embeds.
7. Combining signals. Do not publish one fused index at launch. Show independent signals with baselines, confidence marks and a public record of past alerts, and study World Monitor's approach without copying its code unless Tzofia is also released under AGPL.

---

## Open questions / not verified

1. FAA NMS API: is it free, who is approved, does it include international NOTAMs, what are the redistribution terms, and has the old system been switched off. Action: email the FAA address in 1.1.
2. A public Israeli web source for current LLLL NOTAMs. Action: check EAD Basic after free registration, and ask the Israel Airports Authority.
3. EASA bulletins: RSS feed and reuse terms; whether 2026-03-R14 is still the current revision.
4. First-issue times of the original closure NOTAMs on 13 June 2025 and 28 February 2026.
5. IODA: authentication, rate limits, data licence, citation wording, real delay in minutes. The API host was unreachable from this session.
6. Cloudflare Radar: rate limits; country filter on the anomalies endpoint; delay in minutes.
7. RIPEstat and RIPE Atlas terms for republication; Atlas credit costs.
8. Google Transparency Report: official API and terms. Kentik: any public feed. ThousandEyes: terms.
9. Home Front Command: official terms of use (403 from abroad); live behaviour of the endpoints from an Israeli address; official polygons source.
10. USGS: the full list of event type values and the licence text. EMSC: whether explosions are flagged, and delay. GEOFON: licence and delay. Geological Survey of Israel: feed, explosion marking, terms.
11. NASA FIRMS: VIIRS and MODIS resolution and pass times, geostationary products and their coverage of the Middle East, data policy and credit line.
12. ACLED prices and the length of the Research-tier delay. UCDP licence text.
13. Liveuamap price and terms from its own page (403).
14. GDELT DOC API rate limits.
15. OSAC embassy alerts: feed and reuse terms. MARAD and UKMTO: machine feeds.
16. NGA warnings endpoint: is it current (the tool saw May 2024 as newest), and does it cover the Red Sea, Gulf and eastern Mediterranean.
17. Oil and currency: EIA daily Brent/WTI series and reuse policy; Bank of Israel rates interface; shekel in Frankfurter.
18. World Monitor's index formula, and whether a specific product is meant by "GlobalSecurity monitors".
19. Licences of the open-source NOTAM parsers named in 1.7.

---

## Sources (every URL used)

Airspace and NOTAMs
- https://www.faa.gov/about/initiatives/notam
- https://www.faa.gov/about/initiatives/notam/faqs
- https://portal.apic4e.faa.gov/s (redirect target of https://api.faa.gov/s/, no content)
- https://apis.io/apis/faa/faa-nms-api/ (secondary)
- https://dataservices.icao.int/default.aspx
- https://icao.int/safety/iStars/Pages/Get-NOTAM-Data.aspx
- https://store.icao.int/en/icao-api-service-plans-booster-pack-for-2k-calls
- https://www.eurocontrol.int/service/network-manager-business-business-b2b-web-services
- https://www.eurocontrol.int/service/european-ais-database
- https://www.ead.eurocontrol.int/cms-eadbasic/opencms/en/ead-solutions/ead-basic/
- https://www.eurocontrol.int/news/israel-airports-authority-entrusts-eurocontrol-provision-aeronautical-information-services
- https://www.easa.europa.eu/en/domains/air-operations/czibs
- https://www.easa.europa.eu/en/print/pdf/node/143294/278079
- https://safeairspace.net/
- https://safeairspace.net/Iran/
- https://www.ias.co.il/?p=186221 (secondary)
- https://www.flightradar24.com/blog/flight-tracking-news/airspace-closures-following-israeli-strikes-on-iran/
- https://www.flightradar24.com/blog/live/israel-launches-pre-emptive-strikes-on-iran-airspace-closures-going-into-place/
- https://easychair.org/publications/paper/cZL9
- https://github.com/slavak/PyNotam (found by search, not read)
- https://www.rubydoc.info/gems/notam (found by search, not read)

Internet outages
- https://ioda.inetintel.cc.gatech.edu/ (no content returned)
- https://ioda.inetintel.cc.gatech.edu/reports/inside-our-new-brochure-journalists-guide-to-ioda-2/
- https://www.caida.org/projects/ioda/
- https://github.com/orgs/InetIntel/repositories
- https://developers.cloudflare.com/radar/
- https://developers.cloudflare.com/radar/get-started/first-request/
- https://developers.cloudflare.com/radar/glossary/
- https://developers.cloudflare.com/api/resources/radar/subresources/traffic_anomalies/methods/get/
- https://developers.cloudflare.com/api/resources/radar/subresources/annotations/subresources/outages/methods/get/
- https://netblocks.org/about
- https://netblocks.org/data-usage-policy
- https://netblocks.org/api (404)
- https://stat.ripe.net/docs/data-api/ripestat-data-api
- https://atlas.ripe.net/docs/apis/
- https://ooni.org/data/
- https://docs.ooni.org/data/
- https://raw.githubusercontent.com/ooni/license/master/data/LICENSE.md
- https://transparencyreport.google.com/traffic/overview (no content returned)
- https://support.google.com/transparencyreport/answer/7381677?hl=en-GB
- https://www.thousandeyes.com/outages/
- https://kentik.com/analysis/internet-blackout-in-syria-due-to-student-exams/ (found by search, title only)

Home Front Command
- https://github.com/eladnava/pikud-haoref-api (secondary)
- https://raw.githubusercontent.com/eladnava/pikud-haoref-api/master/config.js (secondary)
- https://raw.githubusercontent.com/eladnava/pikud-haoref-api/master/lib/alerts.js (secondary)
- https://www.oref.org.il/warningMessages/alert/History/AlertsHistory.json (403 from outside Israel)
- https://www.oref.org.il/heb/terms-of-use (403 from outside Israel)
- https://www.tzevaadom.co.il/en/systems/
- https://www.tzevaadom.co.il/en/terms/

Earthquakes
- https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
- https://earthquake.usgs.gov/fdsnws/event/1/
- https://earthquake.usgs.gov/data/comcat/index.php
- https://www.usgs.gov/faqs/how-quickly-earthquake-information-posted-usgs-website-and-sent-out-earthquake-notification
- https://www.seismicportal.eu/realtime.html
- https://geofon.gfz.de/eqinfo/
- https://eq.gsi.gov.il/en/earthquake/lastEarthquakes.php (no content returned)

Fires
- https://firms.modaps.eosdis.nasa.gov/api/
- https://firms.modaps.eosdis.nasa.gov/api/map_key/
- https://www.earthdata.nasa.gov/data/tools/firms/faq (headings only)
- https://www.earthdata.nasa.gov/learn/articles/firms-urt-data
- https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/data-latency
- https://bellingcat.com/resources/2022/10/04/scorched-earth-using-nasa-fire-data-to-monitor-war-zones
- https://smallwarsjournal.com/2026/03/25/fire-detection-as-a-proxy-for-combat-the-economist/ (found by search, not read)

Conflict data and news signals
- https://acleddata.com/terms-and-conditions
- https://acleddata.com/content-usage-terms
- https://acleddata.com/myacled-faqs
- https://acleddata.com/conflict-alert-system
- https://www.gdeltproject.org/about.html
- https://www.gdeltproject.org/data.html
- https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
- https://ucdp.uu.se/apidocs/
- https://liveuamap.com/promo/api (403)
- https://www.worldmonitor.app/compare/worldmonitor-vs-liveuamap/ (secondary for Liveuamap prices)
- https://t.me/s/idfofficial
- https://telegram.org/tos
- https://telegram.org/tos/content-licensing
- https://core.telegram.org/api/terms
- https://core.telegram.org/bots/faq
- https://travel.state.gov/content/travel/en/rss.html
- https://www.osac.gov/Pages/ContentReports.aspx?cid=13
- https://content-api.publishing.service.gov.uk/
- https://www.gov.uk/api/content/foreign-travel-advice/israel
- https://www.gov.uk/foreign-travel-advice/israel
- https://www.maritime.dot.gov/msci-advisories
- https://www.ukmto.org/recent-incidents
- https://www.ukmto.org/terms-and-conditions
- https://msi.nga.mil/api/publications/broadcast-warn?status=active&output=json
- https://msi.nga.mil/NavWarnings (no content returned)
- https://www.eia.gov/opendata/
- https://fred.stlouisfed.org/docs/api/terms_of_use.html
- https://frankfurter.dev/
- https://www.boi.org.il/media/upqgqpuv/extracting-representative-exchange-rates-from-the-new-series-database.pdf (found by search, not read)

Methodology and dashboards
- https://www.prio.org/publications/13335
- https://en.wikipedia.org/wiki/Pentagon_pizza_theory (secondary)
- https://washingtonian.com/2025/06/26/did-busy-pizza-shops-really-predict-us-airstrikes-on-iran/
- https://github.com/koala73/worldmonitor
- https://github.com/koala73/worldmonitor/blob/main/README.md
- https://www.worldmonitor.app/docs/data-sources
