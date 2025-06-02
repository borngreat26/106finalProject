// main_map.js

// —————————————————————————————————————————————————————————————————
// 1) SETUP: dimensions, projections, tooltips, and zoom behaviors
// —————————————————————————————————————————————————————————————————

const width  = 960;
const height = 600;

// 1.1) Cancer‐map container & SVG
const cancerContainer = d3.select("#cancer-container")
  .style("position", "relative"); // ensure relative positioning for overlay

const cancerSvg = cancerContainer.select("#cancer-svg")
  .attr("width", width)
  .attr("height", height);

const cancerG = cancerSvg.append("g").attr("class", "cancer-counties-group");

// 1.1a) Canvas overlay (for industry dots)
const cancerCanvas = cancerContainer.append("canvas")
  .attr("id", "cancer-canvas")
  .attr("width", width)
  .attr("height", height)
  .style("position", "absolute")
  .style("top", "0px")
  .style("left", "0px")
  .style("pointer-events", "none"); // let mouse events pass through

const ctx = cancerCanvas.node().getContext("2d");

// Track whether “industry” mode is active
let industryMode = false;
// Store current zoom transform
let currentTransform = d3.zoomIdentity;

// Will hold industry facilities data after load
let facilities = [];
// Color scale for sectors (assigned after data load)
let sectorColor;

// 1.2) Pollution‐map SVG & group (for PM₂.₅, Income)
const pollutionSvg = d3.select("#pollution-svg")
  .attr("width", width)
  .attr("height", height);

const pollutionG = pollutionSvg.append("g").attr("class", "pollution-counties-group");

// 1.3) Tooltips
const cancerTooltip    = d3.select("#cancer-tooltip");
const pollutionTooltip = d3.select("#pollution-tooltip");

// 1.4) Shared projection & geoPath for both maps
const projection = d3.geoAlbersUsa()
  .translate([width / 2, height / 2])
  .scale(1200);

const path = d3.geoPath().projection(projection);


// —————————————————————————————————————————————————————————————————
// 2) PREDEFINE FUNCTIONS FOR INDUSTRY LAYER (canvas draw)
// —————————————————————————————————————————————————————————————————

// Redraw all facility dots on the canvas under currentTransform
function drawFacilities() {
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.translate(currentTransform.x, currentTransform.y);
  ctx.scale(currentTransform.k, currentTransform.k);

  facilities.forEach(d => {
    const proj = projection([d.longitude, d.latitude]);
    if (!proj) return;
    const [cx, cy] = proj;
    ctx.fillStyle = sectorColor(d.sector);
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
    ctx.fill();
  });

  ctx.restore();
}

// Enter industry mode: enable canvas drawing + redraw
function enterIndustryMode() {
  industryMode = true;
  drawFacilities();
}

// Cancel industry mode: clear canvas
function cancelIndustryMode() {
  if (industryMode) {
    industryMode = false;
    ctx.clearRect(0, 0, width, height);
  }
}


// —————————————————————————————————————————————————————————————————
// 3) SETUP ZOOM BEHAVIORS (one for each SVG)
// —————————————————————————————————————————————————————————————————

// Cancer zoom now also redraws canvas when in industryMode
const cancerZoom = d3.zoom()
  .scaleExtent([1, 8])
  .on("zoom", event => {
    currentTransform = event.transform;
    cancerG.attr("transform", event.transform);
    if (industryMode) {
      drawFacilities();
    }
  });

const pollutionZoom = d3.zoom()
  .scaleExtent([1, 8])
  .on("zoom", event => {
    pollutionG.attr("transform", event.transform);
  });

// Attach zoom handlers
cancerSvg.call(cancerZoom);
pollutionSvg.call(pollutionZoom);


// —————————————————————————————————————————————————————————————————
// 4) LOAD DATA IN PARALLEL:
//    4.1) US counties TopoJSON
//    4.2) incd (1).csv  (All‐Cancer incidence – skip first 8 lines)
//    4.3) leukemia_incidents.csv
//    4.4) lymphoma_incidents.csv
//    4.5) thryroid_incidents.csv
//    4.6) air_pollution_data2.csv  (FIPS, PM₂.₅)
//    4.7) industry_over_10k.csv   (Facility Name, Lat, Lon, Industry Sector)
//    4.8) County_Median_Income_2022.csv (FIPS, Median_Income)
// —————————————————————————————————————————————————————————————————

Promise.all([
  d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json"),
  d3.text("incd (1).csv"),
  d3.csv("leukemia_incidents.csv", row => ({
    county:    row.County.replace(/\(\d+\)$/, "").replace(/"/g, "").trim(),
    fips:      String(+row.FIPS).padStart(5, "0"),
    incidence: +row["Age-Adjusted Incidence Rate([rate note]) - cases per 100,000"]
  })),
  d3.csv("lymphoma_incidents.csv", row => ({
    county:    row.County.replace(/\(\d+\)$/, "").replace(/"/g, "").trim(),
    fips:      String(+row.FIPS).padStart(5, "0"),
    incidence: +row["Age-Adjusted Incidence Rate([rate note]) - cases per 100,000"]
  })),
  d3.csv("thryroid_incidents.csv", row => ({
    county:    row.County.replace(/\(\d+\)$/, "").replace(/"/g, "").trim(),
    fips:      String(+row.FIPS).padStart(5, "0"),
    incidence: +row["Age-Adjusted Incidence Rate([rate note]) - cases per 100,000"]
  })),
  d3.csv("air_pollution_data2.csv", row => {
    const rawPm25 = +row["Micrograms per cubic meter (PM2.5)(1)"];
    const pm25 = isNaN(rawPm25) ? null : rawPm25;
    const fipsStr = (row.FIPS || "").trim();
    const fipsCode = (fipsStr !== "" && !isNaN(+fipsStr))
      ? String(+fipsStr).padStart(5, "0")
      : null;
    return { fips: fipsCode, pm25 };
  }),
  d3.csv("industry_over_10k.csv", row => ({
    facilityName: row["Facility Name"].trim(),
    latitude:     parseFloat(row.Latitude),
    longitude:    parseFloat(row.Longitude),
    sector:       row["Industry Sector"].trim()
  })),
  d3.csv("County_Median_Income_2022.csv", row => {
    const fipsStr = (row.FIPS || "").trim();
    const fipsCode = (fipsStr !== "" && !isNaN(+fipsStr))
      ? String(+fipsStr).padStart(5, "0")
      : null;
    const incomeRaw = +row["Median_Income_2022"];
    const medianIncome = isNaN(incomeRaw) ? null : incomeRaw;
    return { fips: fipsCode, medianIncome };
  })
])
.then(([
  usTopology,
  rawCancerText,
  leukemiaData,
  lymphomaData,
  thyroidData,
  pm25Data,
  industryData,
  incomeData
]) => {
  // —————————————————————————————————————————————————————————————————
  // 5) PARSE “incd (1).csv” for “All Cancer Sites” (skip first 8 lines)
  // —————————————————————————————————————————————————————————————————

  const cancerLines     = rawCancerText.split("\n");
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
      fips:      fipsString,
      county:    rawCounty,
      state:     stateName,
      incidence
    };
  });

  const cancerByFIPS = new Map();
  const nameToFIPS   = new Map();
  allCancerData.forEach(d => {
    if (d.fips && d.incidence != null) {
      cancerByFIPS.set(d.fips, d.incidence);
      const key = `${d.county}, ${d.state}`.toLowerCase();
      nameToFIPS.set(key, d.fips);
      const noSuffix = key.replace(/ county$/, "");
      if (noSuffix !== key) nameToFIPS.set(noSuffix, d.fips);
    }
  });

  const fipsToName = new Map();
  allCancerData.forEach(d => {
    if (d.fips) {
      fipsToName.set(d.fips, `${d.county}, ${d.state}`);
    }
  });

  const allCountyNames = Array.from(fipsToName.values());

  // 5.6) Suggestions container
  const suggestionsDiv = d3.select("#suggestions");

  // 5.7) SEARCH BOX: show suggestions, handle clicks & Enter key
  d3.select("#county-search")
    .on("input", function() {
      const query = this.value.trim().toLowerCase();
      suggestionsDiv.html("");
      suggestionsDiv.style("display", "none");
      if (!query) return;

      const matches = allCountyNames
        .filter(name => name.toLowerCase().includes(query))
        .slice(0, 10);
      if (matches.length === 0) return;

      matches.forEach(name => {
        suggestionsDiv
          .append("div")
          .attr("class", "suggestion-item")
          .text(name)
          .on("click", () => {
            // Fill input, clear suggestions, then trigger search
            d3.select("#county-search").property("value", name);
            suggestionsDiv.html("");
            suggestionsDiv.style("display", "none");
            d3.select("#search-button").node().click();
          });
      });

      suggestionsDiv.style("display", "block");
    })
    .on("keydown", function(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        d3.select("#search-button").node().click();
      }
    });

  d3.select("body").on("click", function(event) {
    if (
      !event.target.closest("#county-search") &&
      !event.target.closest("#suggestions")
    ) {
      suggestionsDiv.html("");
      suggestionsDiv.style("display", "none");
    }
  });


  // —————————————————————————————————————————————————————————————————
  // 6) BUILD MAPS FOR EACH CANCER SUBTYPE: leukemia, lymphoma, thyroid
  // —————————————————————————————————————————————————————————————————

  const leukemiaByFIPS = new Map();
  leukemiaData.forEach(d => {
    if (d.fips && !isNaN(d.incidence)) {
      leukemiaByFIPS.set(d.fips, d.incidence);
      const key = d.county.toLowerCase();
      nameToFIPS.set(key, d.fips);
      const noSuffix = key.replace(/ county$/, "");
      if (noSuffix !== key) nameToFIPS.set(noSuffix, d.fips);
    }
  });

  const lymphomaByFIPS = new Map();
  lymphomaData.forEach(d => {
    if (d.fips && !isNaN(d.incidence)) {
      lymphomaByFIPS.set(d.fips, d.incidence);
      const key = d.county.toLowerCase();
      nameToFIPS.set(key, d.fips);
      const noSuffix = key.replace(/ county$/, "");
      if (noSuffix !== key) nameToFIPS.set(noSuffix, d.fips);
    }
  });

  const thyroidByFIPS = new Map();
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
  // 7) BUILD MAP FOR PM₂.₅ (air_pollution_data2.csv)
  // —————————————————————————————————————————————————————————————————

  const airByFIPS = new Map();
  pm25Data.forEach(d => {
    if (d.fips && d.pm25 != null) {
      airByFIPS.set(d.fips, d.pm25);
    }
  });

  const incomeByFIPS = new Map();
  incomeData.forEach(d => {
    if (d.fips && d.medianIncome != null) {
      incomeByFIPS.set(d.fips, d.medianIncome);
    }
  });


  // —————————————————————————————————————————————————————————————————
  // 8) CONVERT US TopoJSON → GeoJSON features (shared by both maps)
  // —————————————————————————————————————————————————————————————————

  const counties = topojson.feature(usTopology, usTopology.objects.counties).features;


  // —————————————————————————————————————————————————————————————————
  // 9) DEFINE COLOR SCALES (using 95th percentile for dynamic ranges)
  // —————————————————————————————————————————————————————————————————

  // 9.1) All‐Sites Cancer: dynamic [min, 95th percentile], clamp above
  const allCancerValues = Array.from(cancerByFIPS.values()).filter(v => !isNaN(v));
  const allMin = d3.min(allCancerValues);
  const allSorted = allCancerValues.slice().sort(d3.ascending);
  const all95 = d3.quantile(allSorted, 0.95);
  const cancerColor = d3.scaleSequential(d3.interpolateReds)
    .domain([allMin, all95])
    .clamp(true);

  // 9.2) Leukemia: domain [min, 95th percentile], clamp above
  const leukemiaValuesArr = Array.from(leukemiaByFIPS.values()).filter(v => !isNaN(v));
  const leukMin = d3.min(leukemiaValuesArr);
  const leukSorted = leukemiaValuesArr.slice().sort(d3.ascending);
  const leuk95 = d3.quantile(leukSorted, 0.95);
  const leukemiaColor = d3.scaleSequential(d3.interpolateReds)
    .domain([leukMin, leuk95])
    .clamp(true);

  // 9.3) Lymphoma: domain [min, 95th percentile], clamp above
  const lymphomaValuesArr = Array.from(lymphomaByFIPS.values()).filter(v => !isNaN(v));
  const lyphMin = d3.min(lymphomaValuesArr);
  const lyphSorted = lymphomaValuesArr.slice().sort(d3.ascending);
  const lyph95 = d3.quantile(lyphSorted, 0.95);
  const lymphomaColor = d3.scaleSequential(d3.interpolateReds)
    .domain([lyphMin, lyph95])
    .clamp(true);

  // 9.4) Thyroid: domain [min, 95th percentile], clamp above
  const thyroidValuesArr = Array.from(thyroidByFIPS.values()).filter(v => !isNaN(v));
  const thyMin = d3.min(thyroidValuesArr);
  const thySorted = thyroidValuesArr.slice().sort(d3.ascending);
  const thy95 = d3.quantile(thySorted, 0.95);
  const thyroidColor = d3.scaleSequential(d3.interpolateReds)
    .domain([thyMin, thy95])
    .clamp(true);

  // 9.5) PM₂.₅: fixed [3, 15]
  const pm25Color = d3.scaleSequential(d3.interpolateBlues)
    .domain([3, 15]);

  // 9.6) County Median Income (dynamic, clamp to 120,000)
  const incomeValuesArr = Array.from(incomeByFIPS.values()).filter(v => !isNaN(v));
  const incomeMin = d3.min(incomeValuesArr);
  const incomeMax = d3.max(incomeValuesArr);
  const incomeColor = d3.scaleSequential(v => d3.interpolateGreys(1 - v))
    .domain([incomeMin, 120000])
    .clamp(true);


  // 9.7) Precompute facilities (for canvas) once, extract unique sectors
  facilities = industryData.filter(d =>
    !isNaN(d.latitude) && !isNaN(d.longitude)
  );

  // Use a categorical palette without reds/oranges/white → d3.schemeSet2
  const uniqueSectors = Array.from(new Set(facilities.map(d => d.sector)));
  sectorColor = d3.scaleOrdinal(d3.schemeSet2).domain(uniqueSectors);


  // —————————————————————————————————————————————————————————————————
  // 10) DRAW THE CANCER MAP
  // —————————————————————————————————————————————————————————————————

  const cancerPaths = cancerG.selectAll("path")
    .data(counties)
    .join("path")
      .attr("d", path)
      .attr("stroke", "#999")
      .attr("stroke-width", 0.2)
      .attr("fill", "#eee")
      .on("mouseover", (event, d) => {
        const fips       = d.id;
        const countyName = fipsToName.get(fips) || "Unknown County";
        const cancerType = d3.select("#cancer-select").property("value");
        let html = "";

        if (cancerType === "all") {
          const val = cancerByFIPS.get(fips);
          html = `
            <strong>County:</strong> ${countyName}<br/>
            <strong>All-Sites Cancer:</strong> ${val != null ? val.toFixed(1) : "N/A"}<br/>
            ${val > all95 ? `(>95th percentile)` : ""}
          `;
        } else if (cancerType === "leukemia") {
          let val = leukemiaByFIPS.get(fips);
          html = `
            <strong>County:</strong> ${countyName}<br/>
            <strong>Leukemia:</strong> ${val != null ? val.toFixed(1) : "N/A"}<br/>
            ${val > leuk95 ? `(>95th percentile)` : ""}
          `;
        } else if (cancerType === "lymphoma") {
          let val = lymphomaByFIPS.get(fips);
          html = `
            <strong>County:</strong> ${countyName}<br/>
            <strong>Lymphoma:</strong> ${val != null ? val.toFixed(1) : "N/A"}<br/>
            ${val > lyph95 ? `(>95th percentile)` : ""}
          `;
        } else if (cancerType === "thyroid") {
          let val = thyroidByFIPS.get(fips);
          html = `
            <strong>County:</strong> ${countyName}<br/>
            <strong>Thyroid:</strong> ${val != null ? val.toFixed(1) : "N/A"}<br/>
            ${val > thy95 ? `(>95th percentile)` : ""}
          `;
        }

        cancerTooltip
          .style("left",  (event.pageX + 10) + "px")
          .style("top",   (event.pageY) + "px")
          .style("opacity", 1)
          .html(html);
      })
      .on("mouseout", () => {
        cancerTooltip.style("opacity", 0);
      });

  const industryLayer = cancerG.append("g").attr("class", "industry-layer");


  // —————————————————————————————————————————————————————————————————
  // 11) CANCER LEGEND SETUP (dynamically updated)
  // —————————————————————————————————————————————————————————————————

  const cancerLegendWidth  = 300;
  const cancerLegendHeight = 12;

  const defsCancer = cancerSvg.append("defs");
  const cancerGrad = defsCancer.append("linearGradient")
    .attr("id", "legend-cancer");

  const cancerLegendGroup = cancerSvg.append("g")
    .attr("transform", `translate(${width - cancerLegendWidth - 50}, 30)`);

  cancerLegendGroup.append("rect")
    .attr("width", cancerLegendWidth)
    .attr("height", cancerLegendHeight)
    .style("fill", "url(#legend-cancer)");

  let cancerLegendScale = d3.scaleLinear()
    .range([0, cancerLegendWidth]);

  let cancerLegendAxis = d3.axisBottom(cancerLegendScale)
    .ticks(5)
    .tickFormat(d3.format(".0f"));

  cancerLegendGroup.append("g")
    .attr("class", "cancer-legend-axis")
    .attr("transform", `translate(0, ${cancerLegendHeight})`);

  cancerLegendGroup.append("text")
    .attr("class", "cancer-legend-title")
    .attr("x", cancerLegendWidth / 2)
    .attr("y", -6)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .text("Cancer Incidence Rate");


  // —————————————————————————————————————————————————————————————————
  // 12) DRAW THE PM₂.₅ & INCOME MAPS
  // —————————————————————————————————————————————————————————————————

  const pollutionPaths = pollutionG.selectAll("path")
    .data(counties)
    .join("path")
      .attr("d", path)
      .attr("stroke", "#999")
      .attr("stroke-width", 0.2)
      .attr("fill", "#eee")
      .on("mouseover", (event, d) => {
        const fips       = d.id;
        const countyName = fipsToName.get(fips) || "Unknown County";
        const pollutionMetric = d3.select("#pollution-select").property("value");

        let html = "";
        if (pollutionMetric === "pm25") {
          const val = airByFIPS.get(fips);
          html = `
            <strong>County:</strong> ${countyName}<br/>
            <strong>PM₂.₅:</strong> ${val != null ? val.toFixed(1) + " µg/m³" : "N/A"}
          `;
        } else if (pollutionMetric === "income") {
          const val = incomeByFIPS.get(fips);
          html = `
            <strong>County:</strong> ${countyName}<br/>
            <strong>Median Income:</strong> ${val != null ? "$" + d3.format(",")(val) : "N/A"}
          `;
        }

        pollutionTooltip
          .style("left",  (event.pageX + 10) + "px")
          .style("top",   (event.pageY) + "px")
          .style("opacity", 1)
          .html(html);
      })
      .on("mouseout", () => {
        pollutionTooltip.style("opacity", 0);
      });

  function updatePollutionChoropleth() {
    pollutionPaths
      .transition()
      .duration(500)
      .attr("fill", d => {
        const fips = d.id;
        const val  = airByFIPS.get(fips);
        return val != null ? pm25Color(val) : "#eee";
      });
  }

  function updateIncomeChoropleth() {
    pollutionPaths
      .transition()
      .duration(500)
      .attr("fill", d => {
        const fips = d.id;
        const val  = incomeByFIPS.get(fips);
        return val != null ? incomeColor(val) : "#eee";
      });
  }


  // —————————————————————————————————————————————————————————————————
  // 13) DRAW LEGENDS FOR PM₂.₅ & INCOME
  // —————————————————————————————————————————————————————————————————

  const pm25LegendWidth  = 300;
  const pm25LegendHeight = 12;

  const defsPm25 = pollutionSvg.append("defs");
  const pm25Grad = defsPm25.append("linearGradient")
    .attr("id", "legend-pm25");

  d3.range(0, 1.001, 0.01).forEach(t => {
    const val = 3 + t * (15 - 3);
    pm25Grad.append("stop")
      .attr("offset", `${t * 100}%`)
      .attr("stop-color", pm25Color(val));
  });

  const pm25LegendGroup = pollutionSvg.append("g")
    .attr("transform", `translate(${width - pm25LegendWidth - 50}, 30)`);

  pm25LegendGroup.append("rect")
    .attr("width", pm25LegendWidth)
    .attr("height", pm25LegendHeight)
    .style("fill", "url(#legend-pm25)");

  const pm25LegendScale = d3.scaleLinear()
    .domain([3, 15])
    .range([0, pm25LegendWidth]);

  const pm25LegendAxis = d3.axisBottom(pm25LegendScale)
    .ticks(6)
    .tickFormat(d3.format(".1f"));

  pm25LegendGroup.append("g")
    .attr("transform", `translate(0, ${pm25LegendHeight})`)
    .call(pm25LegendAxis);

  pm25LegendGroup.append("text")
    .attr("x", pm25LegendWidth / 2)
    .attr("y", -6)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .text("PM₂.₅ (µg/m³)");


  const incomeLegendWidth  = 300;
  const incomeLegendHeight = 12;

  const defsIncome = pollutionSvg.append("defs");
  const incomeGrad = defsIncome.append("linearGradient")
    .attr("id", "legend-income");

  d3.range(0, 1.001, 0.01).forEach(t => {
    const val = incomeMin + t * (incomeMax - incomeMin);
    incomeGrad.append("stop")
      .attr("offset", `${t * 100}%`)
      .attr("stop-color", incomeColor(val));
  });

  const incomeLegendGroup = pollutionSvg.append("g")
    .attr("transform", `translate(${width - incomeLegendWidth - 50}, 50)`);

  incomeLegendGroup.append("rect")
    .attr("width", incomeLegendWidth)
    .attr("height", incomeLegendHeight)
    .style("fill", "url(#legend-income)");

  const incomeLegendScale = d3.scaleLinear()
    .domain([incomeMin, incomeMax])
    .range([0, incomeLegendWidth]);

  const incomeLegendAxis = d3.axisBottom(incomeLegendScale)
    .ticks(5)
    .tickFormat(d3.format(".0f"));

  incomeLegendGroup.append("g")
    .attr("transform", `translate(0, ${incomeLegendHeight})`)
    .call(incomeLegendAxis);

  incomeLegendGroup.append("text")
    .attr("x", incomeLegendWidth / 2)
    .attr("y", -6)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .text("Median Income (2022)");

  d3.select("#pollution-container").style("display", "none");
  pm25LegendGroup.style("display", "none");
  incomeLegendGroup.style("display", "none");


  // —————————————————————————————————————————————————————————————————
  // 14) CONTROLS BEHAVIOR
  // —————————————————————————————————————————————————————————————————

  d3.select("#pollution-select").on("change", () => {
    const pollutionMetric = d3.select("#pollution-select").property("value");

    if (pollutionMetric === "pm25") {
      d3.select("#pollution-container").style("display", null);
      pm25LegendGroup.style("display", null);
      incomeLegendGroup.style("display", "none");
      cancelIndustryMode();

      updatePollutionChoropleth();
    }
    else if (pollutionMetric === "income") {
      d3.select("#pollution-container").style("display", null);
      pm25LegendGroup.style("display", "none");
      incomeLegendGroup.style("display", null);
      cancelIndustryMode();

      updateIncomeChoropleth();
    }
    else if (pollutionMetric === "industry") {
      d3.select("#pollution-container").style("display", "none");
      pm25LegendGroup.style("display", "none");
      incomeLegendGroup.style("display", "none");

      enterIndustryMode();
    }
    else {
      d3.select("#pollution-container").style("display", "none");
      pm25LegendGroup.style("display", "none");
      incomeLegendGroup.style("display", "none");
      cancelIndustryMode();
    }

    updateCancerChoropleth();
  });

  // 14.2) Cancer dropdown: update choropleth & legend
  d3.select("#cancer-select").on("change", () => {
    updateCancerChoropleth();
    updateCancerLegend();
  });

  // 14.3) SEARCH BUTTON: zoom & highlight outline
  d3.select("#search-button").on("click", () => {
    const queryRaw = d3.select("#county-search").property("value").trim().toLowerCase();
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
        alert("County not found—make sure you typed something like “Union County, Florida.”");
        return;
      }
    }

    // Remove any existing highlight
    cancerPaths
      .attr("stroke", "#999")
      .attr("stroke-width", 0.2);

    // Highlight the matched county
    cancerPaths
      .filter(d => d.id === matchedFips)
      .attr("stroke", "black")
      .attr("stroke-width", 0.75);

    // Find the GeoJSON feature for that FIPS
    const feature = counties.find(d => d.id === matchedFips);
    if (!feature) {
      alert("Found a FIPS but no corresponding geometry. Check your data.");
      return;
    }

    // Zoom both maps
    zoomToFeature(feature);
  });

  // 14.4) RESET BUTTON
  d3.select("#reset-button").on("click", () => {
    // Reset zoom transforms
    cancerSvg.transition().duration(750).call(cancerZoom.transform, d3.zoomIdentity);
    pollutionSvg.transition().duration(750).call(pollutionZoom.transform, d3.zoomIdentity);

    // Remove any existing highlight
    cancerPaths
      .attr("stroke", "#999")
      .attr("stroke-width", 0.2);

    // Also clear industry overlay if visible
    cancelIndustryMode();
  });


  // —————————————————————————————————————————————————————————————————
  // 15) HELPER: zoom a GeoJSON feature on both maps
  // —————————————————————————————————————————————————————————————————

  function zoomToFeature(feature) {
    const bounds = path.bounds(feature);
    const dx = bounds[1][0] - bounds[0][0];
    const dy = bounds[1][1] - bounds[0][1];
    const x  = (bounds[0][0] + bounds[1][0]) / 2;
    const y  = (bounds[0][1] + bounds[1][1]) / 2;

    // Scale so that county fits within 90% of viewport
    const scaleFactor = Math.max(
      1,
      Math.min(8, 0.9 / Math.max(dx / width, dy / height))
    );

    const translateX = width  / 2 - scaleFactor * x;
    const translateY = height / 2 - scaleFactor * y;

    const transform = d3.zoomIdentity
      .translate(translateX, translateY)
      .scale(scaleFactor);

    cancerSvg.transition().duration(750).call(cancerZoom.transform, transform);
    pollutionSvg.transition().duration(750).call(pollutionZoom.transform, transform);
  }


  // —————————————————————————————————————————————————————————————————
  // 16) UPDATE CANCER CHOROPLETH & LEGEND
  // —————————————————————————————————————————————————————————————————

  function updateCancerChoropleth() {
    const cancerType = d3.select("#cancer-select").property("value");

    cancerPaths
      .transition()
      .duration(500)
      .attr("fill", d => {
        const fips = d.id;
        if (cancerType === "all") {
          const val = cancerByFIPS.get(fips);
          return val != null ? cancerColor(val) : "lightblue";
        } else if (cancerType === "leukemia") {
          const val = leukemiaByFIPS.get(fips);
          return val != null ? leukemiaColor(val) : "lightblue";
        } else if (cancerType === "lymphoma") {
          const val = lymphomaByFIPS.get(fips);
          return val != null ? lymphomaColor(val) : "lightblue";
        } else if (cancerType === "thyroid") {
          const val = thyroidByFIPS.get(fips);
          return val != null ? thyroidColor(val) : "lightblue";
        }
      });
  }

  function updateCancerLegend() {
    const cancerType = d3.select("#cancer-select").property("value");
    let scale, domainMin, domainMax, titleText;

    if (cancerType === "all") {
      scale = cancerColor;
      domainMin = allMin;
      domainMax = all95;
      titleText = "All-Sites Cancer Incidence (≤ 95th percentile)";
    } else if (cancerType === "leukemia") {
      scale = leukemiaColor;
      domainMin = leukMin;
      domainMax = leuk95;
      titleText = "Leukemia Incidence (≤ 95th percentile)";
    } else if (cancerType === "lymphoma") {
      scale = lymphomaColor;
      domainMin = lyphMin;
      domainMax = lyph95;
      titleText = "Lymphoma Incidence (≤ 95th percentile)";
    } else if (cancerType === "thyroid") {
      scale = thyroidColor;
      domainMin = thyMin;
      domainMax = thy95;
      titleText = "Thyroid Incidence (≤ 95th percentile)";
    }

    // Rebuild gradient stops
    cancerGrad.selectAll("stop").remove();
    d3.range(0, 1.001, 0.01).forEach(t => {
      const val = domainMin + t * (domainMax - domainMin);
      cancerGrad.append("stop")
        .attr("offset", `${t * 100}%`)
        .attr("stop-color", scale(val));
    });

    // Update legend scale domain & axis
    cancerLegendScale = d3.scaleLinear()
      .domain([domainMin, domainMax])
      .range([0, cancerLegendWidth]);

    cancerLegendAxis = d3.axisBottom(cancerLegendScale)
      .ticks(5)
      .tickFormat(d3.format(".0f"));

    cancerLegendGroup.select(".cancer-legend-axis")
      .transition()
      .duration(500)
      .call(cancerLegendAxis);

    // Update legend title
    cancerLegendGroup.select(".cancer-legend-title")
      .text(titleText);
  }

  // Initial draw (default: "all")
  updateCancerChoropleth();
  updateCancerLegend();

})
.catch(err => {
  console.error("Error loading data or map:", err);
  d3.select("#map").append("p").text("Failed to load data or map files.");
});