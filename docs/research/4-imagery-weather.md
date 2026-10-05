# Tzofia research 4: satellite imagery by chosen location, and weather / meteorology layers

Research date: 5 October 2026. Method: every key claim below was read on the provider's own page with a page fetch on that date, and carries the URL and a short exact quote. Where a provider page could not be read (blocked, script-only page, or no numbers published), the item is marked NOT VERIFIED. Nothing here was tested with a live account or live tile request: the work environment blocked direct network calls, so endpoints were not exercised.

Reading note on quotes: quotes are the text returned by the page fetch tool. For long PDF documents (EUMETSAT Data Policy) the article numbers were returned by the tool and should be re-read in the original before signing anything.

---

## Part A - Satellite imagery

### A1. Copernicus Data Space Ecosystem (CDSE) and its Sentinel Hub APIs

**What it is.** The EU's official free access point for Sentinel data. It includes the Sentinel Hub APIs: Process API (image rendered on request from a custom script), OGC services, catalogue, statistics.

| Item | Finding | Source and quote |
|---|---|---|
| OGC services | WMS, WMTS, WCS, WFS are all offered. Authentication is by a "configuration instance" ID created in the dashboard | https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/OGC.html - "Simply add a new data collection in your GIS application" |
| Process API | Main image API; mosaics tiles automatically; takes a custom script ("evalscript") | https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Process.html - "the most commonly used API in Sentinel Hub" |
| Free quota, general user, Sentinel Hub | 10,000 processing units per month, 10,000 requests per month, 300 requests per minute, 300 processing units per minute. Resets on the first of each month | https://documentation.dataspace.copernicus.eu/Quotas.html (table values: 10,000 / 10,000 / 300 / 300) |
| Free quota, downloads | 12 TB per rolling 30 days, 4 concurrent connections, 20 MB/s per connection; direct HTTP access to cloud-optimised files: 50,000 requests per month | Same page - "Once the cumulative transfer for the last 30 days falls below the limit" |
| Sentinel-2 resolution | 13 bands: four at 10 m, six at 20 m, three at 60 m | https://documentation.dataspace.copernicus.eu/Data/SentinelMissions/Sentinel2.html - "four bands at 10 m, six bands at 20 m" |
| Sentinel-2 revisit | 5 days at the equator with two satellites, 2 to 3 days at mid-latitudes | Same page - "5 days with 2 satellites which results in 2-3 days at mid-latitudes" |
| Sentinel-2 constellation | 2B and 2C are the nominal pair. 2A runs an "extension campaign" since March 2025; the CDSE page gives it as active until 13 March 2026. Whether 2A still images today: NOT VERIFIED | https://sentiwiki.copernicus.eu/web/s2-mission - "Sentinel-2A is performing an extension campaign" |
| Sentinel-1 (radar, works through cloud and at night) | One satellite repeats every 12 days; a pair gives a 6-day exact repeat. Monthly mosaics are at 20 m (IW mode) | https://sentiwiki.copernicus.eu/web/s1-mission - "The two-satellite constellation offers a 6 day exact repeat cycle" |
| Sentinel-1 constellation | 1A (since 2014, planned to mid-2026), 1C (operational since May 2025), 1D (launched 4 Nov 2025, operations from mid-April 2026). The pair moves to 1C + 1D by mid-2026. Actual status on 5 Oct 2026: NOT VERIFIED | Same page |
| Sentinel-3 | OLCI colour instrument at 300 m, revisit under 2 days; SLSTR temperature instrument, revisit under 4 days | https://documentation.dataspace.copernicus.eu/Data/SentinelMissions/Sentinel3.html |
| Latency, sensing to availability | Official expectation: 24 hours for Sentinel-1 and Sentinel-2, 3 hours for Sentinel-3 and Sentinel-5P. For Sentinel-1 the mission page says in practice "few hours" | https://documentation.dataspace.copernicus.eu/FAQ.html - "24 hours after sensing for Sentinel-1 and Sentinel-2"; https://sentiwiki.copernicus.eu/web/s1-mission - "reduced to few hours from sensing" |
| Licence for a public site | Free, full and open. Reproduction, distribution, communication to the public, adaptation and combination are all permitted. The CDSE FAQ, as read, indicates commercial use is allowed | https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice - "communication to the public"; https://dataspace.copernicus.eu/terms-and-conditions - "free, full and open basis" |
| Required credit | Unmodified: "Copernicus Sentinel data [Year]". Modified (any rendered or processed image): "Contains modified Copernicus Sentinel data [Year]" | Legal notice, same URL |
| Israel area | No provider page states any degradation or regional restriction of Sentinel data. The FAQ says access is worldwide. The US restriction (see A4) is a US law on US-licensed operators; Copernicus is an EU programme. Explicit statement "Israel is not degraded" from Copernicus itself: NOT VERIFIED (no such sentence exists on the pages read) | https://documentation.dataspace.copernicus.eu/FAQ.html - "data and services will be available to users worldwide" |

**Practical meaning of the free quota.** 10,000 requests per month is about 330 map tiles per day. That is enough for the owner's own analysis and for pre-rendering images on a server, and far too little for serving live tiles to public visitors straight from Sentinel Hub. The right pattern is: the Tzofia server calls the Process API once per area and date, stores the result, and serves it to the public itself. The licence allows this.

**Portal content other than Sentinel data** (logos, texts, pages of the portal) is non-commercial only: https://dataspace.copernicus.eu/terms-and-conditions - "intended for non-commercial use only".

### A2. NASA GIBS (the tile service behind Worldview)

| Item | Finding | Source and quote |
|---|---|---|
| Service | Public WMTS (REST and key-value) in four projections, including Web Mercator at `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/` | https://nasa-gibs.github.io/gibs-api-docs/access-basics/ - "public standards-compliant web services" |
| Authentication | None mentioned on the access page; no key | Same page |
| Latency | Near-real-time layers within 3.5 hours of observation; standard layers within 24 hours | https://nasa-gibs.github.io/gibs-api-docs/available-visualizations/ - "available in GIBS within 3.5 hours of observation" |
| True colour, daily | "Corrected Reflectance (True Color)" exists for VIIRS on NOAA-20, period Daily, ongoing. Same family exists for MODIS and VIIRS on other satellites (layer names for those not individually fetched) | https://gibs.earthdata.nasa.gov/layer-metadata/v1.0/VIIRS_NOAA20_CorrectedReflectance_TrueColor.json |
| Night lights | "Black Marble Nighttime At Sensor Radiance (Day/Night Band)", period Daily, ongoing | https://gibs.earthdata.nasa.gov/layer-metadata/v1.0/VIIRS_SNPP_DayNightBand_At_Sensor_Radiance.json |
| Geostationary imagery | GOES-East, GOES-West and Himawari, every 10 minutes, rolling one month. Layers: Red Visible, Clean Infrared, Air Mass; a GOES-East "GeoColor" layer (true colour by day, infrared by night) also exists, period Subdaily | https://www.earthdata.nasa.gov/learn/articles/geostationary-in-worldview - "full-disk image of Earth at the same time every 10 minutes"; https://gibs.earthdata.nasa.gov/layer-metadata/v1.0/GOES-East_ABI_GeoColor.json |
| Meteosat in GIBS | Not mentioned on any NASA page read. GOES-East does not see Israel and Himawari does not either, so GIBS geostationary layers do not cover the Middle East. For Israel use EUMETSAT (A3) | Same NASA pages (absence) |
| Licence | NASA policy of full and open sharing; an acknowledgement sentence is requested | https://nasa-gibs.github.io/gibs-api-docs/ - "We acknowledge the use of imagery provided by services from NASA's" |
| Usage limits for a public site | No published request limit found: NOT VERIFIED. The NASA data-use policy page returned an access error | - |

### A3. EUMETSAT (Meteosat over Israel and the Middle East)

This is the correct geostationary source for Israel.

| Item | Finding | Source and quote |
|---|---|---|
| EUMETView WMS | Open WMS at `https://view.eumetsat.int/geoserver/wms`. Its own capabilities document lists fees "none" and access constraints "none" | https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetCapabilities - "EUMETSAT visualizations offering via WMS" |
| New-generation satellite (MTG), 0 degrees | Layers with a 10-minute time step, for example infrared 10.5 image (`mtg_fd:ir105_hrfi`), fire power, blended precipitation | Same capabilities document (time step PT10M) |
| Lightning from space | `mtg_fd:li_afa`, "LI Accumulated Flash Area", 5-minute time step. A lightning layer with no ground network needed | Same document (time step PT5M) |
| Older generation (MSG), 0 degrees | Products at 15-minute time step | Same document (PT15M) |
| Indian Ocean service (IODC), 45.5 E | Products at 15-minute time step; Meteosat-9 is the prime satellite | Same document - "Meteosat-9 at 45.5° E is the prime satellite for the IODC" |
| Latency | EUMETView and Data Store: under 15 minutes | https://www-cdn.eumetsat.int/files/2026-05/10-%20MTG%20Data%20Access%20-%20Africa-Erdem_PDF.pdf - "Low latency (<15 minutes)" |
| Data Store API | Pull access to the original numerical data, with a command-line tool (EUMDAC). Registration details and key procedure: NOT VERIFIED (the user portal pages are script-only and could not be read) | Same PDF - "Pull data which you need and when you need it" |
| Licence, original numerical data | Data Policy last amended 25 November 2025. Hourly data and any data one hour old or more are free for any use. Data fresher than one hour, other than the hourly slots, need a licence: 4,000 euro per year for an end user, 8,000 euro per year for a service provider or broadcaster. Research, education and personal use are free but operational and commercial use is prohibited | https://www-cdn.eumetsat.int/files/2026-01/45173%20-%20Data_Policy.pdf - "All Level 1 Hourly SEVIRI, FCI and IRS data"; "Without Charge for any use"; "operational and commercial use, including Broadcasting in any form, is prohibited" |
| Licence, rendered images | EUMETView gives visualisations, not original data. As read, derived "Advanced Image Products" are core data under CC-BY-4.0 | Same policy - "without providing access to original numerical data" |
| Independent confirmation | The Norwegian met service republishes EUMETSAT images as free and unrestricted | https://api.met.no/weatherapi/geosatellite/1.4/documentation - "The data are considered free and unrestricted" |

**Open point that matters.** The capabilities document says no fees and no constraints, and the policy treats visualisations differently from raw data. But whether a public site may re-serve the 10-minute EUMETView images in real time (rather than hourly ones) is not stated in one clear sentence on any page read. The safe reading: hourly images and anything older than one hour are free for any use; for 10-minute real-time display, ask EUMETSAT in writing before launch. Marked NOT VERIFIED.

### A4. High-resolution and commercial imagery

**US restriction on Israel imagery (Kyl-Bingaman Amendment).**
- The statute: US-licensed operators may collect or release imagery of Israel only if "no more detailed or precise than" what is commercially available elsewhere. Source: https://www.NESDIS.NOAA.gov/s3/2021-12/Imager%20Restriction%20over%20Israel.pdf
- Current limit: 0.4 m. Source: https://www.federalregister.gov/documents/2020/07/21/2020-15770/notice-of-findings-regarding-commercial-availability-of-non-us-satellite-imagery-with-respect-to - "changed the existing resolution limit of 2.0 m GSD to 0.4 m GSD". Date of change: 21 July 2020 (https://space.commerce.gov/?p=3951).
- Any change after 2020: none found on the two government pages read. A later amendment or individual operator practice (some US firms have voluntarily restricted Israel and Gaza imagery since 2023): NOT VERIFIED from a primary source.
- Meaning: US operators (Vantor, Planet, BlackSky, Umbra, Capella) may not sell Israel imagery sharper than 0.4 m. Non-US operators (Airbus, at 0.3 m) are not bound by this law.

**Free sources**

| Source | Finding | Source and quote |
|---|---|---|
| Landsat 8 and 9 (USGS) | Free. Each satellite revisits every 16 days, the pair every 8 days. Resolution (30 m, 15 m panchromatic) and latency: NOT VERIFIED on the pages read | https://www.usgs.gov/faqs/what-are-acquisition-schedules-landsat-satellites - "capture images of the same area every eight days" |
| Landsat licence | No restrictions | https://www.usgs.gov/faqs/are-there-any-restrictions-use-or-redistribution-landsat-data - "it can be used or redistributed as desired" |
| Umbra open radar data | CC BY 4.0, on Amazon open storage with no sign-up, 16 cm to 1 m, time series over fixed sites. Locations are chosen by Umbra, not by the user | https://registry.opendata.aws/umbra-open-data/ - "Creative Commons License (CC by 4.0)" |
| Capella open radar data | CC BY 4.0, public storage bucket, new data quarterly, 0.25 m to 1.2 m by mode | https://registry.opendata.aws/capella_opendata/ - "New data is added quarterly." |
| ICEYE open radar data | Free download with no registration; the licence is not stated on the page: NOT VERIFIED | https://www.iceye.com/resources/datasets - "No registration. No paywall. Download and start working." |
| Planet NICFI programme | Ended. Tropical mosaics left the programme on 24 January 2025; never covered Israel | https://community.planet.com/tropical-basemaps-85/nicfi-satellite-data-program-prolongs-public-access-to-high-resolution-rainforest-satellite-images-6020 - "due to contract end" |
| Planet Education and Research | University-affiliated people only. Free tier: 3,000 km2 per month, with a 30-day delay on imagery. A law student with a college e-mail address may qualify; publication only "for illustrative purposes with attribution", not in a product | https://www.planet.com/industries/education-and-research/ - "Any University-Affiliated Student, Faculty Member or Researcher May Apply" |

**Paid sources, realistic price for one recent image of a chosen place**

| Source | Finding | Source and quote |
|---|---|---|
| SkyFi (reseller of many operators, no contract) | Price sheet of August 2025, optical, per km2: 0.51 to 1.0 m: 5 USD existing, 8 USD new. 0.31 to 0.50 m: 8 USD existing, 12 USD new. 0.16 to 0.30 m: 22.50 to 35 USD existing, 30 USD new. Minimum scene 5 km2 on the sheet. The site's help article says the minimum new tasking is 25 km2 from 200 USD. The two figures differ; treat 200 USD as the realistic floor for a new image and 25 to 175 USD for an existing one | https://skyfi.com/files/SkyFi_Pricing_August_2025.pdf ; https://learn.skyfi.com/?p=506 - "just 25 square kilometers" ; https://www.skyfi.com/faqs |
| SkyFi radar | Umbra 5x5 km scene: 675 USD (about 1 m), 950 USD (0.5 m), 1,750 USD (0.31 to 0.40 m), 3,250 USD (0.25 m). ICEYE: 450 USD existing; new 1,150 USD (3 m) or 1,450 USD (1 m) | Same price sheet |
| SkyFi delivery | Existing image within 24 hours of order; new image 48 hours after capture. Time from order to capture is not published: NOT VERIFIED | https://www.skyfi.com/faqs |
| SkyFi publication right | Sharing on the web is allowed with visible credit to the provider and SkyFi; no resale | Same page - "You are free to share purchased images on the web" |
| Umbra direct | Open price list: 1 m spotlight 5x5 km 675 USD, 0.25 m from 3,250 USD; all delivered data under CC BY 4.0, so it can be republished freely | https://umbra.space/pricing/ |
| UP42 (marketplace, Airbus-owned) | Prepaid credits, 100 credits = 1 euro, minimum purchase 100 euro. Minimum billed area for existing Pleiades Neo (0.3 m): 5 km2 for delivery in a few days; SPOT and Pleiades: 1 km2. Per-km2 prices are shown only inside the platform: NOT VERIFIED | https://up42.com/pricing - "100 credits = €1.00" ; https://docs.up42.com/data/catalog-min-charges |
| Airbus OneAtlas direct | Pricing pages returned "not found": NOT VERIFIED. Use UP42 for Airbus imagery | - |
| Planet | PlanetScope is the daily 3 m product. Self-service exists (fixed areas up to 300 km2, and single SkySat tasking orders with no commitment), but the pricing page shows no numbers to a page fetch: prices NOT VERIFIED | https://www.planet.com/pulse/planet-enables-self-service-purchasing-for-small-customers-on-planet-insights-platform/ |
| Maxar, now Vantor | Maxar Intelligence was renamed Vantor in October 2025. No public single-image price list was found; available through SkyFi. Vantor's own open-data page returned "not found": terms NOT VERIFIED | https://skyfi.com/en/blog/maxar-rebrands-as-vantor-and-lanteris-what-to-know - "As of October 2025, Maxar Intelligence has officially rebranded as Vantor." |
| ICEYE, Capella direct tasking | No public price page read: NOT VERIFIED. ICEYE prices above are through SkyFi | - |

Whether any of these resellers refuse or delay orders over Israel beyond the 0.4 m rule: NOT VERIFIED (the SkyFi help page says nothing about it).

### A5. Change detection over time, and a high-resolution background layer

| Tool | Finding | Source and quote |
|---|---|---|
| Sentinel Hub custom scripts | Public library of ready scripts for Sentinel-1, Sentinel-2 and others, including monthly Sentinel-1 mosaics and quarterly cloud-free Sentinel-2 mosaics. Licence CC-BY-SA-4.0 (the scripts, so a modified script must be shared alike; the output images follow the Sentinel licence). A script can read several dates in one request, which is the basis for a before/after difference layer | https://github.com/sentinel-hub/custom-scripts - "A repository of custom scripts to be used with Sentinel Hub" |
| Google Earth Engine, eligibility | Free for journalists only "at an organization whose primary mission is journalism". No paid work for commercial or government bodies. A solo journalist with no registered media organisation: eligibility NOT VERIFIED | https://earthengine.google.com/noncommercial/ - "free of charge for journalists at an organization whose primary mission is journalism" |
| Earth Engine quotas, since 27 April 2026 | Community tier 150 compute-hours per month; Contributor tier 1,000 (needs a billing account, not charged); Partner tier 100,000 (by application) | https://developers.google.com/earth-engine/guides/noncommercial_tiers - "Available to all verified noncommercial projects" |
| Earth Engine public apps | A published app can be public and needs no account to view; each app has its own quota and returns "too many requests" when exceeded. Serving Earth Engine tiles inside an outside site is not addressed: NOT VERIFIED | https://developers.google.com/earth-engine/guides/apps - "No Earth Engine account is required to view or interact" |
| Esri World Imagery (background) | Through the ArcGIS Location Platform: 2 million basemap tiles per month free, then 0.15 USD per 1,000 tiles. Needs an account and key. Exact terms of use for a public non-Esri map, the attribution wording, and the Wayback archive (dated past versions) could not be read (script-only pages): NOT VERIFIED | https://location.arcgis.com/pricing/ - "$0.15 per 1,000 tiles" |

---

## Part B - Weather

### B1. Open-Meteo

| Item | Finding | Source and quote |
|---|---|---|
| Models in the forecast API | ICON (Germany, 2 to 11 km, 7.5 days, every 3 hours), GFS and HRRR (USA, 3 to 25 km, 16 days, hourly), ARPEGE and AROME (France), IFS and AIFS (ECMWF, 9 to 25 km, 15 days, every 6 hours), UK Met Office (2 to 10 km), plus Norway, Japan, Canada and others | https://open-meteo.com/en/docs |
| ECMWF inside Open-Meteo | The native 9 km IFS is served at full resolution, hourly steps to 90 hours, with no added delay, following ECMWF's open-data change of October 2025 | https://open-meteo.com/en/docs/ecmwf-api - "1-Hourly, 3-hourly after 90 hours, 6-hourly after 144 hours" |
| Sea-level pressure | Variable `pressure_msl` is available | https://open-meteo.com/en/docs |
| Ensemble API | ECMWF IFS 51 members (0.25 degree global; 9 km over Europe), ECMWF AIFS 51, GFS ensemble 31, ICON ensemble 40, UK global 18, Canada 21, Google WeatherNext 2 64 | https://open-meteo.com/en/docs/ensemble-api |
| Archive API | ERA5 from 1940 (25 km, 5 days behind), ERA5-Land from 1950 (11 km), ECMWF IFS 9 km from 2017 with no delay | https://open-meteo.com/en/docs/historical-weather-api - "Daily with 5 days delay" |
| Free tier | Non-commercial only: 600 calls per minute, 5,000 per hour, 10,000 per day, 300,000 per month. No key | https://open-meteo.com/en/terms - "10.000 calls / day" |
| What counts as non-commercial | Private or non-profit sites with no subscriptions and no advertising | Same page - "websites or apps that do not have subscriptions or advertising" |
| Paid | Standard 99 USD per month for 1 million calls; Professional 499 USD per month for 5 million calls, and only this tier and above include the ensemble, historical and climate APIs | https://open-meteo.com/en/pricing - "no per-call overages or surprise charges" |
| Data licence | CC BY 4.0, credit required ("Weather data by Open-Meteo.com") | https://open-meteo.com/en/terms - "provided under the terms of the CC-BY 4.0 licence" |
| Self-hosting | Server code is open source (AGPLv3), runs in Docker or on Ubuntu; the processed weather database is published through Amazon's open-data programme, so a self-hosted copy can pull ready data | https://github.com/open-meteo/open-meteo - "redistributed through the AWS Open Data Sponsorship Program" |
| Exact delay per model | The model-updates page shows a live table that the page fetch could not read: NOT VERIFIED | https://open-meteo.com/en/docs/model-updates |

Fit with the owner's wish for independence: self-hosting Open-Meteo removes both the call limit and the "non-commercial" question, because the limits are on Open-Meteo's hosted service and not on the underlying data.

### B2. Raw model data from the weather centres

| Source | Finding | Source and quote |
|---|---|---|
| ECMWF open data | CC-BY-4.0, commercial use allowed. 0.25 degree, GRIB2 format. Four runs a day (00, 06, 12, 18 UTC). Ensemble included for both IFS and the AI model AIFS. About 12 latest runs kept. Mirrors on Amazon, Microsoft and Google clouds. Limit of 500 simultaneous connections on ECMWF's own portal | https://www.ecmwf.int/en/forecasts/datasets/open-data - "0.25 degrees resolution in GRIB2 format" ; "500 simultaneous connections" |
| ECMWF resolution note | The ECMWF page still says higher resolution needs a separate agreement, while Open-Meteo says it serves the native 9 km under CC-BY 4.0 since October 2025. The two statements differ; which route gives a solo developer the 9 km fields directly from ECMWF is NOT VERIFIED | Both URLs above |
| NOAA GFS | Open, "can be used as desired". Four runs a day. 28 km base resolution to 16 days. Free on Amazon storage with no account | https://registry.opendata.aws/noaa-gfs-bdp-pds/ - "open to the public and can be used as desired" |
| NOAA GEFS (ensemble) | Same licence; the registry page describes 21 members (Open-Meteo lists 31; the registry text may be dated), four runs a day | https://registry.opendata.aws/noaa-gefs/ - "4 times a day, every 6 hours starting at midnight." |
| DWD ICON | Open server with no registration: global ICON, ICON-EU, ICON-D2 and their ensembles. DWD's own terms page was blocked to the page fetch; the DWD climate-data terms document states CC BY 4.0. Licence wording for the forecast-model folder specifically: NOT VERIFIED | https://opendata.dwd.de/README.txt - "Access is granted without registration." ; https://opendata.dwd.de/climate_environment/CDC/Terms_of_use.pdf |
| MET Norway (relevant to Bergen) | CC BY 4.0. Every request must identify the app in the User-Agent header. Maximum 20 requests per second per application. Responses must be cached. No use of the "Yr" brand | https://api.met.no/doc/TermsOfService - "cache all API responses to avoid repeatedly asking for the same data" |
| MET Norway forecast content | Nordic area from the MEPS model (2.5 km class), updated hourly; rest of the world from ECMWF, updated four times a day; nine days ahead; includes sea-level pressure | https://docs.api.met.no/doc/locationforecast/datamodel.html - "Our Nordic forecasts are updated once every hour" |
| Israel Meteorological Service | An API with a token exists for station observations, issued after signing terms of use. The service's own site timed out on every attempt, so the terms, cost and redistribution rule are NOT VERIFIED. Only a third-party library page confirms the token process | https://pypi.org/project/ims-envista/ - "how to get a token" (third party, not the provider) |

### B3. Low-pressure systems: positions, tracks and forecasts

**Ready-made products**

| Product | Finding | Source and quote |
|---|---|---|
| ECMWF extratropical cyclone database | Marks lows, frontal waves and fronts in the deterministic and all ensemble members, tracks each feature, and gives track plumes and strike-probability maps. Domain: Europe and the North Atlantic. 12-hour steps on a 50 km grid. Whether the domain reaches the eastern Mediterranean and Israel: NOT VERIFIED | https://sites.ecmwf.int/charts/cdb/help/ - "follow the cyclonic features as they evolve in each ensemble member" |
| ECMWF charts licence | Hundreds of charts are free under CC-BY 4.0 since 7 October 2020, including cyclone activity, and may be redistributed even commercially | https://www.ecmwf.int/node/25178 - "even for commercial applications, as long as they acknowledge the source as ECMWF" |
| ECMWF machine access to charts | The charts site blocked the page fetch (anti-robot screen), so an automated pull of chart images or of the cyclone-database data files is NOT VERIFIED | https://charts.ecmwf.int/ |
| ECMWF tropical cyclone tracks | Part of open data, deterministic and ensemble, as BUFR files. Tropical systems only | https://www.ecmwf.int/en/forecasts/datasets/open-data |
| UK Met Office surface pressure charts | Analysis plus forecasts to five days for Europe and the north-east Atlantic, hand-drawn lows and fronts. Updated twice a day, about 07:30 and 19:30 UTC. Crown copyright; website material generally under the Open Government Licence v3.0. Images only, no data file | https://weather.metoffice.gov.uk/maps-and-charts/surface-pressure - "updated every 12 hours around 0730 UTC and 1930 UTC" ; https://www.metoffice.gov.uk/policies/legal |
| NOAA Ocean Prediction Center | Unified surface analysis and 48-hour and 96-hour surface forecasts for the Atlantic and Pacific, also as KML files. Public domain. Does not cover the Mediterranean. The page showed "updated" dates from May to July 2026 on those KML files, so the feeds may be stale: check live | https://ocean.weather.gov/gis/ - "it points to the latest OPC product" ; https://www.weather.gov/disclaimer - "may be used without charge for any lawful purpose" |
| DWD surface analysis charts | Not read (site blocks page fetch): NOT VERIFIED | - |

**Deriving lows ourselves (the route that covers Israel and gives full control).**
The verified open tool is TempestExtremes, an open-source framework for point-feature tracking that handles extratropical cyclones (https://gmd.copernicus.org/articles/10/1069/2017/ - "open-source software framework for automated pointwise feature tracking").
The method, in general terms (standard practice, described here from general knowledge and not quoted from a provider page):
1. Take the sea-level-pressure field for each forecast step from ECMWF open data, GFS or ICON.
2. Find local minima, and keep only those enclosed by a closed pressure contour of a chosen depth within a chosen radius, to drop shallow noise.
3. Link minima between consecutive steps by nearest distance under a maximum speed, to form tracks; keep tracks that last a minimum time.
4. Repeat on every ensemble member (51 for ECMWF) to get a spread of tracks and a probability that a low passes near a point.
5. Compare the track of the newest run with earlier runs to show how the forecast is shifting.
This runs on free data with a CC-BY licence, updates four times a day, and the result (points and lines) is our own derived product.

### B4. Real-time observation layers

| Source | Finding | Source and quote |
|---|---|---|
| RainViewer radar tiles | Personal and educational use only; commercial terms case by case. No key. Credit required. Changes through 2025 and 2026: forecast frames and satellite infrared discontinued on 1 January 2026; free tiles capped at zoom level 7; only one colour scheme; 100 requests per IP per minute; history 2 hours at 10-minute steps. (The main API page still mentions "nowcast frames", which contradicts the transition page; the transition page is the dated one.) No published commercial price | https://www.rainviewer.com/api.html - "available for personal and educational use only" ; https://rainviewer.com/api/transition-faq.html - "Maximum zoom level set to 7" |
| Blitzortung lightning | Non-commercial community network. Raw data only for participants or by explicit permission. A third-party site must be freely accessible, name the source, and fetch through its own server. Data under CC BY-SA 4.0. Must not be used for storm warning systems | https://www.blitzortung.org/en/contact.php - "allowed only to the participants of the project" |
| Lightning alternative | EUMETSAT lightning imager layer, 5-minute step (see A3) | - |
| METAR and TAF (airport observations) | Free API, formats include JSON and GeoJSON. Limit 100 requests per minute. A full-world cache file is refreshed every minute, which is the right way to load all stations at once | https://aviationweather.gov/data/api/ - "All requests are rate limited to 100 requests per minute" |
| SYNOP via Ogimet | Site blocks page fetch: terms NOT VERIFIED | - |
| Marine buoys (NOAA NDBC) | Plain files over HTTPS; most stations hourly, available about 25 minutes after the hour. Mostly US waters; Mediterranean coverage NOT VERIFIED | https://www.ndbc.noaa.gov/faq/rt_data_access.shtml - "We ask that you limit your retrievals to a minimal level." |
| Wave forecasts | Open-Meteo has a marine API (not fetched in this research): NOT VERIFIED | - |
| OpenWeatherMap | Free plan: 60 calls per minute, 1,000,000 per month, current weather and 5-day forecast. Weather Maps 2.0 (the full tile product): 545 USD per month. Licence wording of the free tier: NOT VERIFIED | https://openweathermap.org/price |
| Windy API | Map Forecast: free test tier is for development only, 500 sessions per day, GFS only. Professional: 990 euro per year, 10,000 sessions per day, plus 1,000 euro for ECMWF, which is then "internal use only". Point Forecast free tier returns deliberately altered data | https://api.windy.com/map-forecast/pricing - "Development purpose only, not intended for production" ; https://api.windy.com/point-forecast/pricing - "randomly shuffled and slightly modified data" |

### B5. Space weather (NOAA Space Weather Prediction Center)

| Item | Finding | Source and quote |
|---|---|---|
| Feeds | Open JSON directory with no key, including the planetary K index at 1-minute steps (`planetary_k_index_1m.json`) and the aurora oval model (`ovation_aurora_latest.json`) | https://services.swpc.noaa.gov/json/ ; https://www.spaceweather.gov/content/data-access |
| Licence | The centre is part of the US National Weather Service, whose material is public domain. A licence sentence on the space-weather site itself was not found: NOT VERIFIED for that site specifically | https://www.weather.gov/disclaimer - "are in the public domain, unless specifically noted otherwise" |
| Caution | The directory listing showed file dates of 14 April 2026 to the page fetch, which looks like a cached view. Check freshness with a live request before relying on it | Same directory URL |
| Site address | The old address now redirects to spaceweather.gov | https://www.swpc.noaa.gov/content/data-access (redirect) |

---

## Recommended choice and why

**Imagery**
1. Core layer by chosen location: Copernicus Sentinel-2 (10 m) and Sentinel-1 radar through the CDSE Sentinel Hub Process API, called from the Tzofia server and stored there. Reason: free, the licence expressly allows communication to the public, credit line is simple, and it is an EU source outside the US restriction. The 10,000-requests monthly quota forces server-side storage, which also fits the wish for independence.
2. Change over time: Sentinel Hub multi-date custom scripts on the same account. Earth Engine only as a second option, because eligibility for a solo journalist is not confirmed and its compute is now capped by tier.
3. Daily global view and night lights: NASA GIBS tiles, direct from the browser, no key.
4. Live cloud view over Israel and the Middle East: EUMETSAT EUMETView WMS (10-minute new-generation layers and the 15-minute Indian Ocean service). Start with hourly frames, which are free for any use, and get written confirmation before showing 10-minute frames in real time.
5. A sharp recent image of one place, when a story needs it: SkyFi for optical (existing image from about 25 USD, new from about 200 USD), Umbra for radar when the image must be republished freely (675 USD, CC BY 4.0). For Israel itself, expect a 0.4 m ceiling from US operators; Airbus through UP42 is the non-US route.
6. Background high-resolution layer: Esri World Imagery through the Location Platform free tier, only after its terms are read on a real browser.

**Weather**
1. Forecast engine: Open-Meteo, self-hosted. It carries ECMWF 9 km, GFS, ICON and the ensembles in one interface, the data are CC BY 4.0, and self-hosting removes the call cap and the non-commercial condition. The hosted free tier is fine for building.
2. Low-pressure tracking: our own derivation from ECMWF open data (CC-BY-4.0), deterministic plus 51 ensemble members, with TempestExtremes or an equivalent own script, refreshed four times a day. Add the UK Met Office and ECMWF charts as human-drawn reference images.
3. Norway and Bergen: MET Norway's API (hourly Nordic model), with caching and an identifying header as its terms require.
4. Radar: RainViewer is no longer suitable for a public product (personal use only, zoom capped at 7, forecast frames removed). Plan on national radar sources or EUMETSAT precipitation layers instead; this needs its own research.
5. Lightning: EUMETSAT lightning imager layer first; Blitzortung only with their explicit permission.
6. Station observations: aviationweather.gov cache file once a minute. Space weather: NOAA JSON feeds.

---

## Open questions / not verified

1. EUMETSAT: may a public site re-serve 10-minute EUMETView images in real time, or only hourly ones and those older than one hour? Needs a written answer from EUMETSAT. Data Store registration and key procedure also not read.
2. Israel Meteorological Service API: terms, cost, redistribution, and whether radar is included. The site did not respond.
3. Kyl-Bingaman: any change after July 2020, and any voluntary restriction by resellers on Israel and Gaza orders.
4. Prices not published or not readable: Planet (all tiers), Airbus OneAtlas direct, UP42 per-km2 prices, Vantor direct, ICEYE and Capella direct tasking. Time from order to capture for new tasking at SkyFi.
5. SkyFi minimum order: price sheet says 5 km2 minimum scene, help article says 25 km2 and 200 USD for new tasking.
6. Sentinel constellation status today: whether Sentinel-2A still images after 13 March 2026, and whether Sentinel-1D has replaced 1A.
7. Copernicus: no explicit sentence that Israel-area data are undegraded; and no explicit sentence about embedding its WMS in a public app.
8. NASA GIBS: request limits for a public site; full current list of geostationary layers; the data-use policy page was blocked.
9. Esri World Imagery: terms for a public non-Esri map, attribution wording, and Wayback access. Earth Engine: eligibility of a solo journalist and serving tiles on an outside site.
10. ECMWF: automated access to chart images and to the cyclone-database files; whether its domain covers the eastern Mediterranean; how to get the native 9 km fields directly from ECMWF.
11. DWD: licence wording for the forecast-model folder, and its surface analysis charts. Ogimet terms. Open-Meteo per-model delay and its marine API. OpenWeatherMap free-tier licence. Landsat resolution and latency figures.
12. NOAA: freshness of the Ocean Prediction Center KML files and of the space-weather JSON directory, both of which showed old dates to the page fetch.
13. No endpoint was exercised live. Every address above should be tested once from a normal connection before it goes into the build.

---

## Sources

Copernicus
- https://documentation.dataspace.copernicus.eu/Quotas.html
- https://dataspace.copernicus.eu/terms-and-conditions
- https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice
- https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/OGC.html
- https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Process.html
- https://documentation.dataspace.copernicus.eu/FAQ.html
- https://documentation.dataspace.copernicus.eu/Data/SentinelMissions/Sentinel1.html
- https://documentation.dataspace.copernicus.eu/Data/SentinelMissions/Sentinel2.html
- https://documentation.dataspace.copernicus.eu/Data/SentinelMissions/Sentinel3.html
- https://sentiwiki.copernicus.eu/web/s1-mission
- https://sentiwiki.copernicus.eu/web/s2-mission
- https://sentiwiki.copernicus.eu/web/s1-products
- https://sentiwiki.copernicus.eu/web/s2-products
- https://github.com/sentinel-hub/custom-scripts

NASA
- https://nasa-gibs.github.io/gibs-api-docs/
- https://nasa-gibs.github.io/gibs-api-docs/access-basics/
- https://nasa-gibs.github.io/gibs-api-docs/available-visualizations/
- https://www.earthdata.nasa.gov/learn/articles/geostationary-in-worldview
- https://earthdata.nasa.gov/news/blog/view-earth-every-10-minutes-geostationary-imagery
- https://wiki.earthdata.nasa.gov/x/5Y9eCQ
- https://gibs.earthdata.nasa.gov/layer-metadata/v1.0/GOES-East_ABI_GeoColor.json
- https://gibs.earthdata.nasa.gov/layer-metadata/v1.0/VIIRS_NOAA20_CorrectedReflectance_TrueColor.json
- https://gibs.earthdata.nasa.gov/layer-metadata/v1.0/VIIRS_SNPP_DayNightBand_At_Sensor_Radiance.json

EUMETSAT
- https://www-cdn.eumetsat.int/files/2026-01/45173%20-%20Data_Policy.pdf
- https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetCapabilities
- https://www-cdn.eumetsat.int/files/2026-05/10-%20MTG%20Data%20Access%20-%20Africa-Erdem_PDF.pdf
- https://www.eumetsat.int/eumetsat-streamlines-its-data-and-service-policy-make-more-data-free-charge
- https://user.eumetsat.int/s3/eup-strapi-media/LESS_THAN_1_H_Manufacturer_October_2023_version_website_4089ac0ab2.pdf
- https://api.met.no/weatherapi/geosatellite/1.4/documentation

US restriction on Israel imagery
- https://www.federalregister.gov/documents/2020/07/21/2020-15770/notice-of-findings-regarding-commercial-availability-of-non-us-satellite-imagery-with-respect-to
- https://space.commerce.gov/?p=3951
- https://www.NESDIS.NOAA.gov/s3/2021-12/Imager%20Restriction%20over%20Israel.pdf

Landsat and commercial imagery
- https://www.usgs.gov/landsat-missions/landsat-data-access
- https://www.usgs.gov/faqs/what-are-acquisition-schedules-landsat-satellites
- https://www.usgs.gov/faqs/are-there-any-restrictions-use-or-redistribution-landsat-data
- https://skyfi.com/en/pricing
- https://skyfi.com/files/SkyFi_Pricing_August_2025.pdf
- https://www.skyfi.com/faqs
- https://learn.skyfi.com/?p=506
- https://skyfi.com/en/blog/maxar-rebrands-as-vantor-and-lanteris-what-to-know
- https://umbra.space/open-data/
- https://umbra.space/pricing/
- https://registry.opendata.aws/umbra-open-data/
- https://registry.opendata.aws/capella_opendata/
- https://www.capellaspace.com/earth-observation/gallery
- https://www.iceye.com/resources/datasets
- https://up42.com/pricing
- https://docs.up42.com/data/catalog-min-charges
- https://docs.up42.com/data/tasking-min-charges
- https://www.planet.com/pricing/
- https://www.planet.com/industries/education-and-research/
- https://www.planet.com/pulse/planet-enables-self-service-purchasing-for-small-customers-on-planet-insights-platform/
- https://community.planet.com/tropical-basemaps-85/nicfi-satellite-data-program-prolongs-public-access-to-high-resolution-rainforest-satellite-images-6020

Earth Engine and Esri
- https://earthengine.google.com/noncommercial/
- https://developers.google.com/earth-engine/guides/noncommercial_tiers
- https://developers.google.com/earth-engine/guides/apps
- https://location.arcgis.com/pricing/

Weather models and forecasts
- https://open-meteo.com/en/pricing
- https://open-meteo.com/en/terms
- https://open-meteo.com/en/docs
- https://open-meteo.com/en/docs/ecmwf-api
- https://open-meteo.com/en/docs/ensemble-api
- https://open-meteo.com/en/docs/historical-weather-api
- https://open-meteo.com/en/docs/model-updates
- https://github.com/open-meteo/open-meteo
- https://www.ecmwf.int/en/forecasts/datasets/open-data
- https://www.ecmwf.int/node/25178
- https://www.ecmwf.int/node/20629
- https://sites.ecmwf.int/charts/cdb/help/
- https://registry.opendata.aws/noaa-gfs-bdp-pds/
- https://registry.opendata.aws/noaa-gefs/
- https://opendata.dwd.de/README.txt
- https://opendata.dwd.de/weather/nwp/
- https://opendata.dwd.de/climate_environment/CDC/Terms_of_use.pdf
- https://api.met.no/doc/TermsOfService
- https://api.met.no/weatherapi/locationforecast/2.0/documentation
- https://docs.api.met.no/doc/locationforecast/datamodel.html
- https://pypi.org/project/ims-envista/ (third party, used only for the existence of the token process)

Pressure systems
- https://weather.metoffice.gov.uk/maps-and-charts/surface-pressure
- https://www.metoffice.gov.uk/policies/legal
- https://ocean.weather.gov/
- https://ocean.weather.gov/unified_analysis.php
- https://ocean.weather.gov/gis/
- https://gmd.copernicus.org/articles/10/1069/2017/

Observations, tiles and space weather
- https://www.rainviewer.com/api.html
- https://rainviewer.com/api/transition-faq.html
- https://www.rainviewer.com/blog/rainviewer-pricing.html
- https://www.blitzortung.org/en/contact.php
- https://aviationweather.gov/data/api/
- https://www.ndbc.noaa.gov/faq/rt_data_access.shtml
- https://openweathermap.org/price
- https://api.windy.com/
- https://api.windy.com/map-forecast/pricing
- https://api.windy.com/point-forecast/pricing
- https://www.spaceweather.gov/content/data-access
- https://services.swpc.noaa.gov/json/
- https://www.weather.gov/disclaimer

Pages that could not be read (blocked, script-only or not found)
- https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance
- https://user.eumetsat.int/resources/user-guides/data-licensing
- https://www.eumetsat.int/eumetsat-data-licensing
- https://ims.gov.il/en/ObservationDataAPI
- https://www.dwd.de/EN/service/legal_notice/legal_notice_node.html
- https://charts.ecmwf.int/
- https://www.ogimet.com/home.phtml.en
- https://api.oneatlas.airbus.com/api-catalog-v2/oad-ppo-archives/overview/
- https://www.vantor.com/open-data/
- https://livingatlas.arcgis.com/wayback/
- https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9
