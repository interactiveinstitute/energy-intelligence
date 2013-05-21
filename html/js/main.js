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
Chart.BAR_SPACING = 4;

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
      .tickFormat(function(d) { return d + ' ' + this.display[0].unit; }.bind(this));

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

  this.container = this.chart.append('g')
      .attr('class', 'container');

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
  
  this.wattHourButton = d3.select(container).append('div')
      .attr('class', 'watt-hour-button')
      .on('touchstart', function() {
        if (this.display[0].type == 'TotalPower') {
          this.display[0] = new TotalEnergy(this);
          d3.event.target.classList.add('active');
        } else {
          this.display[0] = new TotalPower(this);
          d3.event.target.classList.remove('active');
        }
        this.display[0].init();
        this.loadData();
      }.bind(this));
      
  // Popups
  (function() {
    var CANCEL_DISTANCE = 10;
    var opening = false;
    var position = null;
    var timeout;
    var popup;
    var cancel = function() {
      opening = false;
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      console.log('canceled');
    };
    var open = function() {
      opening = false;
      
      var time = +this.x.invert(position[0]);
      
      var data = this.chart.select('.area').datum();
      var dt = Infinity;
      for (var i = 0; i < data.length; i++) {
        var delta = Math.abs(+data[i].resampledAt - time);
        if (delta < dt) dt = delta;
        else break;
      }
      
      var datum = data[i];
      
      popup = this.chart
        .append('g')
          .attr('class', 'popup');
      popup.append('circle')
          .attr('cx', this.x(datum.resampledAt))
          .attr('cy', this.y(datum.value))
          .attr('r', 48)
          .on('touchstart', function() {
            close();
            d3.event.stopPropagation();
          });
          
      console.log('open', datum);
    }.bind(this);
    var close = function() {
      if (popup) {
        popup.remove();
        popup = null;
      }
    }.bind(this);
    var me = this;
    this.chart
        .on('touchstart', function() {
          if (me.display[0].type != 'TotalPower') return;
          
          if (d3.touches(this).length == 1) {
            opening = true;
            position = d3.touches(this)[0];
            
            timeout = setTimeout(open, 1000);
            
            close();
          } else {
            opening = false;
          }
        })
        .on('touchmove', function() {
          if (!opening) return;
          
          var touch = d3.touches(this)[0];
          var distance = Math.sqrt(Math.pow(touch[1] - position[1], 2) + Math.pow(touch[0] - position[0], 2));
          if (distance > CANCEL_DISTANCE) cancel();
        })
        .on('touchend', function() {
          if (opening) cancel();
        });
  }.bind(this))();
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
  var params = this.display[0].getParameters();
  params.feed = this.display[0].feed;
  params.datastream = this.display[0].datastream;
  var url = this.db + '/_design/energy_data/_show/historical?' + Object.keys(params).map(function(key) {
    return key + '=' + encodeURIComponent(params[key]);
  }).join('&');
  
  this.getJSON(url, function(result) {
    var data = this.display[0].getDataFromRequest(params, result);

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
