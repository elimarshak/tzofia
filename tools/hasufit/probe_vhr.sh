#!/bin/bash
# Which free very-sharp image collections (under one metre) have anything over the northern border area.
set +e
echo "== Umbra open data (radar, 25 cm to 1 m, CC BY 4.0): task folders"
aws s3 ls --no-sign-request s3://umbra-open-data-catalog/sar-data/tasks/ | tee umbra.txt | wc -l
grep -i -E "israel|syria|leban|golan|hermon|quneitra|beirut|damascus|haifa|tel aviv|jerusalem|gaza|jordan|middle" umbra.txt
echo "== Capella open data (radar, CC BY 4.0)"
aws s3 ls --no-sign-request s3://capella-open-data/data/ 2>&1 | head -20
curl -fsSL https://capella-open-data.s3.us-west-2.amazonaws.com/stac/catalog.json | head -c 1500; echo
echo "== Satellogic EarthView (1 m, CC BY 4.0): top level"
aws s3 ls --no-sign-request s3://satellogic-opendata-earthview/ 2>&1 | head -20
aws s3 ls --no-sign-request s3://satellogic-earthview/ 2>&1 | head -20
