function json(url, callback) {
  // We’re using this instead of d3.json because the latter doesn’t seem to work well in IE10?
  var req = new XMLHttpRequest();
  req.withCredentials = true;
  req.open('GET', url, true);
  req.onreadystatechange = function() {
    if (req.readyState == 4 && req.status == 200)
      callback(JSON.parse(req.responseText));
  };
  req.send();
}

function start() {
  json('config.json', function(config) {
    json(config.couch + '/_design/energy_data/_rewrite/feeds_and_datastreams', function(info) {
      json(config.couch + '/_design/energy_data/_view/domains?group=true', function(domains) {
        init(config, info, domains);
      });
    });
  });
}

function url(config, base, args) {
  var url = config.couch + base;
  if (args) {
    var arr = [];
    for (var key in args)
      arr.push(key + '=' + encodeURIComponent(args[key]));
    url += '?' + arr.join('&');
  }
  return url;
}

var chart;

// Config
var config;

// Data
var data;

// The two graphs
var focus;
var context;

// Dimensions
var cwidth = 960;
var cheight = 500;
var margin = { top: 10, right: 10, bottom: 100, left: 40 };
var margin2 = { top: 430, right: 10, bottom: 20, left: 40 };
var width = cwidth - margin.left - margin.right;
var height = cheight - margin.top - margin.bottom;
var height2 = cheight - margin2.top - margin2.bottom;

// Scales
var x = d3.time.scale().range([0, width]);
var x2 = d3.time.scale().range([0, width]);
var y = d3.scale.linear().range([height, 0]);
var y2 = d3.scale.linear().range([height2, 0]);

// Axes
var xAxis = d3.svg.axis().scale(x).orient('bottom');
var xAxis2 = d3.svg.axis().scale(x2).orient('bottom');
var yAxis = d3.svg.axis().scale(y).orient('left');

// Brush
var brush = d3.svg.brush()
  .x(x2)
  .on('brush', set);

// Time
var n = 243;
var duration = 750;
var now = new Date(Date.now() - 60 * 60 * 1000 - duration);
//var start = now;
var count = 0;

// Use original time stamps or resampled?
var resampled = true;

var domains;
  
var area = d3.svg.area()
  //.interpolate('step-after') //step-after
  .x(function(d) { return x(resampled ? d.resampledAt : d.at) })
  .y0(height)
  .y1(function(d) { return y(d.value) });
var area2 = d3.svg.area()
  //.interpolate('step-after')
  .x(function(d) { return x2(resampled ? d.resampledAt : d.at) })
  .y0(height2)
  .y1(function(d) { return y2(d.value) });

// Set focus view
function set() {
  x.domain(brush.empty() ? x2.domain() : brush.extent());
  focus.select('path').attr('d', area);
  focus.select('.x.axis').call(xAxis);
}

function fetch(url, params) {
  json(url, function(ndata) {
    data = ndata.datapoints;

    data.forEach(function(d, i) {
      d.at = new Date(d.at) || 0;
      d.resampledAt = new Date(+new Date(params.start) + (i - 1) * params.interval * 1000);
      if (d.value === true) d.value = 1;
      else if (d.value === false) d.value = 0;
      else if (!isNaN(parseFloat(d.value))) d.value = parseFloat(d.value);
      else d.value = 0;
    });
    
    //x.domain(d3.extent(data.map(function(d) { return d.time })));
    //y.domain([0, d3.max(data.map(function(d) { return d.value }))]);
    //y2.domain(y.domain());
    y.domain([0, d3.max(data.map(function(d) { return d.value }))]);
    y2.domain(y.domain());
    
    focus.select('path').datum(data);
    focus.select('.y.axis').call(yAxis);
    
    context.select('path').datum(data).attr('d', area2);
    context.select('.x.brush').call(brush);
    
    set();
    
    d3.select('.loading').classed('visible', false);
  });
}

function settings() {
  var feed = d3.select('.feed').node().value;
  var datastream = d3.select('.datastream').node().value;
  var duration_number = d3.select('.duration_number').node().value;
  var duration_unit = d3.select('.duration_unit').node().value;
  var duration = duration_number + duration_unit;
  var start_date = d3.select('.start_date').node().value;
  var start_time = d3.select('.start_time').node().value;
  var start_datetime = start_date + 'T' + start_time + ':00+02:00';
  var interval = d3.select('.interval').node().value;
  resampled = !!d3.select('.resample').node().checked;
  
  d3.select('.o_feed').text(feed);
  d3.select('.o_number').text(domains[feed].count);
  d3.select('.o_first').text(new Date(domains[feed].min));
  d3.select('.o_last').text(new Date(domains[feed].max));
  
  var start = new Date(start_datetime);
  
  var params = {
    feed: feed,
    datastream: datastream,
    interval: interval,
    duration: duration,
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
  var parsed = /(\d+)([a-z]+)/.exec(duration);
  var ms = parseInt(parsed[1]) * units[parsed[2]] * 1000;
  
  var end = new Date(+start + ms);
  
  x.domain([start, end]);
  x2.domain(x.domain());

  context.select('.x.axis').call(xAxis2);
  
  d3.select('.loading').classed('visible', true);
  
  fetch(url(config, '/_design/energy_data/_show/historical', params), params);
}

function tick() {
  var interval = d3.select('.interval').node().value;
  switch (interval) {
    case 'minute': var dt = 60 * 1000; break;
    case 'hour': var dt = 60 * 60 * 1000; break;
    case 'day': var dt = 24 * 60 * 60 * 1000; break;
    case 'week': var dt = 7 * 24 * 60 * 60 * 1000; break;
    case 'month': var dt = 31 * 24 * 60 * 60 * 1000; break;
  }
  
  now = new Date() - 60 * 60 * 1000;
  x.domain([now - dt - duration, now - duration]);
  x2.domain(x.domain());
  
  focus.select('.x.axis').transition()
    .duration(duration)
    .ease('linear')
    .call(xAxis);
  context.select('.x.axis').transition()
    .duration(duration)
    .ease('linear')
    .call(xAxis2);
  
    //console.now, dt, x(now-dt));
  focus.select('path').transition()
    .duration(duration)
    .ease('linear')
    //.attr('transform', 'translate(' + x(start - (now)) + ')')
    .each('end', tick);
    
  context.select('path').transition()
    .duration(duration)
    .ease('linear')
    .attr('transform', 'translate(' + x2(now - dt) + ')');
}

function init(nconfig, feeds_and_datastreams, ndomains) {
  config = nconfig;
  
  domains = {};
  ndomains.rows.forEach(function(row) {
    domains[row.key] = row.value;
  });

  chart = d3.select('body').append('svg')
    .attr('class', 'chart')
    .attr('width', cwidth)
    .attr('height', cheight);
    
  chart.append('defs').append('clipPath')
    .attr('id', 'clip')
    .append('rect')
      .attr('width', width)
      .attr('height', height);
  
  focus = chart.append('g')
    .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
  
  context = chart.append('g')
    .attr('transform', 'translate(' + margin2.left + ',' + margin2.top + ')');

  focus.append('path')
    .datum({time:new Date(),value:0})
    .attr('clip-path', 'url(#clip)')
    .attr('d', area);
    
  focus.append('g')
    .attr('class', 'x axis')
    .attr('transform', 'translate(0,' + height + ')')
    .call(xAxis);
      
  focus.append('g')
    .attr('class', 'y axis')
    .call(yAxis);
        
  context.append('path')
    .datum({time:new Date(),value:0})
    .attr('d', area2);
        
  context.append('g')
    .attr('class', 'x axis')
    .attr('transform', 'translate(0,'  + height2 + ')')
    .call(xAxis2);

  context.append('g')
    .attr('class', 'x brush')
    .call(brush)
    .selectAll('rect')
      .attr('y', -6)
      .attr('height', height2 + 7);
  
  feeds_and_datastreams.feeds.forEach(function(feed) {
    var option = d3.select('.feed').append('option').text(feed);
    if (feed == 'room261') option.attr('selected', true);
  });
  feeds_and_datastreams.datastreams.forEach(function(stream) {
    var option = d3.select('.datastream').append('option').text(stream);
    if (stream == 'ElectricPower') option.attr('selected', true);
  });

  settings();

  d3.select('.feed').on('change', settings);
  d3.select('.datastream').on('change', settings);
  d3.select('.duration_number').on('change', settings);
  d3.select('.duration_unit').on('change', settings);
  d3.select('.start_date').on('change', settings);
  d3.select('.start_time').on('change', settings);
  d3.select('.interval').on('change', settings);
  d3.select('.resample').on('change', settings);
  
  //tick();
}
