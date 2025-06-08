// main_map.js

// —————————————————————————————————————————————————————————————————
// 1) SHARED CONSTANTS: dimensions, projection, etc.
// —————————————————————————————————————————————————————————————————

const width = 960;
const height = 600;

// Shared projection & path (used by all sections)
const projection = d3.geoAlbersUsa()
  .translate([width / 2, height / 2])
  .scale(1200);

const path = d3.geoPath().projection(projection);

// ──────────────────────────────────────────────────────────────────────────
// A) FIVE ANNOTATION REGIONS (GeoJSON “Polygons”)
// ──────────────────────────────────────────────────────────────────────────
const annotationRegions = {
  Louisisiana: {
    type: "Polygon",
    coordinates: [[
      [-94.0, 31.5], // top left
      [-89.5, 31.5], // top right
      [-89.5, 29], // bottom right
      [-94.0, 29], // bottom left
      [-94.0, 32.0]  // top left again to close the polygon
    ]]
  },
  Florida: {
    type: "Polygon",
    coordinates: [[
      [-84.5, 30.5], // top left
      [-81.0, 31.0], // top right
      [-80.0, 27.5], // bottom right
      [-83.0, 28.0], // bottom left
      [-84.5, 30.5]  // top left again to close the polygon
    ]]
  },
  NorthMidWest: {
    type: "Polygon",
    coordinates: [[
      [-98.6, 48.3], // top left
      [-92.5, 48.3], // top right
      [-87.5, 36.5], // bottom right
      [-98.6, 43.5], // bottom left
      [-98.6, 48.3] //  top left again to close the polygon
    ]]
  },
  Alaska: {
    type: "Polygon",
    coordinates: [[
      [-117.5, 28.5], // top left
      [-114.395, 29.574],// top right
      [-113.281, 27.139],// bottom right
      [-117.0, 26.2],// bottom left
      [-117.5, 28.5]//  top left again to close the polygon
    ]]
  },
  Montana: {
    type: "Polygon",
    coordinates: [[
      [-112.5, 47.0],//top left
      [-106.0, 47.0], //top right 
      [-106.0, 45.0],//bottom right
      [-112.5, 45.0], //bottom left
      [-112.5, 47.0] //top left again to close the polygon
    ]]
  },
  kentucky: {
    type: "Polygon",
    coordinates: [[
      [-87.0, 38.8], //top left
      [-80.8, 40.2], //top right
      [-81.8, 36.5],//bottom right
      [-87.0, 36.5],//bottom left
      [-87.0, 38.8] //top left again to close the polygon
    ]]
  },
  NewYork: {
    type: "Polygon",
    coordinates: [[
      [-80.0, 44.0], //top left
      [-75.0, 44.4], //top right
      [-75.0, 42.0],//bottom right
      [-80.0, 42.0],//bottom left
      [-80.0, 44.0] //top left again to close the polygon
    ]]
  }
};

// Shared data containers
let counties;                          // GeoJSON array of U.S. counties
let fipsToName = new Map();            // Map< "12345" → "County, State" >
let nameToFIPS = new Map();            // Map< lowercase "county, state" → "12345" >

let cancerByFIPS;        // Map<fips, incidence>
let leukemiaByFIPS;      // Map<fips, incidence>
let lymphomaByFIPS;      // Map<fips, incidence>
let thyroidByFIPS;       // Map<fips, incidence>
let breastByFIPS;        // Map<fips, incidence> for breast cancer
let breastColor;         // d3.scaleThreshold for breast
let breastMin, breast95; // for legend (max)

// —————————————————————————————————————————————————————————————————
// Reusable function to toggle annotation groups
// —————————————————————————————————————————————————————————————————
let showAnnotations = true;
function toggleAnnotations(groupSelector) {
  showAnnotations = !showAnnotations;
  d3.selectAll(groupSelector).style("display", showAnnotations ? null : "none");
}

let airByFIPS;           // Map<fips, pm25>
let incomeByFIPS;        // Map<fips, medianIncome>
let waterByFIPS;         // Map<fips, water quality score>
let waterColor;          // d3.scaleQuantile for water

let facilities = [];     // Array of { facilityName, latitude, longitude, sector, onSiteRelease }
let sectorColor;         // d3.scaleOrdinal for sectors

// Color scales
let cancerColor, leukemiaColor, lymphomaColor, thyroidColor;
let pm25Color, incomeColor;

// 95th‐percentile cutoffs
let allMin, all95, leukMin, leuk95, lyphMin, lyph95, thyMin, thy95;
let incomeMin, incomeMax;

// —————————————————————————————————————————————————————————————————
// 2) LOAD ALL DATA IN PARALLEL (TopoJSON + CSVs)
// —————————————————————————————————————————————————————————————————

Promise.all([
  // 2.1) US counties TopoJSON
  d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json"),

  // 2.2) “incd (1).csv” → All‐Sites Cancer (skip first 8 lines)
  d3.text("incd (1).csv"),

  // 2.3) leukemia_incidents.csv
  d3.csv("leukemia_incidents.csv", row => ({
    county: row.County.replace(/\(\d+\)$/, "").replace(/"/g, "").trim(),
    fips: String(+row.FIPS).padStart(5, "0"),
    incidence: +row["Age-Adjusted Incidence Rate([rate note]) - cases per 100,000"]
  })),

  // 2.4) lymphoma_incidents.csv
  d3.csv("lymphoma_incidents.csv", row => ({
    county: row.County.replace(/\(\d+\)$/, "").replace(/"/g, "").trim(),
    fips: String(+row.FIPS).padStart(5, "0"),
    incidence: +row["Age-Adjusted Incidence Rate([rate note]) - cases per 100,000"]
  })),

  // 2.5) thryroid_incidents.csv
  d3.csv("thryroid_incidents.csv", row => ({
    county: row.County.replace(/\(\d+\)$/, "").replace(/"/g, "").trim(),
    fips: String(+row.FIPS).padStart(5, "0"),
    incidence: +row["Age-Adjusted Incidence Rate([rate note]) - cases per 100,000"]
  })),

  // 2.6a) breast_incidents.csv
  d3.csv("breast_incidents.csv", row => ({
    county: row.County.replace(/\(\d+\)$/, "").replace(/"/g, "").trim(),
    fips: String(+row.FIPS).padStart(5, "0"),
    incidence: +row["Age-Adjusted Incidence Rate([rate note]) - cases per 100,000"]
  })),

  // 2.6) air_pollution_data2.csv → PM₂.₅
  d3.csv("air_pollution_data2.csv", row => {
    const rawPm25 = +row["Micrograms per cubic meter (PM2.5)(1)"];
    const pm25 = isNaN(rawPm25) ? null : rawPm25;
    const fipsStr = (row.FIPS || "").trim();
    const fipsCode = (fipsStr !== "" && !isNaN(+fipsStr))
      ? String(+fipsStr).padStart(5, "0")
      : null;
    return { fips: fipsCode, pm25 };
  }),

  // 2.7) industry_over_10k.csv
  d3.csv("industry_over_10k.csv", row => ({
    facilityName: row["Facility Name"].trim(),
    latitude: parseFloat(row.Latitude),
    longitude: parseFloat(row.Longitude),
    sector: row["Industry Sector"].trim(),
    onSiteRelease: +row["On-Site Release Total"]    // use exact column name
  })),

  // 2.8) County_Median_Income_2022.csv → Income
  d3.csv("County_Median_Income_2022.csv", row => {
    const fipsStr = (row.FIPS || "").trim();
    const fipsCode = (fipsStr !== "" && !isNaN(+fipsStr))
      ? String(+fipsStr).padStart(5, "0")
      : null;
    const incomeRaw = +row["Median_Income_2022"];
    const medianIncome = isNaN(incomeRaw) ? null : incomeRaw;
    return { fips: fipsCode, medianIncome };
  }),

  // 2.9) County_Water_Quality_Scores.csv → Water Quality Scores
  d3.csv("County_Water_Quality_Scores.csv", d => ({
    fips: String(+d.COUNTY_FIPS_CODE).padStart(5, "0"),
    score: +d.WATER_QUALITY_COUNTY_SCORE
  })),
])
  .then(([
    usTopology,
    rawCancerText,
    leukemiaData,
    lymphomaData,
    thyroidData,
    breastData,
    pm25Data,
    industryData,
    incomeData,
    waterData
  ]) => {
    // —————————————————————————————————————————————————————————————————
    // 3) PARSE “incd (1).csv” → All‐Sites Cancer (skip first 8 lines)
    // —————————————————————————————————————————————————————————————————

    const cancerLines = rawCancerText.split("\n");
    const cancerDataLines = cancerLines.slice(8).join("\n");

    const allCancerData = d3.csvParse(cancerDataLines, row => {
      const rawCounty = (row.County || "")
        .replace(/\(\d+\)$/, "")
        .replace(/"/g, "")
        .trim();
      const fipsStr = (row.FIPS || "").trim();
      const fipsString = (fipsStr !== "" && !isNaN(+fipsStr))
        ? String(+fipsStr).padStart(5, "0")
        : null;
      const rawInc = +row["Age-Adjusted Incidence Rate([rate note]) - cases per 100,000"];
      const incidence = isNaN(rawInc) ? null : rawInc;
      const stateName = (row.State || "").trim();

      return {
        fips: fipsString,
        county: rawCounty,
        state: stateName,
        incidence
      };
    });

    // Build cancerByFIPS + fipsToName, nameToFIPS
    cancerByFIPS = new Map();
    allCancerData.forEach(d => {
      if (d.fips && d.incidence != null) {
        cancerByFIPS.set(d.fips, d.incidence);
        const fullName = `${d.county}, ${d.state}`;
        fipsToName.set(d.fips, fullName);
        const key = fullName.toLowerCase();
        nameToFIPS.set(key, d.fips);
        // Also allow “county” without “County” suffix
        const noSuffix = key.replace(/ county$/, "");
        if (noSuffix !== key) nameToFIPS.set(noSuffix, d.fips);
      }
    });

    // —————————————————————————————————————————————————————————————————
    // 4) PARSE SUBTYPE DATA: leukemia, lymphoma, thyroid
    // —————————————————————————————————————————————————————————————————

    leukemiaByFIPS = new Map();
    lymphomaByFIPS = new Map();
    thyroidByFIPS = new Map();

    leukemiaData.forEach(d => {
      if (d.fips && !isNaN(d.incidence)) {
        leukemiaByFIPS.set(d.fips, d.incidence);
        const key = d.county.toLowerCase();
        nameToFIPS.set(key, d.fips);
        const noSuffix = key.replace(/ county$/, "");
        if (noSuffix !== key) nameToFIPS.set(noSuffix, d.fips);
      }
    });
    lymphomaData.forEach(d => {
      if (d.fips && !isNaN(d.incidence)) {
        lymphomaByFIPS.set(d.fips, d.incidence);
        const key = d.county.toLowerCase();
        nameToFIPS.set(key, d.fips);
        const noSuffix = key.replace(/ county$/, "");
        if (noSuffix !== key) nameToFIPS.set(noSuffix, d.fips);
      }
    });
    thyroidData.forEach(d => {
      if (d.fips && !isNaN(d.incidence)) {
        thyroidByFIPS.set(d.fips, d.incidence);
        const key = d.county.toLowerCase();
        nameToFIPS.set(key, d.fips);
        const noSuffix = key.replace(/ county$/, "");
        if (noSuffix !== key) nameToFIPS.set(noSuffix, d.fips);
      }
    });

    // —————————————————————————————————————————————————————————————————
    // Parse breast_incidents.csv → breastByFIPS
    // —————————————————————————————————————————————————————————————————
    breastByFIPS = new Map();
    breastData.forEach(d => {
      if (d.fips && !isNaN(d.incidence)) {
        breastByFIPS.set(d.fips, d.incidence);
        const key = d.county.toLowerCase();
        nameToFIPS.set(key, d.fips);
        const noSuffix = key.replace(/ county$/, "");
        if (noSuffix !== key) nameToFIPS.set(noSuffix, d.fips);
      }
    });

    // —————————————————————————————————————————————————————————————————
    // 5) PARSE AIR POLLUTION DATA → airByFIPS
    // —————————————————————————————————————————————————————————————————

    airByFIPS = new Map();
    pm25Data.forEach(d => {
      if (d.fips && d.pm25 != null) {
        airByFIPS.set(d.fips, d.pm25);
      }
    });

    // —————————————————————————————————————————————————————————————————
    // 6) PARSE INCOME DATA → incomeByFIPS
    // —————————————————————————————————————————————————————————————————

    incomeByFIPS = new Map();
    incomeData.forEach(d => {
      if (d.fips && d.medianIncome != null) {
        incomeByFIPS.set(d.fips, d.medianIncome);
      }
    });

    // —————————————————————————————————————————————————————————
    // Parse County_Water_QUALITY_SCORES.csv → waterByFIPS
    // —————————————————————————————————————————————————————————
    waterByFIPS = new Map();
    waterData.forEach(d => {
      if (d.fips && !isNaN(d.score)) {
        waterByFIPS.set(d.fips, d.score);
      }
    });

    // —————————————————————————————————————————————————————————————————
    // 7) CONVERT TopoJSON → GeoJSON “counties”
    // —————————————————————————————————————————————————————————————————

    counties = topojson.feature(usTopology, usTopology.objects.counties).features;

    // —————————————————————————————————————————————————————————————————
    // 8) DEFINE COLOR SCALES (Cancer, subtypes, PM₂.₅, Income)
    // —————————————————————————————————————————————————————————————————

    // 8.1) All‐Sites Cancer: quintile‐based threshold scale
    {
      const allVals = Array.from(cancerByFIPS.values()).filter(v => !isNaN(v)).sort(d3.ascending);
      const q20 = d3.quantile(allVals, 0.2);
      const q40 = d3.quantile(allVals, 0.4);
      const q60 = d3.quantile(allVals, 0.6);
      const q80 = d3.quantile(allVals, 0.8);
      allMin = d3.min(allVals);
      all95 = d3.max(allVals); // used for dashboard legend range

      cancerColor = d3.scaleThreshold()
        .domain([q20, q40, q60, q80])
        .range(["#fdf4e3", "#f4c6ab", "#e49679", "#d85a44", "#990000"]);
    }

    // 8.2) Leukemia (quintile‐binned threshold scale)
    {
      const arr = Array.from(leukemiaByFIPS.values()).filter(v => !isNaN(v)).sort(d3.ascending);
      const q20 = d3.quantile(arr, 0.2);
      const q40 = d3.quantile(arr, 0.4);
      const q60 = d3.quantile(arr, 0.6);
      const q80 = d3.quantile(arr, 0.8);
      leukMin = d3.min(arr);
      leuk95 = d3.max(arr);
      leukemiaColor = d3.scaleThreshold()
        .domain([q20, q40, q60, q80])
        .range(["#fdf4e3", "#f4c6ab", "#e49679", "#d85a44", "#990000"]);
    }

    // 8.3) Lymphoma (quintile‐binned threshold scale)
    {
      const arr = Array.from(lymphomaByFIPS.values()).filter(v => !isNaN(v)).sort(d3.ascending);
      const q20 = d3.quantile(arr, 0.2);
      const q40 = d3.quantile(arr, 0.4);
      const q60 = d3.quantile(arr, 0.6);
      const q80 = d3.quantile(arr, 0.8);
      lyphMin = d3.min(arr);
      lyph95 = d3.max(arr);
      lymphomaColor = d3.scaleThreshold()
        .domain([q20, q40, q60, q80])
        .range(["#fdf4e3", "#f4c6ab", "#e49679", "#d85a44", "#990000"]);
    }

    // 8.4) Thyroid (quintile‐binned threshold scale)
    {
      const arr = Array.from(thyroidByFIPS.values()).filter(v => !isNaN(v)).sort(d3.ascending);
      const q20 = d3.quantile(arr, 0.2);
      const q40 = d3.quantile(arr, 0.4);
      const q60 = d3.quantile(arr, 0.6);
      const q80 = d3.quantile(arr, 0.8);
      thyMin = d3.min(arr);
      thy95 = d3.max(arr);
      thyroidColor = d3.scaleThreshold()
        .domain([q20, q40, q60, q80])
        .range(["#fdf4e3", "#f4c6ab", "#e49679", "#d85a44", "#990000"]);
    }

    // 8.5) Breast Cancer (quintile‐binned threshold scale)
    {
      const arr = Array.from(breastByFIPS.values()).filter(v => !isNaN(v)).sort(d3.ascending);
      const q20 = d3.quantile(arr, 0.2);
      const q40 = d3.quantile(arr, 0.4);
      const q60 = d3.quantile(arr, 0.6);
      const q80 = d3.quantile(arr, 0.8);
      breastMin = d3.min(arr);
      breast95 = d3.max(arr);
      breastColor = d3.scaleThreshold()
        .domain([q20, q40, q60, q80])
        .range(["#fdf4e3", "#f4c6ab", "#e49679", "#d85a44", "#990000"]);
    }

    // 8.6) Precompute “facilities” (for industrial dots)
    facilities = industryData.filter(d =>
      !isNaN(d.latitude) && !isNaN(d.longitude)
    );
    const uniqueSectors = Array.from(new Set(facilities.map(d => d.sector)));
    sectorColor = d3.scaleOrdinal(d3.schemeSet2).domain(uniqueSectors);

    // 8.7) PM₂.₅: quantile scale
    {
      const allPM25Data = [];
      airByFIPS.forEach((v, k) => {
        allPM25Data.push(+v);
      });
      const pm25Vals = allPM25Data
        .filter(d => !isNaN(d))
        .sort(d3.ascending);

      pm25Color = d3.scaleQuantile()
        .domain(pm25Vals)
        .range([
          "#ffffcc",  // very low PM₂.₅
          "#ffeda0",  // low PM₂.₅
          "#fed976",  // moderate PM₂.₅
          "#feb24c",  // high PM₂.₅
          "#fd8d3c"   // very high PM₂.₅
        ]);
    }

    // 8.8) Income: quantile scale
    {
      const allIncomeData = [];
      incomeByFIPS.forEach((v, k) => {
        allIncomeData.push(+v);
      });
      const incomeVals = allIncomeData.filter(d => !isNaN(d)).sort(d3.ascending);
      incomeMin = d3.min(incomeVals);
      incomeMax = d3.max(incomeVals);
      incomeColor = d3.scaleQuantile()
        .domain(incomeVals)
        .range(["#f1e4c7", "#d3eac2", "#a8dba8", "#7ccba2", "#4daf91"]);
    }

    // 8.9) Water Quality: quantile scale
    {
      const allWaterData = [];
      waterByFIPS.forEach((v, k) => {
        allWaterData.push(+v);
      });
      const waterVals = allWaterData.filter(d => !isNaN(d)).sort(d3.ascending);
      waterColor = d3.scaleQuantile()
        .domain(waterVals)
        .range(["#a87c56", "#a6cfd5", "#72b4ce", "#4191b8", "#1d6ca4"]);
    }

    // —————————————————————————————————————————————————————————————————
    // 9) INITIALIZE ALL FIVE VIEWS
    // —————————————————————————————————————————————————————————————————

    initCancerOnly();
    initAirOnly();
    initIndustryOnly();
    initIncomeOnly();
    initWaterOnly(); // Initialize the new Water Pollution‐Only view
    initFullDashboard();
  })
  .catch(err => {
    console.error("Error loading data:", err);
    d3.select("body")
      .append("p")
      .text("Failed to load data. Check console for details.");
  });


// ==========================================
// 10) Cancer‐Only Section Initialization
// ==========================================
function initCancerOnly() {
  // Select elements
  const svg = d3.select("#cancer-svg").attr("width", width).attr("height", height);
  const g = svg.append("g").attr("class", "cancer-group");
  // Remove tooltip-based display, use fixed info box instead
  // Add static info box if not already present
  d3.select("#map-cancer")
    .selectAll("#info-cancer")
    .data([null])
    .join("div")
    .attr("id", "info-cancer")
    .attr("class", "static-info-box")
    .style("position", "absolute")
    .style("bottom", "10px")
    .style("left", "10px")
    .style("background", "#fff")
    .style("padding", "8px")
    .style("border", "1px solid #ccc")
    .style("font-size", "12px")
    .text("Hover over a county");

  // Zoom behavior
  const zoomBehavior = d3.zoom()
    .scaleExtent([1, 8])
    .translateExtent([[0, 0], [width, height]])
    .on("zoom", event => {
      g.attr("transform", event.transform);
    });
  svg.call(zoomBehavior);

  // Draw county paths (cancer choropleth by “all” initially)
  const paths = g.selectAll("path")
    .data(counties)
    .join("path")
    .attr("d", path)
    .attr("stroke", "#999")
    .attr("stroke-width", 0.2)
    .attr("fill", d => {
      const v = cancerByFIPS.get(d.id);
      return v != null ? cancerColor(v) : "#eee";
    })
    .on("mouseover", (event, d) => {
      const fips = d.id;
      const name = fipsToName.get(fips) || "Unknown County";
      const type = d3.select("#cancer-select").property("value");
      let val, label;
      if (type === "all") {
        val = cancerByFIPS.get(fips);
        label = "All‐Sites Cancer";
      } else if (type === "leukemia") {
        val = leukemiaByFIPS.get(fips);
        label = "Leukemia";
      } else if (type === "lymphoma") {
        val = lymphomaByFIPS.get(fips);
        label = "Lymphoma";
      } else if (type === "thyroid") {
        val = thyroidByFIPS.get(fips);
        label = "Thyroid";
      } else if (type === "breast") {
        val = breastByFIPS.get(fips);
        label = "Breast";
      }
      const display = val != null ? val.toFixed(1) : "N/A";
      d3.select("#info-cancer")
        .text(`${name} — ${label}: ${display}`);
    });

  // Cancer dropdown behavior
  d3.select("#cancer-select").on("change", updateChoropleth);

  function updateChoropleth() {
    // (Hide any comparison legends that might be visible elsewhere)
    d3.select("#legend-water").style("display", "none");
    d3.select("#legend-pm25").style("display", "none");
    d3.select("#legend-income").style("display", "none");

    const type = d3.select("#cancer-select").property("value");
    paths.transition().duration(500).attr("fill", d => {
      const fips = d.id;
      if (type === "all") {
        const v = cancerByFIPS.get(fips);
        return v != null ? cancerColor(v) : "#eee";
      } else if (type === "leukemia") {
        const v = leukemiaByFIPS.get(fips);
        return v != null ? leukemiaColor(v) : "#eee";
      } else if (type === "lymphoma") {
        const v = lymphomaByFIPS.get(fips);
        return v != null ? lymphomaColor(v) : "#eee";
      } else if (type === "thyroid") {
        const v = thyroidByFIPS.get(fips);
        return v != null ? thyroidColor(v) : "#eee";
      } else if (type === "breast") {
        const v = breastByFIPS.get(fips);
        return v != null ? breastColor(v) : "#eee";
      }
    });
  }

  // Build Cancer legend (quintile‐binned)
  buildCancerLegend("#legend-cancer");

  // Reset button
  d3.select("#reset-button").on("click", () => {
    svg.transition().duration(750).call(zoomBehavior.transform, d3.zoomIdentity);
    paths.attr("stroke", "#999").attr("stroke-width", 0.2);
    d3.select("#county-search").property("value", "");
  });

  // Search
  setupSearchBox(
    "#county-search",
    "#suggestions",
    "#search-button",
    paths,
    zoomBehavior,
    { highlightPaths: paths }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // INSERT FOUR “ANNOTATION” POLYGONS AS BLACK OUTLINES (Cancer‐Only)
  // ──────────────────────────────────────────────────────────────────────────
  const annotationGroupC = g.append("g").attr("class", "annotation-group-cancer");
  Object.values(annotationRegions).forEach(region => {
    annotationGroupC.append("path")
      .datum(region)
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "black")
      .attr("stroke-width", 2);
  });

  // Add Toggle Annotations button (styled and placed under map, right aligned)
  d3.select("#map-cancer") // Use the correct existing container in your HTML
    .append("button")
    .attr("id", "toggle-annotations-btn")
    .text("Toggle Annotations")
    .style("margin-top", "10px")
    .style("float", "right")
    .on("click", () => toggleAnnotations(".annotation-group-cancer"));
}


// Helper: Build Cancer legend (categorical, quintile‐based)
function buildCancerLegend(containerSelector) {
  const bins = cancerColor.range();
  const container = d3.select(containerSelector);
  container.selectAll("*").remove();

  const svg = container.append("svg")
    .attr("width", 300)
    .attr("height", 50);

  // Add title
  svg.append("text")
    .attr("x", 0)
    .attr("y", 12)
    .attr("font-size", "12px")
    .attr("font-weight", "bold")
    .text("Cancer Rates");

  const labelCategories = ["Very Low", "Low", "Moderate", "High", "Very High"];

  bins.forEach((color, i) => {
    svg.append("rect")
      .attr("x", i * 60)
      .attr("y", 20)
      .attr("width", 60)
      .attr("height", 15)
      .attr("fill", color);

    svg.append("text")
      .attr("x", i * 60 + 30)
      .attr("y", 48)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .text(labelCategories[i]);
  });
}


// ==========================================
// 11) Air‐Only Section Initialization
// ==========================================
function initAirOnly() {
  const svg = d3.select("#air-svg").attr("width", width).attr("height", height);
  const g = svg.append("g").attr("class", "air-group");
  // Remove tooltip-based display, use fixed info box instead
  d3.select("#map-air")
    .selectAll("#info-air")
    .data([null])
    .join("div")
    .attr("id", "info-air")
    .attr("class", "static-info-box")
    .style("position", "absolute")
    .style("bottom", "10px")
    .style("left", "10px")
    .style("background", "#fff")
    .style("padding", "8px")
    .style("border", "1px solid #ccc")
    .style("font-size", "12px")
    .text("Hover over a county");

  // Zoom behavior
  const zoomBehavior = d3.zoom()
    .scaleExtent([1, 8])
    .translateExtent([[0, 0], [width, height]])
    .on("zoom", event => {
      g.attr("transform", event.transform);
    });
  svg.call(zoomBehavior);

  // Draw counties by PM₂.₅
  const paths = g.selectAll("path")
    .data(counties)
    .join("path")
    .attr("d", path)
    .attr("stroke", "#999")
    .attr("stroke-width", 0.2)
    .attr("fill", d => {
      const v = airByFIPS.get(d.id);
      return v != null ? pm25Color(v) : "#eee";
    })
    .on("mouseover", (event, d) => {
      const fips = d.id;
      const name = fipsToName.get(fips) || "Unknown County";
      const v = airByFIPS.get(fips);
      const display = v != null ? v.toFixed(1) + " µg/m³" : "N/A";
      d3.select("#info-air")
        .text(`${name} — PM₂.₅: ${display}`);
    });

  // Build PM₂.₅ legend (quintile‐binned)
  buildPM25Legend("#legend-pm25");
  d3.select("#legend-pm25").style("display", null);

  // Reset button
  d3.select("#reset-button-air").on("click", () => {
    svg.transition().duration(750).call(zoomBehavior.transform, d3.zoomIdentity);
    paths.attr("stroke", "#999").attr("stroke-width", 0.2);
    d3.select("#county-search-air").property("value", "");
  });

  // Search
  setupSearchBox(
    "#county-search-air",
    "#suggestions-air",
    "#search-button-air",
    paths,
    zoomBehavior,
    { highlightPaths: paths }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // INSERT FOUR “ANNOTATION” POLYGONS AS BLACK OUTLINES (Air‐Only)
  // ──────────────────────────────────────────────────────────────────────────
  const annotationGroupA = g.append("g").attr("class", "annotation-group-air");
  Object.values(annotationRegions).forEach(region => {
    annotationGroupA.append("path")
      .datum(region)
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "black")
      .attr("stroke-width", 2);
  });
  // Add Toggle Annotations button for Air-Only
  d3.select("#map-air")
    .append("button")
    .attr("id", "toggle-annotations-btn-air")
    .text("Toggle Annotations")
    .style("margin-top", "10px")
    .style("float", "right")
    .on("click", () => toggleAnnotations(".annotation-group-air"));
}

// Helper: Build PM₂.₅ legend (quintile‐binned threshold scale)
function buildPM25Legend(containerSelector) {
  const bins = pm25Color.range();
  const container = d3.select(containerSelector);
  container.selectAll("*").remove();

  const svg = container.append("svg")
    .attr("width", 300)
    .attr("height", 50);

  // Add title
  svg.append("text")
    .attr("x", 0)
    .attr("y", 12)
    .attr("font-size", "12px")
    .attr("font-weight", "bold")
    .text("Air Pollution (PM₂.₅)");

  const labelCategories = ["Very Clean", "Clean", "Moderate", "Polluted", "Very Polluted"];

  bins.forEach((color, i) => {
    svg.append("rect")
      .attr("x", i * 60)
      .attr("y", 20)
      .attr("width", 60)
      .attr("height", 15)
      .attr("fill", color);

    svg.append("text")
      .attr("x", i * 60 + 30)
      .attr("y", 48)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .text(labelCategories[i]);
  });
}


// ==========================================
// 12) Industrial‐Only Section Initialization
// ==========================================
function initIndustryOnly() {
  const svg = d3.select("#industry-svg").attr("width", width).attr("height", height);
  const g = svg.append("g").attr("class", "industry-cancer-group");
  // Remove tooltip-based display, use fixed info box instead
  d3.select("#map-industry")
    .selectAll("#info-industry")
    .data([null])
    .join("div")
    .attr("id", "info-industry")
    .attr("class", "static-info-box")
    .style("position", "absolute")
    .style("bottom", "10px")
    .style("left", "10px")
    .style("background", "#fff")
    .style("padding", "8px")
    .style("border", "1px solid #ccc")
    .style("font-size", "12px")
    .text("Hover over a county or facility");

  // Zoom behavior
  const zoomBehavior = d3.zoom()
    .scaleExtent([1, 8])
    .translateExtent([[0, 0], [width, height]])
    .on("zoom", event => {
      const t = event.transform;
      g.attr("transform", t);
      facilityG.attr("transform", t);
    });
  svg.call(zoomBehavior);

  // 12.1) Draw cancer choropleth (All Sites by default)
  const paths = g.selectAll("path")
    .data(counties)
    .join("path")
    .attr("d", path)
    .attr("stroke", "#999")
    .attr("stroke-width", 0.2)
    .attr("fill", d => {
      const v = cancerByFIPS.get(d.id);
      return v != null ? cancerColor(v) : "#eee";
    })
    .on("mouseover", (event, d) => {
      const fips = d.id;
      const name = fipsToName.get(fips) || "Unknown County";
      d3.select("#info-industry")
        .text(`${name}`);
    });

  // Populate Sector dropdown
  const sectorDropdown = d3.select("#sector-select-industry");
  sectorDropdown.selectAll("option").remove();
  sectorDropdown.append("option")
    .attr("value", "all")
    .text("All Sectors");
  sectorColor.domain().forEach(sec => {
    sectorDropdown.append("option")
      .attr("value", sec)
      .text(sec);
  });

  // 12.2) Draw facilities (SVG circles) on top
  const facilityG = svg.append("g")
    .attr("class", "facility-group")
    .attr("pointer-events", "visiblePainted"); // allow mouseover on circles

  const facilityCircles = facilityG.selectAll("circle")
    .data(facilities)
    .join("circle")
    .attr("cx", d => {
      const xy = projection([d.longitude, d.latitude]);
      return xy ? xy[0] : -10;
    })
    .attr("cy", d => {
      const xy = projection([d.longitude, d.latitude]);
      return xy ? xy[1] : -10;
    })
    .attr("r", 4)
    .attr("fill", d => sectorColor(d.sector))
    .attr("stroke", "#333")
    .attr("stroke-width", 0.5)
    .on("mouseover", (event, d) => {
      d3.select("#info-industry")
        .text(`Facility: ${d.facilityName} — Emissions Total: ${d.onSiteRelease}`);
    });

  // Filter facilities by selected sector
  sectorDropdown.on("change", () => {
    const selected = sectorDropdown.property("value");
    if (selected === "all") {
      facilityCircles.attr("display", null);
    } else {
      facilityCircles.attr("display", d => d.sector === selected ? null : "none");
    }
    updateIndustryCanvas();
  });

  // 12.3) Cancer dropdown (changes choropleth colors)
  d3.select("#cancer-select-industry").on("change", updateChoropleth);

  function updateChoropleth() {
    const type = d3.select("#cancer-select-industry").property("value");
    paths.transition().duration(500).attr("fill", d => {
      const fips = d.id;
      if (type === "all") {
        const v = cancerByFIPS.get(fips);
        return v != null ? cancerColor(v) : "#eee";
      } else if (type === "leukemia") {
        const v = leukemiaByFIPS.get(fips);
        return v != null ? leukemiaColor(v) : "#eee";
      } else if (type === "lymphoma") {
        const v = lymphomaByFIPS.get(fips);
        return v != null ? lymphomaColor(v) : "#eee";
      } else if (type === "thyroid") {
        const v = thyroidByFIPS.get(fips);
        return v != null ? thyroidColor(v) : "#eee";
      } else if (type === "breast") {
        const v = breastByFIPS.get(fips);
        return v != null ? breastColor(v) : "#eee";
      }
    });
  }

  // Build Cancer legend for this view
  buildCancerLegend("#legend-cancer-industry");

  // Build Industry legend (categorical)
  buildIndustryLegend("#industry-legend-items");

  // Reset button
  d3.select("#reset-button-industry").on("click", () => {
    svg.transition().duration(750).call(zoomBehavior.transform, d3.zoomIdentity);
    paths.attr("stroke", "#999").attr("stroke-width", 0.2);
    d3.select("#county-search-industry").property("value", "");
  });

  // Search
  setupSearchBox(
    "#county-search-industry",
    "#suggestions-industry",
    "#search-button-industry",
    paths,
    zoomBehavior,
    { highlightPaths: paths }
  );

  // Add emission threshold filter
  d3.select("#emission-threshold").on("input", function () {
    d3.select("#emission-value").text(this.value);
    updateIndustryCanvas();
  });

  // Helper to update the visible facilities based on threshold and sector
  function updateIndustryCanvas() {
    const threshold = +d3.select("#emission-threshold").property("value");
    const selectedSector = sectorDropdown.property("value");
    facilityCircles.attr("display", d => {
      const emission = +d.onSiteRelease;
      const sectorMatch = (selectedSector === "all") || (d.sector === selectedSector);
      return (emission >= threshold && sectorMatch) ? null : "none";
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // INSERT FOUR “ANNOTATION” POLYGONS AS BLACK OUTLINES (Industry‐Only)
  // ──────────────────────────────────────────────────────────────────────────
  const annotationGroupI = g.append("g").attr("class", "annotation-group-industry");
  Object.values(annotationRegions).forEach(region => {
    annotationGroupI.append("path")
      .datum(region)
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "black")
      .attr("stroke-width", 2);
  });
  // Add Toggle Annotations button for Industry-Only
  d3.select("#map-industry")
    .append("button")
    .attr("id", "toggle-annotations-btn-industry")
    .text("Toggle Annotations")
    .style("margin-top", "10px")
    .style("float", "right")
    .on("click", () => toggleAnnotations(".annotation-group-industry"));
}


// Helper: Build Industry legend (a list of colored squares + sector names)
function buildIndustryLegend(containerSelector) {
  const container = d3.select(containerSelector);
  // Clear existing items
  container.selectAll(".legend-item").remove();
  // Bind data: one entry per sector
  const items = container.selectAll(".legend-item")
    .data(sectorColor.domain())
    .join("div")
    .classed("legend-item", true)
    .style("display", "flex")
    .style("align-items", "center")
    .style("margin", "2px 0");
  items.append("div")
    .style("width", "12px")
    .style("height", "12px")
    .style("background-color", d => sectorColor(d))
    .style("margin-right", "4px");
  items.append("span")
    .classed("label", true)
    .attr("data-sector", d => d)
    .text(d => d);
}


// ==========================================
// 13) Income‐Only Section Initialization
// ==========================================
function initIncomeOnly() {
  const svg = d3.select("#income-svg").attr("width", width).attr("height", height);
  const g = svg.append("g").attr("class", "income-group");
  // Remove tooltip-based display, use fixed info box instead
  d3.select("#map-income")
    .selectAll("#info-income")
    .data([null])
    .join("div")
    .attr("id", "info-income")
    .attr("class", "static-info-box")
    .style("position", "absolute")
    .style("bottom", "10px")
    .style("left", "10px")
    .style("background", "#fff")
    .style("padding", "8px")
    .style("border", "1px solid #ccc")
    .style("font-size", "12px")
    .text("Hover over a county");

  // Zoom
  const zoomBehavior = d3.zoom()
    .scaleExtent([1, 8])
    .translateExtent([[0, 0], [width, height]])
    .on("zoom", event => {
      g.attr("transform", event.transform);
    });
  svg.call(zoomBehavior);

  // Draw counties by Income
  const paths = g.selectAll("path")
    .data(counties)
    .join("path")
    .attr("d", path)
    .attr("stroke", "#999")
    .attr("stroke-width", 0.2)
    .attr("fill", d => {
      const v = incomeByFIPS.get(d.id);
      return v != null ? incomeColor(v) : "#eee";
    })
    .on("mouseover", (event, d) => {
      const fips = d.id;
      const name = fipsToName.get(fips) || "Unknown County";
      const v = incomeByFIPS.get(fips);
      const display = v != null ? "$" + d3.format(",")(v) : "N/A";
      d3.select("#info-income")
        .text(`${name} — Median Income: ${display}`);
    });

  // Build Income legend (quintile‐binned)
  buildIncomeLegend("#legend-income");
  d3.select("#legend-income").style("display", null);

  // Reset
  d3.select("#reset-button-income").on("click", () => {
    svg.transition().duration(750).call(zoomBehavior.transform, d3.zoomIdentity);
    paths.attr("stroke", "#999").attr("stroke-width", 0.2);
    d3.select("#county-search-income").property("value", "");
  });

  // Search
  setupSearchBox(
    "#county-search-income",
    "#suggestions-income",
    "#search-button-income",
    paths,
    zoomBehavior,
    { highlightPaths: paths }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // INSERT FOUR “ANNOTATION” POLYGONS AS BLACK OUTLINES (Income‐Only)
  // ──────────────────────────────────────────────────────────────────────────
  const annotationGroupInc = g.append("g").attr("class", "annotation-group-income");
  Object.values(annotationRegions).forEach(region => {
    annotationGroupInc.append("path")
      .datum(region)
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "black")
      .attr("stroke-width", 2);
  });
  // Add Toggle Annotations button for Income-Only
  d3.select("#map-income")
    .append("button")
    .attr("id", "toggle-annotations-btn-income")
    .text("Toggle Annotations")
    .style("margin-top", "10px")
    .style("float", "right")
    .on("click", () => toggleAnnotations(".annotation-group-income"));
}


// Helper: Build Income legend (quintile‐binned threshold scale)
function buildIncomeLegend(containerSelector) {
  const bins = incomeColor.range();
  const container = d3.select(containerSelector);
  container.selectAll("*").remove();

  const svg = container.append("svg")
    .attr("width", 300)
    .attr("height", 50);

  // Add title
  svg.append("text")
    .attr("x", 0)
    .attr("y", 12)
    .attr("font-size", "12px")
    .attr("font-weight", "bold")
    .text("Median Household Income");

  const labelCategories = ["Very Low", "Low", "Moderate", "High", "Very High"];

  bins.forEach((color, i) => {
    svg.append("rect")
      .attr("x", i * 60)
      .attr("y", 20)
      .attr("width", 60)            // <-- fixed here
      .attr("height", 15)
      .attr("fill", color);

    svg.append("text")
      .attr("x", i * 60 + 30)
      .attr("y", 48)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .text(labelCategories[i]);
  });
}


// ==========================================
// 14) Water Pollution‐Only View Initialization
// ==========================================
function initWaterOnly() {
  const svg = d3.select("#water-svg").attr("width", width).attr("height", height);
  const g = svg.append("g").attr("class", "water-group");
  // Remove tooltip-based display, use fixed info box instead
  d3.select("#map-water")
    .selectAll("#info-water")
    .data([null])
    .join("div")
    .attr("id", "info-water")
    .attr("class", "static-info-box")
    .style("position", "absolute")
    .style("bottom", "10px")
    .style("left", "10px")
    .style("background", "#fff")
    .style("padding", "8px")
    .style("border", "1px solid #ccc")
    .style("font-size", "12px")
    .text("Hover over a county");

  const zoomBehavior = d3.zoom()
    .scaleExtent([1, 8])
    .translateExtent([[0, 0], [width, height]])
    .on("zoom", event => {
      g.attr("transform", event.transform);
    });
  svg.call(zoomBehavior);

  const paths = g.selectAll("path")
    .data(counties)
    .join("path")
    .attr("d", path)
    .attr("stroke", "#999")
    .attr("stroke-width", 0.2)
    .attr("fill", d => {
      const v = waterByFIPS.get(d.id);
      return v != null ? waterColor(v) : "#eee";
    })
    .on("mouseover", (event, d) => {
      const fips = d.id;
      const name = fipsToName.get(fips) || "Unknown County";
      const v = waterByFIPS.get(fips);
      const display = v != null ? v.toFixed(1) : "N/A";
      d3.select("#info-water")
        .text(`${name} — Water Quality Score: ${display}`);
    });

  // Build Water Quality legend (quintile‐binned)
  buildWaterLegend("#legend-water");
  d3.select("#legend-water").style("display", null);

  // Reset button
  d3.select("#reset-button-water").on("click", () => {
    svg.transition().duration(750).call(zoomBehavior.transform, d3.zoomIdentity);
    paths.attr("stroke", "#999").attr("stroke-width", 0.2);
    d3.select("#county-search-water").property("value", "");
  });

  // Search
  setupSearchBox(
    "#county-search-water",
    "#suggestions-water",
    "#search-button-water",
    paths,
    zoomBehavior,
    { highlightPaths: paths }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // INSERT FOUR “ANNOTATION” POLYGONS AS BLACK OUTLINES + Kentucky (Water‐Only)
  // ──────────────────────────────────────────────────────────────────────────
  const annotationGroupW = g.append("g").attr("class", "annotation-group-water");
  Object.values(annotationRegions).forEach(region => {
    annotationGroupW.append("path")
      .datum(region)
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "black")
      .attr("stroke-width", 2);
  });
  // Add Toggle Annotations button for Water-Only
  d3.select("#map-water")
    .append("button")
    .attr("id", "toggle-annotations-btn-water")
    .text("Toggle Annotations")
    .style("margin-top", "10px")
    .style("float", "right")
    .on("click", () => toggleAnnotations(".annotation-group-water"));
}


// Helper: Build Water Quality legend (quintile‐binned threshold scale)
function buildWaterLegend(containerSelector) {
  const bins = waterColor.range();
  const container = d3.select(containerSelector);
  container.selectAll("*").remove();

  const svg = container.append("svg")
    .attr("width", 300)
    .attr("height", 50);

  // Add title
  svg.append("text")
    .attr("x", 0)
    .attr("y", 12)
    .attr("font-size", "12px")
    .attr("font-weight", "bold")
    .text("Drinking Water Quality");

  // Reverse bins & labels so “Very Dirty” is leftmost
  const reversedBins = bins.slice().reverse();
  const labelCategories = ["Very Clean", "Clean", "Moderate", "Dirty", "Very Dirty"];
  reversedBins.forEach((color, i) => {
    svg.append("rect")
      .attr("x", i * 60)
      .attr("y", 20)
      .attr("width", 60)
      .attr("height", 15)
      .attr("fill", color);

    svg.append("text")
      .attr("x", i * 60 + 30)
      .attr("y", 48)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .text(labelCategories[i]);
  });
}


// ==========================================
// 15) Full Dashboard Initialization
// ==========================================
function initFullDashboard() {
  // 15.1) Elements for Cancer layer
  const cancerSvg = d3.select("#cancer-svg-2").attr("width", width).attr("height", height);
  const cancerG = cancerSvg.append("g").attr("class", "cancer-group-2");
  const facilitySvg = d3.select("#facility-svg-2");
  const cancerTooltip = d3.select("#cancer-tooltip-2");

  // 15.2) Elements for Pollution layer (PM₂.₅ / Income / Water) + facility tooltips
  const pollutionContainer2 = d3.select("#pollution-container-2");
  const pollutionSvg = d3.select("#pollution-svg-2").attr("width", width).attr("height", height);
  const pollutionG = pollutionSvg.append("g").attr("class", "pollution-group-2");
  const pollutionTooltip = d3.select("#pollution-tooltip-2");

  // Track whether “Industry” is active
  let industryModeFull = false;

  // ——————————————————————————————————————————————————
  // 15.3) Draw county paths for Cancer & (hidden) Pollution
  // ——————————————————————————————————————————————————

  // 15.3.1) Cancer choropleth, initially All Sites
  const cancerPaths = cancerG.selectAll("path")
    .data(counties)
    .join("path")
    .attr("d", path)
    .attr("stroke", "#999")
    .attr("stroke-width", 0.2)
    .attr("fill", d => {
      const v = cancerByFIPS.get(d.id);
      return v != null ? cancerColor(v) : "#eee";
    })
    .on("mouseover", (event, d) => {
      const fips = d.id;
      const name = fipsToName.get(fips) || "Unknown County";
      const type = d3.select("#cancer-select-2").property("value");
      let val, label;
      if (type === "all") {
        val = cancerByFIPS.get(fips);
        label = "All‐Sites Cancer";
      } else if (type === "leukemia") {
        val = leukemiaByFIPS.get(fips);
        label = "Leukemia";
      } else if (type === "lymphoma") {
        val = lymphomaByFIPS.get(fips);
        label = "Lymphoma";
      } else if (type === "thyroid") {
        val = thyroidByFIPS.get(fips);
        label = "Thyroid";
      } else if (type === "breast") {
        val = breastByFIPS.get(fips);
        label = "Breast";
      }
      const display = val != null ? val.toFixed(1) : "N/A";
      cancerTooltip
        .style("left", (event.clientX + 1) + "px")
        .style("top", (event.clientY + 1) + "px")
        .style("opacity", 1)
        .html(
          `<strong>County:</strong> ${name}<br/>` +
          `<strong>${label}:</strong> ${display}`
        );
    })
    .on("mouseout", () => {
      cancerTooltip.style("opacity", 0);
    });

  // 15.3.2) Facility circles for Industry (initially hidden)
  const facilityG = facilitySvg.append("g")
    .attr("class", "facility-group-2")
    .style("display", "none"); // hidden until Industry is selected

  const facilityCirclesFull = facilityG.selectAll("circle")
    .data(facilities)
    .join("circle")
    .attr("cx", d => {
      const xy = projection([d.longitude, d.latitude]);
      return xy ? xy[0] : -10;
    })
    .attr("cy", d => {
      const xy = projection([d.longitude, d.latitude]);
      return xy ? xy[1] : -10;
    })
    .attr("r", 4)
    .attr("fill", d => sectorColor(d.sector))
    .attr("stroke", "#333")
    .attr("stroke-width", 0.5)
    .on("mouseover", (event, d) => {
      const html =
        `<strong>Facility:</strong> ${d.facilityName}<br/>` +
        `<strong>Emissions Total:</strong> ${d.onSiteRelease}`;
      pollutionTooltip
        .style("left", (event.clientX + 1) + "px")
        .style("top", (event.clientY + 1) + "px")
        .style("opacity", 1)
        .html(html);
    })
    .on("mouseout", () => {
      pollutionTooltip.style("opacity", 0);
    });

  // Add emission threshold filter for Full Dashboard
  d3.select("#emission-threshold-2").on("input", function () {
    d3.select("#emission-value-2").text(this.value);
    updateIndustryFullCanvas();
  });


  // —————————————————————————————————————————————————————————
  // Populate “Industry Facilities” multi-select dropdown (Full Dashboard)
  // —————————————————————————————————————————————————————————

  const sectorDropdownFull = d3.select("#sector-select-2");
  // Clear any existing <option> elements:
  sectorDropdownFull.selectAll("option").remove();

  // Create one <option> per sector:
  sectorColor.domain().forEach(sec => {
    sectorDropdownFull.append("option")
      .attr("value", sec)
      .text(sec);
  });

  // Whenever the dropdown changes, filter the facility circles:
  sectorDropdownFull.on("change", () => {
    updateIndustryFullCanvas();
    // Gather an array of the values that are currently selected:
    const selectedList = Array.from(
      sectorDropdownFull.node().selectedOptions
    ).map(opt => opt.value);

    if (selectedList.length === 0) {
      // If nothing is selected, hide all facilities:
      facilityG.style("display", "none");
    } else {
      // Otherwise show the group, and hide any circle whose sector is not in the selectedList:
      facilityG.style("display", null);
    }

    // Toggle legend visibility
    if (selectedList.length === 0) {
      d3.select("#industry-legend-full").style("display", "none");
    } else {
      d3.select("#industry-legend-full").style("display", null);
    }

    // Bold/unbold legend labels based on which sectors are selected
    d3.selectAll("#industry-legend-items-full .legend-item .label")
      .style("font-weight", function () {
        const sector = d3.select(this).attr("data-sector");
        return selectedList.includes(sector) ? "bold" : "normal";
      });
  });
  // Helper to update the visible facilities in Full Dashboard based on threshold and sector
  function updateIndustryFullCanvas() {
    const threshold = +d3.select("#emission-threshold-2").property("value");
    const selectedList = Array.from(
      sectorDropdownFull.node().selectedOptions
    ).map(opt => opt.value);
    facilityCirclesFull.attr("display", d => {
      const emission = +d.onSiteRelease;
      const sectorMatch = selectedList.includes(d.sector);
      return (emission >= threshold && sectorMatch) ? null : "none";
    });
  }

  // Allow clicking an option to toggle selection without needing Ctrl:
  sectorDropdownFull.on("mousedown", function (event) {
    event.preventDefault();
    const opt = event.target;
    if (opt.tagName === "OPTION") {
      opt.selected = !opt.selected;
      d3.select(this).dispatch("change");
    }
  });

  // “All” button selects every option and triggers change:
  d3.select("#sector-all-2").on("click", () => {
    sectorDropdownFull.selectAll("option").property("selected", true);
    sectorDropdownFull.dispatch("change");
  });

  // “None” button clears all selections and triggers change:
  d3.select("#sector-none-2").on("click", () => {
    sectorDropdownFull.selectAll("option").property("selected", false);
    sectorDropdownFull.dispatch("change");
  });

  // —————————————————————————————————————————————————————————
  // End of “Industry Facilities” multi-select dropdown logic
  // —————————————————————————————————————————————————————————

  // Populate Industry Legend in Full Dashboard
  buildIndustryLegend("#industry-legend-items-full");
  d3.select("#industry-legend-full").style("display", "none");

  // Build all three pollution legends for dashboard (ensure present and visible)
  buildPM25Legend("#legend-pm25-full");
  d3.select("#legend-pm25-full").style("display", null);
  buildIncomeLegend("#legend-income-full");
  d3.select("#legend-income-full").style("display", null);
  // Build gradient legend for water using same structure as air/income
  {
    // Gather all water data values (needed for min/max)
    const allWaterVals = Array.from(waterByFIPS.values()).filter(d => !isNaN(d)).sort(d3.ascending);
    const min = d3.min(allWaterVals);
    const max = d3.max(allWaterVals);
    buildLegendGradient("#legend-water-gradient-full", min, max, waterColor);
    // Update legend title
    d3.select("#water-legend-title-full").text("Drinking Water Quality");
  }
  d3.select("#legend-water-full").style("display", null);
  // Build and display Cancer legend for dashboard
  buildCancerLegend("#legend-cancer-full");
  d3.select("#legend-cancer-full").style("display", null);

  // 15.3.3) Pollution paths (drawn when needed; initially fill="#eee")
  const pollutionPaths = pollutionG.selectAll("path")
    .data(counties)
    .join("path")
    .attr("d", path)
    .attr("stroke", "#999")
    .attr("stroke-width", 0.2)
    .attr("fill", "#eee")
    .on("mouseover", (event, d) => {
      let value = null;
      let label = "";
      let rec = null;

      const selected = d3.select("#pollution-select-2").property("value");
      if (selected === "cancer") {
        rec = cancerByFIPS.get(d.id);
        label = "Cancer Rate:";
        value = rec;
      } else if (selected === "pm25") {
        rec = airByFIPS.get(d.id);
        label = "PM₂.₅:";
        value = rec;
      } else if (selected === "income") {
        rec = incomeByFIPS.get(d.id);
        label = "Income:";
        value = rec;
      } else if (selected === "water") {
        rec = waterByFIPS.get(d.id);
        label = "Water Quality:";
        value = rec;
      }

      if (value != null) {
        pollutionTooltip
          .style("left", (event.clientX + 6) + "px")
          .style("top", (event.clientY + 4) + "px")
          .style("opacity", 1)
          .html(`<strong>County:</strong> ${fipsToName.get(d.id)}<br/>
                 <strong>${label}</strong> ${d3.format(".2f")(value)}`);
      }
    })
    .on("mouseout", () => pollutionTooltip.style("opacity", 0));

  // ——————————————————————————————————————————————————
  // 15.4) ZOOM BEHAVIOR (shared by both maps + facility)
  // ——————————————————————————————————————————————————
  const zoomBehavior2 = d3.zoom()
    .scaleExtent([1, 8])
    .translateExtent([[0, 0], [width, height]])
    .on("zoom", event => {
      const t = event.transform;
      cancerG.attr("transform", t);
      pollutionG.attr("transform", t);
      facilityG.attr("transform", t);
    });

  cancerSvg.call(zoomBehavior2);
  pollutionSvg.call(zoomBehavior2);
  facilitySvg.call(zoomBehavior2);

  // ——————————————————————————————————————————————————
  // 15.5) SEARCH BOX (Full Dashboard)
  // ——————————————————————————————————————————————————
  setupSearchBox(
    "#county-search-2",
    "#suggestions-2",
    "#search-button-2",
    cancerPaths,
    zoomBehavior2,
    {
      highlightPaths: [cancerPaths, pollutionPaths],
      highlightAttrs: { stroke: "black", "stroke-width": 0.75 }
    }
  );

  // ——————————————————————————————————————————————————
  // 15.6) CANCER DROPDOWN (Full Dashboard)
  // ——————————————————————————————————————————————————
  d3.select("#cancer-select-2").on("change", updateCancerChoroplethFull);

  function updateCancerChoroplethFull() {
    const type = d3.select("#cancer-select-2").property("value");
    cancerPaths.transition().duration(500).attr("fill", d => {
      const fips = d.id;
      if (type === "all") {
        const v = cancerByFIPS.get(fips);
        return v != null ? cancerColor(v) : "#eee";
      } else if (type === "leukemia") {
        const v = leukemiaByFIPS.get(fips);
        return v != null ? leukemiaColor(v) : "#eee";
      } else if (type === "lymphoma") {
        const v = lymphomaByFIPS.get(fips);
        return v != null ? lymphomaColor(v) : "#eee";
      } else if (type === "thyroid") {
        const v = thyroidByFIPS.get(fips);
        return v != null ? thyroidColor(v) : "#eee";
      } else if (type === "breast") {
        const v = breastByFIPS.get(fips);
        return v != null ? breastColor(v) : "#eee";
      }
    });

    // Rebuild Cancer legend
    buildCancerLegend("#legend-cancer-full");
  }

  // ——————————————————————————————————————————————————
  // 15.7) POLLUTION DROPDOWN (Full Dashboard)
  // ——————————————————————————————————————————————————
  d3.select("#pollution-select-2").on("change", updatePollutionFull);

  function updatePollutionFull() {
    const selected = d3.select("#pollution-select-2").property("value");

    if (selected === "none") {
      // Hide pollution & facilities, show cancer alone
      pollutionContainer2.style("display", "none");
      cancerPaths.attr("fill-opacity", 1);

      // Show cancer legend, hide others
      d3.select("#legend-cancer-full").style("display", null);
      d3.select("#legend-pm25-full").style("display", "none");
      d3.select("#legend-income-full").style("display", "none");
      d3.select("#legend-water-full").style("display", "none");

      // Recolor cancer (in case user changed subtype)
      updateCancerChoroplethFull();

    } else if (selected === "pm25") {
      // Show pollution (PM₂.₅) below cancer
      pollutionContainer2.style("display", null);

      // Color pollutionPaths by PM₂.₅
      pollutionPaths.transition().duration(500).attr("fill", d => {
        const v = airByFIPS.get(d.id);
        return v != null ? pm25Color(v) : "#eee";
      });

      // Show cancer legend alongside PM₂.₅ legend
      d3.select("#legend-cancer-full").style("display", null);
      d3.select("#legend-pm25-full").style("display", null);
      d3.select("#legend-income-full").style("display", "none");
      d3.select("#legend-water-full").style("display", "none");

      // Rebuild PM₂.₅ legend
      buildPM25Legend("#legend-pm25-full");

    } else if (selected === "income") {
      // Show pollution (Income) below cancer
      pollutionContainer2.style("display", null);

      // Color pollutionPaths by Income
      pollutionPaths.transition().duration(500).attr("fill", d => {
        const v = incomeByFIPS.get(d.id);
        return v != null ? incomeColor(v) : "#eee";
      });

      // Show cancer legend alongside Income legend
      d3.select("#legend-cancer-full").style("display", null);
      d3.select("#legend-pm25-full").style("display", "none");
      d3.select("#legend-income-full").style("display", null);
      d3.select("#legend-water-full").style("display", "none");

      // Rebuild Income legend
      buildIncomeLegend("#legend-income-full");

    } else if (selected === "water") {
      // Display the pollution container (reusing its <svg> for water)
      d3.select("#pollution-container-2").style("display", null);

      // Show cancer legend, hide others except water
      d3.select("#legend-cancer-full").style("display", null);
      d3.select("#legend-pm25-full").style("display", "none");
      d3.select("#legend-income-full").style("display", "none");
      d3.select("#legend-water-full").style("display", null);

      // Color pollutionPaths by Water Quality
      pollutionPaths.transition().duration(500).attr("fill", d => {
        const v = waterByFIPS.get(d.id);
        return v != null ? waterColor(v) : "#eee";
      });

      // Build the discrete Water Quality legend
      buildWaterLegend("#legend-water-full");
    }
  }

  // ——————————————————————————————————————————————————
  // 15.8) RESET BUTTON (Full Dashboard)
  // ——————————————————————————————————————————————————
  d3.select("#reset-button-2").on("click", () => {
    cancerSvg.transition().duration(750).call(zoomBehavior2.transform, d3.zoomIdentity);
    pollutionSvg.transition().duration(750).call(zoomBehavior2.transform, d3.zoomIdentity);
    facilitySvg.transition().duration(750).call(zoomBehavior2.transform, d3.zoomIdentity);

    cancerPaths.attr("stroke", "#999").attr("stroke-width", 0.2);
    pollutionPaths.attr("stroke", "#999").attr("stroke-width", 0.2);

    // Hide pollution/facilities, reset dropdown
    pollutionContainer2.style("display", "none");
    facilityG.style("display", "none");
    // No need to hide/show #water-container-2
    d3.select("#pollution-select-2").property("value", "none");
    sectorDropdownFull.selectAll("option").property("selected", false);

    // Show cancer legend, hide others
    d3.select("#legend-cancer-full").style("display", null);
    d3.select("#legend-pm25-full").style("display", "none");
    d3.select("#legend-income-full").style("display", "none");
    d3.select("#industry-legend-full").style("display", "none");

    d3.select("#county-search-2").property("value", "");

    updateCancerChoroplethFull();
  });

  // ——————————————————————————————————————————————————
  // 15.9) INITIAL STATE (Full Dashboard)
  // ——————————————————————————————————————————————————
  pollutionContainer2.style("display", "none");
  facilityG.style("display", "none");

  // Build initial Cancer legend
  buildLegendGradient("#legend-cancer-gradient-full", allMin, all95, cancerColor);
  d3.select("#legend-cancer-full").style("display", null);
  d3.select("#cancer-legend-title-full").text("All‐Sites Cancer Incidence (≤ 95th percentile)");
}


// ==========================================
// UTILITY: build a generic gradient legend
// gradientId:      "#some-gradient-id"  (the <linearGradient> itself)
// domainMin/Max:   numbers
// colorScale:      e.g. cancerColor, pm25Color, incomeColor
// ==========================================
function buildLegendGradient(gradientId, domainMin, domainMax, colorScale) {
  const grad = d3.select(gradientId);
  grad.selectAll("stop").remove();
  d3.range(0, 1.001, 0.01).forEach(t => {
    const val = domainMin + t * (domainMax - domainMin);
    grad.append("stop")
      .attr("offset", `${t * 100}%`)
      .attr("stop-color", colorScale(val));
  });
}


// ==========================================
// UTILITY: SEARCH BOX SETUP
// inputSelector:     "#county-search"
// suggestionsSelector:"#suggestions"
// buttonSelector:    "#search-button"
// pathSelection:     D3 selection of county <path> elements
// zoomBehavior:      d3.zoom() instance
// options: { highlightPaths: [...], highlightAttrs: {...} }
// ==========================================
function setupSearchBox(
  inputSelector,
  suggestionsSelector,
  buttonSelector,
  pathSelection,
  zoomBehavior,
  options = {}
) {
  const searchInput = d3.select(inputSelector);
  const suggestionsDiv = d3.select(suggestionsSelector);
  const searchButton = d3.select(buttonSelector);

  let highlightSelections;
  if (options.highlightPaths) {
    highlightSelections = Array.isArray(options.highlightPaths)
      ? options.highlightPaths
      : [options.highlightPaths];
  } else {
    highlightSelections = [pathSelection];
  }
  const highlightAttrs = options.highlightAttrs || {
    stroke: "black",
    "stroke-width": 0.75
  };

  searchInput
    .on("input", function () {
      const query = this.value.trim().toLowerCase();
      suggestionsDiv.html("");
      suggestionsDiv.style("display", "none");
      if (!query) return;
      const matches = Array.from(nameToFIPS.keys())
        .filter(name => name.includes(query))
        .slice(0, 10);
      if (matches.length === 0) return;
      matches.forEach(name => {
        suggestionsDiv
          .append("div")
          .attr("class", "suggestion-item")
          .text(name)
          .on("click", () => {
            searchInput.property("value", name);
            suggestionsDiv.html("");
            suggestionsDiv.style("display", "none");
            searchButton.node().click();
          });
      });
      suggestionsDiv.style("display", "block");
    })
    .on("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        searchButton.node().click();
      }
    });

  d3.select("body").on("click", function (event) {
    if (
      !event.target.closest(inputSelector) &&
      !event.target.closest(suggestionsSelector)
    ) {
      suggestionsDiv.html("");
      suggestionsDiv.style("display", "none");
    }
  });

  searchButton.on("click", () => {
    const queryRaw = searchInput.property("value").trim().toLowerCase();
    if (!queryRaw) {
      alert("Please type a county (e.g. “Union County, Florida”).");
      return;
    }
    let matchedFips = nameToFIPS.get(queryRaw);
    if (!matchedFips) {
      const candidates = Array.from(nameToFIPS.keys())
        .filter(key => key.includes(queryRaw));
      if (candidates.length === 1) {
        matchedFips = nameToFIPS.get(candidates[0]);
      } else if (candidates.length > 1) {
        alert(
          `Multiple matches found:\n` +
          candidates.slice(0, 10).map(k => `• ${k}`).join("\n") +
          (candidates.length > 10 ? `\n(and ${candidates.length - 10} more…)` : "")
        );
        return;
      } else {
        alert("County not found—make sure you typed “Union County, Florida.”");
        return;
      }
    }

    // Clear existing highlights
    highlightSelections.forEach(sel => {
      sel.attr("stroke", "#999").attr("stroke-width", 0.2);
    });

    // Highlight the matched county
    highlightSelections.forEach(sel => {
      sel.filter(d => d.id === matchedFips)
        .attr("stroke", highlightAttrs.stroke)
        .attr("stroke-width", highlightAttrs["stroke-width"]);
    });

    // Zoom into that county
    const feature = counties.find(d => d.id === matchedFips);
    if (!feature) return;
    const b = path.bounds(feature);
    const dx = b[1][0] - b[0][0];
    const dy = b[1][1] - b[0][1];
    const x = (b[0][0] + b[1][0]) / 2;
    const y = (b[0][1] + b[1][1]) / 2;
    const scale = Math.max(1, Math.min(8, 0.9 / Math.max(dx / width, dy / height)));
    const tx = width / 2 - scale * x;
    const ty = height / 2 - scale * y;
    const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);

    d3.select(pathSelection.node().ownerSVGElement)
      .transition()
      .duration(750)
      .call(zoomBehavior.transform, transform);
  });
}