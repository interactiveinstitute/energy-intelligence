function (doc, req) {
  // This show function builds the right query URL based on a Cosm-like URL.
  var url = '/' + req.path.splice(0, 3).join('/') + '/_list/interpolate_datastream/by_source_and_time?';
  var params = {};
  
  // Get intervals and the key function from the map function.
  var map = eval(this.views.by_source_and_time.map)();
  
  // Which group level does this belong to?
  var interval = parseInt(req.query.interval) || 0;
  var index = map.intervals.indexOf(interval);
  if (index == -1) index = 0;
  params.group_level = map.intervals.length - index;
  
  // Determine start and end timestamps.
  var units = {
    second: 1, seconds: 1,
    minute: 60, minutes: 60,
    hour: 60 * 60, hours: 60 * 60,
    day: 60 * 60 * 24, days: 60 * 60 * 24,
    week: 60 * 60 * 24 * 7, weeks: 60 * 60 * 24 * 7,
    month: 60 * 60 * 24 * 31, months: 60 * 60 * 24 * 31,
    year: 60 * 60 * 24 * 366, years: 60 * 60 * 24 * 366
  };
  var duration = /(\d+)([a-z]+)/.exec(req.query.duration);
  var ms = parseInt(duration[1]) * units[duration[2]] * 1000;
  var start = req.query.start ? +new Date(req.query.start) : +new Date - ms;
  var end = start + ms;

  // Fetch extra points at the start.
  start -= map.extra_time_before;

  // Use the map key function to determine the boundaries.
  params.startkey = JSON.stringify(map.unix_to_couchm_ts(start, req.query.feed, true));
  params.endkey = JSON.stringify(map.unix_to_couchm_ts(end, req.query.feed, true));
  
  params.datastream = req.query.datastream;
  
  // Finish the URL.
  url += Object.keys(params).map(function(key) {
    return key + '=' + encodeURIComponent(params[key]);
  }).join('&');

  return {
    code: 302, // Found
    headers: { 'Location': url, 'Content-Type': 'application/json' }
  };
}