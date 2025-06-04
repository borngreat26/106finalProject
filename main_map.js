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

// Shared data containers
let counties;                          // GeoJSON array of U.S. counties
let fipsToName = new Map();            // Map< "12345" → "County, State" >
let nameToFIPS = new Map();            // Map< lowercase "county, state" → "12345" >

let cancerByFIPS;        // Map<fips, incidence>
let leukemiaByFIPS;      // Map<fips, incidence>
let lymphomaByFIPS;      // Map<fips, incidence>
let thyroidByFIPS;       // Map<fips, incidence>
let breastByFIPS;        // Map<fips, incidence> for breast cancer
let breastColor;         // d3.scaleSequential for breast
let breastMin, breast95; // 95th-percentile cutoffs for breast
let airByFIPS;           // Map<fips, pm25>
let incomeByFIPS;        // Map<fips, medianIncome>
let waterByFIPS;       // Map<fips, water quality score>
let waterColor;        // d3.scaleSequential for water
let waterMin, water95; // 95th-percentile cutoffs for water

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
    // Parse County_Water_Quality_Scores.csv → waterByFIPS
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

    // 8.1) All‐Sites Cancer: dynamic [min, 95th percentile], clamp above
    {
      const allVals = Array.from(cancerByFIPS.values()).filter(v => !isNaN(v));
      allMin = d3.min(allVals);
      const sorted = allVals.slice().sort(d3.ascending);
      all95 = d3.quantile(sorted, 0.95);
      cancerColor = d3.scaleSequential(d3.interpolateReds)
        .domain([allMin, all95])
        .clamp(true);
    }

    // 8.2) Leukemia
    {
      const arr = Array.from(leukemiaByFIPS.values()).filter(v => !isNaN(v));
      leukMin = d3.min(arr);
      const sorted = arr.slice().sort(d3.ascending);
      leuk95 = d3.quantile(sorted, 0.95);
      leukemiaColor = d3.scaleSequential(d3.interpolateReds)
        .domain([leukMin, leuk95])
        .clamp(true);
    }

    // 8.3) Lymphoma
    {
      const arr = Array.from(lymphomaByFIPS.values()).filter(v => !isNaN(v));
      lyphMin = d3.min(arr);
      const sorted = arr.slice().sort(d3.ascending);
      lyph95 = d3.quantile(sorted, 0.95);
      lymphomaColor = d3.scaleSequential(d3.interpolateReds)
        .domain([lyphMin, lyph95])
        .clamp(true);
    }

    // 8.4) Thyroid
    {
      const arr = Array.from(thyroidByFIPS.values()).filter(v => !isNaN(v));
      thyMin = d3.min(arr);
      const sorted = arr.slice().sort(d3.ascending);
      thy95 = d3.quantile(sorted, 0.95);
      thyroidColor = d3.scaleSequential(d3.interpolateReds)
        .domain([thyMin, thy95])
        .clamp(true);
    }

    // 8.5) Breast Cancer: dynamic [min, 95th percentile], clamp above
    {
      const arr = Array.from(breastByFIPS.values()).filter(v => !isNaN(v));
      breastMin = d3.min(arr);
      const sorted = arr.slice().sort(d3.ascending);
      breast95 = d3.quantile(sorted, 0.95);
      breastColor = d3.scaleSequential(d3.interpolateReds)
        .domain([breastMin, breast95])
        .clamp(true);
    }

    // 8.6) PM₂.₅: fixed [3, 15]
    pm25Color = d3.scaleSequential(d3.interpolateBlues)
      .domain([3, 15]);

    // 8.7) Income: [incomeMin, incomeMax], clamp above 120k
    {
      const arr = Array.from(incomeByFIPS.values()).filter(v => !isNaN(v));
      incomeMin = d3.min(arr);
      incomeMax = d3.max(arr);
      incomeColor = d3.scaleSequential(v => d3.interpolateGreys(1 - v))
        .domain([incomeMin, 120000])
        .clamp(true);
    }

    // 8.8) Precompute “facilities” (for industrial dots)
    facilities = industryData.filter(d =>
      !isNaN(d.latitude) && !isNaN(d.longitude)
    );
    const uniqueSectors = Array.from(new Set(facilities.map(d => d.sector)));
    sectorColor = d3.scaleOrdinal(d3.schemeSet2).domain(uniqueSectors);

    // —————————————————————————————————————————————————————————
    // 8.9) Water Quality: dynamic [min, 95th percentile], clamp above
    // —————————————————————————————————————————————————————————
    const waterArr = Array.from(waterByFIPS.values()).filter(v => !isNaN(v));
    waterMin = d3.min(waterArr);
    const waterSorted = waterArr.slice().sort(d3.ascending);
    water95 = d3.quantile(waterSorted, 0.95);
    waterColor = d3.scaleLinear()
      .domain([40, 60])
      .range(["#ffffcc", "#41b6c4"])
      .clamp(true);

    // —————————————————————————————————————————————————————————————————
    // 9) INITIALIZE ALL FIVE VIEWS
    // —————————————————————————————————————————————————————————————————

    initCancerOnly();
    initAirOnly();
    initIndustryOnly();
    initIncomeOnly();
    initWaterOnly(); // Initialize the new Water Pollution‐Only view
    initFullDashboard();
    // ========================================================================
    //  Water Pollution‐Only View Initialization
    // ========================================================================
    function initWaterOnly() {
      const svg = d3.select("#water-svg").attr("width", width).attr("height", height);
      const g = svg.append("g").attr("class", "water-group");
      const tooltip = d3.select("#water-tooltip");

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
          tooltip
            .style("left", (event.clientX + 1) + "px")
            .style("top", (event.clientY + 1) + "px")
            .style("opacity", 1)
            .html(
              `<strong>County:</strong> ${name}<br/>` +
              `<strong>Water Quality Score:</strong> ${display}`
            );
        })
        .on("mouseout", () => {
          tooltip.style("opacity", 0);
        });

      // Build Water Quality legend
      buildWaterLegend("#legend-water", "#water-legend-axis");

      // Reset button
      d3.select("#reset-button-water").on("click", () => {
        svg.transition().duration(750).call(zoomBehavior.transform, d3.zoomIdentity);
        paths.attr("stroke", "#999").attr("stroke-width", 0.2);
        d3.select("#county-search-water").property("value", "");
      });

      setupSearchBox(
        "#county-search-water",
        "#suggestions-water",
        "#search-button-water",
        paths,
        zoomBehavior,
        { highlightPaths: paths }
      );
    }

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
  const tooltip = d3.select("#cancer-tooltip");

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
      tooltip
        .style("left", (event.clientX + 1) + "px")
        .style("top", (event.clientY + 1) + "px")
        .style("opacity", 1)
        .html(
          `<strong>County:</strong> ${name}<br/>` +
          `<strong>${label}:</strong> ${display}`
        );
    })
    .on("mouseout", () => {
      tooltip.style("opacity", 0);
    });

  // Cancer dropdown behavior
  d3.select("#cancer-select").on("change", updateChoropleth);

  function updateChoropleth() {
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

  // Build Cancer legend
  buildCancerLegend("#legend-cancer", "#cancer-legend-axis");

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

  // Initial draw
  updateChoropleth();
}


// Helper: Build Cancer legend
function buildCancerLegend(gradientId, axisGroupId) {
  const legendWidth = 300;
  const legendHeight = 12;

  // 1) Gradient stops
  const grad = d3.select(gradientId);
  grad.selectAll("stop").remove();
  d3.range(0, 1.001, 0.01).forEach(t => {
    const val = allMin + t * (all95 - allMin);
    grad.append("stop")
      .attr("offset", `${t * 100}%`)
      .attr("stop-color", cancerColor(val));
  });

  // 2) Axis
  const scale = d3.scaleLinear().domain([allMin, all95]).range([0, legendWidth]);
  const axis = d3.axisBottom(scale).ticks(5).tickFormat(d3.format(".0f"));
  d3.select(axisGroupId).call(axis);
}


// ==========================================
// 11) Air‐Only Section Initialization
// ==========================================
function initAirOnly() {
  const svg = d3.select("#air-svg").attr("width", width).attr("height", height);
  const g = svg.append("g").attr("class", "air-group");
  const tooltip = d3.select("#air-tooltip");

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
      tooltip
        .style("left", (event.clientX + 1) + "px")
        .style("top", (event.clientY + 1) + "px")
        .style("opacity", 1)
        .html(
          `<strong>County:</strong> ${name}<br/>` +
          `<strong>PM₂.₅:</strong> ${display}`
        );
    })
    .on("mouseout", () => {
      tooltip.style("opacity", 0);
    });

  // Build PM₂.₅ legend
  buildPM25Legend("#legend-pm25", "#pm25-legend-axis");

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
}


// Helper: Build PM₂.₅ legend
function buildPM25Legend(gradientId, axisGroupId) {
  const legendWidth = 300;
  const legendHeight = 12;

  const grad = d3.select(gradientId);
  grad.selectAll("stop").remove();
  d3.range(0, 1.001, 0.01).forEach(t => {
    const val = 3 + t * (15 - 3);
    grad.append("stop")
      .attr("offset", `${t * 100}%`)
      .attr("stop-color", pm25Color(val));
  });

  const scale = d3.scaleLinear().domain([3, 15]).range([0, legendWidth]);
  const axis = d3.axisBottom(scale).ticks(6).tickFormat(d3.format(".1f"));
  d3.select(axisGroupId).call(axis);
}


// ==========================================
// 12) Industrial‐Only Section Initialization
// ==========================================
function initIndustryOnly() {
  const svg = d3.select("#industry-svg").attr("width", width).attr("height", height);
  const g = svg.append("g").attr("class", "industry-cancer-group");
  const tooltip = d3.select("#industry-tooltip");

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
      tooltip
        .style("left", (event.clientX + 1) + "px")
        .style("top", (event.clientY + 1) + "px")
        .style("opacity", 1)
        .html(`<strong>County:</strong> ${name}`);
    })
    .on("mouseout", () => {
      tooltip.style("opacity", 0);
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
      const html =
        `<strong>Facility:</strong> ${d.facilityName}<br/>` +
        `<strong>Emissions Total:</strong> ${d.onSiteRelease}`;
      tooltip
        .style("left", (event.clientX + 1) + "px")
        .style("top", (event.clientY + 1) + "px")
        .style("opacity", 1)
        .html(html);
    })
    .on("mouseout", () => {
      tooltip.style("opacity", 0);
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
  buildCancerLegend("#legend-cancer-industry", "#cancer-legend-axis-industry");

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
  const tooltip = d3.select("#income-tooltip");

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
      tooltip
        .style("left", (event.clientX + 1) + "px")
        .style("top", (event.clientY + 1) + "px")
        .style("opacity", 1)
        .html(
          `<strong>County:</strong> ${name}<br/>` +
          `<strong>Median Income:</strong> ${display}`
        );
    })
    .on("mouseout", () => {
      tooltip.style("opacity", 0);
    });

  // Build Income legend
  buildIncomeLegend("#legend-income", "#income-legend-axis");

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
}


// Helper: Build Income legend
function buildIncomeLegend(gradientId, axisGroupId) {
  const legendWidth = 300;
  const legendHeight = 12;

  const grad = d3.select(gradientId);
  grad.selectAll("stop").remove();
  d3.range(0, 1.001, 0.01).forEach(t => {
    const val = incomeMin + t * (incomeMax - incomeMin);
    grad.append("stop")
      .attr("offset", `${t * 100}%`)
      .attr("stop-color", incomeColor(val));
  });

  const scale = d3.scaleLinear().domain([incomeMin, incomeMax]).range([0, legendWidth]);
  const axis = d3.axisBottom(scale).ticks(5).tickFormat(d3.format(".0f"));
  d3.select(axisGroupId).call(axis);
}


// ==========================================
// 14) Full Dashboard Initialization
// ==========================================
function initFullDashboard() {
  // 14.1) Elements for Cancer layer
  const cancerSvg = d3.select("#cancer-svg-2").attr("width", width).attr("height", height);
  const cancerG = cancerSvg.append("g").attr("class", "cancer-group-2");
  const facilitySvg = d3.select("#facility-svg-2");
  const cancerTooltip = d3.select("#cancer-tooltip-2");

  // 14.2) Elements for Pollution layer (PM₂.₅ / Income) + facility tooltips
  const pollutionContainer2 = d3.select("#pollution-container-2");
  const pollutionSvg = d3.select("#pollution-svg-2").attr("width", width).attr("height", height);
  const pollutionG = pollutionSvg.append("g").attr("class", "pollution-group-2");
  const pollutionTooltip = d3.select("#pollution-tooltip-2");

  // Track whether “Industry” is active
  let industryModeFull = false;

  // ——————————————————————————————————————————————————
  // 14.3) Draw county paths for Cancer & (hidden) Pollution
  // ——————————————————————————————————————————————————

  // 14.3.1) Cancer choropleth, initially All Sites
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

  // 14.3.2) Facility circles for Industry (initially hidden)
  const facilityG = facilitySvg.append("g")
    .attr("class", "facility-group-2")
    .style("display", "none"); // hidden until Industry is selected

  // Facility circles for Industry (initially hidden)
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

  // 14.3.3) Pollution paths (drawn when needed; initially fill="#eee")
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
      } else if (selected === "pollution" || selected === "pm25") {
        rec = airByFIPS.get(d.id);
        label = "PM2.5:";
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
  // 14.4) ZOOM BEHAVIOR (shared by both maps + facility)
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
  // 14.5) SEARCH BOX (Full Dashboard)
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
  // 14.6) CANCER DROPDOWN (Full Dashboard)
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
    if (type === "all") {
      buildLegendGradient("#legend-cancer-gradient-full", allMin, all95, cancerColor);
      const scale = d3.scaleLinear().domain([allMin, all95]).range([0, 300]);
      const axis = d3.axisBottom(scale).ticks(5).tickFormat(d3.format(".0f"));
      d3.select("#cancer-legend-axis-full").call(axis);
      d3.select("#cancer-legend-title-full").text("All‐Sites Cancer Incidence (≤ 95th percentile)");
    } else if (type === "leukemia") {
      buildLegendGradient("#legend-cancer-gradient-full", leukMin, leuk95, leukemiaColor);
      const scale = d3.scaleLinear().domain([leukMin, leuk95]).range([0, 300]);
      const axis = d3.axisBottom(scale).ticks(5).tickFormat(d3.format(".0f"));
      d3.select("#cancer-legend-axis-full").call(axis);
      d3.select("#cancer-legend-title-full").text("Leukemia Incidence (≤ 95th percentile)");
    } else if (type === "lymphoma") {
      buildLegendGradient("#legend-cancer-gradient-full", lyphMin, lyph95, lymphomaColor);
      const scale = d3.scaleLinear().domain([lyphMin, lyph95]).range([0, 300]);
      const axis = d3.axisBottom(scale).ticks(5).tickFormat(d3.format(".0f"));
      d3.select("#cancer-legend-axis-full").call(axis);
      d3.select("#cancer-legend-title-full").text("Lymphoma Incidence (≤ 95th percentile)");
    } else if (type === "thyroid") {
      buildLegendGradient("#legend-cancer-gradient-full", thyMin, thy95, thyroidColor);
      const scale = d3.scaleLinear().domain([thyMin, thy95]).range([0, 300]);
      const axis = d3.axisBottom(scale).ticks(5).tickFormat(d3.format(".0f"));
      d3.select("#cancer-legend-axis-full").call(axis);
      d3.select("#cancer-legend-title-full").text("Thyroid Incidence (≤ 95th percentile)");
    } else if (type === "breast") {
      buildLegendGradient("#legend-cancer-gradient-full", breastMin, breast95, breastColor);
      const scale = d3.scaleLinear().domain([breastMin, breast95]).range([0, 300]);
      const axis = d3.axisBottom(scale).ticks(5).tickFormat(d3.format(".0f"));
      d3.select("#cancer-legend-axis-full").call(axis);
      d3.select("#cancer-legend-title-full").text("Breast Incidence (≤ 95th percentile)");
    }
  }

  // ——————————————————————————————————————————————————
  // 14.7) POLLUTION DROPDOWN (Full Dashboard)
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

      // Hide cancer legend; show PM₂.₅ legend
      d3.select("#legend-cancer-full").style("display", "none");
      d3.select("#legend-pm25-full").style("display", null);
      d3.select("#legend-income-full").style("display", "none");
      d3.select("#legend-water-full").style("display", "none");

      // Rebuild PM₂.₅ gradient & axis
      buildLegendGradient("#legend-pm25-gradient-full", 3, 15, pm25Color);
      {
        const scale = d3.scaleLinear().domain([3, 15]).range([0, 300]);
        const axis = d3.axisBottom(scale).ticks(6).tickFormat(d3.format(".1f"));
        d3.select("#pm25-legend-axis-full").call(axis);
      }
      d3.select("#pm25-legend-title-full").text("PM₂.₅ (µg/m³)");

    } else if (selected === "income") {
      // Show pollution (Income) below cancer
      pollutionContainer2.style("display", null);

      // Color pollutionPaths by Income
      pollutionPaths.transition().duration(500).attr("fill", d => {
        const v = incomeByFIPS.get(d.id);
        return v != null ? incomeColor(v) : "#eee";
      });

      // Hide cancer legend; show Income legend
      d3.select("#legend-cancer-full").style("display", "none");
      d3.select("#legend-pm25-full").style("display", "none");
      d3.select("#legend-income-full").style("display", null);
      d3.select("#legend-water-full").style("display", "none");

      // Rebuild Income gradient & axis
      buildLegendGradient("#legend-income-gradient-full", incomeMin, incomeMax, incomeColor);
      {
        const scale = d3.scaleLinear().domain([incomeMin, incomeMax]).range([0, 300]);
        const axis = d3.axisBottom(scale).ticks(5).tickFormat(d3.format(".0f"));
        d3.select("#income-legend-axis-full").call(axis);
      }
      d3.select("#income-legend-title-full").text("Median Income (2022)");

    } else if (selected === "water") {
      pollutionContainer2.style("display", null);

      pollutionPaths.transition().duration(500).attr("fill", d => {
        const v = waterByFIPS.get(d.id);
        return v != null ? waterColor(v) : "#eee";
      });

      d3.select("#legend-cancer-full").style("display", "none");
      d3.select("#legend-pm25-full").style("display", "none");
      d3.select("#legend-income-full").style("display", "none");
      d3.select("#legend-water-full").style("display", null);

      buildWaterLegend("#legend-water-gradient-full", "#water-legend-axis-full", waterColor, waterMin, water95);
      d3.select("#water-legend-title-full").text("Water Contaminant Level (≤ 95th percentile)");
    }
  }

  // ——————————————————————————————————————————————————
  // 14.8) RESET BUTTON (Full Dashboard)
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
  // 14.9) INITIAL STATE (Full Dashboard)
  // ——————————————————————————————————————————————————
  pollutionContainer2.style("display", "none");
  facilityG.style("display", "none");

  // Build initial Cancer legend
  buildLegendGradient("#legend-cancer-gradient-full", allMin, all95, cancerColor);
  {
    const scale = d3.scaleLinear().domain([allMin, all95]).range([0, 300]);
    const axis = d3.axisBottom(scale).ticks(5).tickFormat(d3.format(".0f"));
    d3.select("#cancer-legend-axis-full").call(axis);
  }
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
// ========================================================================
// Helper: Build Water Quality legend
// ========================================================================
function buildWaterLegend(gradientId, axisGroupId, color = waterColor, min = waterMin, max = water95) {
  const grad = d3.select(gradientId);
  grad.selectAll("stop").remove();
  d3.range(0, 1.001, 0.01).forEach(t => {
    const val = min + t * (max - min);
    grad.append("stop")
      .attr("offset", `${t * 100}%`)
      .attr("stop-color", color(val));
  });
  const scale = d3.scaleLinear().domain([min, max]).range([0, 300]);
  const axis = d3.axisBottom(scale).ticks(5).tickFormat(d3.format(".1f"));
  d3.select(axisGroupId).call(axis);
}