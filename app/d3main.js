function Chart(width, height) {
  this.width = width;
  this.height = height;
  
  this.construct();
}

Chart.SAMPLE_SIZE = 4; // px

Chart.prototype.construct = function ChartConstruct() {
  var padding = {
    bottom: 25
  };

  var x = this.x = d3.time.scale()
    .domain([0, new Date])
    .range([0, this.width]);
  var y = this.y = d3.scale.linear()
    .domain([0, 200])
    .range([this.height - padding.bottom, 0]);

  this.xAxis = d3.svg.axis()
    .scale(x)
    .orient('bottom')
    .ticks(8)
    .tickSubdivide(true)
    .tickPadding(6)
    .tickSize(this.height);
  this.yAxis = d3.svg.axis()
    .scale(y)
    .orient('left')
    .ticks(5)
    .tickPadding(6)
    .tickSize(-this.width)
    .tickFormat(function(d) { return d + ' W'; });

  this.area = d3.svg.area()
    .x(function(d) { return x(d.at); }) // TODO resampled
    .y0(this.height - padding.bottom)
    .y1(function(d) { return y(d.value) / 2; });
  this.line = d3.svg.line()
    .x(function(d) { return x(d.at); })
    .y(function(d) { return y(d.value) / 2; });

  this.tickDistance = 0;
  
  this.zoom = d3.behavior.zoom()
      .x(x)
      .scaleExtent([1, Infinity])
      .on('zoom', this.transform.bind(this));
}

Chart.prototype.init = function ChartInit(container) {
  this.chart = d3.select(container).append('svg')
      .attr('class', 'time')
      .attr('width', this.width)
      .attr('height', this.height)
      .call(this.zoom)
    .append('g')
      .attr('transform', 'translate(0, 0)')

  this.chart.append('g')
      .attr('class', 'x axis');  
  this.chart.append('g')
      .attr('class', 'y axis');

  this.chart.append('g')
      .attr('class', 'container')
    .append('path')
      .attr('class', 'area')
      .datum([])
      .attr('d', this.area);

  var filter = this.chart.append('filter')
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
  this.chart.select('.container').append('path')
      .attr('class', 'line')
      .datum([])
      .attr('d', this.line);
    
  var gradient = this.chart.append('defs').append('linearGradient')
      .attr('id', 'leftGradient')
      .attr('x1', '0%')
      .attr('x2', '100%')
      .attr('y1', '0%')
      .attr('y2', '0%');
  gradient.append('stop')
      .attr('offset', '0%')
      .style('stop-color', '#111111')
      .style('stop-opacity', 1);
  gradient.append('stop')
      .attr('offset', '100%')
      .style('stop-color', '#111111')
      .style('stop-opacity', 0);
  this.chart.append('rect')
      .attr('width', 90)
      .attr('height', this.height)
      .attr('fill', 'url(#leftGradient)');

  this.chart.append('g')
      .attr('class', 'yText axis');

  this.transform();

  d3.select(window).on('mouseup', this.loadData.bind(this));
  var timeout;
  this.chart.on('mousewheel', function(event) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(this.loadData.bind(this), 500);
  }.bind(this));
  this.loadData();
};

Chart.prototype.transform = function ChartTransform() {
  var axis = this.chart.select('.x.axis')
      .call(this.xAxis);
  axis.selectAll('text')
      .attr('x', 5)
      .attr('y', this.height - 15);
  
  var lines = axis.selectAll('line');
  var ndistance = 0;
  if (lines[0] && lines[0].length > 1) {
    for (var i = 0; i < lines[0].length - 1; i++) {
      ndistance = (lines[0][i + 1].transform.baseVal.getItem(0).matrix.e - lines[0][i].transform.baseVal.getItem(0).matrix.e) / 2;
      if (ndistance > 0) {
        this.tickDistance = ndistance;
        break;
      }
    }
  }
  lines.style('stroke-width', this.tickDistance)
      .attr('x1', this.tickDistance / 2)
      .attr('x2', this.tickDistance / 2);
  
  this.chart.select('.container')
      .attr('transform', 'translate(' + this.zoom.translate()[0] + ', 0) scale(' + this.zoom.scale() + ', 1)');
  
  this.chart.select('.line')
      .attr('filter', '');
}

Chart.prototype.loadData = function ChartLoadData() {
  var start = this.x.domain()[0];
  var duration = +this.x.domain()[1] - +this.x.domain()[0];
  var n = this.width / Chart.SAMPLE_SIZE;
  var interval = duration / n;
  
  // FIXME
  // 1. clamp 'interval' to one of the values in couchm (have feeds_and_datastreams tell about them)
  // 2. use code below to create the right url
  
  /*
var params = {
  feed: feed,
  datastream: datastream,
  interval: interval,
  duration: duration, <<< just /1000 and use 'seconds'
  start: start_datetime
};
var units = {
  second: 1, seconds: 1,
  minute: 60, minutes: 60,
  hour: 60 * 60, hours: 60 * 60,
  day: 60 * 60 * 24, days: 60 * 60 * 24,
  week: 60 * 60 * 24 * 7, weeks: 60 * 60 * 24 * 7,
  month: 60 * 60 * 24 * 31, months: 60 * 60 * 24 * 31,
  year: 60 * 60 * 24 * 366, years: 60 * 60 * 24 * 366
};
//var parsed = /(\d+)([a-z]+)/.exec(duration);
//var ms = parseInt(parsed[1]) * units[parsed[2]] * 1000;
  
  
  '/_design/energy_data/_show/historical'
  

  var arr = [];
  for (var key in args)
    arr.push(key + '=' + encodeURIComponent(args[key]));
  url += '?' + arr.join('&');
  */
  
  
  // also, use domains to set the initial view, so that we don’t have to load unavailable data for 30+ years
  
  //d3.json(url, function(error, data) {
    var fakeData = [];
    fakeData[0] = {
      at: +start - duration,
      value: 20 + Math.random() * 50
    };
    for (var i = 1; i < n * 3; i++) {
      fakeData.push({
        at: new Date(+fakeData[i - 1].at + interval),
        value: Math.max(0, fakeData[i - 1].value + Math.random() * 40 - 20)
      });
    }
    
    this.y.domain([0, d3.max(fakeData.map(function(d) { return d.value })) + 50]);
    var axis = this.chart.select('.y.axis')
        .transition()
        .duration(1000)
        .call(this.yAxis);
    axis = this.chart.select('.yText.axis')
        .transition()
        .duration(1000)
        .call(this.yAxis)
      .selectAll('text')
        .attr('x', 5)
        .attr('y', -10);

    this.chart.select('.area')
        .datum(fakeData)
        .attr('d', this.area)
        .attr('transform', 'scale(' + (1 / this.zoom.scale()) + ', 1) translate(' + -this.zoom.translate()[0] + ', 0)');

    this.chart.select('.line')
        .datum(fakeData)
        .attr('d', this.line)
        .attr('transform', 'scale(' + (1 / this.zoom.scale()) + ', 1) translate(' + -this.zoom.translate()[0] + ', 0)')
        .attr('filter', 'url(#lineShadow)');
}
