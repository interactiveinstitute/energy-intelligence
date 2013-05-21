function TotalPower(chart) {
  this.chart = chart;
  
  this.area = d3.svg.area()
      //.interpolate('step-after')
      .x(function(d) { return this.chart.x(d.resampledAt); }.bind(this))
      .y0(this.chart.height - Chart.PADDING_BOTTOM)
      .y1(function(d) { return this.chart.y(d.value); }.bind(this));
  this.line = d3.svg.line()
      //.interpolate('step-after')
      .x(function(d) { return this.chart.x(d.resampledAt); }.bind(this))
      .y(function(d) { return this.chart.y(d.value); }.bind(this));
};
TotalPower.prototype.type = 'TotalPower';
TotalPower.prototype.unit = 'W';
TotalPower.prototype.feed = 'allRooms';
TotalPower.prototype.datastream = 'ElectricPower';
TotalPower.prototype.init = function() {
  this.chart.container.selectAll('*').remove();

  this.chart.container
    .append('path')
      .attr('class', 'area')
      .datum([])
      .attr('d', this.area);
      
  var filter = this.chart.chart.append('filter')
      .attr('id', 'lineShadow')
      .attr('height', '130%');
  filter.append('feGaussianBlur')
      .attr('in', 'SourceAlpha')
      .attr('stdDeviation', 10);
  filter.append('feOffset')
      .attr('dx', 0)
      .attr('dy', 5)
      .attr('result', 'offsetblur');
  var merge = filter.append('feMerge');
  merge.append('feMergeNode');
  merge.append('feMergeNode')
      .attr('in', 'SourceGraphic');
  this.chart.chart.select('.container').append('path')
      .attr('class', 'line')
      .datum([])
      .attr('d', this.line);
};
TotalPower.prototype.getDataFromRequest = function(params, result) {
  var resample = +new Date(params.start);
  return result.datapoints.map(function(d, i) {
    return {
      at: new Date(d.at),
      resampledAt: new Date(resample + i * params.interval * 1000),
      value: parseFloat(d.value || 0)
    };
  });
};
TotalPower.prototype.setDataAndTransform = function(data, from, to) {
  this.chart.chart.select('.area')
      .datum(data)
      .attr('d', this.area)
      .attr('transform', from)
    .transition()
      .duration(1000)
      .attr('transform', to);

  this.chart.chart.select('.line')
      .datum(data)
      .attr('d', this.line)
      .attr('transform', from)
//        .attr('filter', 'url(#lineShadow)');
    .transition()
      .duration(1000)
      .attr('transform', to);
};
TotalPower.prototype.getParameters = function() {
  var start = this.chart.x.domain()[0];
  var duration = +this.chart.x.domain()[1] - +this.chart.x.domain()[0];
    
  var n = this.chart.width / Chart.SAMPLE_SIZE;
  for (var i = 0; i < this.chart.intervals.length; i++) {
    if (this.chart.intervals[i] > duration * Chart.SAMPLE_SIZE / this.chart.width / 1000) break;
  }
  var interval = this.chart.intervals[i - 1] || 1;
  var n = Math.ceil(duration * 3 / interval / 1000);
  
  return {
    interval: interval,
    duration: parseInt(duration * 3 / 1000) + 'seconds',
    start: new Date(+start - duration).toJSON()
  };
};

function TotalEnergy(chart) {
  this.chart = chart;
};
TotalEnergy.prototype.type = 'TotalEnergy';
TotalEnergy.prototype.unit = 'Wh';
TotalEnergy.prototype.feed = 'allRooms';
TotalEnergy.prototype.datastream = 'ElectricEnergy';
TotalEnergy.prototype.init = function() {
  this.chart.container.selectAll('*').remove();
  
  this.group = this.chart.container;
};
TotalEnergy.prototype.getDataFromRequest = function(params, result) {
  var resample = +new Date(params.start);
  
  var pointsPerBar = 20;
  var data = [];
  var n = 0;
  console.log('length', result.datapoints.length);
  while ((n + 1) * pointsPerBar < result.datapoints.length) {
    var endIndex = Math.min(n * pointsPerBar + pointsPerBar - 1, result.datapoints.length);
    var end = parseFloat(result.datapoints[endIndex].value || 0);
    var start = parseFloat(result.datapoints[n * pointsPerBar].value || 0);
    if (end > start && start > 0)
      var value = (end - start) * 1000;
    else
      var value = 0;
    data[n++] = {
      start: new Date(result.datapoints[n * pointsPerBar].at),
      value: value
    };
  }
  console.log(data);
  return data;
};
TotalEnergy.prototype.setDataAndTransform = function(data, from, to) {
  this.group
      .attr('transform', to);
  
  var bar = this.group.selectAll('.bar')
      .data(data)
    .enter().append('g')
      .attr('class', 'bar')
      .attr('transform', function(d) { return 'translate(' + this.chart.x(d.start) + ',0)'; }.bind(this));
  bar.append('rect')
      .attr('x', Chart.BAR_SPACING / 2)
      .attr('y', function(d) { return this.chart.y(d.value); }.bind(this))
      .attr('width', this.chart.x(data[1].start) - +this.chart.x(data[0].start) - Chart.BAR_SPACING / 2)
      .attr('height', function(d) { return this.chart.height - Chart.PADDING_BOTTOM - this.chart.y(d.value); }.bind(this));
};
TotalEnergy.prototype.getParameters = function() {
  var start = this.chart.x.domain()[0];
  var duration = +this.chart.x.domain()[1] - +this.chart.x.domain()[0];
  
  // TODO use tick width instead of sample size. This will work as well but slower.
  var n = this.chart.width / Chart.SAMPLE_SIZE;
  for (var i = 0; i < this.chart.intervals.length; i++) {
    if (this.chart.intervals[i] > duration * Chart.SAMPLE_SIZE / this.chart.width / 1000) break;
  }
  var interval = this.chart.intervals[i - 1] || 1;
  var n = Math.ceil(duration * 3 / interval / 1000);
  
  return {
    interval: interval,
    duration: parseInt(duration * 3 / 1000) + 'seconds',
    start: new Date(+start - duration).toJSON()
  };
};
