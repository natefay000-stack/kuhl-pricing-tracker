#!/usr/bin/env node
/**
 * build-cbsa-metros.js
 *
 * Reads the counties TopoJSON, computes geographic centroids for ~100 major
 * US metro areas (CBSAs), projects them to SVG coordinates in a 960x620
 * viewBox, and writes the result to public/geo/cbsa-metros.json.
 *
 * Key technique: per-state offset correction. The Wikimedia SVG state paths
 * use a slightly different projection than d3's geoAlbersUsa. We compute
 * the offset between d3-projected state centroids and the actual SVG path
 * bounding-box centers, then apply each state's offset to metros within it.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const TOPO_PATH = path.join(PROJECT_ROOT, 'public', 'geo', 'counties-10m.json');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'public', 'geo', 'cbsa-metros.json');

// SVG bounding-box centers for each state — auto-computed from the current
// state SVG paths in src/lib/us-state-paths.ts.
function computeSvgCentroids() {
  const statePathsFile = fs.readFileSync(
    path.join(PROJECT_ROOT, 'src', 'lib', 'us-state-paths.ts'), 'utf8'
  );
  const centroids = {};
  // Match each state entry: XX: "path data"
  const re = /(\w{2}):\s*"([^"]+)"/g;
  let match;
  while ((match = re.exec(statePathsFile)) !== null) {
    const abbr = match[1];
    const d = match[2];
    // Extract all numbers from the path
    const nums = d.match(/[\d.]+/g);
    if (!nums || nums.length < 4) continue;
    const values = nums.map(Number);
    const xs = values.filter((_, i) => i % 2 === 0);
    const ys = values.filter((_, i) => i % 2 === 1);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    centroids[abbr] = [Math.round(cx * 10) / 10, Math.round(cy * 10) / 10];
  }
  return centroids;
}
const SVG_CENTROIDS = computeSvgCentroids();
console.log(`Computed SVG centroids for ${Object.keys(SVG_CENTROIDS).length} states from current paths`);

// State FIPS code (2-digit prefix of county FIPS) → state abbreviation
const STATE_FIPS = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT',
  '10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL',
  '18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD',
  '25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE',
  '32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND',
  '39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD',
  '47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV',
  '55':'WI','56':'WY',
};

// Curated list of ~100 major CBSAs
const CBSA_LIST = [
  { cbsa: "31080", name: "Los Angeles-Long Beach-Anaheim", shortName: "Los Angeles", countyFips: ["06037","06059"] },
  { cbsa: "35620", name: "New York-Newark-Jersey City", shortName: "New York", countyFips: ["36061","36047","36081","36005","36085","34017","34013","34039","34003","34031","34023","34025","34029","34035","36027","36071","36079","36087","36103","36119"] },
  { cbsa: "16980", name: "Chicago-Naperville-Elgin", shortName: "Chicago", countyFips: ["17031","17043","17063","17089","17093","17097","17111","17197","18073","18089","18111","18127","55059"] },
  { cbsa: "19100", name: "Dallas-Fort Worth-Arlington", shortName: "Dallas-Fort Worth", countyFips: ["48085","48113","48121","48139","48221","48231","48251","48257","48367","48397","48439","48497"] },
  { cbsa: "26420", name: "Houston-The Woodlands-Sugar Land", shortName: "Houston", countyFips: ["48015","48039","48071","48157","48167","48201","48291","48339","48473"] },
  { cbsa: "47900", name: "Washington-Arlington-Alexandria", shortName: "Washington DC", countyFips: ["11001","24009","24017","24021","24031","24033","51013","51043","51059","51061","51107","51153","51177","51179","51187","51510","51600","51610","51630","51683","51685"] },
  { cbsa: "33100", name: "Miami-Fort Lauderdale-Pompano Beach", shortName: "Miami", countyFips: ["12011","12086","12099"] },
  { cbsa: "37980", name: "Philadelphia-Camden-Wilmington", shortName: "Philadelphia", countyFips: ["34005","34007","34015","34033","10003","24015","42017","42029","42045","42091","42101"] },
  { cbsa: "12060", name: "Atlanta-Sandy Springs-Alpharetta", shortName: "Atlanta", countyFips: ["13013","13015","13035","13045","13057","13063","13067","13077","13085","13089","13097","13113","13117","13121","13135","13143","13149","13151","13159","13171","13199","13211","13217","13223","13227","13231","13247","13255","13297"] },
  { cbsa: "14460", name: "Boston-Cambridge-Newton", shortName: "Boston", countyFips: ["25005","25009","25017","25021","25023","25025","25027","33015","33017"] },
  { cbsa: "38060", name: "Phoenix-Mesa-Chandler", shortName: "Phoenix", countyFips: ["04013","04021"] },
  { cbsa: "41860", name: "San Francisco-Oakland-Berkeley", shortName: "San Francisco", countyFips: ["06001","06013","06041","06075","06081"] },
  { cbsa: "40140", name: "Riverside-San Bernardino-Ontario", shortName: "Riverside", countyFips: ["06065","06071"] },
  { cbsa: "19820", name: "Detroit-Warren-Dearborn", shortName: "Detroit", countyFips: ["26087","26093","26099","26125","26147","26163"] },
  { cbsa: "41740", name: "San Diego-Chula Vista-Carlsbad", shortName: "San Diego", countyFips: ["06073"] },
  { cbsa: "29820", name: "Las Vegas-Henderson-Paradise", shortName: "Las Vegas", countyFips: ["32003"] },
  { cbsa: "36740", name: "Orlando-Kissimmee-Sanford", shortName: "Orlando", countyFips: ["12069","12095","12097","12117"] },
  { cbsa: "40060", name: "Richmond", shortName: "Richmond", countyFips: ["51041","51075","51085","51087","51127","51145","51149","51183","51570","51670","51730","51760"] },
  { cbsa: "42660", name: "Seattle-Tacoma-Bellevue", shortName: "Seattle", countyFips: ["53033","53053","53061"] },
  { cbsa: "33460", name: "Minneapolis-St. Paul-Bloomington", shortName: "Minneapolis", countyFips: ["27003","27019","27025","27037","27053","27059","27079","27095","27123","27139","27141","27163","27171","55093","55109"] },
  { cbsa: "41180", name: "St. Louis", shortName: "St. Louis", countyFips: ["17005","17013","17027","17083","17117","17119","17133","17163","29071","29099","29113","29183","29189","29219","29510"] },
  { cbsa: "45300", name: "Tampa-St. Petersburg-Clearwater", shortName: "Tampa", countyFips: ["12053","12057","12101","12103"] },
  { cbsa: "19740", name: "Denver-Aurora-Lakewood", shortName: "Denver", countyFips: ["08001","08005","08014","08019","08031","08035","08047","08059","08093"] },
  { cbsa: "38300", name: "Pittsburgh", shortName: "Pittsburgh", countyFips: ["42003","42005","42007","42019","42051","42059","42125","42129"] },
  { cbsa: "39580", name: "Raleigh-Cary", shortName: "Raleigh", countyFips: ["37069","37101","37135","37183"] },
  { cbsa: "40900", name: "Sacramento-Roseville-Folsom", shortName: "Sacramento", countyFips: ["06017","06034","06061","06067","06113"] },
  { cbsa: "13820", name: "Birmingham-Hoover", shortName: "Birmingham", countyFips: ["01007","01009","01073","01115","01117","01127"] },
  { cbsa: "36420", name: "Oklahoma City", shortName: "Oklahoma City", countyFips: ["40017","40027","40051","40081","40083","40087","40109","40125"] },
  { cbsa: "16740", name: "Charlotte-Concord-Gastonia", shortName: "Charlotte", countyFips: ["37025","37071","37097","37109","37119","37159","37167","37179","45057","45091"] },
  { cbsa: "34980", name: "Nashville-Davidson-Murfreesboro-Franklin", shortName: "Nashville", countyFips: ["47021","47037","47043","47081","47111","47119","47147","47149","47159","47165","47169","47187","47189"] },
  { cbsa: "41700", name: "San Antonio-New Braunfels", shortName: "San Antonio", countyFips: ["48013","48019","48029","48091","48187","48259","48325"] },
  { cbsa: "12420", name: "Austin-Round Rock-Georgetown", shortName: "Austin", countyFips: ["48021","48055","48209","48453","48491"] },
  { cbsa: "26900", name: "Indianapolis-Carmel-Anderson", shortName: "Indianapolis", countyFips: ["18011","18013","18057","18059","18063","18081","18095","18097","18109","18133","18145"] },
  { cbsa: "17140", name: "Cincinnati", shortName: "Cincinnati", countyFips: ["18029","18047","18115","21015","21023","21037","21077","21081","21117","39015","39017","39025","39027","39061","39165"] },
  { cbsa: "28140", name: "Kansas City", shortName: "Kansas City", countyFips: ["20091","20103","20107","20121","20209","29013","29025","29037","29047","29049","29095","29107","29165","29177","29511"] },
  { cbsa: "36540", name: "Omaha-Council Bluffs", shortName: "Omaha", countyFips: ["19085","19129","19155","31025","31055","31153","31155","31177"] },
  { cbsa: "18140", name: "Columbus", shortName: "Columbus", countyFips: ["39041","39045","39049","39057","39073","39089","39097","39117","39127","39129","39159"] },
  { cbsa: "27260", name: "Jacksonville", shortName: "Jacksonville", countyFips: ["12003","12019","12031","12089","12109"] },
  { cbsa: "32820", name: "Memphis", shortName: "Memphis", countyFips: ["28033","28093","28137","28143","47047","47157","47167"] },
  { cbsa: "46060", name: "Tucson", shortName: "Tucson", countyFips: ["04019"] },
  { cbsa: "35380", name: "New Orleans-Metairie", shortName: "New Orleans", countyFips: ["22051","22071","22075","22087","22089","22093","22095","22103"] },
  { cbsa: "39300", name: "Providence-Warwick", shortName: "Providence", countyFips: ["44001","44003","44005","44007","44009","25005"] },
  { cbsa: "41620", name: "Salt Lake City", shortName: "Salt Lake City", countyFips: ["49035","49045","49049"] },
  { cbsa: "40380", name: "Rochester", shortName: "Rochester", countyFips: ["36051","36055","36069","36073","36117","36123"] },
  { cbsa: "46140", name: "Tulsa", shortName: "Tulsa", countyFips: ["40037","40111","40113","40131","40143","40145"] },
  { cbsa: "15380", name: "Buffalo-Cheektowaga", shortName: "Buffalo", countyFips: ["36029","36063"] },
  { cbsa: "24340", name: "Grand Rapids-Kentwood", shortName: "Grand Rapids", countyFips: ["26081","26015","26121","26139"] },
  { cbsa: "10740", name: "Albuquerque", shortName: "Albuquerque", countyFips: ["35001","35043","35057","35061"] },
  { cbsa: "35840", name: "North Port-Sarasota-Bradenton", shortName: "Sarasota", countyFips: ["12081","12115"] },
  { cbsa: "14260", name: "Boise City", shortName: "Boise", countyFips: ["16001","16015","16027","16045","16073"] },
  { cbsa: "36260", name: "Ogden-Clearfield", shortName: "Ogden", countyFips: ["49003","49011","49029","49057"] },
  { cbsa: "39340", name: "Provo-Orem", shortName: "Provo", countyFips: ["49023","49049"] },
  { cbsa: "17460", name: "Cleveland-Elyria", shortName: "Cleveland", countyFips: ["39035","39055","39085","39093","39103"] },
  { cbsa: "33340", name: "Milwaukee-Waukesha", shortName: "Milwaukee", countyFips: ["55079","55089","55131","55133"] },
  { cbsa: "38900", name: "Portland-Vancouver-Hillsboro", shortName: "Portland", countyFips: ["41005","41009","41051","41067","41071","53011","53059"] },
  { cbsa: "47260", name: "Virginia Beach-Norfolk-Newport News", shortName: "Virginia Beach", countyFips: ["51073","51093","51095","51115","51175","51199","51550","51650","51700","51710","51735","51740","51800","51810","51830"] },
  { cbsa: "25540", name: "Hartford-East Hartford-Middletown", shortName: "Hartford", countyFips: ["09003","09007"] },
  { cbsa: "24860", name: "Greenville-Anderson", shortName: "Greenville", countyFips: ["45007","45045","45059","45077","45083"] },
  { cbsa: "12580", name: "Baltimore-Columbia-Towson", shortName: "Baltimore", countyFips: ["24003","24005","24013","24025","24027","24035","24510"] },
  { cbsa: "30780", name: "Little Rock-North Little Rock-Conway", shortName: "Little Rock", countyFips: ["05045","05053","05085","05105","05119","05125"] },
  { cbsa: "17820", name: "Colorado Springs", shortName: "Colorado Springs", countyFips: ["08041","08119"] },
  { cbsa: "10420", name: "Akron", shortName: "Akron", countyFips: ["39133","39153"] },
  { cbsa: "22180", name: "Fayetteville-Springdale-Rogers", shortName: "Fayetteville AR", countyFips: ["05007","05087","05143"] },
  { cbsa: "20500", name: "Durham-Chapel Hill", shortName: "Durham", countyFips: ["37037","37063","37135"] },
  { cbsa: "24660", name: "Greensboro-High Point", shortName: "Greensboro", countyFips: ["37081","37151","37157"] },
  { cbsa: "49180", name: "Winston-Salem", shortName: "Winston-Salem", countyFips: ["37059","37067","37169","37197"] },
  { cbsa: "16700", name: "Charleston-North Charleston", shortName: "Charleston", countyFips: ["45015","45019","45035"] },
  { cbsa: "23420", name: "Fresno", shortName: "Fresno", countyFips: ["06019"] },
  { cbsa: "44700", name: "Stockton", shortName: "Stockton", countyFips: ["06077"] },
  { cbsa: "11260", name: "Anchorage", shortName: "Anchorage", countyFips: ["02020","02170"] },
  { cbsa: "15980", name: "Cape Coral-Fort Myers", shortName: "Fort Myers", countyFips: ["12071"] },
  { cbsa: "18580", name: "Corpus Christi", shortName: "Corpus Christi", countyFips: ["48355","48409"] },
  { cbsa: "20260", name: "Duluth", shortName: "Duluth", countyFips: ["27137","55031"] },
  { cbsa: "21340", name: "El Paso", shortName: "El Paso", countyFips: ["48141"] },
  { cbsa: "25420", name: "Harrisburg-Carlisle", shortName: "Harrisburg", countyFips: ["42041","42043","42099"] },
  { cbsa: "25860", name: "Hickory-Lenoir-Morganton", shortName: "Hickory", countyFips: ["37003","37023","37035"] },
  { cbsa: "27140", name: "Jackson MS", shortName: "Jackson MS", countyFips: ["28029","28049","28089","28121","28127"] },
  { cbsa: "28420", name: "Kennewick-Richland", shortName: "Kennewick", countyFips: ["53005","53021"] },
  { cbsa: "28940", name: "Knoxville", shortName: "Knoxville", countyFips: ["47001","47009","47013","47063","47089","47093","47105","47129","47173"] },
  { cbsa: "29460", name: "Lakeland-Winter Haven", shortName: "Lakeland", countyFips: ["12105"] },
  { cbsa: "29540", name: "Lancaster", shortName: "Lancaster PA", countyFips: ["42071"] },
  { cbsa: "30460", name: "Lexington-Fayette", shortName: "Lexington", countyFips: ["21017","21049","21067","21113","21151","21209","21239"] },
  { cbsa: "30700", name: "Lincoln", shortName: "Lincoln NE", countyFips: ["31109","31159"] },
  { cbsa: "31140", name: "Louisville/Jefferson County", shortName: "Louisville", countyFips: ["18019","18043","18061","18071","18143","21015","21029","21103","21111","21163","21185","21211","21215"] },
  { cbsa: "32580", name: "McAllen-Edinburg-Mission", shortName: "McAllen", countyFips: ["48215"] },
  { cbsa: "33860", name: "Montgomery", shortName: "Montgomery AL", countyFips: ["01001","01051","01085","01101"] },
  { cbsa: "34820", name: "Myrtle Beach-Conway-North Myrtle Beach", shortName: "Myrtle Beach", countyFips: ["45051"] },
  { cbsa: "37100", name: "Oxnard-Thousand Oaks-Ventura", shortName: "Ventura", countyFips: ["06111"] },
  { cbsa: "37340", name: "Palm Bay-Melbourne-Titusville", shortName: "Melbourne", countyFips: ["12009"] },
  { cbsa: "37860", name: "Pensacola-Ferry Pass-Brent", shortName: "Pensacola", countyFips: ["12033","12091"] },
  { cbsa: "39100", name: "Poughkeepsie-Newburgh-Middletown", shortName: "Poughkeepsie", countyFips: ["36027","36071"] },
  { cbsa: "39740", name: "Reading", shortName: "Reading PA", countyFips: ["42011"] },
  { cbsa: "40220", name: "Reno", shortName: "Reno", countyFips: ["32031","32510"] },
  { cbsa: "40420", name: "Rockford", shortName: "Rockford", countyFips: ["26007","17007","17201"] },
  { cbsa: "41500", name: "Salinas", shortName: "Salinas", countyFips: ["06053"] },
  { cbsa: "41940", name: "San Jose-Sunnyvale-Santa Clara", shortName: "San Jose", countyFips: ["06069","06085"] },
  { cbsa: "42100", name: "Santa Cruz-Watsonville", shortName: "Santa Cruz", countyFips: ["06087"] },
  { cbsa: "42200", name: "Santa Maria-Santa Barbara", shortName: "Santa Barbara", countyFips: ["06083"] },
  { cbsa: "42540", name: "Scranton-Wilkes-Barre", shortName: "Scranton", countyFips: ["42069","42079"] },
  { cbsa: "43340", name: "Shreveport-Bossier City", shortName: "Shreveport", countyFips: ["22017","22015","22119"] },
  { cbsa: "43580", name: "Sioux Falls", shortName: "Sioux Falls", countyFips: ["46083","46099","46101","46125"] },
  { cbsa: "43780", name: "South Bend-Mishawaka", shortName: "South Bend", countyFips: ["18141"] },
  { cbsa: "44060", name: "Spokane-Spokane Valley", shortName: "Spokane", countyFips: ["53063"] },
  { cbsa: "44140", name: "Springfield MA", shortName: "Springfield MA", countyFips: ["25013","25015"] },
  { cbsa: "44180", name: "Springfield MO", shortName: "Springfield MO", countyFips: ["29043","29077","29225"] },
  { cbsa: "46520", name: "Urban Honolulu", shortName: "Honolulu", countyFips: ["15003"] },
  { cbsa: "48620", name: "Wichita", shortName: "Wichita", countyFips: ["20015","20079","20173","20191"] },
];

async function main() {
  // Dynamic imports for ESM-only packages
  const d3Geo = await import('d3-geo');
  const topojsonClient = await import('topojson-client');

  // Read the TopoJSON
  const topoRaw = fs.readFileSync(TOPO_PATH, 'utf8');
  const topo = JSON.parse(topoRaw);

  // Build a lookup: FIPS id -> county geometry
  const countyLookup = new Map();
  for (const geom of topo.objects.counties.geometries) {
    countyLookup.set(geom.id, geom);
  }

  // Set up projection (used as baseline before offset correction)
  const projection = d3Geo.geoAlbersUsa()
    .scale(1070)
    .translate([480, 310]);

  // ── Build per-state offset corrections ──
  // For each state: offset = SVG_centroid - d3_projected_centroid
  const stateOffsets = new Map(); // state abbr → { dx, dy }

  // Group counties by state FIPS to compute state centroids from TopoJSON
  const stateCounties = new Map(); // state FIPS (2-digit) → [county geoms]
  for (const geom of topo.objects.counties.geometries) {
    const fips = String(geom.id).padStart(5, '0');
    const stateFips = fips.substring(0, 2);
    if (!stateCounties.has(stateFips)) stateCounties.set(stateFips, []);
    stateCounties.get(stateFips).push(geom);
  }

  console.log("Computing per-state offsets...");
  for (const [stateFips, counties] of stateCounties) {
    const stateAbbr = STATE_FIPS[stateFips];
    if (!stateAbbr || !SVG_CENTROIDS[stateAbbr]) continue;

    // Merge all counties in this state into one geometry
    const mergedState = topojsonClient.merge(topo, counties);
    const geoCentroid = d3Geo.geoCentroid(mergedState);
    const projected = projection(geoCentroid);
    if (!projected) continue;

    const svgTarget = SVG_CENTROIDS[stateAbbr];
    const dx = svgTarget[0] - projected[0];
    const dy = svgTarget[1] - projected[1];
    stateOffsets.set(stateAbbr, { dx, dy });

    const err = Math.sqrt(dx * dx + dy * dy);
    if (err > 15) {
      console.log("  " + stateAbbr + ": offset dx=" + dx.toFixed(1) + " dy=" + dy.toFixed(1) + " (magnitude " + err.toFixed(1) + "px)");
    }
  }
  console.log("  Computed offsets for " + stateOffsets.size + " states\n");

  // ── Process each metro ──
  const results = [];
  const warnings = [];

  for (const metro of CBSA_LIST) {
    // Find constituent county geometries
    const matchedGeoms = [];
    const missingFips = [];

    for (const fips of metro.countyFips) {
      const geom = countyLookup.get(fips);
      if (geom) {
        matchedGeoms.push(geom);
      } else {
        missingFips.push(fips);
      }
    }

    if (missingFips.length > 0) {
      warnings.push("  " + metro.shortName + " (" + metro.cbsa + "): missing FIPS " + missingFips.join(", "));
    }

    if (matchedGeoms.length === 0) {
      warnings.push("  " + metro.shortName + " (" + metro.cbsa + "): NO counties found, skipping");
      continue;
    }

    // Merge all matched county geometries into a single GeoJSON polygon
    const mergedGeoJSON = topojsonClient.merge(topo, matchedGeoms);

    // Compute the geographic centroid (lon/lat)
    const geoCentroid = d3Geo.geoCentroid(mergedGeoJSON);

    // Project to SVG coordinates (raw d3 position)
    const svgPoint = projection(geoCentroid);

    if (!svgPoint) {
      warnings.push("  " + metro.shortName + " (" + metro.cbsa + "): projection returned null for centroid [" + geoCentroid + "]");
      continue;
    }

    // Determine the primary state for offset correction.
    // Use a weighted approach: for each state in the metro's counties, count
    // how many counties are in that state, then use that state's offset.
    // For single-state metros (most), this is straightforward.
    const stateCounts = new Map();
    for (const fips of metro.countyFips) {
      const stFips = fips.substring(0, 2);
      const stAbbr = STATE_FIPS[stFips];
      if (stAbbr) stateCounts.set(stAbbr, (stateCounts.get(stAbbr) || 0) + 1);
    }

    // For cross-state metros, compute weighted average offset
    let totalWeight = 0;
    let weightedDx = 0;
    let weightedDy = 0;
    for (const [stAbbr, count] of stateCounts) {
      const offset = stateOffsets.get(stAbbr);
      if (offset) {
        weightedDx += offset.dx * count;
        weightedDy += offset.dy * count;
        totalWeight += count;
      }
    }

    let finalX = svgPoint[0];
    let finalY = svgPoint[1];
    if (totalWeight > 0) {
      finalX += weightedDx / totalWeight;
      finalY += weightedDy / totalWeight;
    }

    results.push({
      cbsa: metro.cbsa,
      name: metro.name,
      shortName: metro.shortName,
      svgX: Math.round(finalX * 10) / 10,
      svgY: Math.round(finalY * 10) / 10,
      countyFips: metro.countyFips,
    });
  }

  // Sort by CBSA code for stable output
  results.sort(function(a, b) { return a.cbsa.localeCompare(b.cbsa); });

  // Convert to object keyed by CBSA code
  const outputObj = {};
  for (const r of results) {
    outputObj[r.cbsa] = {
      name: r.name,
      shortName: r.shortName,
      svgX: r.svgX,
      svgY: r.svgY,
      countyFips: r.countyFips,
    };
  }

  // Write output
  const output = JSON.stringify(outputObj, null, 2);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, output, 'utf8');

  console.log("Wrote " + results.length + " metro areas to " + OUTPUT_PATH);
  console.log("File size: " + Buffer.byteLength(output) + " bytes");

  if (warnings.length > 0) {
    console.log("\nWarnings (" + warnings.length + "):");
    for (const w of warnings) {
      console.log(w);
    }
  }

  // Print sample entries
  console.log("\nSample entries:");
  var samples = ["35620", "31080", "16980", "42660", "19740", "46520", "11260"];
  for (const cbsa of samples) {
    const entry = results.find(function(r) { return r.cbsa === cbsa; });
    if (entry) {
      console.log("  " + entry.shortName + ": (" + entry.svgX + ", " + entry.svgY + ")");
    }
  }
}

main().catch(function(err) {
  console.error("Error:", err);
  process.exit(1);
});
