var couchapp = require('couchapp');
var path = require('path');

var ddoc = {
  _id: '_design/energy_data'
};

ddoc.views = {
  /*
   * Use the domains view to see aggregated data about timestamps per data
   * source. The _stats reduce function for example gives the minimum and
   * maximum timestamp.
   */
  domains: {
    map: function(doc) {
      if (doc.type != 'measurement') return;
      var timestamp = (doc.timestamp > 10 * 365 * 24 * 60 * 60 * 1000) ? doc.timestamp : doc.timestamp * 1000;
      if (timestamp > 50 * 365 * 24 * 60 * 60 * 1000) return;
      emit(doc.source, timestamp);
    },
    reduce: '_stats'
  },
  
  wrong_timestamp: {
    map: function(doc) {
      if (doc.timestamp < 10*365*24*60*60*1000) emit(null, {_rev:doc._rev,_id:doc._id,_deleted:true});
    }
  },

  by_source_and_time: {
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
      shared.intervals = [0, 1, 30, 60, 300, 900, 1800, 3600, 10800, 21600, 43200, 86400, Infinity];
      shared.unix_to_couchm_ts = function(timestamp, source, limit) {
        limit = true;
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
        if (limit && first_zero != -1) {
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
      
      if (!doc) return shared;

      if (doc.type != 'measurement') return;
      
      // Fix wrongly submitted data
      var timestamp = (doc.timestamp > 10*365*24*60*60*1000) ? doc.timestamp : doc.timestamp * 1000;
      timestamp = parseInt(timestamp);

      var key = shared.unix_to_couchm_ts(timestamp, doc.source);
      
      var value = [];
      value[shared.field('at')] = shared.unix_to_cosm_ts(timestamp);
      for (var i in doc) if (shared.field(i) != -1)
        value[shared.field(i)] = isNaN(parseFloat(doc[i])) ? doc[i] : parseFloat(doc[i]);

      emit(key, value);
    },
    reduce: function(keys, values, rereduce) {
      // Note: we currently ignore earlier measurements that may contain more values.
      // In case values will be submitted using multiple types of measurement docs,
      // we can merge them here.
      return values[values.length - 1];
    }
  }
};

ddoc.lists = {
  feeds_and_datastreams: function(head, req) {
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
    
    send(JSON.stringify(result, null, 2));
  },
  interpolate_datastream: function(head, req) {
    start({
      headers: { 'Content-Type': 'application/json' }
    });
    
    var map = eval(this.views.by_source_and_time.map)();
    
    var stream = req.query.datastream;
    var at_idx = map.field('at');
    var stream_idx = map.field(stream);
    
    send('{\n  "id": ' + JSON.stringify(stream) + ',\n  "datapoints": [\n');
    
    var level = req.query.group_level;
    //send(JSON.stringify(req.query.startkey) + '\n');

    var first = req.query.startkey.slice(0, level);
    //return send(map.couchm_to_unix_ts(first));
    var last = req.query.endkey.slice(0, level);
    var step = map.intervals[map.intervals.length - level] * 1000;
    
    
    /*
    result.start = new Date(map.couchm_to_unix_ts(first)).toJSON();
    result.end = new Date(map.couchm_to_unix_ts(last)).toJSON();
    send(JSON.stringify(result, null, 2));
    return;
    */
    
    //var at = map.couchm_to_unix_ts(first);
    //var value = 0;
    
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
      
      //var at = row.value.at;
      
      /*
      // Create new steams if needed.
      for (var stream in row.value.data) {
        if (!(stream in track)) {
          var n = result.datastreams.push({
            id: stream,
            min_value: Infinity,
            max_value: -Infinity,
            datapoints: [],
            end: {
              date: new Date(map.couchm_to_unix_ts(last)).toJSON()
            },
            blub: {
              between: map.couchm_to_unix_ts(first),
              step: step,
              key: key
            }
          });
          track[stream] = {
            lastAt: new Date(map.couchm_to_unix_ts(first)).toJSON(),
            lastKey: map.couchm_to_unix_ts(first) - step,
            lastValue: null,
            index: n - 1
          };
        }
      }
      */
        
      // Interpolate all streams up until now.
      //for (var stream in track) {
        for (var between = lastKey + step; between < key; between += step) {
          sendValue(['interpolate', new Date(between)]);
        }
        lastKey = key;
        //}
      
      // Update all relevant datastreams with new values.
      //for (var stream in row.value.data) {
        //var datastream = result.datastreams[track[stream].index];
        

        
        
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
      //}
    }
    
    var end = map.couchm_to_unix_ts(last);
    //for (var stream in track) {
      for (var until = lastKey; until < end; until += step) {
        sendValue(['finish', new Date(until)]);
      }
      //result.datastreams[track[stream].index].current_value = track[stream].lastValue;
      //result.datastreams[track[stream].index].at = track[stream].lastAt;
      //}
    send('\n  ]');
    for (var key in meta)
      send(',\n  ' + JSON.stringify(key) + ': ' + JSON.stringify(meta[key]));
    meta.endkey = last;
    meta.endstamp = end;
    meta.origend = req.query.endkey;
    //send(JSON.stringify(meta));
    send('\n}\n');

    //send(JSON.stringify(result, null, 2));
  }
};

ddoc.shows = {
  historical: function(doc, req) {
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
    //start -= 1000;
    var end = start + ms;// + 2000 + ms;

    // Use the map key function to determine the boundaries.
    params.startkey = JSON.stringify(map.unix_to_couchm_ts(start, req.query.feed, true));
    params.endkey = JSON.stringify(map.unix_to_couchm_ts(end, req.query.feed, true));
    
    params.datastream = req.query.datastream;
    
    // Finish the URL.
    url += Object.keys(params).map(function(key) {
      return key + '=' + encodeURIComponent(params[key]);
    }).join('&');
    
    /*
    return JSON.stringify({
      url: url,
      start: new Date(start).toJSON(),
      startkey: JSON.parse(params.startkey),
      //startbla: timestamp(JSON.parse(params.startkey).splice(1, params.group_level)) * 1000,
      //startts: new Date(timestamp(JSON.parse(params.startkey).splice(1, params.group_level)) * 1000).toJSON(),
      //startts2: new Date(timestamp2(JSON.parse(params.startkey).splice(1, params.group_level)) * 1000).toJSON(),
      end: new Date(end).toJSON(),
      endkey: JSON.parse(params.endkey),
      //endts: new Date(timestamp(JSON.parse(params.endkey).splice(1, params.group_level)) * 1000).toJSON()
    }, null, 2);
    */
    return {
      code: 302, // Found
      headers: { 'Location': url }
    };
  }
};

ddoc.filters = {
};

ddoc.updates = {
  measurement: function(doc, req) {
    doc = JSON.parse(req.body);
    doc._id = req.uuid;
    doc.type = 'measurement';
    if (!doc.timestamp) doc.timestamp = new Date().getTime();
    doc.user = req.userCtx.name;
    return [doc, 'Thanks\n'];
  }
};

ddoc.rewrites = [
  {
    from: '/feeds_and_datastreams',
    to: '/_list/feeds_and_datastreams/by_source_and_time',
    query: {
      group_level: '1'
    }
  }
];

couchapp.loadAttachments(ddoc, path.join(__dirname, 'app'));

module.exports = ddoc;
