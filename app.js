// # Couchm
//
// The file `app.js` describes a CouchDB design document, which is basically an application that runs within the database. Run the command
//
//     ./node_modules/.bin/couchapp push app.js http://name:password@server/dbname
//
// to generate the actual design document. It’s then stored as a JSON doc with the `_id` `_design/energy_data`.

var couchapp = require('couchapp');
var path = require('path');

var ddoc = {
  _id: '_design/energy_data',
  views: {},
  lists: {},
  shows: {},
  filters: {},
  updates: {},
  rewrites: []
};

// ## Measurement update
//
// This accepts POST requests to `_design/energy_data/_update/measurement` containing JSON documents like
//
//     { "source": "Room 1", "ElectricPower": 42.0, "timestamp": 1366117340982 }
//
// and turns them into usable docs. It’s the only function in Couchm that actually stores data.
//
// In terms of Cosm concepts, the `source` field identifies the feed, and each field that is not called `source`, `timestamp`, `user` or `time` is considered to be a datastream value. All numbers are converted to strings so that we’re not bothered too much by CouchDB’s [decimal value handling](http://couchdb.readthedocs.org/en/latest/json-structure.html#number-handling).
ddoc.updates.measurement = function(doc, req) {
  doc = JSON.parse(req.body);
  for (var field in doc) {
    if (field != 'timestamp' && typeof doc[field] == 'number')
      doc[field] = '' + doc[field];
  }
  doc._id = req.uuid;
  doc.type = 'measurement';
  if (!doc.timestamp) doc.timestamp = new Date().getTime();
  doc.user = req.userCtx.name;
  return [doc, 'Thanks\n'];
};

// ## By source and time view
//
// This view indexes the measurements so that they can easily be accessed in a way similar to Cosm, e.g. by a feed name and a timestamp.
//
// The `shared` values and functions are accessible by other functions in this design doc.
ddoc.views.by_source_and_time = {
// ### Map: give each measurement a usable key
  map: function(doc) {
    var shared = {};
    shared.fields = [
      'at',
      'ElectricPower',
      'OfficeOccupied',
      'OfficeTemperature',
      'ElectricEnergy',
      'ElectricEnergyOccupied',
      'ElectricEnergyUnoccupied'
    ];
    shared.field = function(name) { return shared.fields.indexOf(name); }

// Use `unix_to_couchm_ts` and `couchm_to_unix_ts` to convert between ‘Couchm timestamps’ and Unix timestamps (the number of milliseconds since 1970 started). A Couchm timestamp is an array `[feed, number1, number2, number3, …]` where `feed` is the feed name and the numbers split up the timestamp using the intervals defined by the Cosm API.
//
// We use these complex keys because they allow for easy querying using [view collation](http://wiki.apache.org/couchdb/View_collation). The Couchm date representation is defined such that all times within an interval (t1, t2] can be collected within ‘group t2’ if you use [grouping](http://wiki.apache.org/couchdb/HTTP_view_API#Querying_Options), and then reduced to a single value (which we want to be the last value before t2).
//
// Conceptually the keys might be easy to understand if you consider that we could just as well have made keys like `["MyFeed", 2013, 4, 16, 14, 44, 23]` that look like a normal date. Just instead of years, months, days etc. we choose interval lengths in seconds that we actually want to use for subsampling data.
    shared.intervals = [0, 1, 30, 60, 300, 900, 1800, 3600, 10800, 21600, 43200, 86400, Infinity];
    shared.unix_to_couchm_ts = function(timestamp, source) {
      var ts = [source];
      var ivals = shared.intervals;
      var seconds = timestamp / 1000;
      var i;
      var val;
      var first_zero = -1;
      for (i = ivals.length - 2; i > 0; i--) {
        val = Math.ceil((seconds % ivals[i + 1]) / ivals[i]);
        ts.push(val);
        if (val == 0 && first_zero == -1) first_zero = ts.length - 1;
      }
      ts.push(timestamp);
      if (first_zero != -1) {
        for (var i = first_zero; i < ts.length - 1; i++) {
          ts[i] = ivals[ivals.length - i] / ivals[ivals.length - 1 - i];
        }
      }
      return ts;
    };
    shared.couchm_to_unix_ts = function(timestamp) {
      var ts = 0;
      var i;
      var j;
      var subtract = 0;
      var ivals = shared.intervals;
      for (i = ivals.length - 2, j = 1; i >= 1; i--, j++) {
        ts += ((timestamp[i] || 0) - subtract) * ivals[j];
        if (timestamp[i] > 0) subtract = 1;
      }
      return ts * 1000;
    };

    shared.unix_to_cosm_ts = function(timestamp) {
      return new Date(timestamp).toJSON().slice(0, 23) + '000Z';
    };
    
    if (!doc) {
      return shared;
    } else if (doc.type == 'measurement') {
// Every measurement is indexed with its Couchm timestamp and the data fields from `shared.fields` if provided. These fields are stored as an array, so use `shared.field(name)` to get the index of field `name`.
      var timestamp = (doc.timestamp > 10*365*24*60*60*1000) ? doc.timestamp : doc.timestamp * 1000;
      timestamp = parseInt(timestamp);
      if (timestamp > 50 * 365 * 24 * 60 * 60 * 1000) return;

      var key = shared.unix_to_couchm_ts(timestamp, doc.source);
    
      var value = [];
      value[shared.field('at')] = shared.unix_to_cosm_ts(timestamp);
      for (var i in doc) if (shared.field(i) != -1)
        value[shared.field(i)] = isNaN(parseFloat(doc[i])) ? doc[i] : parseFloat(doc[i]);

      emit(key, value);
    }
  },
// ### Reduce: keep the latest measured value
//
// The `at` value in row resulting from the map is used to find the latest measurement within a group. We do this because when we want to know the value at time t2, we can now ask for the reduced value over interval (0, t2]. Ideally this returns a measurement done at t2, but otherwise it should return the last measurement done before t2.
//
// Note that we currently assume that each measurement for a certain feed contains all relevant fields. If we ever want to collect measurements from multiple data sources, this reduce function should keep track of each field separately.
  reduce: function(keys, values, rereduce) {
    var latest = 0;
    var winner = null;
    for (var i = 0; i < values.length; i++) {
      var ts = +new Date(values[i][0]);
      if (ts > latest) {
        latest = ts;
        winner = values[i];
      }
    }
    return winner;
  }
};

// ## Querying for historical data
//
// To make data available using the API described in `README.md`, this show function takes Cosm-like parameters and calculates the right list URL.
ddoc.shows.historical = function(doc, req) {
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
    headers: { 'Location': url }
  };
};

// ## Datastream interpolation list
//
// This function loops over the rows returned by a view query, and converts it into a Cosm-like format that contains a value for each sample point.
ddoc.lists.interpolate_datastream = function(head, req) {
  start({
    headers: { 'Content-Type': 'application/json' }
  });
  
  var map = eval(this.views.by_source_and_time.map)();
  
  var stream = req.query.datastream;
  var at_idx = map.field('at');
  var stream_idx = map.field(stream);
  
  send('{\n  "id": ' + JSON.stringify(stream) + ',\n  "datapoints": [\n');
  
  var level = req.query.group_level;

  var first = req.query.startkey.slice(0, level);
  var last = req.query.endkey.slice(0, level);
  var step = map.intervals[map.intervals.length - level] * 1000;
  
  var meta = {
    min_value: Infinity,
    max_value: -Infinity,
    current_value: null,
    at: new Date(map.couchm_to_unix_ts(first))
  };
  
  var lastKey = map.couchm_to_unix_ts(first) - step;
  
  var first = true;
  var sendValue = function(dbg) {
    var obj = {
      at: meta.at,
      value: meta.current_value
    };
    if (dbg) obj.debug = dbg;
    send((first ? '' : ',\n') + '    ' + JSON.stringify(obj));
    first = false;
  };
  
  var row;
  while (row = getRow()) {
    var origkey = JSON.parse(JSON.stringify(row.key));
    var key = map.couchm_to_unix_ts(row.key);

    // Interpolate all streams up until now.
    for (var between = lastKey + step; between < key; between += step) {
      sendValue(['interpolate', new Date(between)]);
    }
    lastKey = key;
    
    // Update the datastream with new values.
    if (row.value.length > stream_idx && row.value[stream_idx] !== null) {
      meta.at = row.value[at_idx];
      var value = row.value[stream_idx];
      if (value === true || value === false) meta.current_value = value;
      else meta.current_value = '' + row.value[stream_idx];
      sendValue(['value', new Date(key)]);

      if (+meta.current_value > +meta.max_value)
        meta.max_value = meta.current_value;
      if (+meta.current_value < +meta.min_value)
        meta.min_value = meta.current_value;
    }
  }
  
  var end = map.couchm_to_unix_ts(last);
  for (var until = lastKey; until < end; until += step) {
    sendValue(['finish', new Date(until)]);
  }
  send('\n  ]');
  for (var key in meta)
    send(',\n  ' + JSON.stringify(key) + ': ' + JSON.stringify(meta[key]));
  meta.endkey = last;
  meta.endstamp = end;
  meta.origend = req.query.endkey;
  send('\n}\n');
};

// ## Utilities
//
// ### Domains view
//
// Used to see aggregated data about timestamps per data source. The `_stats` reduce function for example gives the minimum and maximum timestamp.
//
// We’re also working around wrongly submitted timestamps.
ddoc.views.domains = {
  map: function(doc) {
    if (doc.type == 'measurement') {
      var timestamp = parseInt(doc.timestamp);
      timestamp = (timestamp > 10 * 365 * 24 * 60 * 60 * 1000) ? timestamp : timestamp * 1000;
      if (timestamp < 50 * 365 * 24 * 60 * 60 * 1000) {
        emit(doc.source, timestamp);
      }
    }
  },
  reduce: '_stats'
};

// ### Measurement filter
//
// If you just want to keep up to date with measurements, optionally for a specific feed or datastream, use the [changes feed](http://couchdb.readthedocs.org/en/latest/changes.html) with the `energy_data/measurements` filter and optionally `feed` and `datastream` parameters.
ddoc.filters.measurements = function(doc, req) {
  if (doc.type != 'measurement') return false;
  if (req.query.feed && req.query.feed != doc.source) return false;
  if (req.query.datastream && Object.keys(doc).indexOf(req.query.datastream) == -1) return false;
  return true;
};

// ### Unix to Couchm timestamp conversion
//
// To get a Couchm timestamp that you can use for custom queries, do a GET request like
//
//     _design/energy_data/_show/unix_to_couchm_ts?feed=Room%201&timestamp=1366118531285
ddoc.shows.unix_to_couchm_ts = function(doc, req) {
  var map = eval(this.views.by_source_and_time.map)();
  var timestamp = parseInt(req.query.timestamp);
  var feed = req.query.feed;
  var result = map.unix_to_couchm_ts(timestamp, feed);
  
  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result)
  };
};

// ### Feeds and datastreams list
//
// To get an overview of available feeds and supported datastream names, do a GET request to
//
//     _design/energy_data/_rewrite/feeds_and_datastreams
ddoc.lists.feeds_and_datastreams = function(head, req) {
  start({
    headers: { 'Content-Type': 'application/json' }
  });
  
  var map = eval(this.views.by_source_and_time.map)();
  
  var result = {
    feeds: []
  };
  
  var row;
  while (row = getRow()) {
    result.feeds.push(row.key[0]);
  }
  
  result.datastreams = map.fields.slice(1);

  result.at_idx = 0;
  result.datastream_idx = {};
  for (var i = 1; i < map.fields.length; i++) {
    result.datastream_idx[map.fields[i]] = i;
  }
  
  result.intervals = map.intervals.slice(1, -1);
  
  send(JSON.stringify(result, null, 2));
};
ddoc.rewrites.push({
  from: '/feeds_and_datastreams',
  to: '/_list/feeds_and_datastreams/by_source_and_time',
  query: {
    group_level: '1'
  }
});

couchapp.loadAttachments(ddoc, path.join(__dirname, 'app'));

module.exports = ddoc;
