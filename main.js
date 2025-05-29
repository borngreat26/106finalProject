const margin = { top: 20, right: 30, bottom: 70, left: 70 },
      width = 800 - margin.left - margin.right,
      height = 500 - margin.top - margin.bottom;

const svg = d3.select("#chart")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

// Tooltip setup
const tooltip = d3.select("body").append("div")
    .style("position", "absolute")
    .style("background-color", "white")
    .style("padding", "8px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "4px")
    .style("box-shadow", "0px 0px 6px rgba(0,0,0,0.2)")
    .style("opacity", 0)
    .style("pointer-events", "none")
    .style("font-family", "sans-serif")
    .style("font-size", "13px");

// Load CSV data
d3.csv("merged_pollution_cancer.csv").then(rawData => {
    const data = rawData.map(d => ({
        FIPS: d.FIPS,
        pollution: parseFloat(d.pollution),
        incidents: parseFloat(d.incidents)
    })).filter(d => !isNaN(d.pollution) && !isNaN(d.incidents));

    // Outlier removal
    function removeOutliers(data, key) {
        const values = data.map(d => d[key]).sort(d3.ascending);
        const q1 = d3.quantile(values, 0.25);
        const q3 = d3.quantile(values, 0.75);
        const iqr = q3 - q1;
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;
        return data.filter(d => d[key] >= lowerBound && d[key] <= upperBound);
    }

    let cleanedData = removeOutliers(data, 'pollution');
    cleanedData = removeOutliers(cleanedData, 'incidents');

    const x = d3.scaleLinear()
        .domain(d3.extent(cleanedData, d => d.pollution)).nice()
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain(d3.extent(cleanedData, d => d.incidents)).nice()
        .range([height, 0]);

    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x));

    svg.append("g")
        .call(d3.axisLeft(y));

    svg.append("text")
        .attr("class", "axis-label")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 50)
        .text("Pollution Level");

    svg.append("text")
        .attr("class", "axis-label")
        .attr("text-anchor", "middle")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -50)
        .text("Cancer Incidents");

    svg.selectAll(".dot")
        .data(cleanedData)
        .enter()
        .append("circle")
        .attr("class", "dot")
        .attr("cx", d => x(d.pollution))
        .attr("cy", d => y(d.incidents))
        .attr("r", 5)
        .attr("fill", "steelblue")
        .attr("opacity", 0.7)
        .on("mouseover", (event, d) => {
            tooltip.transition().duration(200).style("opacity", 1);
            tooltip.html(`FIPS: <b>${d.FIPS}</b><br>Pollution: ${d.pollution}<br>Incidents: ${d.incidents}`)
                .style("left", `${event.pageX + 10}px`)
                .style("top", `${event.pageY - 25}px`);
        })
        .on("mouseout", () => {
            tooltip.transition().duration(200).style("opacity", 0);
        });

    // Normalized regression
    function linearRegressionNormalized(data) {
        const meanX = d3.mean(data, d => d.pollution);
        const stdX = d3.deviation(data, d => d.pollution);
        const meanY = d3.mean(data, d => d.incidents);
        const stdY = d3.deviation(data, d => d.incidents);

        const normalizedData = data.map(d => ({
            x: (d.pollution - meanX) / stdX,
            y: (d.incidents - meanY) / stdY
        }));

        const slopeNormalized = d3.sum(normalizedData, d => d.x * d.y) / d3.sum(normalizedData, d => d.x ** 2);
        const interceptNormalized = 0;

        return {
            slopeNormalized,
            interceptNormalized,
            meanX,
            stdX,
            meanY,
            stdY
        };
    }

    const reg = linearRegressionNormalized(cleanedData);

    // Generate line points in original scale
    const regressionPoints = [
        {
            pollution: d3.min(cleanedData, d => d.pollution),
            incidents: reg.meanY + reg.slopeNormalized * reg.stdY / reg.stdX * (d3.min(cleanedData, d => d.pollution) - reg.meanX)
        },
        {
            pollution: d3.max(cleanedData, d => d.pollution),
            incidents: reg.meanY + reg.slopeNormalized * reg.stdY / reg.stdX * (d3.max(cleanedData, d => d.pollution) - reg.meanX)
        }
    ];

    svg.append("line")
        .attr("x1", x(regressionPoints[0].pollution))
        .attr("y1", y(regressionPoints[0].incidents))
        .attr("x2", x(regressionPoints[1].pollution))
        .attr("y2", y(regressionPoints[1].incidents))
        .attr("stroke", "red")
        .attr("stroke-width", 2);

    svg.append("text")
        .attr("x", 10)
        .attr("y", height + 40)
        .attr("fill", "red")
        .style("font-size", "13px")
        .text(`Normalized slope (correlation): ${reg.slopeNormalized.toFixed(4)}`);

    console.log("Normalized slope (correlation):", reg.slopeNormalized);

}).catch(error => console.error("CSV Loading Error:", error));