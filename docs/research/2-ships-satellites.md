# Tzofia research 2: ship tracking (AIS) and satellite tracking

Research date: 5 October 2026. Every claim below carries the page it came from and a short exact quote. Where a primary page could not be reached or says nothing, the item is marked NOT VERIFIED. Pages were read through an automated fetcher that summarises the page, so quotes should be re-read on the live page before they are relied on in public or legal text.

Constraint assumed throughout: solo operator, no AIS receiver of his own, public website.

---

## Part A: live AIS without owning a receiver

### A1. Summary table

| Source | Delivery | Coverage | Price | Public display allowed? | Latency | Usable for Tzofia? |
|---|---|---|---|---|---|---|
| aisstream.io | Websocket stream, server side only | "global network" of stations, no map published; Middle East coverage NOT VERIFIED | Free | No written terms exist (NOT VERIFIED either way) | Live stream, no figure published | Yes as a first source, with real risks (see A2) |
| AISHub | REST poll (XML/JSON/CSV) | Pooled feeds of members | Free, but only for members who feed a receiver | Terms page not reachable, NOT VERIFIED | Max once a minute | No (needs own receiver) |
| MarineTraffic / Kpler | REST API, NMEA stream | Terrestrial plus satellite, "over 13,000 AIS receivers" | Not published, sales contact | NOT VERIFIED (terms page blocked) | NOT VERIFIED | Only with a negotiated contract |
| VesselFinder | REST, credits or flat subscription | Terrestrial plus satellite | 330 EUR per 10,000 credits; area feed price not published | Not stated in docs, NOT VERIFIED | NOT VERIFIED | Possible paid fallback for single vessels |
| Datalastic | REST, credits | "Live AIS tracking", sources not stated | 199 EUR/month and up (price from a secondary listing, see A6) | Forbidden to show raw data in a public app | "Every 1 minute (real-time)" polling option | No for a public raw map |
| Spire Maritime (now Kpler) | Enterprise API | Satellite AIS | Not published | NOT VERIFIED | NOT VERIFIED | No for a solo project |
| Global Fishing Watch | REST API with token | Global, satellite plus terrestrial AIS, plus Sentinel-1 radar detections | Free | Yes if non-commercial, with "Powered by Global Fishing Watch" | 72 to 96 hours for AIS products, about 5 days for radar | Yes, as the "dark ships" and history layer, not live |
| Norway (Kystverket / BarentsWatch) | Raw TCP feed and REST with OAuth | Norwegian economic zone only | Free | Yes, NLOD licence with attribution | Live | Only for Norway |
| Finland (Digitraffic) | REST and MQTT over websocket | Finnish waters, Baltic | Free, no key | Yes, CC BY 4.0 with attribution | Live | Only for the Baltic |
| Denmark (DMA) | CSV file download | Danish waters | Free | NOT VERIFIED | Historical only | No for live |

Bottom line of the table: there is no free, licensed, live AIS source that is confirmed to cover the Eastern Mediterranean, Red Sea, Persian Gulf and Suez. The only free live source with potentially global reach is aisstream.io, and it publishes neither a coverage map nor terms of use.

### A2. aisstream.io

What it is: a free websocket API that streams AIS messages. Homepage wording: "in real-time and for free" (https://aisstream.io/). GitHub description: "a free api to stream global AIS data via websockets" (https://github.com/aisstream).

Delivery and authentication (https://aisstream.io/documentation):
- Endpoint: `wss://stream.aisstream.io/v0/stream`
- A subscription message with the API key and bounding boxes must be sent "Within 3 seconds" of connecting.
- Bounding boxes are pairs of corner coordinates, for example `"BoundingBoxes": [[[25.835, -80.208], [25.603, -79.879]]]`. Optional filters: `FiltersShipMMSI` (limit "200 per subscription") and `FilterMessageTypes`.
- The browser cannot connect directly: "Direct browser connections are not permitted". Tzofia therefore needs its own small relay server that holds the key and forwards to visitors only what they need.

Limits (same page):
- "3 subscribed connections" per account, and "3 open connections" per originating IP.
- Subscription updates: "1 per second per connection".
- Slow consumers lose data: "the service drops messages".

Stability: "The service currently provides no SLA or uptime guarantee, and events are not durably replayed." (https://aisstream.io/documentation). The public issue tracker showed 188 open issues on the research date, including in August 2026: "Stream silent since 2026-08-05", "SSL Certificate Expired", "WebSocket connection issues / Service down", "WebSocket connection accepted but zero data received" (https://github.com/aisstream/issues/issues). No maintainer replies were visible on the issues read.

Beta status: no "beta" label was found on the homepage, the documentation page or the GitHub organisation page on 5 October 2026. Whether the service was formally taken out of beta: NOT VERIFIED.

Terms of use: none found. `https://aisstream.io/terms` returns 404. An open issue of 30 August 2026 is titled "Data licensing: written terms of use?" and its author writes "I couldn't find any written terms or data licence" (https://github.com/aisstream/issues/issues/290). Another issue of 29 August 2026 asks for written permission for "live vessel display" and has no maintainer answer (https://github.com/aisstream/issues/issues/289). So permission to show the data on a public site is NOT VERIFIED, and so is any prohibition.

Coverage: the homepage speaks of "Our global network of Automatic Identification System (AIS) stations". No coverage map, station list or statement about satellite AIS was found. A user issue of 26 August 2026 asks for "an updated list of stations" and says the last map seen "dates of 2022" (https://github.com/aisstream/issues/issues/286). The wording "stations" points to shore receivers, so mid-sea areas are probably not covered, but this is an inference. Coverage of Israel's coast, the Eastern Mediterranean, Suez, the Red Sea and the Persian Gulf: NOT VERIFIED. It can only be settled by subscribing to those bounding boxes for a few days and counting vessels.

Latency: no figure published. The documentation says only "AIS messages are event-driven rather than emitted on a fixed schedule."

Message types (https://aisstream.io/documentation), 25 in total: PositionReport, UnknownMessage, AddressedSafetyMessage, AddressedBinaryMessage, AidsToNavigationReport, AssignedModeCommand, BaseStationReport, BinaryAcknowledge, BinaryBroadcastMessage, ChannelManagement, CoordinatedUTCInquiry, DataLinkManagementMessage, DataLinkManagementMessageData, ExtendedClassBPositionReport, GroupAssignmentCommand, GnssBroadcastBinaryMessage, Interrogation, LongRangeAisBroadcastMessage, MultiSlotBinaryMessage, SafetyBroadcastMessage, ShipStaticData, SingleSlotBinaryMessage, StandardClassBPositionReport, StandardSearchAndRescueAircraftReport, StaticDataReport.

Fields of PositionReport: MessageID, RepeatIndicator, UserID (the MMSI), Valid, NavigationalStatus, RateOfTurn, Sog, PositionAccuracy, Longitude, Latitude, Cog, TrueHeading, Timestamp, SpecialManoeuvreIndicator, Raim, CommunicationState. Every message also carries a MetaData object with MMSI, ShipName, Latitude, Longitude. The field list of ShipStaticData was not shown on the page read; the full models are in https://github.com/aisstream/ais-message-models (not read, NOT VERIFIED).

Weaknesses for a public app: no SLA, documented multi-day outages, no written licence, unknown coverage in the region that matters most, three-connection cap.

### A3. AISHub

- Requires feeding: "Every AISHub contributor is required to provide at least one raw AIS feed" (https://www.aishub.net/join-us).
- Quality bar for API access: "Coverage of at least 10 vessels" and "At least 90% uptime" over the last 7 days (same page).
- Recycled data is banned: "Data from publicly available AIS sources or services" (same page).
- API: "retrieve AISHub data in XML, JSON or CSV format"; rate: "Don't access the webservice more frequently than once per minute!" (https://www.aishub.net/api).
- Fields: MMSI, TIME, LONGITUDE, LATITUDE, COG, SOG, HEADING, ROT, NAVSTAT, IMO, NAME, CALLSIGN, TYPE, dimensions A/B/C/D, DRAUGHT, DEST, ETA.
- Terms on public or commercial use: the terms page could not be reached (404 on two guessed addresses). NOT VERIFIED.

Not usable for Tzofia without a receiver. It becomes relevant only if a receiver is ever placed on the Israeli coast.

### A4. MarineTraffic / Kpler

- Sold through sales, no public price list: the product page offers only "Request a demo" (https://www.kpler.com/product/maritime/data-services).
- Coverage claim: "over 13,000 AIS receivers across the globe", collected "along the coast, in the ocean and in space" (same page).
- Delivery: "API or live NMEA data stream" (same page). The API documentation uses an API key and includes a "Credits Balance" endpoint (https://servicedocs.marinetraffic.com/). The exact credit prices: NOT VERIFIED.
- Terms on redistribution and public display: the terms page returned 403 to the fetcher. NOT VERIFIED.

### A5. VesselFinder API

Source: https://api.vesselfinder.com/docs/ (the marketing pages on vesselfinder.com blocked the fetcher).
- Credit methods: Vessels, PortCalls, ExpectedArrivals, MasterData, Distance. Flat-fee methods: VesselsList and LiveData, "available for a fixed subscription fee".
- LiveData is the one that matters for a map: "All vessels in a predefined area". Its price is not published. NOT VERIFIED.
- Credit prices: 10,000 credits 330 EUR, 20,000 credits 625 EUR, 50,000 credits 1470 EUR. "All credits expire 12 months after purchase."
- Satellite costs ten times more: "1 credit per terrestrial AIS position and 10 credits per satellite AIS position."
- Formats: JSON by default, XML optional.
- Terms on public display and redistribution: not stated in the docs. NOT VERIFIED.

### A6. Datalastic

- Plans (https://datalastic.com/pricing/): Starter 20,000 credits a month, Growth 80,000, Developer Pro unlimited. "14-day trial Money-Back guarantee."
- Prices: the pricing page did not show amounts to the fetcher. A secondary listing that cites that page gives 199 EUR, 569 EUR and 679 EUR a month (https://apis.io/plans/datalastic/datalastic-plans-pricing/). Treat the amounts as NOT VERIFIED on the primary page.
- When credits run out: "further requests are automatically blocked" (pricing page).
- The licence rules out a public raw map. Forbidden: "through any public-facing application" (full sentence: may not expose raw data or a substantial portion of it to any third party), and "publish, distribute, or otherwise redistribute" (https://datalastic.com/terms-of-services/).
- Terrestrial versus satellite sources: not stated. The terms say only "Certain information is obtained from third-party sources." NOT VERIFIED.

### A7. Spire Maritime / Kpler

Spire's maritime business, the main independent satellite AIS provider, was bought by Kpler. The deal closed on 25 April 2025 for about 233.5 million dollars (secondary source: https://maritime-executive.com/article/kpler-closes-spire-maritime-acquisition-as-uk-proceeds-with-investigation; the Kpler press page returned 404). Current product name, price and terms after the merger: NOT VERIFIED. Practical meaning: satellite AIS is now concentrated in one enterprise vendor that sells through sales contacts.

### A8. Global Fishing Watch (GFW) APIs

This is not a live feed. It is the best free, documented source for history, "dark" events and radar detections.

Licence and limits (https://globalfishingwatch.org/our-apis/documentation/docs/license-rate-limits):
- "The Services are available for noncommercial use only" under CC BY-NC 4.0.
- The application must not be "directed towards commercial advantage or monetary compensation".
- Limits: 50,000 requests per day and 1,500,000 per month per user, with at most five tokens per user. Above that the API returns 429.
- Required credit on a website: "Powered by Global Fishing Watch" with a link.
- Commercial use (https://globalfishingwatch.org/faqs/can-i-use-global-fishing-watch-apis-for-commercial-purposes/): free for "anything that is free and open and contributes to the public good"; otherwise "custom licenses in clearly mission-aligned circumstances".
- Access needs registration, a token, and a short statement of intended impact (https://globalfishingwatch.org/our-apis/).

Datasets, API version 3 (https://globalfishingwatch.org/our-apis/documentation/docs/v3/general-api-doc/key-concepts):
- `public-global-presence:latest`: AIS vessel presence, all vessel types, "from 2012 to approximately 96 hours ago". Built from "one position per hour per vessel" (data caveats page).
- `public-global-sar-presence:latest`: radar detections, "between 2017 to 5 days ago", with a `matched` filter that separates detections matched to AIS from unmatched ones.
- `public-global-gaps-events:latest`: "AIS intentional off events for all vessel types", marked as prototype.
- Also encounters, loitering, port visits, fishing events, vessel identity.

Latency, two GFW pages disagree slightly: the data availability page says "near real time data (72 hour delay)" (https://globalfishingwatch.org/global-fishing-watch-data-availability/), while the key concepts page says 96 hours for AIS products and 5 days for radar. Plan for 4 days on AIS products and 5 days or more on radar detections.

Caveats stated by GFW (https://globalfishingwatch.org/our-apis/documentation/docs/v3/general-api-doc/data-caveats):
- A gap event "must be at least 12 hours" and "must start at least 50 nautical miles from shore". So gaps close to the coast, which is most of the Eastern Mediterranean and the Gulf, are deliberately not flagged.
- Radar: "Sentinel-1 SAR data does not sample most of the open ocean"; resolution about 20 m; the method will "miss most vessels under 15 m in length"; nothing is classified "within 1 km of shore"; "some false positives may still remain".
- The API shows a filtered subset; the full radar detection set is in the download portal (https://globalfishingwatch.org/our-apis/assets/APIs_gfwr_and_Data_Downloads_Products_Differences.pdf).

Whether a journalist's public site with donations or ads counts as non-commercial is a question for GFW, not something the pages settle. NOT VERIFIED.

### A9. National open AIS feeds

Norway:
- Raw feed open to anyone at "153.44.253.27 port 5631" (https://www.kystverket.no/en/sea-transport-and-ports/ais/access-to-ais-data/).
- Coverage: "Vessels within the Norwegian economic zone and the protection zones off Svalbard and Jan Mayen".
- Excluded: "Fishing vessels under 15 metres and recreational craft under 45 metres".
- Licence: Norwegian Licence for Open Government Data (NLOD), "free and universally accessible".
- BarentsWatch API on the same data: OAuth client credentials, "No data older than 14 days" (https://developer.barentswatch.no/docs/AIS/live-ais-api/). Terms: "You may use data from BarentsWatch commercially as long as you follow the guidelines", with the visible credit "Data delivered by BarentsWatch", and a warning that high-traffic sites should make contact first or "you will be charged server handling fees" (https://www.barentswatch.no/en/articles/api-terms-and-conditions/).
- Whether satellite AIS is included in the open feed: NOT VERIFIED.

Finland:
- REST: `https://meri.digitraffic.fi/api/ais/v1/locations` and `/vessels`. Stream: MQTT over websocket at `wss://meri.digitraffic.fi:443/mqtt`, topics `vessels-v2/<mmsi>/locations` and `vessels-v2/<mmsi>/metadata` (https://www.digitraffic.fi/en/marine-traffic/).
- No key. Limits without the identifying header: 60 requests a minute per IP, MQTT 5 connections a minute per IP; "You can make more requests when the header is set" (the `Digitraffic-User` header). Compression is required: "The use of compression is mandatory" (https://www.digitraffic.fi/en/support/instructions/).
- Licence: Creative Commons 4.0 BY, credit example "Source: Fintraffic / digitraffic.fi, license CC 4.0 BY" (https://www.digitraffic.fi/en/terms-of-service/).

Denmark:
- "continuously updated historical AIS data for free", as CSV files, at aisdata.ais.dk. No live feed is described (https://www.dma.dk/safety-at-sea/navigational-information/ais-data).
- Licence terms: NOT VERIFIED.

None of these covers the Mediterranean or the Middle East. They are useful as clean, licensed test data and for a Baltic or North Sea view.

### A10. Other sources checked

- MyShipTracking API: the address tried returned 404. NOT VERIFIED.
- No open government live AIS feed for Israel, Egypt, Cyprus, Greece or the Gulf states was found in this research. This was not searched exhaustively. NOT VERIFIED that none exists.

### A11. AIS spoofing, AIS gaps and "dark ship" detection

Spoofing, as documented by GFW:
- Shared identity: "multiple vessels are simultaneously broadcasting the same MMSI number". The track then "jumps back and forth across the ocean at impossible speeds". GFW puts this at "less than a quarter of one percent of the AIS signals" (https://globalfishingwatch.org/data/spoofing-one-identity-shared-by-multiple-vessels/).
- False positions: GFW and SkyTruth documented fabricated tracks of warships in 2020 and 2021. Two checks exposed them. First, radar imagery: "no corresponding vessel was visible on the satellite imagery". Second, receiver geometry: a position near Kiel was "picked up by a receiver in Gdynia, Poland more than 300 miles away" (https://globalfishingwatch.org/data/analysis-reveals-false-vessel-tracks/).
- What Tzofia can implement itself from a live stream: impossible speed between consecutive positions of one MMSI, the same MMSI in two places at once, placeholder MMSI such as 123456789, and position clusters on land or in known jamming circles. The receiver-geometry check is not possible, because aisstream.io does not expose which station heard a message (not in the MetaData fields listed in A2).

Gaps:
- GFW's rule for a deliberate switch-off: at least 12 hours and starting at least 50 nautical miles from shore, because "not all AIS signals broadcasted are received by satellite or terrestrial AIS receivers" (data caveats page, A8).
- Consequence for Tzofia: with a shore-receiver feed, a missing signal usually means the ship left coverage. A gap must not be presented as "went dark" unless reception in that spot is known to be good. The underlying paper (Welch et al., Science Advances 2022) could not be fetched (403). NOT VERIFIED from the primary.

Dark ships with Sentinel-1 radar:
- GFW method, published in Nature in January 2024: detect vessels in Sentinel-1 radar scenes, then match each detection to AIS positions; unmatched detections are the dark vessels. Findings: "72–76% of the world's industrial fishing vessels are not publicly tracked" and "21–30% of transport and energy vessel activity is missing". Detection rate ">70% for 25-m vessels and >90% for vessels 50 m and larger". Limit: "Sentinel-1 does not sample most of the open ocean" (https://www.nature.com/articles/s41586-023-06825-8).
- xView3: "A competition to detect dark vessels using computer vision and global SAR satellite imagery", run by the Defense Innovation Unit and GFW, on Sentinel-1 imagery (https://iuu.xview.us/). Reference code uses the VV and VH radar channels plus bathymetry (https://github.com/DIUx-xView/xview3-reference). Dataset licence: NOT VERIFIED.
- Realistic latency. The radar itself: products "typically in less than 3 hours" for near-real-time users, otherwise "within 24 hours from sensing". Revisit: "main shipping routes in 1-3 days and in 3 days at the equator" (https://sentiwiki.copernicus.eu/web/s1-mission). GFW's published detections arrive about 5 days after the pass (A8). So an open "dark ship" layer is a look-back of days, never live. Running one's own detection on fresh Sentinel-1 scenes could bring it to hours after each pass, with a pass every one to three days per location; that is a substantial build and its false-alarm rate near coasts is a known problem ("We do not classify objects within 1 km of shore").

---

## Part B: satellites

### B1. CelesTrak

Formats (https://celestrak.org/NORAD/documentation/gp-data-formats.php): TLE, 3LE, 2LE, OMM in XML and KVN, JSON, JSON-PRETTY, CSV. Query pattern: `https://celestrak.org/NORAD/elements/gp.php?{QUERY}=VALUE[&FORMAT=VALUE]` with CATNR, INTDES, GROUP, NAME or SPECIAL.

The TLE format is now a dead end for new objects: "We ran out of 5-digit catalog numbers on 2026-07-11." New objects get six-digit numbers and "GP data will not be available for them using the TLE format" (https://celestrak.org/NORAD/elements/). Tzofia must fetch JSON or CSV in OMM form, not TLE text.

How often to fetch: "CelesTrak only checks for new GP data once every 2 hours, so there is no need for you to check more often." A repeat download before the next update gets a refusal text instead of data ("GP data has not updated since your last successful download").

Usage policy (https://celestrak.org/usage-policy.php and the formats page):
- "Only download the data you need, when you are going to use it, and only download data once per update".
- Bandwidth: "If you are using more than 100 MB/day you can expect that your IP address may end up in the firewall."
- Errors: after "more than 1,000 HTTP 403 errors" in a day (also 301 and 404) the IP is blocked.
- Automated clients "should immediately stop querying when it receives any non-HTTP 200 responses".
- Consequence: visitors' browsers must never call CelesTrak. Tzofia's server fetches once every two hours at most, stores the file, and serves its own copy.
- Redistribution terms for CelesTrak's files: nothing explicit found on the pages read. NOT VERIFIED.

Number of objects (https://celestrak.org/satcat/boxscore.php, data of 4 October 2026): 35,229 objects in orbit, of which 20,209 payloads and 15,020 debris and rocket bodies; 70,882 catalogued in total. The fetcher also reported 17,201 active payloads; that figure should be re-read on the page. The exact row count of the "active" group file could not be fetched (robots rule). NOT VERIFIED.

Groups available include Active, Starlink, OneWeb, Kuiper, GPS, GLONASS, Galileo, Beidou, Space Stations, Weather, Earth Resources (same elements page).

Supplemental data: element sets "derived directly from owner/operator-supplied orbital data"; Starlink comes from "SpaceX's public data repository"; checked "Each day" (https://celestrak.org/NORAD/elements/supplemental/). More accurate for Starlink than the radar-based catalogue.

Metadata from CelesTrak: the SATCAT in CSV (`https://celestrak.org/satcat/records.php?...`) has OWNER, LAUNCH_DATE, OBJECT_TYPE (PAY, R/B, DEB, UNK) and OPS_STATUS_CODE (https://celestrak.org/satcat/satcat-format.php). Policy says to fetch SATCAT once or twice a day.

### B2. Space-Track.org

- Account required; the API documentation is behind login.
- Redistribution: the user agreement forbids transfer "to any other entity without prior express approval", but then grants "express blanket approval for transfer/redistribution of basic SSA data" on condition of "appropriate citation" (https://www.space-track.org/documentation#/user_agree). What exactly counts as "basic SSA data" should be read in the agreement itself after logging in. Partly NOT VERIFIED.
- Rate limits: "less than 30 requests per 1 minute(s) and 300 requests per 1 hour(s)". For element sets: "Once every hour for TLEs", at a random minute away from the top and bottom of the hour (https://www.space-track.org/documentation#/api).
- Enforcement: "Your space-track account may be suspended"; multiple accounts to get around limits are forbidden.
- Classified objects are absent: "All objects on this site will have a classification of 'U' (unclassified)" (https://www.space-track.org/documentation#/faq).
- Scale stated in the FAQ: "more than 16,000 satellites in orbit".

For Tzofia, CelesTrak is enough for the public catalogue. Space-Track adds value only for history and decay data, at the cost of an account bound to a personal agreement.

### B3. Classified satellites

- Official catalogues do not publish elements for them (B2).
- Amateur-tracked elements: Mike McCants's page still lists `classfd.zip`, described as "updated whenever I receive and process new observations" (https://mmccants.org/tles/index.html). The same page lists `inttles.zip`, updated "every day at 12 Noon and about 6 or 7 PM Central time". Two older files "no longer being updated and has been removed".
- The actual date of the current classfd file could not be read (download blocked from the research environment). NOT VERIFIED. Check the file's epoch dates before relying on it: amateur elements for manoeuvring satellites go stale within days to weeks.
- Licence or permission for republishing McCants's file: nothing stated on the page. NOT VERIFIED. The file is in TLE format only.

### B4. Propagation in the browser

- Library: satellite.js, version 6.0.0, MIT licence, implements SGP4 and SDP4, and accepts the new JSON form through `json2satrec()`, "preferred for new applications" (https://github.com/shashwatak/satellite-js, https://www.npmjs.com/package/satellite.js).
- Published speed figures for satellite.js itself: none found. A benchmark planned for this research could not be run (package download blocked). NOT VERIFIED.
- Nearest primary reference points: a native implementation propagates the full CelesTrak catalogue at one-minute steps over 24 hours, 1,440 steps, in about 8.4 to 9 seconds on one desktop core (https://github.com/neuromorphicsystems/sgp4/). That is roughly 6 milliseconds per whole-catalogue step for the catalogue of 2020. JavaScript on a phone will be several times to tens of times slower; the exact factor is NOT VERIFIED.
- Proof that it works at scale in a browser: KeepTrack renders "50,000+ satellites in real-time" using WebGL 2 and web workers for "Background orbit calculations (non-blocking UI)" (https://github.com/thkruz/keeptrack.space). Its licence is AGPL-3.0, where "Network use counts as distribution", so its code cannot be copied into a closed product.
- Design that follows from this (engineering judgment, not a measured result): run propagation in a web worker, not the main thread; recompute each object every one to few seconds and interpolate between; propagate only what is on screen or in the chosen group; draw points on the map's GPU layer rather than as individual map markers. Measure on a mid-range Android phone before promising "all 35,000 objects".

### B5. Starlink

- Size on 2 October 2026 per Jonathan McDowell's statistics page: 12,988 launched, 11,156 in orbit, 9,727 in operational orbit (https://planet4589.org/space/con/star/stats.html).
- Data sources: CelesTrak group `starlink` (general catalogue) and CelesTrak supplemental Starlink, built from SpaceX's own published ephemerides (B1).
- Starlink is about a third of all objects in orbit, so it should be a separate layer that is off by default.

### B6. Satellite metadata (owner, purpose)

- UCS Satellite Database: frozen. Last data 1 May 2023 with 7,560 satellites; "The UCS Satellite Database has paused updates" (https://www.ucs.org/resources/satellite-database). It has the best purpose and user fields (28 data types) but misses everything launched since. Licence not stated. NOT VERIFIED.
- GCAT (Jonathan McDowell): alive and openly licensed. Release 1.8.8, data updated 2 October 2026, licence "CC-BY-4.0", tab-separated files, with owner, manufacturer, object type and status (https://www.planet4589.org/space/gcat/).
- CelesTrak SATCAT: owner code, launch date, object type, operational status (B1). No purpose field.
- No single live open source gives a clean "purpose" label (imaging, signals, communications) for every satellite. Practical route: GCAT for owner and type, UCS for purpose of older satellites, CelesTrak group membership (Earth Resources, Weather, navigation groups) as a coarse purpose tag, and a hand-kept list for military imaging satellites.

### B7. Pass and overflight prediction for imaging satellites

- Compute it in Tzofia: with the element sets from B1 and the library from B4, the ground track and the times a satellite is above a chosen point are computed locally. What is not open is the sensor's actual pointing and swath for agile commercial and military satellites, so the result is "could have imaged", not "imaged".
- N2YO API, free with a key: positions, visual passes, radio passes, and "above" a location. Limits per hour: 1000 for positions, 100 for passes, 100 for "above". "The REST API v1 is free but it is transaction limited by type." (https://www.n2yo.com/api/). Its radio-pass call is a geometric pass predictor. Terms on showing results publicly: only an anti-abuse clause was found. NOT VERIFIED.
- Sentinel-1 planned acquisitions: ESA publishes map files with "detailed information about the planned Sentinel-1 acquisitions", each covering about 20 days, for Sentinel-1A, 1C and 1D (https://sentinels.copernicus.eu/web/sentinel/copernicus/sentinel-1/acquisition-plans). This is the one case where real planned imaging footprints, not only orbits, are public. It also tells Tzofia when the next radar scene over a given sea area is due (ties to A11).
- Heavens-Above gives per-location predictions on its website; no API was found on the page read (https://www.heavens-above.com/).

---

## Recommended choice and why

Ships:
1. Live layer: aisstream.io behind Tzofia's own relay server. It is the only free source that needs no receiver and may reach beyond one country. Before building on it, run a one-week coverage test on four bounding boxes (Israeli coast and Eastern Mediterranean, Suez, Red Sea, Persian Gulf) and write to the maintainers for written permission to display positions publicly, since no terms exist.
2. Label the live layer honestly on the site: coverage is shore-based and partial, and absence of a ship is not evidence.
3. History, gaps and radar "dark" detections: Global Fishing Watch API, as a separate layer clearly dated (4 to 5 days behind), with the required credit. Confirm with GFW that the site counts as non-commercial.
4. Paid fallback if aisstream.io proves empty in the region: ask VesselFinder for a LiveData area quote and written display rights. Datalastic is ruled out by its terms for a public raw map. MarineTraffic/Kpler only if budget allows a negotiated contract.
5. Longer term, in line with independence from others: a cheap receiver on the Israeli coast would give owned data and unlock AISHub membership.

Satellites:
1. CelesTrak in JSON or CSV form, fetched by the server at most once every two hours and served from Tzofia's own copy. Not TLE text, because of the catalogue-number limit.
2. satellite.js in a web worker in the browser; Starlink as a separate optional layer.
3. Metadata from GCAT (CC-BY-4.0) joined by catalogue number, with CelesTrak SATCAT for status.
4. Classified satellites as an optional layer from McCants's file, shown with the element age and a clear "amateur estimate" label, after checking the file is current.
5. Overflight times computed locally; Sentinel-1 planned acquisitions added as real footprints.

## Open questions / not verified

- aisstream.io: actual coverage of the Eastern Mediterranean, Suez, Red Sea, Persian Gulf; whether satellite AIS is included; any written terms; beta status; real latency.
- AISHub, MarineTraffic/Kpler, VesselFinder, DMA: terms on public display (pages unreachable or silent).
- VesselFinder LiveData price; MarineTraffic/Kpler prices; Datalastic prices on the primary page; Datalastic data sources.
- Spire Maritime product and terms after the Kpler merger.
- Whether GFW treats a journalist's public site as non-commercial; which of 72 or 96 hours is the current delay.
- Whether Norway's open feed includes satellite AIS.
- Any open live AIS feed from governments in the Mediterranean or Middle East.
- CelesTrak: redistribution terms; exact size of the "active" group; the 17,201 active-payload figure.
- Space-Track: exact scope of "basic SSA data" in the blanket redistribution approval.
- McCants classfd file: current date and republishing permission.
- satellite.js speed on a phone: no measured figure obtained.
- xView3 dataset licence; N2YO terms on public display; UCS licence.
- Welch et al. 2022 on AIS disabling: primary paper not readable from here.

## Sources

AIS
- https://aisstream.io/
- https://aisstream.io/documentation
- https://aisstream.io/terms (404)
- https://github.com/aisstream
- https://github.com/aisstream/issues/issues
- https://github.com/aisstream/issues/issues/286
- https://github.com/aisstream/issues/issues/289
- https://github.com/aisstream/issues/issues/290
- https://www.aishub.net/api
- https://www.aishub.net/join-us
- https://www.kpler.com/product/maritime/data-services
- https://servicedocs.marinetraffic.com/
- https://support.marinetraffic.com/en/articles/9552659-api-services
- https://help.kpler.com/en/articles/9552663
- https://api.vesselfinder.com/docs/
- https://datalastic.com/pricing/
- https://datalastic.com/terms-of-services/
- https://apis.io/plans/datalastic/datalastic-plans-pricing/ (secondary)
- https://maritime-executive.com/article/kpler-closes-spire-maritime-acquisition-as-uk-proceeds-with-investigation (secondary)
- https://globalfishingwatch.org/our-apis/
- https://globalfishingwatch.org/our-apis/documentation
- https://globalfishingwatch.org/our-apis/documentation/docs/license-rate-limits
- https://globalfishingwatch.org/our-apis/documentation/docs/v3/general-api-doc/key-concepts
- https://globalfishingwatch.org/our-apis/documentation/docs/v3/general-api-doc/data-caveats
- https://globalfishingwatch.org/our-apis/documentation/docs/release-notes
- https://globalfishingwatch.org/global-fishing-watch-data-availability/
- https://globalfishingwatch.org/our-apis/assets/APIs_gfwr_and_Data_Downloads_Products_Differences.pdf
- https://globalfishingwatch.org/faqs/can-i-use-global-fishing-watch-apis-for-commercial-purposes/
- https://globalfishingwatch.org/data/spoofing-one-identity-shared-by-multiple-vessels/
- https://globalfishingwatch.org/data/analysis-reveals-false-vessel-tracks/
- https://www.nature.com/articles/s41586-023-06825-8
- https://iuu.xview.us/
- https://github.com/DIUx-xView/xview3-reference
- https://sentiwiki.copernicus.eu/web/s1-mission
- https://sentiwiki.copernicus.eu/web/s1-products
- https://www.kystverket.no/en/sea-transport-and-ports/ais/access-to-ais-data/
- https://developer.barentswatch.no/docs/AIS/live-ais-api/
- https://www.barentswatch.no/en/articles/api-terms-and-conditions/
- https://www.digitraffic.fi/en/marine-traffic/
- https://www.digitraffic.fi/en/terms-of-service/
- https://www.digitraffic.fi/en/support/instructions/
- https://www.dma.dk/safety-at-sea/navigational-information/ais-data

Satellites
- https://celestrak.org/NORAD/elements/
- https://celestrak.org/NORAD/documentation/gp-data-formats.php
- https://celestrak.org/usage-policy.php
- https://celestrak.org/satcat/boxscore.php
- https://celestrak.org/satcat/satcat-format.php
- https://celestrak.org/NORAD/elements/supplemental/
- https://www.space-track.org/documentation#/user_agree
- https://www.space-track.org/documentation#/api
- https://www.space-track.org/documentation#/faq
- https://mmccants.org/tles/index.html
- https://github.com/shashwatak/satellite-js
- https://www.npmjs.com/package/satellite.js
- https://github.com/neuromorphicsystems/sgp4/
- https://github.com/thkruz/keeptrack.space
- https://planet4589.org/space/con/star/stats.html
- https://www.planet4589.org/space/gcat/
- https://www.ucs.org/resources/satellite-database
- https://www.n2yo.com/api/
- https://sentinels.copernicus.eu/web/sentinel/copernicus/sentinel-1/acquisition-plans
- https://www.heavens-above.com/

Pages that blocked the fetcher or returned an error (nothing taken from them): vesselfinder.com marketing pages, marinetraffic.com terms, live.ais.barentswatch.no, science.org (Welch et al.), myshiptracking.com/api, kpler.com press page, aishub.net terms.
