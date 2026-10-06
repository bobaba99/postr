import * as d3 from "d3";
const svg = d3.select("#chart").append("svg").attr("width", 600).attr("height", 400);
svg.selectAll("circle").data(data).join("circle")
  .attr("cx", d => x(d.x))
  .attr("cy", d => y(d.y))
  .attr("r", 4);
