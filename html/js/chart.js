function Chart(db, width, height) {
  this.db = db;
  this.width = width;
  this.height = height;
  this.display = [new TotalPower(this)];
  this.ready = false;
  this.onReady = [];
  
  this.getJSON('config.json', function(config) {
    this.config = config;
    var design = db + '/_design/energy_data/';
    this.getJSON(design + '_rewrite/feeds_and_datastreams', function(info) {
      this.intervals = info.intervals;
      this.construct();

      this.ready = true;
      var callback;
      while (callback = this.onReady.shift()) callback(this);
    }.bind(this));
  }.bind(this));
}

Chart.SAMPLE_SIZE = 2; // px
Chart.EXTRA_UNITS_ABOVE = 50;
Chart.PADDING_BOTTOM = 48;
Chart.PADDING_TOP = 48;
Chart.BAR_SPACING = 4;
Chart.NOW_BAR_WIDTH = 8;
Chart.MIN_TIME_IN_VIEW = 60 * 60 * 1000;
Chart.MAX_TIME_IN_VIEW = 2 * 7 * 24 * 60 * 60 * 1000;

Chart.prototype.then = function(callback) {
  if (this.ready) callback(this);
  else this.onReady.push(callback);
};

Chart.prototype.getJSON = function(url, callback) {
  var request = new XMLHttpRequest;
  request.open('GET', url, true);
  request.withCredentials = true;
  request.onload = function(event) { callback(JSON.parse(request.response)); };
  request.send();
};

Chart.prototype.construct = function() {
  this.x = d3.time.scale();
  // TODO need to reset this.x.domain on feed change
  this.y = d3.scale.linear()
      .domain([0, 200])
      .range([this.height - Chart.PADDING_BOTTOM - Chart.PADDING_TOP, 0]);

  this.xAxis = d3.svg.axis()
      .orient('bottom')
      .scale(this.x)
      .ticks(5)
      .tickSubdivide(true)
      .tickPadding(6)
      .tickSize(this.height);
  // TODO change labeling of this.xAxis here to make it always recognisable
  this.yAxis = d3.svg.axis()
      .scale(this.y)
      .orient('left')
      .ticks(5)
      .tickPadding(6)
      .tickSize(-this.width)
      .tickFormat(function(d) {
        return d + ' ' + this.display[0].unit;
      }.bind(this));

  // Used to determine x axis stroke width.
  this.tickDistance = 0;

  this.zoom = d3.behavior.zoom()
      .x(this.x)
      .on('zoom', this.transform.bind(this));
  // TODO need to reset this.zoom.scaleExtent on feed change
 
  this.defaultView();
};

Chart.prototype.init = function(time, zoomer, meter, buttons) {
  this.time = d3.select(time);
  this.zoomer = d3.select(zoomer);
  this.meter = d3.select(meter);
  this.buttons = d3.select(buttons);

  this.time
      .attr('width', this.width)
      .attr('height', this.height)
    //.select('.time > g') // TODO was this piece in between needed?
      .call(this.zoom);

  this.display[0].init();

  // TODO hide gradient during pan & zoom to make it smoother
  this.time.select('.leftGradientBox')
      .attr('height', this.height);

  // Call .loadData() if the user has been zooming the way we want.
  (function() {
    var timeout;
    var config = [];
    d3.select(window)
      .on('touchstart', function() {
        config = [this.zoom.translate()[0], this.zoom.scale()];
      }.bind(this), true)
      .on('touchend', function() {
        if (timeout) clearTimeout(timeout);
        if (config[0] != this.zoom.translate()[0] ||
            config[1] != this.zoom.scale())
          timeout = setTimeout(this.loadData.bind(this), 500);
      }.bind(this), true)
      .on('mousewheel', function() {
        d3.event.stopPropagation();
        d3.event.preventDefault();
      }, true);
    // TODO prevent double tap
  }.bind(this))();

  BubbleBath.db = this.db;
  BubbleBath.chart = this;
  BubbleBath.container = this.time.select('.bubblebath');

  // TODO use d3 drag functionality, is more stable
  var zooming = -1;
  this.zoomer = d3.select('.zoomer');
  this.zoomer.select('.handle')
      .on('touchstart', function() { zooming = d3.touches(this)[0][0]; })
      .on('touchend', function() { zooming = -1; });
  d3.select('body')
      .on('touchmove', function() {
        if (zooming == -1) return;
        var handle = this.zoomer.select('.handle').node();
        var position = (d3.touches(this.zoomer.node())[0][0] - zooming) /
            (this.zoomer.node().clientWidth - handle.clientWidth);
        if (position < 0) position = 0;
        if (position > 1) position = 1;
        var extent = this.zoom.scaleExtent();
        var scale = extent[0] +
            Math.pow(position, 4) * (extent[1] - extent[0]);

        var screenOrigin = this.width / 2;
        var translate = screenOrigin -
            (screenOrigin - this.zoom.translate()[0]) *
            scale / this.zoom.scale();
        this.zoom.translate([translate, 0]);
        this.zoom.scale(scale);
        this.transform();
        this.showLoading = true;
      }.bind(this));
      this.transform();

  this.loading = this.time.select('.loading');
  this.loading.select('rect')
      .attr('width', this.width)
      .attr('height', this.height);
  this.loading.select('text')
      .attr('dx', this.width / 2)
      .attr('dy', this.height / 2);
  
  this.loadData(true);
  
  this.button('watt-hours', function(showWattHours) {
    this.display[0] = new (showWattHours ? TotalEnergy : TotalPower)(this);
    this.display[0].init();
    this.loadData();
  }, false);
  this.button('highlights', function(showHighlights) {
    d3.select('.bubblebath')
        .classed('withHighlights', showHighlights);
    // TODO: not enough, can't get popup bubble now
  }, true);

  this.meter.on('touchstart', function() {
    this.autopan(this.defaultDomain());
  }.bind(this));
};

Chart.prototype.button = function(cls, handler, state) {
  var that = this;
  return this.buttons.append('div')
      .classed(cls, true)
      .classed('button', true)
      .classed('active', state)
      .on('touchstart', function() {
        var el = d3.select(this);
        var state = !el.classed('active');
        el.classed('active', state);
        handler.bind(that)(state, this);
      });
};

Chart.prototype.defaultDomain = function() {
  var n = new Date;
  var startH = (n.getHours() > this.config.work_day_hours[0]) ?
      this.config.work_day_hours[0] : this.config.work_day_hours[0] - 24;
  var start = new Date(n.getFullYear(), n.getMonth(), n.getDate(), startH);
  var endHour = (n.getHours() < this.config.work_day_hours[0] - 1) ?
      this.config.work_day_hours[1] : start.getHours() + 24;
  var end = new Date(n.getFullYear(), n.getMonth(), n.getDate(), endHour);
  return [start, end];
};

Chart.prototype.defaultView = function() {
  this.x
      .domain(this.defaultDomain())
      .range([0, this.width]);

  var defaultTimeInView = this.defaultDomain()[1] - this.defaultDomain()[0];
  var minScale = defaultTimeInView / Chart.MAX_TIME_IN_VIEW;
  var maxScale = defaultTimeInView / Chart.MIN_TIME_IN_VIEW;
  this.zoom.x(this.x).scaleExtent([minScale, maxScale]);
};

Chart.prototype.autopan = function(domain) {
  var transition = d3.transition().duration(1000).tween('zoom', function() {
    var oldStart = this.x.domain()[0];
    var oldEnd = this.x.domain()[1];
    var interpolate = d3.interpolate([+oldStart, +oldEnd],
        [+domain[0], +domain[1]]);
    return function(t) {
      this.x.domain(interpolate(t));
      this.zoom.x(this.x);
      this.transform();
      //this.display[0].transform();
      // TODO translate and zoom display, don't recalculate
    }.bind(this);
  }.bind(this))
      .each('end', function() {
        //this.showLoading = true;
        this.loadData(true, domain, function() {
          this.time.select('.zooms').style('opacity', 1);
        }.bind(this));
      }.bind(this));
  this.time.select('.zooms').style('opacity', 0);
};

Chart.prototype.transform = function() {
  this.transformXAxis();
  
  this.time.select('.zooms')
      .attr('transform',
          'translate(' + this.zoom.translate()[0] + ', 0) ' + 
          'scale(' + this.zoom.scale() + ', 1)');
  
  var handle = this.zoomer.select('.handle').node();
  var scale = this.zoom.scale();
  var extent = this.zoom.scaleExtent();
  var width = this.zoomer.node().clientWidth - handle.clientWidth;
  handle.style.left = Math.pow(
      (scale - extent[0]) / (extent[1] - extent[0]), 1/4) * width + 'px';

  BubbleBath.position();

  if (this.display[0].transformExtras) 
    this.display[0].transformExtras();
}

Chart.prototype.transformXAxis = function() {
  var axis = this.time.select('.x.axis')
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
};

Chart.prototype.loadData = function(first, domain, callback) {
  if (!domain) domain = this.x.domain();

  var params = this.display[0].getParameters(domain);
  params.feed = this.display[0].feed;
  params.datastream = this.display[0].datastream;
  var url = this.db + '/_design/energy_data/_show/historical?' +
      Object.keys(params).map(function(key) {
    return key + '=' + encodeURIComponent(params[key]);
  }).join('&');
  
  this.getJSON(url, function(result) {
    var data = this.display[0].getDataFromRequest(params, result);

    // Make transition to new domain on y axis
    var oldDomain = this.y.domain()[1];
    var newDomain = d3.max(
        data.map(function(d) { return d.value })) + Chart.EXTRA_UNITS_ABOVE;
    var tempScale = newDomain / oldDomain;

    this.y.domain([0, newDomain]);
    var axis = this.time.select('.y.axis');
    if (!first) {
      axis = axis.transition().duration(1000);
    }
    axis.call(this.yAxis);
    axis = this.time.select('.yText.axis')
    if (!first) {
      axis = axis.transition().duration(1000);
    }
    axis
       .call(this.yAxis)
      .selectAll('text')
        .attr('x', 5)
        .attr('y', -16);

    var from = 'matrix(1, 0, 0, ' +
        tempScale + ', 0, ' + (this.height - 48) * (1 - tempScale) + ') ' +
        'scale(' + (1 / this.zoom.scale()) + ', 1) ' +
        'translate(' + -this.zoom.translate()[0] + ', 0)';
    var to = 'scale(' + (1 / this.zoom.scale()) + ', 1) ' +
        'translate(' + -this.zoom.translate()[0] + ', 0)';
    if (first) from = to;
    
    this.display[0].setDataAndTransform(data, from, to);

    if (this.display[0].transformExtras) 
      this.display[0].transformExtras();

    BubbleBath.position();
    BubbleBath.load([this.display[0].feed],
        this.x.domain()[0], this.x.domain()[1]);
    // TODO load extra offscreen bubbles?

    this.loading.attr('opacity', 0);

    if (callback) callback();
  }.bind(this));

  if (this.showLoading) {
    this.loading.attr('opacity', .6);
    this.showLoading = false;
  }
};
