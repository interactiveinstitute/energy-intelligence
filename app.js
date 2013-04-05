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
      this.intervals = [0, 1, 30, 60, 300, 900, 1800, 3600, 10800, 21600, 43200, 86400, Infinity];
      this.key = function(source, timestamp) {
        var key = new Array(this.intervals.length - 2);

        key[0] = source;
        for (var i = 0, n = this.intervals.length; i < n - 2; i++)
          key[i + 1] = Math.ceil(
            (timestamp / 1000 % this.intervals[n - 1 - i]) /
            (this.intervals[n - 2 - i])
          );
        key[i] = timestamp;

        return key;
      };
      this.cosmstamp = function(timestamp) {
        return new Date(timestamp * 1000).toJSON().slice(0, 23) + '000Z';
      };

      if (doc.type != 'measurement') return;
      
      // Fix wrongly submitted data
      //var timestamp = (doc.timestamp > 10*365*24*60*60*1000) ? doc.timestamp : doc.timestamp * 1000;

      var key = this.key(doc.source, doc.timestamp);
      
      var value = { at: this.cosmstamp(doc.timestamp / 1000), data: {} };
      for (var i in doc) if (['_id', '_rev', 'type', 'timestamp', 'user', 'source'].indexOf(i) == -1)
        value.data[i] = isNaN(parseFloat(doc[i])) ? doc[i] : parseFloat(doc[i]);

      emit(key, value);
    },
    reduce: function(keys, values, rereduce) {
      return values[values.length - 1];
    }
  }
};

ddoc.lists = {
  interpolate: function(head, req) {
    function timestamp(arr) {
      return arr.map(function(number, i) {
        return (number - 1) * map.intervals[map.intervals.length - i - 2];
      }).reduce(function(prev, curr) {
        return prev + curr;
      });
    }
    // for boundaries
    function timestamp2(arr) {
      return arr.map(function(number, i) {
        return (number) * map.intervals[map.intervals.length - i - 2];
      }).reduce(function(prev, curr) {
        return prev - curr;
      });
    }
    
    start({
      headers: { 'Content-Type': 'application/json' }
    });
    
    var result = {
      datastreams: []
    };
    
    var map = new (eval(this.views.by_source_and_time.map))({});
    
    var level = req.query.group_level;

    var cp1 = JSON.stringify(req.query.startkey);
    var cp2 = JSON.stringify(req.query.startkey);
    var first = req.query.startkey.splice(1, level - 1);
    var last = req.query.endkey.splice(1, level - 1);
    var step = map.intervals[map.intervals.length - level];
    
    var at = timestamp(first);
    var value = 0;
    
    var track = {};
    
    var row;
    while (row = getRow()) {
      var origkey = JSON.parse(JSON.stringify(row.key));
      var key = timestamp(row.key.splice(1));
      var at = row.value.at;
      
      // Create new steams if needed.
      for (var stream in row.value.data) {
        if (!(stream in track)) {
          var SPLICED = JSON.parse(cp2).splice(1, level - 2);
          var n = result.datastreams.push({
            id: stream,
            min_value: Infinity,
            max_value: -Infinity,
            datapoints: [],
            start: {
              date: new Date(timestamp(SPLICED) * 1000).toJSON(),
              querystartkey: JSON.parse(cp1),
              spliced: SPLICED
            },
            end: {
              date: new Date(timestamp(last) * 1000).toJSON()
            },
            blub: {
              between: timestamp(first),
              step: step,
              key: key
            }
          });
          track[stream] = {
            lastAt: new Date(timestamp(first) * 1000).toJSON(),
            lastKey: timestamp(first) - step,
            lastValue: null,
            index: n - 1
          };
        }
      }
        
      // Interpolate all streams up until now.
      for (var stream in track) {
        for (var between = track[stream].lastKey + step; between < key; between += step) {
          result.datastreams[track[stream].index].datapoints.push({
            at: track[stream].lastAt,
            value: track[stream].lastValue,
            bla: true,
            from: track[stream].lastKey,
            to: key,
            step: step,
            between: between
          });
          //if (result.datastreams[track[stream].index].datapoints.length > 200) return JSON.stringify(result, null, 2);
        }
        track[stream].lastKey = key;
      }
      
      // Update all relevant datastreams with new values.
      for (var stream in row.value.data) {
        var datastream = result.datastreams[track[stream].index];
        datastream.datapoints.push({
          at: row.value.at,
          value: '' + row.value.data[stream],
          bleh: false,
          key: origkey,
          keystamp: key
        });
        track[stream].lastAt = row.value.at;
        track[stream].lastValue = row.value.data[stream];
        if (+row.value.data[stream] > datastream.max_value)
          datastream.max_value = +row.value.data[stream];
        if (+row.value.data[stream] < datastream.min_value)
          datastream.min_value = +row.value.data[stream];
      }
    }
    
    var end = timestamp(last);
    for (var stream in track) {
      for (var until = track[stream].lastKey; until < end; until += step) {
        result.datastreams[track[stream].index].datapoints.push({
          at: track[stream].lastAt,
          value: track[stream].lastValue,
          until: until
        });
      }
      result.datastreams[track[stream].index].current_value = track[stream].lastValue;
      result.datastreams[track[stream].index].at = track[stream].lastAt;
    }

    send(JSON.stringify(result, null, 2));
  }
};

ddoc.shows = {
  historical: function(doc, req) {
    // This show function builds the right query URL based on a Cosm-like URL.
    var url = '/' + req.path.splice(0, 3).join('/') + '/_list/interpolate/by_source_and_time?';
    var params = {};
    
    // Get intervals and the key function from the map function.
    var map = new (eval(this.views.by_source_and_time.map))({});
    
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
    start -= 1000;
    var end = start + 2000 + ms;

    // Use the map key function to determine the boundaries.
    params.startkey = JSON.stringify(map.key(req.query.source, start));
    params.endkey = JSON.stringify(map.key(req.query.source, end));
    
    // Finish the URL.
    url += Object.keys(params).map(function(key) {
      return key + '=' + encodeURIComponent(params[key]);
    }).join('&');
    
    function timestamp(arr) {
      return arr.map(function(number, i) {
        return (number - 1) * map.intervals[map.intervals.length - i - 2];
      }).reduce(function(prev, curr) {
        return prev + curr;
      });
    }
    function timestamp2(arr) {
      return arr.map(function(number, i) {
        return (number) * map.intervals[map.intervals.length - i - 2];
      }).reduce(function(prev, curr) {
        return prev - curr;
      });
    }
    
    /*
    return JSON.stringify({
      url: url,
      start: new Date(start).toJSON(),
      startkey: JSON.parse(params.startkey),
      startbla: timestamp(JSON.parse(params.startkey).splice(1, params.group_level)) * 1000,
      startts: new Date(timestamp(JSON.parse(params.startkey).splice(1, params.group_level)) * 1000).toJSON(),
      startts2: new Date(timestamp2(JSON.parse(params.startkey).splice(1, params.group_level)) * 1000).toJSON(),
      end: new Date(end).toJSON(),
      endkey: JSON.parse(params.endkey),
      endts: new Date(timestamp(JSON.parse(params.endkey).splice(1, params.group_level)) * 1000).toJSON()
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

couchapp.loadAttachments(ddoc, path.join(__dirname, 'app'));

module.exports = ddoc;
