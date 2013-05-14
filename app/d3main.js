function TotalPower(chart) {
  this.chart = chart;
  
  this.feed = 'allRooms';
  this.datastream = 'ElectricPower';
  
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
TotalPower.prototype.init = function() {
  this.chart.chart.append('g')
      .attr('class', 'container')
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

function TotalEnergy() {
  this.feed = 'allRooms';
  this.datastream = 'ElectricEnergy';
};

function Chart(db, width, height) {
  this.db = db;
  this.width = width;
  this.height = height;
  this.display = [new TotalPower(this)];
  this.ready = false;
  this.onReady = [];
  
  this.getJSON(db + '/_design/energy_data/_rewrite/feeds_and_datastreams', function(info) {
    this.getJSON(db + '/_design/energy_data/_view/domains?group=true', function(domains) {
      this.intervals = info.intervals;
      this.domains = {};
      domains.rows.forEach(function(row) {
        this.domains[row.key] = [row.value.min, row.value.max];
      }, this);
      this.construct();
      this.ready = true;
    
      var callback;
      while (callback = this.onReady.pop())
        callback(this);
    }.bind(this));
  }.bind(this));
}

Chart.SAMPLE_SIZE = 4; // px
Chart.EXTRA_UNITS_ABOVE = 50;
Chart.PADDING_BOTTOM = 48;

Chart.prototype.then = function ChartThen(callback) {
  if (this.ready) callback(this);
  else this.onReady.push(callback);
};

Chart.prototype.getJSON = function ChartGetJSON(url, callback) {
  var request = new XMLHttpRequest;
  request.open('GET', url, true);
  request.withCredentials = true;
  request.onload = function(event) {
    callback(JSON.parse(event.target.response));
  };
  request.send();
};

Chart.prototype.construct = function ChartConstruct() {
  this.x = d3.time.scale()
      .domain(this.domains[this.display[0].feed])
      .range([0, this.width]);
  this.y = d3.scale.linear()
      .domain([0, 200])
      .range([this.height - Chart.PADDING_BOTTOM, 0]);

  this.xAxis = d3.svg.axis()
      .scale(this.x)
      .orient('bottom')
      .ticks(5)
      .tickSubdivide(true)
      .tickPadding(6)
      .tickSize(this.height);
  this.yAxis = d3.svg.axis()
      .scale(this.y)
      .orient('left')
      .ticks(5)
      .tickPadding(6)
      .tickSize(-this.width)
      .tickFormat(function(d) { return d + ' W'; });

  this.tickDistance = 0;
  
  this.zoom = d3.behavior.zoom()
      .x(this.x)
      .scaleExtent([1, 1000]) // TODO prefer to define this related to time
      .on('zoom', this.transform.bind(this));
};

Chart.prototype.init = function ChartInit(container) {
  this.chart = d3.select(container).append('svg')
      .attr('class', 'time')
      .attr('width', this.width)
      .attr('height', this.height)
      .call(this.zoom)
    .append('g')
      .attr('transform', 'translate(0, 0)')
  
  this.chart.append('rect')
      .attr('width', this.width)
      .attr('height', this.height);

  this.chart.append('g')
      .attr('class', 'x axis');  
  this.chart.append('g')
      .attr('class', 'y axis');

  this.display[0].init();
  
  // TODO hide gradient during pan & zoom to make it smoother
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

  var timeout;
  var touchend = function touchend(event) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(this.loadData.bind(this), 500);
  }.bind(this);
  d3.select(window).on('touchend', touchend);
  this.chart.on('touchend', touchend);
  
  var zooming = -1;
  this.zoomer = d3.select(container).append('div')
      .attr('class', 'zoomer');
  this.zoomer.append('div')
      .attr('class', 'handle')
      .on('touchstart', function() {
        zooming = d3.touches(this)[0][0];
      })
      .on('touchend', function() {
        zooming = -1;
      });
  d3.select(container)
      .on('touchmove', function() {
        if (zooming == -1) return;
        var handle = this.zoomer.select('.handle').node();
        var position = (d3.touches(this.zoomer.node())[0][0] - zooming) / (this.zoomer.node().clientWidth - handle.clientWidth);
        if (position < 0) position = 0;
        if (position > 1) position = 1;
        var extent = this.zoom.scaleExtent();
        var scale = extent[0] + Math.pow(position, 4) * (extent[1] - extent[0]);
        
        var screenOrigin = 960;
        var translate = screenOrigin - (screenOrigin - this.zoom.translate()[0]) * scale / this.zoom.scale();
        this.zoom.translate([translate, 0]);
        this.zoom.scale(scale);
        this.transform();
      }.bind(this));
      this.transform();
  
  this.loadData();
  
  this.switcher = d3.select(container).append('button')
      .text('switch')
      .on('click', function() {
      });
};

Chart.prototype.transform = function ChartTransform() {
  var axis = this.chart.select('.x.axis')
      .call(this.xAxis);
  axis.selectAll('text')
      .attr('x', 16)
      .attr('y', this.height - 32);
  
  // Set x axis line width
  var lines = axis.selectAll('line');
  if (lines[0] && lines[0].length > 1) {
    var left = Infinity;
    for (var i = 0; i < lines[0].length; i++) {
      var transform = lines[0][i].transform.baseVal;
      if (transform.numberOfItems) {
        var position = transform.getItem(0).matrix.e;
        if (position >= 0 && position < left) left = position;
      }
    }
    var next = Infinity;
    if (left > -1) {
      for (var i = 0; i < lines[0].length; i++) {
        var transform = lines[0][i].transform.baseVal;
        if (transform.numberOfItems) {
          var position = transform.getItem(0).matrix.e;
          if (position > left && position < next) next = position;
        }
      }
    }
    if (left != Infinity && next != Infinity)
      this.tickDistance = (next - left) / 2;
  }
  lines.style('stroke-width', this.tickDistance)
      .attr('x1', this.tickDistance / 2)
      .attr('x2', this.tickDistance / 2);
  
  this.chart.select('.container')
      .attr('transform', 'translate(' + this.zoom.translate()[0] + ', 0) scale(' + this.zoom.scale() + ', 1)');
  
  this.chart.select('.line')
      .attr('filter', 'none');
  
  var handle = this.zoomer.select('.handle').node();
  var scale = this.zoom.scale();
  var extent = this.zoom.scaleExtent();
  var width = this.zoomer.node().clientWidth - handle.clientWidth;
  handle.style.left = Math.pow((scale - extent[0]) / (extent[1] - extent[0]), 1/4) * width + 'px';
}

Chart.prototype.loadData = function ChartLoadData() {
  var start = this.x.domain()[0];
  var duration = +this.x.domain()[1] - +this.x.domain()[0];
    
  var n = this.width / Chart.SAMPLE_SIZE;
  for (var i = 0; i < this.intervals.length; i++) {
    if (this.intervals[i] > duration * Chart.SAMPLE_SIZE / this.width / 1000) break;
  }
  var interval = this.intervals[i - 1] || 1;
  var n = Math.ceil(duration * 3 / interval / 1000);
  
  var params = {
    feed: this.display[0].feed,
    datastream: this.display[0].datastream,
    interval: interval,
    duration: parseInt(duration * 3 / 1000) + 'seconds',
    start: new Date(+start - duration).toJSON()
  };
  var url = this.db + '/_design/energy_data/_show/historical?' + Object.keys(params).map(function(key) {
    return key + '=' + encodeURIComponent(params[key]);
  }).join('&');
  
  this.getJSON(url, function(result) {
    var resample = +new Date(params.start);
    var data = result.datapoints.map(function(d, i) {
      return {
        at: new Date(d.at),
        resampledAt: new Date(resample + i * interval * 1000),
        value: parseFloat(d.value || 0)
      };
    });

    var oldDomain = this.y.domain()[1];
    var newDomain = d3.max(data.map(function(d) { return d.value })) + Chart.EXTRA_UNITS_ABOVE;
    var tempScale = newDomain / oldDomain;

    this.y.domain([0, newDomain]);
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
        .attr('y', -16);

    var from = 'matrix(1, 0, 0, ' + tempScale + ', 0, ' + (this.height - 48) * (1 - tempScale) + ') scale(' + (1 / this.zoom.scale()) + ', 1) translate(' + -this.zoom.translate()[0] + ', 0)';
    var to = 'scale(' + (1 / this.zoom.scale()) + ', 1) translate(' + -this.zoom.translate()[0] + ', 0)';
    
    this.display[0].setDataAndTransform(data, from, to);
  }.bind(this));
};
