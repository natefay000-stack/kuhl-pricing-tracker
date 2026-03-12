#!/usr/bin/env node
const fs = require('fs');
const metros = JSON.parse(fs.readFileSync('public/geo/cbsa-metros.json', 'utf-8'));
const cities = JSON.parse(fs.readFileSync('public/geo/us-city-coords.json', 'utf-8'));
const centroids = JSON.parse(fs.readFileSync('public/geo/state-centroids.json', 'utf-8'));

const FIPS_STATE = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT',
  '10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL',
  '18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD',
  '25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE',
  '32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND',
  '39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD',
  '47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV',
  '55':'WI','56':'WY'
};

let matched = 0, fallback = 0, total = 0;
for (const [cbsa, metro] of Object.entries(metros)) {
  total++;
  const name = metro.shortName || metro.name;
  const firstFips = metro.countyFips && metro.countyFips[0];
  const stateCode = firstFips ? FIPS_STATE[firstFips.substring(0, 2)] : null;

  let found = false;

  // Try exact match with metro's state
  if (stateCode) {
    const key = name.toUpperCase() + '|' + stateCode;
    if (cities[key]) {
      metro.lat = cities[key][0];
      metro.lng = cities[key][1];
      found = true;
      matched++;
    }
  }

  // Try all states
  if (!found) {
    for (const st of Object.values(FIPS_STATE)) {
      const key = name.toUpperCase() + '|' + st;
      if (cities[key]) {
        metro.lat = cities[key][0];
        metro.lng = cities[key][1];
        found = true;
        matched++;
        break;
      }
    }
  }

  // Fall back to state centroid
  if (!found && stateCode && centroids[stateCode]) {
    metro.lat = centroids[stateCode][0];
    metro.lng = centroids[stateCode][1];
    fallback++;
  }
}

fs.writeFileSync('public/geo/cbsa-metros.json', JSON.stringify(metros, null, 2));
console.log(`Matched ${matched} of ${total} metros (${fallback} used state centroid fallback)`);
