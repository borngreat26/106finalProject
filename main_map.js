// main_map.js

// —————————————————————————————————————————————————————————————————
// 1) SETUP: dimensions, projections, tooltips, and zoom behaviors
// —————————————————————————————————————————————————————————————————

const width  = 960;
const height = 600;

// 1.1) Cancer‐map SVG & group
const cancerSvg = d3.select("#cancer-svg")
  .attr("width", width)
  .attr("height", height);

const cancerG = cancerSvg.append("g").attr("class", "cancer-counties-group");

// 1.2) Pollution‐map SVG & group (for PM₂.₅)
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

// 1.5) Zoom behaviors (one for each SVG)
const cancerZoom = d3.zoom()
  .scaleExtent([1, 8])
  .on("zoom", event => {
    cancerG.attr("transform", event.transform);
  });

const pollutionZoom = d3.zoom()
  .scaleExtent([1, 8])
  .on("zoom", event => {
    pollutionG.attr("transform", event.transform);
  });

// 1.6) Attach zoom handlers to each SVG
cancerSvg.call(cancerZoom);
pollutionSvg.call(pollutionZoom);


// —————————————————————————————————————————————————————————————————
// 2) LOAD DATA IN PARALLEL:
//    2.1) US counties TopoJSON
//    2.2) incd (1).csv  (All‐Cancer incidence – skip 8 lines)
//    2.3) leukemia_incidents.csv
//    2.4) lymphoma_incidents.csv
//    2.5) thryroid_incidents.csv
//    2.6) air_pollution_data2.csv  (FIPS, PM₂.₅)
//    2.7) industry_over_10k.csv   (Facility Name, Lat, Lon)
// —————————————————————————————————————————————————————————————————

Promise.all([
  // 2.1) U.S. counties TopoJSON
  d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json"),

  // 2.2) incd (1).csv as raw text (skip first 8 lines)
  d3.text("incd (1).csv"),

  // 2.3) leukemia_incidents.csv
  d3.csv("leukemia_incidents.csv", row => ({
    county:    row.County.replace(/\(\d+\)$/, "").replace(/"/g, "").trim(),
    fips:      String(+row.FIPS).padStart(5, "0"),
    incidence: +row["Age-Adjusted Incidence Rate([rate note]) - cases per 100,000"]
  })),

  // 2.4) lymphoma_incidents.csv
  d3.csv("lymphoma_incidents.csv", row => ({
    county:    row.County.replace(/\(\d+\)$/, "").replace(/"/g, "").trim(),
    fips:      String(+row.FIPS).padStart(5, "0"),
    incidence: +row["Age-Adjusted Incidence Rate([rate note]) - cases per 100,000"]
  })),

  // 2.5) thryroid_incidents.csv
  d3.csv("thryroid_incidents.csv", row => ({
    county:    row.County.replace(/\(\d+\)$/, "").replace(/"/g, "").trim(),
    fips:      String(+row.FIPS).padStart(5, "0"),
    incidence: +row["Age-Adjusted Incidence Rate([rate note]) - cases per 100,000"]
  })),

  // 2.6) air_pollution_data2.csv (PM₂.₅ values)
  d3.csv("air_pollution_data2.csv", row => {
    // The header for PM₂.₅ is "Micrograms per cubic meter (PM2.5)(1)"
    const rawPm25 = +row["Micrograms per cubic meter (PM2.5)(1)"];
    const pm25 = isNaN(rawPm25) ? null : rawPm25;

    // FIPS might be a number; zero-pad to 5 digits
    const fipsStr = (row.FIPS || "").trim();
    const fipsCode = (fipsStr !== "" && !isNaN(+fipsStr))
      ? String(+fipsStr).padStart(5, "0")
      : null;

    return { fips: fipsCode, pm25 };
  }),

  // 2.7) industry_over_10k.csv (Facility Name, Latitude, Longitude)
  d3.csv("industry_over_10k.csv", row => ({
    facilityName: row["Facility Name"].trim(),
    latitude:     parseFloat(row.Latitude),
    longitude:    parseFloat(row.Longitude)
  }))
])
.then(([
  usTopology,
  rawCancerText,
  leukemiaData,
  lymphomaData,
  thyroidData,
  pm25Data,
  industryData      // <-- newly loaded
]) => {
  // —————————————————————————————————————————————————————————————————
  // 3) PARSE “incd (1).csv” for “All Cancer Sites” (skip first 8 lines)
  // —————————————————————————————————————————————————————————————————

  // 3.1) Drop the first 8 lines
  const cancerLines     = rawCancerText.split("\n");
  const cancerDataLines = cancerLines.slice(8).join("\n");

  // 3.2) Parse the remainder as CSV
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

  // 3.3) Build maps for “All Cancer Sites”
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

  // 3.4) Build a reverse lookup: FIPS → "County, State"
  const fipsToName = new Map();
  allCancerData.forEach(d => {
    if (d.fips) {
      fipsToName.set(d.fips, `${d.county}, ${d.state}`);
    }
  });

  // 3.5) Build an array of all county names for suggestions
  const allCountyNames = Array.from(fipsToName.values());

  // 3.6) Grab the #suggestions container
  const suggestionsDiv = d3.select("#suggestions");

  // 3.7) Set up “input” listener on the search box to display suggestions
  d3.select("#county-search").on("input", function() {
    const query = this.value.trim().toLowerCase();
    suggestionsDiv.html("");              // clear previous suggestions
    suggestionsDiv.style("display", "none");

    if (!query) return;                   // nothing to show

    // Filter county names that include the query (case-insensitive)
    const matches = allCountyNames
      .filter(name => name.toLowerCase().includes(query))
      .slice(0, 10);                      // show up to 10 matches

    if (matches.length === 0) return;

    // Populate suggestionsDiv with a <div> for each match
    matches.forEach(name => {
      suggestionsDiv
        .append("div")
        .attr("class", "suggestion-item")
        .text(name)
        .on("click", () => {
          // When clicked, fill input, clear suggestions
          d3.select("#county-search").property("value", name);
          suggestionsDiv.html("");
          suggestionsDiv.style("display", "none");
        });
    });

    // Show the suggestions container (now that it has children)
    suggestionsDiv.style("display", "block");
  });

  // 3.8) Clicking outside suggestions should clear/hide them
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
  // 4) BUILD MAPS FOR EACH CANCER SUBTYPE: leukemia, lymphoma, thyroid
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
  // 5) BUILD MAP FOR PM₂.₅ (air_pollution_data2.csv)
  // —————————————————————————————————————————————————————————————————

  const airByFIPS = new Map();
  pm25Data.forEach(d => {
    if (d.fips && d.pm25 != null) {
      airByFIPS.set(d.fips, d.pm25);
    }
  });


  // —————————————————————————————————————————————————————————————————
  // 6) CONVERT US TopoJSON → GeoJSON features (shared by both maps)
  // —————————————————————————————————————————————————————————————————

  const counties = topojson.feature(usTopology, usTopology.objects.counties).features;


  // —————————————————————————————————————————————————————————————————
  // 7) DEFINE COLOR SCALES
  //    • cancerColor  (for all/selected cancer type): domain [300,700], Reds
  //    • leukemiaColor, lymphomaColor, thyroidColor: dynamic Reds
  //    • pm25Color     (for PM₂.₅ map): fixed [3, 15], Blues
  // —————————————————————————————————————————————————————————————————

  // 7.1) All‐Sites Cancer: [300,700]
  const cancerColor = d3.scaleSequential(d3.interpolateReds)
    .domain([300, 700]);

  // 7.2) Leukemia: dynamic [leukMin, leukMax]
  const leukemiaValues = Array.from(leukemiaByFIPS.values());
  const leukMin = d3.min(leukemiaValues);
  const leukMax = d3.max(leukemiaValues);
  const leukemiaColor = d3.scaleSequential(d3.interpolateReds)
    .domain([leukMin, leukMax]);

  // 7.3) Lymphoma: dynamic [lyphMin, lyphMax]
  const lymphomaValues = Array.from(lymphomaByFIPS.values());
  const lyphMin = d3.min(lymphomaValues);
  const lyphMax = d3.max(lymphomaValues);
  const lymphomaColor = d3.scaleSequential(d3.interpolateReds)
    .domain([lyphMin, lyphMax]);

  // 7.4) Thyroid: dynamic [thyMin, thyMax]
  const thyroidValues = Array.from(thyroidByFIPS.values());
  const thyMin = d3.min(thyroidValues);
  const thyMax = d3.max(thyroidValues);
  const thyroidColor = d3.scaleSequential(d3.interpolateReds)
    .domain([thyMin, thyMax]);

  // 7.5) PM₂.₅: fixed [3, 15]
  const pm25Color = d3.scaleSequential(d3.interpolateBlues)
    .domain([3, 15]);


  // —————————————————————————————————————————————————————————————————
  // 8) DRAW THE CANCER MAP
  // —————————————————————————————————————————————————————————————————

  // 8.1) Main county paths (initially fill with all‐cancer)
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
            <strong>All-Sites Cancer:</strong> ${val != null ? val.toFixed(1) : "N/A"}
          `;
        } else if (cancerType === "leukemia") {
          const val = leukemiaByFIPS.get(fips);
          html = `
            <strong>County:</strong> ${countyName}<br/>
            <strong>Leukemia:</strong> ${val != null ? val.toFixed(1) : "N/A"}
          `;
        } else if (cancerType === "lymphoma") {
          const val = lymphomaByFIPS.get(fips);
          html = `
            <strong>County:</strong> ${countyName}<br/>
            <strong>Lymphoma:</strong> ${val != null ? val.toFixed(1) : "N/A"}
          `;
        } else if (cancerType === "thyroid") {
          const val = thyroidByFIPS.get(fips);
          html = `
            <strong>County:</strong> ${countyName}<br/>
            <strong>Thyroid:</strong> ${val != null ? val.toFixed(1) : "N/A"}
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

  // 8.2) A dedicated <g> for drawing “Industry” circles atop the cancer map
  const industryLayer = cancerG.append("g").attr("class", "industry-layer");

  function updateCancerChoropleth() {
    const cancerType = d3.select("#cancer-select").property("value");

    cancerPaths
      .transition()
      .duration(500)
      .attr("fill", d => {
        const fips = d.id;
        if (cancerType === "all") {
          const val = cancerByFIPS.get(fips);
          return val != null ? cancerColor(val) : "#eee";
        } else if (cancerType === "leukemia") {
          const val = leukemiaByFIPS.get(fips);
          return val != null ? leukemiaColor(val) : "#eee";
        } else if (cancerType === "lymphoma") {
          const val = lymphomaByFIPS.get(fips);
          return val != null ? lymphomaColor(val) : "#eee";
        } else if (cancerType === "thyroid") {
          const val = thyroidByFIPS.get(fips);
          return val != null ? thyroidColor(val) : "#eee";
        }
      });
  }

  // Initial draw (default: "all")
  updateCancerChoropleth();

  // Redraw when the cancer‐dropdown changes
  d3.select("#cancer-select").on("change", updateCancerChoropleth);


  // —————————————————————————————————————————————————————————————————
  // 9) DRAW THE PM₂.₅ MAP
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
        const val        = airByFIPS.get(fips);

        const html = `
          <strong>County:</strong> ${countyName}<br/>
          <strong>PM₂.₅:</strong> ${val != null ? val.toFixed(1) + " µg/m³" : "N/A"}
        `;

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


  // —————————————————————————————————————————————————————————————————
  // 10) DRAW LEGENDS FOR CANCER & PM₂.₅
  // —————————————————————————————————————————————————————————————————

  // 10.1) Cancer legend (300→700, Reds)
  const cancerLegendWidth  = 300;
  const cancerLegendHeight = 12;

  const defsCancer = cancerSvg.append("defs");
  const cancerGrad = defsCancer.append("linearGradient")
    .attr("id", "legend-cancer");

  d3.range(0, 1.001, 0.01).forEach(t => {
    const val = cancerColor.domain()[0] + t * (cancerColor.domain()[1] - cancerColor.domain()[0]);
    cancerGrad.append("stop")
      .attr("offset", `${t * 100}%`)
      .attr("stop-color", cancerColor(val));
  });

  const cancerLegendGroup = cancerSvg.append("g")
    .attr("transform", `translate(${width - cancerLegendWidth - 50}, 30)`);

  cancerLegendGroup.append("rect")
    .attr("width", cancerLegendWidth)
    .attr("height", cancerLegendHeight)
    .style("fill", "url(#legend-cancer)");

  const cancerLegendScale = d3.scaleLinear()
    .domain(cancerColor.domain())  // [300,700]
    .range([0, cancerLegendWidth]);

  const cancerLegendAxis = d3.axisBottom(cancerLegendScale)
    .ticks(5)
    .tickFormat(d3.format(".0f"));

  cancerLegendGroup.append("g")
    .attr("transform", `translate(0, ${cancerLegendHeight})`)
    .call(cancerLegendAxis);

  cancerLegendGroup.append("text")
    .attr("x", cancerLegendWidth / 2)
    .attr("y", -6)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .text("Cancer Incidence Rate");

  // 10.2) PM₂.₅ legend (fixed [3, 15], Blues)
  const pm25LegendWidth  = 300;
  const pm25LegendHeight = 12;

  const defsPm25 = pollutionSvg.append("defs");
  const pm25Grad = defsPm25.append("linearGradient")
    .attr("id", "legend-pm25");

  d3.range(0, 1.001, 0.01).forEach(t => {
    const val = 3 + t * (15 - 3);  // interpolation from 3→15
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
    .domain([3, 15])              // fixed [3,15]
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

  // Hide the PM₂.₅ map + legend initially
  d3.select("#pollution-container").style("display", "none");
  pm25LegendGroup.style("display", "none");


  // —————————————————————————————————————————————————————————————————
  // 11) CONTROLS BEHAVIOR
  //     • Cancer dropdown → update cancer map
  //     • Pollution dropdown → show/hide PM₂.₅ map or Industry dots
  //     • Search box → zoom both maps
  //     • Reset button → reset zoom on both maps
  // —————————————————————————————————————————————————————————————————

  // 11.1) Pollution dropdown
  d3.select("#pollution-select").on("change", () => {
    const pollutionMetric = d3.select("#pollution-select").property("value");

    if (pollutionMetric === "pm25") {
      // (1) Show the PM₂.₅ map & legend
      d3.select("#pollution-container").style("display", null);
      pm25LegendGroup.style("display", null);

      // (2) Hide any industry dots
      industryLayer.selectAll("circle").remove();

      // (3) Color the counties by PM₂.₅
      updatePollutionChoropleth();
    }
    else if (pollutionMetric === "industry") {
      // (1) Hide the PM₂.₅ map & legend
      d3.select("#pollution-container").style("display", "none");
      pm25LegendGroup.style("display", "none");

      // (2) Draw industry facility dots on top of the cancer map
      drawIndustryDots();
    }
    else {
      // “None” chosen: hide PM₂.₅ map/legend, remove industry dots
      d3.select("#pollution-container").style("display", "none");
      pm25LegendGroup.style("display", "none");
      industryLayer.selectAll("circle").remove();
    }

    // Re‐draw cancer choropleth if cancer dropdown changed
    updateCancerChoropleth();
  });

  // 11.2) Cancer dropdown
  d3.select("#cancer-select").on("change", updateCancerChoropleth);

  // 11.3) SEARCH BOX (click “Go” to zoom)
  d3.select("#search-button").on("click", () => {
    const queryRaw = d3.select("#county-search").property("value").trim().toLowerCase();
    if (!queryRaw) {
      alert("Please type a county (e.g. “Union County, Florida”).");
      return;
    }

    // Try exact match in nameToFIPS
    let matchedFips = nameToFIPS.get(queryRaw);

    // If no exact match, try substring
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

    // Find the GeoJSON feature for that FIPS
    const feature = counties.find(d => d.id === matchedFips);
    if (!feature) {
      alert("Found a FIPS but no corresponding geometry. Check your data.");
      return;
    }

    // Zoom both maps
    zoomToFeature(feature);
  });

  // 11.4) RESET BUTTON
  d3.select("#reset-button").on("click", () => {
    // Reset both zoom behaviors to identity
    cancerSvg.transition().duration(750).call(cancerZoom.transform, d3.zoomIdentity);
    pollutionSvg.transition().duration(750).call(pollutionZoom.transform, d3.zoomIdentity);

    // Also clear any industry dots if visible
    industryLayer.selectAll("circle").remove();
  });


  // —————————————————————————————————————————————————————————————————
  // 12) HELPER: zoom a GeoJSON feature on both maps
  // —————————————————————————————————————————————————————————————————

  function zoomToFeature(feature) {
    const bounds = path.bounds(feature);  // [[x0,y0],[x1,y1]]
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
  // 13) DRAW INDUSTRY FACILITY DOTS ON THE CANCER MAP
  // —————————————————————————————————————————————————————————————————

  function drawIndustryDots() {
    // First, clear any existing circles
    industryLayer.selectAll("circle").remove();

    // Filter out any invalid lat/lon rows
    const validFacilities = industryData.filter(d =>
      !isNaN(d.latitude) && !isNaN(d.longitude)
    );

    // Bind the valid facilities and append one circle per facility
    industryLayer.selectAll("circle")
      .data(validFacilities)
      .join("circle")
        .attr("cx", d => {
          const proj = projection([d.longitude, d.latitude]);
          return proj ? proj[0] : null;
        })
        .attr("cy", d => {
          const proj = projection([d.longitude, d.latitude]);
          return proj ? proj[1] : null;
        })
        .attr("r", 3)               // radius of each dot (adjust if you like)
        .attr("fill", "blue")
        .attr("stroke", "#fff")
        .attr("stroke-width", 0.5)
        .attr("opacity", 0.7)
      .on("mouseover", (event, d) => {
        const html = `
          <strong>Facility:</strong> ${d.facilityName}
        `;
        cancerTooltip
          .style("left",  (event.pageX + 10) + "px")
          .style("top",   (event.pageY) + "px")
          .style("opacity", 1)
          .html(html);
      })
      .on("mouseout", () => {
        cancerTooltip.style("opacity", 0);
      });
  }

})
.catch(err => {
  console.error("Error loading data or map:", err);
  d3.select("#map").append("p").text("Failed to load data or map files.");
});
