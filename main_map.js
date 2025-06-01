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

// 1.2) Pollution‐map SVG & group
const pollutionSvg = d3.select("#pollution-svg")
  .attr("width", width)
  .attr("height", height);

const pollutionG = pollutionSvg.append("g").attr("class", "pollution-counties-group");

// 1.3) Tooltips
const cancerTooltip = d3.select("#cancer-tooltip");
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
//    • US counties TopoJSON
//    • incd (1).csv  (All‐Cancer incidence)
//    • leukemia_incidents.csv
//    • lymphoma_incidents.csv
//    • thryroid_incidents.csv
//    • air_pollution_data.csv  (APS table)
// —————————————————————————————————————————————————————————————————

Promise.all([
  // 2.1) U.S. counties TopoJSON
  d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json"),

  // 2.2) incd (1).csv as raw text (skip 8 header lines)
  d3.text("incd (1).csv"),

  // 2.3) leukemia_incidents.csv (direct CSV, no skip)
  d3.csv("leukemia_incidents.csv", row => {
    return {
      county: row.County.replace(/\(\d+\)$/, "").replace(/"/g, "").trim(),
      fips:   String(+row.FIPS).padStart(5, "0"),
      incidence: +row["Age-Adjusted Incidence Rate([rate note]) - cases per 100,000"]
    };
  }),

  // 2.4) lymphoma_incidents.csv
  d3.csv("lymphoma_incidents.csv", row => {
    return {
      county: row.County.replace(/\(\d+\)$/, "").replace(/"/g, "").trim(),
      fips:   String(+row.FIPS).padStart(5, "0"),
      incidence: +row["Age-Adjusted Incidence Rate([rate note]) - cases per 100,000"]
    };
  }),

  // 2.5) thryroid_incidents.csv  (note: file name is “thryroid_incidents.csv”)
  d3.csv("thryroid_incidents.csv", row => {
    return {
      county: row.County.replace(/\(\d+\)$/, "").replace(/"/g, "").trim(),
      fips:   String(+row.FIPS).padStart(5, "0"),
      incidence: +row["Age-Adjusted Incidence Rate([rate note]) - cases per 100,000"]
    };
  }),

  // 2.6) air_pollution_data.csv  (columns: County, State, Air_Pollution_Score)
  d3.csv("air_pollution_data.csv", row => ({
    county: (row.County || "").trim(),
    state:  (row.State  || "").trim(),
    aps:    +row.Air_Pollution_Score
  }))
])
.then(([
  usTopology,
  rawCancerText,
  leukemiaData,
  lymphomaData,
  thyroidData,
  airPollutionData
]) => {
  // —————————————————————————————————————————————————————————————————
  // 3) PARSE “incd (1).csv” for “All Cancer Sites” (skip 8 header lines)
  // —————————————————————————————————————————————————————————————————

  // 3.1) Drop the first 8 lines of rawCancerText
  const cancerLines     = rawCancerText.split("\n");
  const cancerDataLines = cancerLines.slice(8).join("\n");

  // 3.2) Now parse the CSV with d3.csvParse
  const allCancerData = d3.csvParse(cancerDataLines, row => {
    // Clean the “County” column of trailing “(6)” footnotes, remove quotes
    const rawCounty = row.County || "";
    const cleanedCounty = rawCounty.replace(/\(\d+\)$/, "").replace(/"/g, "").trim();

    // Pad FIPS to 5 digits
    const fipsStr = (row.FIPS || "").trim();
    const fipsString = (fipsStr !== "" && !isNaN(+fipsStr))
      ? String(+fipsStr).padStart(5, "0")
      : null;

    // Pull out the age‐adjusted incidence column
    const rawInc = +row["Age-Adjusted Incidence Rate([rate note]) - cases per 100,000"];
    const incidence = isNaN(rawInc) ? null : rawInc;

    // Grab the “State” column (full state name)
    const stateName = (row.State || "").trim();

    return {
      fips:       fipsString,
      county:     cleanedCounty,
      state:      stateName,
      incidence
    };
  });

  // 3.3) Build lookup Maps for “All Cancer”:
  //      • cancerByFIPS: Map<"01001" → 300.2> (all sites)
  //      • nameToFIPS  : Map<"union county, florida" → "12125">
  const cancerByFIPS = new Map();
  const nameToFIPS   = new Map();

  allCancerData.forEach(d => {
    if (d.fips && d.incidence != null) {
      cancerByFIPS.set(d.fips, d.incidence);
      const key = `${d.county}, ${d.state}`.toLowerCase();
      nameToFIPS.set(key, d.fips);
      // Also store version without trailing “ County”
      const noSuffix = key.replace(/ county$/, "");
      if (noSuffix !== key) {
        nameToFIPS.set(noSuffix, d.fips);
      }
    }
  });


  // —————————————————————————————————————————————————————————————————
  // 4) BUILD LOOKUPS FOR EACH CANCER SUB‐TYPE (leukemia, lymphoma, thyroid)
  // —————————————————————————————————————————————————————————————————

  const leukemiaByFIPS = new Map();
  leukemiaData.forEach(d => {
    if (d.fips && !isNaN(d.incidence)) {
      leukemiaByFIPS.set(d.fips, d.incidence);
      // Also ensure nameToFIPS knows about counties from this subtype
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
  // 5) BUILD LOOKUP FOR APS (Air Pollution Score)
  // —————————————————————————————————————————————————————————————————

  // Each row: { county: "Ada County", state: "ID", aps: 0.38… }
  // We already built nameToFIPS above, so:
  const airByFIPS = new Map();
  airPollutionData.forEach(d => {
    const lookupKey = `${d.county}, ${d.state}`.toLowerCase();
    const fipsCode  = nameToFIPS.get(lookupKey);
    if (fipsCode != null && !isNaN(d.aps)) {
      airByFIPS.set(fipsCode, d.aps);
    }
  });


  // —————————————————————————————————————————————————————————————————
  // 6) CONVERT US TopoJSON → GeoJSON Features (used by both maps)
  // —————————————————————————————————————————————————————————————————

  const counties = topojson.feature(usTopology, usTopology.objects.counties).features;


  // —————————————————————————————————————————————————————————————————
  // 7) DEFINE COLOR SCALES
  //    • cancerColor  (for all/selected cancer type): domain [300,700], Reds
  //    • leukemiaColor, lymphomaColor, thyroidColor: same color‐scheme, domain [X,Y] ?
  //      For simplicity, we’ll use [0, maxIncidence] for each subtype, but you can adjust.
  //    • apsColor      (for Air Pollution Score): domain [0.2,1.2], Blues
  // —————————————————————————————————————————————————————————————————

  // 7.1) All Cancer (All Sites) domain (300→700)
  const cancerColor = d3.scaleSequential(d3.interpolateReds)
    .domain([300, 700]);

  // 7.2) Leukemia incidence (find its own min/max)
  const leukemiaValues = Array.from(leukemiaByFIPS.values());
  const leukMin = d3.min(leukemiaValues);
  const leukMax = d3.max(leukemiaValues);
  const leukemiaColor = d3.scaleSequential(d3.interpolateReds)
    .domain([leukMin, leukMax]);

  // 7.3) Lymphoma incidence
  const lymphomaValues = Array.from(lymphomaByFIPS.values());
  const lyphMin = d3.min(lymphomaValues);
  const lyphMax = d3.max(lymphomaValues);
  const lymphomaColor = d3.scaleSequential(d3.interpolateReds)
    .domain([lyphMin, lyphMax]);

  // 7.4) Thyroid incidence
  const thyroidValues = Array.from(thyroidByFIPS.values());
  const thyMin = d3.min(thyroidValues);
  const thyMax = d3.max(thyroidValues);
  const thyroidColor = d3.scaleSequential(d3.interpolateReds)
    .domain([thyMin, thyMax]);

  // 7.5) APS (Air Pollution Score) domain (0.2 → 1.2)
  const apsColor = d3.scaleSequential(d3.interpolateBlues)
    .domain([0.2, 1.2]);


  // —————————————————————————————————————————————————————————————————
  // 8) DRAW THE CANCER MAP
  // —————————————————————————————————————————————————————————————————

  // 8.1) Bind counties to <path> inside cancerG
  const cancerPaths = cancerG.selectAll("path")
    .data(counties)
    .join("path")
      .attr("d", path)
      .attr("stroke", "#999")
      .attr("stroke-width", 0.2)
      .attr("fill", "#eee") // default: no data
      .on("mouseover", (event, d) => {
        const fips = d.id;
        // Determine which cancerType is selected:
        const cancerType = d3.select("#cancer-select").property("value");
        let html;

        if (cancerType === "all") {
          const val = cancerByFIPS.get(fips);
          html = `
            <strong>FIPS:</strong> ${fips}<br/>
            <strong>All‐Sites Cancer:</strong> ${val != null ? val.toFixed(1) : "N/A"}
          `;
        } else if (cancerType === "leukemia") {
          const val = leukemiaByFIPS.get(fips);
          html = `
            <strong>FIPS:</strong> ${fips}<br/>
            <strong>Leukemia:</strong> ${val != null ? val.toFixed(1) : "N/A"}
          `;
        } else if (cancerType === "lymphoma") {
          const val = lymphomaByFIPS.get(fips);
          html = `
            <strong>FIPS:</strong> ${fips}<br/>
            <strong>Lymphoma:</strong> ${val != null ? val.toFixed(1) : "N/A"}
          `;
        } else if (cancerType === "thyroid") {
          const val = thyroidByFIPS.get(fips);
          html = `
            <strong>FIPS:</strong> ${fips}<br/>
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

  // 8.2) Function to recolor cancerPaths based on selected cancer type
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

  // 8.3) Initial draw: default = “all” cancer
  updateCancerChoropleth();

  // 8.4) When cancer‐dropdown changes, redraw cancer map
  d3.select("#cancer-select").on("change", updateCancerChoropleth);


  // —————————————————————————————————————————————————————————————————
  // 9) DRAW THE POLLUTION MAP (only APS for now)
  // —————————————————————————————————————————————————————————————————

  // 9.1) Bind counties to <path> inside pollutionG
  const pollutionPaths = pollutionG.selectAll("path")
    .data(counties)
    .join("path")
      .attr("d", path)
      .attr("stroke", "#999")
      .attr("stroke-width", 0.2)
      .attr("fill", "#eee") // default: no data
      .on("mouseover", (event, d) => {
        const fips = d.id;
        const val  = airByFIPS.get(fips);

        const html = `
          <strong>FIPS:</strong> ${fips}<br/>
          <strong>Air Pollution Score:</strong> ${val != null ? val.toFixed(3) : "N/A"}
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

  // 9.2) Function to recolor APS map
  function updatePollutionChoropleth() {
    pollutionPaths
      .transition()
      .duration(500)
      .attr("fill", d => {
        const fips = d.id;
        const val  = airByFIPS.get(fips);
        return val != null ? apsColor(val) : "#eee";
      });
  }

  // 9.3) We will call updatePollutionChoropleth() whenever we show the pollution map


  // —————————————————————————————————————————————————————————————————
  // 10) LEGENDS
  //    • Cancer legend (static, always shown above the cancer map)
  //    • APS legend (static, always shown above the pollution map once it appears)
  // —————————————————————————————————————————————————————————————————

  // 10.1) Cancer legend (300→700, Reds)
  const cancerLegendWidth  = 300;
  const cancerLegendHeight = 12;

  // Create a <defs> entry for the cancer gradient
  const defs = cancerSvg.append("defs");
  const cancerGrad = defs.append("linearGradient")
    .attr("id", "legend-cancer");

  d3.range(0, 1.001, 0.01).forEach(t => {
    const val = cancerColor.domain()[0] + t * (cancerColor.domain()[1] - cancerColor.domain()[0]);
    cancerGrad.append("stop")
      .attr("offset", `${t * 100}%`)
      .attr("stop-color", cancerColor(val));
  });

  // Place the cancer legend in the cancerSvg, top‐right
  const cancerLegendGroup = cancerSvg.append("g")
    .attr("transform", `translate(${width - cancerLegendWidth - 50}, 30)`);

  cancerLegendGroup.append("rect")
    .attr("width", cancerLegendWidth)
    .attr("height", cancerLegendHeight)
    .style("fill", "url(#legend-cancer)");

  const cancerLegendScale = d3.scaleLinear()
    .domain(cancerColor.domain()) // [300,700]
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

  // 10.2) APS legend (0.2→1.2, Blues)
  const apsLegendWidth  = 300;
  const apsLegendHeight = 12;

  const pollutionDefs = pollutionSvg.append("defs");
  const apsGrad = pollutionDefs.append("linearGradient")
    .attr("id", "legend-aps");

  d3.range(0, 1.001, 0.01).forEach(t => {
    const val = apsColor.domain()[0] + t * (apsColor.domain()[1] - apsColor.domain()[0]);
    apsGrad.append("stop")
      .attr("offset", `${t * 100}%`)
      .attr("stop-color", apsColor(val));
  });

  const apsLegendGroup = pollutionSvg.append("g")
    .attr("transform", `translate(${width - apsLegendWidth - 50}, 30)`);

  apsLegendGroup.append("rect")
    .attr("width", apsLegendWidth)
    .attr("height", apsLegendHeight)
    .style("fill", "url(#legend-aps)");

  const apsLegendScale = d3.scaleLinear()
    .domain(apsColor.domain()) // [0.2,1.2]
    .range([0, apsLegendWidth]);

  const apsLegendAxis = d3.axisBottom(apsLegendScale)
    .ticks(5)
    .tickFormat(d3.format(".1f"));

  apsLegendGroup.append("g")
    .attr("transform", `translate(0, ${apsLegendHeight})`)
    .call(apsLegendAxis);

  apsLegendGroup.append("text")
    .attr("x", apsLegendWidth / 2)
    .attr("y", -6)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .text("Air Pollution Score");

  // By default, hide the APS legend and pollution map:
  d3.select("#pollution-container").style("display", "none");
  apsLegendGroup.style("display", "none");


  // —————————————————————————————————————————————————————————————————
  // 11) CONTROLS BEHAVIOR
  // —————————————————————————————————————————————————————————————————

  // 11.1) When pollution dropdown changes:
  d3.select("#pollution-select").on("change", () => {
    const pollutionMetric = d3.select("#pollution-select").property("value");

    if (pollutionMetric === "aps") {
      // Show pollution map & legend
      d3.select("#pollution-container").style("display", null);
      apsLegendGroup.style("display", null);
      // Draw APS colors
      updatePollutionChoropleth();
    } else {
      // Hide pollution map & legend
      d3.select("#pollution-container").style("display", "none");
      apsLegendGroup.style("display", "none");
    }
    // Always re-color cancer map in case the user changed cancer dropdown as well
    updateCancerChoropleth();
  });

  // 11.2) When cancer dropdown changes, update only the cancer map
  d3.select("#cancer-select").on("change", () => {
    updateCancerChoropleth();
  });

  // 11.3) SEARCH BOX (same for both maps)
  d3.select("#search-button").on("click", () => {
    const queryRaw = d3.select("#county-search").property("value").trim().toLowerCase();
    if (!queryRaw) {
      alert("Please type a county (e.g. “Union County, Florida”).");
      return;
    }

    // 11.3.1) Try exact match
    let matchedFips = nameToFIPS.get(queryRaw);

    // 11.3.2) If no exact match, try substring
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

    // 11.3.3) Find the GeoJSON feature for that FIPS
    const feature = counties.find(d => d.id === matchedFips);
    if (!feature) {
      alert("Found a FIPS but no corresponding geometry. Check your data.");
      return;
    }

    // 11.3.4) Zoom both maps so that county is centered on each
    zoomToFeature(feature);
  });

  // 11.4) RESET BUTTON: zoom both maps back out to full USA
  d3.select("#reset-button").on("click", () => {
    cancerSvg.transition().duration(750).call(cancerZoom.transform, d3.zoomIdentity);
    pollutionSvg.transition().duration(750).call(pollutionZoom.transform, d3.zoomIdentity);
  });


  // —————————————————————————————————————————————————————————————————
  // 12) HELPER FUNCTIONS FOR ZOOMING
  // —————————————————————————————————————————————————————————————————

  function zoomToFeature(feature) {
    // Compute pixel‐bounds of that county (in the cancer map’s coordinate space)
    const bounds = path.bounds(feature); // [[x0,y0], [x1,y1]]
    const dx = bounds[1][0] - bounds[0][0];
    const dy = bounds[1][1] - bounds[0][1];
    const x  = (bounds[0][0] + bounds[1][0]) / 2;
    const y  = (bounds[0][1] + bounds[1][1]) / 2;

    // Choose a scale so that the county “just fits” within 90% of the viewport
    const scaleFactor = Math.max(
      1,
      Math.min(8, 0.9 / Math.max(dx / width, dy / height))
    );

    // Translate so that county’s centroid goes to center of SVG
    const translateX = width  / 2 - scaleFactor * x;
    const translateY = height / 2 - scaleFactor * y;

    const transform = d3.zoomIdentity
      .translate(translateX, translateY)
      .scale(scaleFactor);

    // Animate both maps
    cancerSvg.transition().duration(750).call(cancerZoom.transform, transform);
    pollutionSvg.transition().duration(750).call(pollutionZoom.transform, transform);
  }


})
.catch(err => {
  console.error("Error loading data or map:", err);
  d3.select("#map").append("p").text("Failed to load map or CSV files.");
});
