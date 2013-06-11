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
  var container = this.chart.time.select('.container');
  container.selectAll('*').remove();
  container.append('path')
      .attr('class', 'area')
      .datum([])
      .attr('d', this.area);
  container.append('path')
      .attr('class', 'line')
      .datum([])
      .attr('d', this.line);

  this.chart.time.select('.extras').append('rect')
      .attr('class', 'nowLine')
      .attr('fill', 'url(#now-line-gradient)')
      .attr('width', Chart.NOW_BAR_WIDTH);
  this.chart.time.select('.extras').append('circle')
      .attr('class', 'nowDot')
      .attr('fill', 'url(#now-dot-gradient)')
      .attr('r', Chart.NOW_BAR_WIDTH);

  var url = this.chart.db +
      '/_changes?filter=energy_data/measurements&source=' + this.feed;
  this.current = 0;
  this.chart.getJSON(url + '&descending=true&limit=2', function(result) {
    this.eventSource = new EventSource(url + '&feed=eventsource&include_docs=true&since=' + result.last_seq, { withCredentials: true });
    this.eventSource.withCredentials = true;
    this.eventSource.onmessage = function(e) {
      var doc = JSON.parse(e.data).doc;
      this.chart.meter.select('text').text((doc.ElectricEnergy | 0) + ' Wh');
      this.current = doc.ElectricPower;
      this.transformExtras();
    }.bind(this);
  }.bind(this));
  setInterval(this.transformExtras.bind(this), 1000);
};
TotalPower.prototype.stop = function() {
  // TODO stop eventsource
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
TotalPower.prototype.transformExtras = function() {
  this.chart.time.select('.nowLine')
      .attr('x', this.chart.x(new Date) - Chart.NOW_BAR_WIDTH / 2)
      .attr('y', this.chart.y(this.current) - Chart.PADDING_BOTTOM)
      .attr('height', this.chart.height - this.chart.y(this.current));

  this.chart.time.select('.nowDot')
      .attr('cx', this.chart.x(new Date))
      .attr('cy', this.chart.y(this.current) - Chart.PADDING_BOTTOM);
};
TotalPower.prototype.setDataAndTransform = function(data, from, to) {
  this.chart.time.select('.area')
      .datum(data)
      .attr('d', this.area)
      .attr('transform', from)
    .transition()
      .duration(1000)
      .attr('transform', to);

  this.chart.time.select('.line')
      .datum(data)
      .attr('d', this.line)
      .attr('transform', from)
    .transition()
      .duration(1000)
      .attr('transform', to);
};
TotalPower.prototype.getParameters = function() {
  var start = this.chart.x.domain()[0];
  var duration = +this.chart.x.domain()[1] - +this.chart.x.domain()[0];

  var actualStart = +start - duration;
  var actualEnd = Math.min(+start + 2 * duration, +new Date);
  var actualDuration = Math.max(+actualStart, actualEnd) - +actualStart;

  var n = this.chart.width / Chart.SAMPLE_SIZE;
  for (var i = 0; i < this.chart.intervals.length; i++) {
    if (this.chart.intervals[i] > duration * Chart.SAMPLE_SIZE / this.chart.width / 1000) break;
  }
  var interval = this.chart.intervals[i - 1] || 1;
  var n = Math.ceil(duration * 3 / interval / 1000);
  
  return {
    interval: interval,
    duration: parseInt(actualDuration / 1000) + 'seconds',
    start: new Date(actualStart).toJSON()
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
