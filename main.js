console.log("Main.js is loaded");

const tooltip = d3.select("#tooltip");

const svg = d3.select("#map")
  .append("svg")
  .attr("width", 1200)
  .attr("height", 800);

Promise.all([
  d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json"),
  d3.csv("cancer_incidents_cleaned.csv", d => {
    return {
      fips: String(Math.floor(+d.fips)).padStart(5, "0"),
      rate: +d.incidence_rate
    };
  })
]).then(([us, data]) => {
  const rateByFIPS = new Map(data.map(d => [d.fips, d.rate]));
  const colorScale = d3.scaleSequential(d3.interpolateReds).domain([200, 1300]);
  const path = d3.geoPath();

  const counties = topojson.feature(us, us.objects.counties).features;
  console.log("Loaded", counties.length, "counties");

  svg.append("g")
    .selectAll("path")
    .data(counties)
    .join("path")
    .attr("fill", d => {
      return "#f00";
      const rate = rateByFIPS.get(d.id);
      return rate ? colorScale(rate) : "#eee";
    })
    .attr("stroke", "#999")
    .attr("stroke-width", 0.3)
    .attr("d", path)
    .on("mouseover", (event, d) => {
      const rate = rateByFIPS.get(d.id);
      tooltip
        .style("opacity", 1)
        .html(`FIPS: ${d.id}<br>Rate: ${rate ? rate.toFixed(1) : "N/A"}`)
        .style("left", `${event.pageX + 10}px`)
        .style("top", `${event.pageY - 28}px`);
    })
    .on("mouseout", () => {
      tooltip.style("opacity", 0);
    });
});
