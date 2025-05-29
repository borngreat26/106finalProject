const width = 960;
const height = 600;

const svg = d3.select("#map")
  .append("svg")
  .attr("width", width)
  .attr("height", height);

const tooltip = d3.select("#tooltip");

const projection = d3.geoAlbersUsa().translate([width / 2, height / 2]).scale(1300);
const path = d3.geoPath().projection(projection);

Promise.all([
  d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json"),
  d3.csv("cancer_cleaned.csv", d => {
    const fips = String(Math.floor(+d.fips)).padStart(5, "0");
    return { fips: fips, rate: +d.incidence_rate };
  })
]).then(([us, data]) => {
  const rateByFIPS = new Map(data.map(d => [d.fips, d.rate]));

  const color = d3.scaleSequential(d3.interpolateReds).domain([300, 700]);

  const counties = topojson.feature(us, us.objects.counties).features;

  // Zoomable group
  const zoomGroup = svg.append("g").attr("class", "zoom-container");

  zoomGroup.selectAll("path")
    .data(counties)
    .join("path")
    .attr("fill", d => {
      const rate = rateByFIPS.get(d.id);
      return rate != null ? color(rate) : "#ccc";
    })
    .attr("d", path)
    .on("mouseover", function (event, d) {
      const rate = rateByFIPS.get(d.id);
      tooltip
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY + "px")
        .style("visibility", "visible")
        .html(`
          <strong>FIPS:</strong> ${d.id}<br>
          <strong>Cancer Rate:</strong> ${rate ? rate.toFixed(1) : "N/A"}
        `);
    })
    .on("mouseout", () => tooltip.style("visibility", "hidden"));

  // Zoom behavior
  svg.call(
    d3.zoom()
      .scaleExtent([1, 8])
      .on("zoom", (event) => {
        zoomGroup.attr("transform", event.transform);
      })
  );

  // Legend
  const legendWidth = 300;
  const legendHeight = 10;

  const defs = svg.append("defs");

  const linearGradient = defs.append("linearGradient")
    .attr("id", "legend-gradient");

  linearGradient.selectAll("stop")
    .data(d3.range(0, 1.01, 0.01))
    .enter().append("stop")
    .attr("offset", d => `${d * 100}%`)
    .attr("stop-color", d => color(color.domain()[0] + d * (color.domain()[1] - color.domain()[0])));

  const legendSvg = svg.append("g")
    .attr("transform", `translate(${width - legendWidth - 50}, 30)`);

  legendSvg.append("rect")
    .attr("width", legendWidth)
    .attr("height", legendHeight)
    .style("fill", "url(#legend-gradient)");

  const legendScale = d3.scaleLinear()
    .domain(color.domain())
    .range([0, legendWidth]);

  const legendAxis = d3.axisBottom(legendScale)
    .ticks(6)
    .tickFormat(d3.format(".0f"));

  legendSvg.append("g")
    .attr("transform", `translate(0, ${legendHeight})`)
    .call(legendAxis);

  legendSvg.append("text")
    .attr("x", legendWidth / 2)
    .attr("y", -8)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .text("Cancer Incidence Rate");
}).catch(error => {
  console.error("Map load failed:", error);
  d3.select("#map").append("p").text("Failed to load map data.");
});

