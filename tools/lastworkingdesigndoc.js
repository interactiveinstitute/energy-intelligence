{
   "_id": "_design/energy_data",
   "_rev": "145-1e2ee6b4cbc6d1e315ab56a8a004d5c2",
   "views": {
       "by_source_and_time": {
           "map": "function (doc) {\n    var shared = {};\n    shared.fields = [\n      'at',\n      'ElectricPower',\n      'OfficeOccupied',\n      'OfficeTemperature',\n      'ElectricEnergy',\n      'ElectricEnergyOccupied',\n      'ElectricEnergyUnoccupied'\n    ];\n    shared.field = function(name) { return shared.fields.indexOf(name); }\n\n// Use `unix_to_couchm_ts` and `couchm_to_unix_ts` to convert between ‘Couchm timestamps’ and Unix timestamps (the number of milliseconds since 1970 started). A Couchm timestamp is an array `[feed, number1, number2, number3, …]` where `feed` is the feed name and the numbers split up the timestamp using the intervals defined by the Cosm API.\n//\n// We use these complex keys because they allow for easy querying using [view collation](http://wiki.apache.org/couchdb/View_collation). The Couchm date representation is defined such that all times within an interval (t1, t2] can be collected within ‘group t2’ if you use [grouping](http://wiki.apache.org/couchdb/HTTP_view_API#Querying_Options), and then reduced to a single value (which we want to be the last value before t2).\n//\n// Conceptually the keys might be easy to understand if you consider that we could just as well have made keys like `[\"MyFeed\", 2013, 4, 16, 14, 44, 23]` that look like a normal date. Just instead of years, months, days etc. we choose interval lengths in seconds that we actually want to use for subsampling data.\n    shared.intervals = [0, 1, 30, 60, 300, 900, 1800, 3600, 10800, 21600, 43200, 86400, Infinity];\n    shared.unix_to_couchm_ts = function(timestamp, source) {\n      var ts = [source];\n      var ivals = shared.intervals;\n      var seconds = timestamp / 1000;\n      var i;\n      var val;\n      var first_zero = -1;\n      for (i = ivals.length - 2; i > 0; i--) {\n        val = Math.ceil((seconds % ivals[i + 1]) / ivals[i]);\n        ts.push(val);\n        if (val == 0 && first_zero == -1) first_zero = ts.length - 1;\n      }\n      ts.push(timestamp);\n      if (first_zero != -1) {\n        for (var i = first_zero; i < ts.length - 1; i++) {\n          ts[i] = ivals[ivals.length - i] / ivals[ivals.length - 1 - i];\n        }\n      }\n      return ts;\n    };\n    shared.couchm_to_unix_ts = function(timestamp) {\n      var ts = 0;\n      var i;\n      var j;\n      var subtract = 0;\n      var ivals = shared.intervals;\n      for (i = ivals.length - 2, j = 1; i >= 1; i--, j++) {\n        ts += ((timestamp[i] || 0) - subtract) * ivals[j];\n        if (timestamp[i] > 0) subtract = 1;\n      }\n      return ts * 1000;\n    };\n\n    shared.unix_to_cosm_ts = function(timestamp) {\n      return new Date(timestamp).toJSON().slice(0, 23) + '000Z';\n    };\n\n// When using the historical API, extra data needs to be loaded from before the start time to ensure that the first datapoint actually contains a measurement. From this extra fetched data, only last datapoint in the interval `[start - extra_time_before, start]` will be used.\n    shared.extra_time_before = 24 * 60 * 60 * 1000;\n    \n    if (!doc) {\n      return shared;\n    } else if (doc.type == 'measurement') {\n// Every measurement is indexed with its Couchm timestamp and the data fields from `shared.fields` if provided. These fields are stored as an array, so use `shared.field(name)` to get the index of field `name`.\n      var timestamp = (doc.timestamp > 10*365*24*60*60*1000) ? doc.timestamp : doc.timestamp * 1000;\n      timestamp = parseInt(timestamp);\n      if (timestamp > 50 * 365 * 24 * 60 * 60 * 1000) return;\n\n      var key = shared.unix_to_couchm_ts(timestamp, doc.source);\n    \n      var value = [];\n      value[shared.field('at')] = shared.unix_to_cosm_ts(timestamp);\n      for (var i in doc) if (shared.field(i) != -1)\n        value[shared.field(i)] = isNaN(parseFloat(doc[i])) ? doc[i] : parseFloat(doc[i]);\n\n      emit(key, value);\n    }\n  }",
           "reduce": "function (keys, values, rereduce) {\n    var latest = 0;\n    var winner = null;\n    for (var i = 0; i < values.length; i++) {\n      var ts = +new Date(values[i][0]);\n      if (ts > latest) {\n        latest = ts;\n        winner = values[i];\n      }\n    }\n    return winner;\n  }"
       },
       "domains": {
           "map": "function (doc) {\n    if (doc.type == 'measurement') {\n      var timestamp = parseInt(doc.timestamp);\n      timestamp = (timestamp > 10 * 365 * 24 * 60 * 60 * 1000) ? timestamp : timestamp * 1000;\n      if (timestamp < 50 * 365 * 24 * 60 * 60 * 1000) {\n        emit(doc.source, timestamp);\n      }\n    }\n  }",
           "reduce": "_stats"
       },
       "extrema": {
           "map": "function (doc) {\n    if (doc.type == 'measurement') {\n      var ignore = ['_id', '_rev', 'source', 'type', 'user'];\n      for (var name in doc) {\n        if (ignore.indexOf(name) == -1) {\n          var timestamp = parseInt(doc.timestamp);\n          var key = [doc.source, name, timestamp];\n          var value = doc[name];\n          timestamp = (timestamp > 10 * 365 * 24 * 60 * 60 * 1000) ? timestamp : timestamp * 1000;\n          if (timestamp > 50 * 365 * 24 * 60 * 60 * 1000) return;\n          if (value === true || value === false) {\n            emit(key, [timestamp, +value]);\n          } else {\n            var parsed = parseFloat(value);\n            if (!isNaN(parsed)) {\n              emit(key, [timestamp, parsed]);\n            }\n          }\n        }\n      }\n    }\n  }",
           "reduce": "function (keys, values, rereduce) {\n    if (rereduce)\n      values = Array.prototype.concat.apply([], values.map(function(v) {\n        return [v.min, v.max];\n      }));\n    values.sort(function(a, b) { return a[1] > b[1]; });\n    return { min: values[0], max: values[values.length - 1] };\n  }"
       }
   },
   "filters": {
       "measurements": "function (doc, req) {\n  if (doc.type != 'measurement') return false;\n  if (req.query.source && req.query.source != doc.source)\n    return false;\n  if (req.query.datastream && Object.keys(doc).indexOf(req.query.datastream) == -1) return false;\n  return true;\n}",
       "to_feed": "function (doc, req) {\n  return doc._id.indexOf('_design/') == 0 || doc.source == req.query.feed;\n}"
   },
   "updates": {
       "measurement": "function (doc, req) {\n  doc = JSON.parse(req.body);\n  for (var field in doc) {\n    if (field != 'timestamp' && typeof doc[field] == 'number')\n      doc[field] = '' + doc[field];\n  }\n  doc._id = req.uuid;\n  doc.type = 'measurement';\n  if (!doc.timestamp) doc.timestamp = new Date().getTime();\n  doc.user = req.userCtx.name;\n  return [doc, 'Thanks\\n'];\n}"
   },
   "attachments_md5": {
       "config.json": {
           "revpos": 142,
           "md5": "156d2e206919690ebd42b7be17049009"
       },
       "d3.v3.min.js": {
           "revpos": 59,
           "md5": "3d75deabac4c4af4c81efecd598ff1ac"
       },
       "graphs.css": {
           "revpos": 85,
           "md5": "b2ee4cd6e6b69a5038ba7d3c614bd2f3"
       },
       "graphs.html": {
           "revpos": 85,
           "md5": "1050c749139186bb28e828b8e14d6cab"
       },
       "graphs.js": {
           "revpos": 85,
           "md5": "14fd34f35541e65bd8fafc30c54dfb28"
       },
       "d3.html": {
           "revpos": 115,
           "md5": "1fa273337052cf48d17f2c46841cc9d5"
       },
       "d3.v3.js": {
           "revpos": 119,
           "md5": "33ab1ba6c80075b48391727ed3b1f517"
       },
       "config.json.new": {
           "revpos": 85,
           "md5": "3f3a2d929c75c20ba04dd601db890c00"
       },
       "graphs.css.new": {
           "revpos": 85,
           "md5": "b107e8d2d55e2777ddd82ed9bcda82af"
       },
       "graphs.html.new": {
           "revpos": 85,
           "md5": "c97e41919d4885da45d4057d3896d632"
       },
       "graphs.js.new": {
           "revpos": 85,
           "md5": "ddb9349222635e871f970f3e4c7d8fe5"
       },
       "d3.css": {
           "revpos": 119,
           "md5": "4fe3ae3b2d480f27ee07fb9f30e8ef14"
       },
       "d3main.js": {
           "revpos": 119,
           "md5": "d4bfea4742e1f9badceccc696bc79fbc"
       },
       "app-mockup.png": {
           "revpos": 119,
           "md5": "fb3ac019ae637ad37f6dd9c92659feb5"
       },
       "touchtest.html": {
           "revpos": 116,
           "md5": "3b8bb3ce7881a3c919b6a6df65c7beb0"
       },
       "button-wh.png": {
           "revpos": 119,
           "md5": "ff3a1e662d9be40616fd6a946934c922"
       },
       "zoomer-handle.png": {
           "revpos": 119,
           "md5": "e4afdfb7a07c8b6ba37963a772343866"
       },
       "zoomer.png": {
           "revpos": 119,
           "md5": "b48cfc1d109b813bd1252955f6432d29"
       }
   },
   "lists": {
       "interpolate_datastream": "function (head, req) {\n  start({\n    headers: { 'Content-Type': 'application/json' }\n  });\n  \n  var map = eval(this.views.by_source_and_time.map)();\n  \n  var stream = req.query.datastream;\n  var at_idx = map.field('at');\n  var stream_idx = map.field(stream);\n  \n  send('{\\n  \"id\": ' + JSON.stringify(stream) + ',\\n  \"datapoints\": [\\n');\n  \n  var level = req.query.group_level;\n\n  var first = req.query.startkey.slice(0, level);\n  var last = req.query.endkey.slice(0, level);\n  var step = map.intervals[map.intervals.length - level] * 1000;\n  \n  var meta = {\n    min_value: Infinity,\n    max_value: -Infinity,\n    current_value: null,\n    at: new Date(map.couchm_to_unix_ts(first))\n  };\n  \n  var realFirstKey = map.couchm_to_unix_ts(first) + map.extra_time_before;\n  var lastKey = realFirstKey - step;\n  \n  var isFirst = true;\n  var sendValue = function(dbg, key) {\n    var obj = {\n      at: key,\n      value: meta.current_value || '0'\n    };\n    if (dbg) obj.debug = dbg;\n    send((isFirst ? '' : ',\\n') + '    ' + JSON.stringify(obj));\n    isFirst = false;\n  };\n  \n  var row;\n  while (row = getRow()) {\n    var origkey = JSON.parse(JSON.stringify(row.key));\n    var key = map.couchm_to_unix_ts(row.key);\n\n    log('keys ' + key + ' ??? ' + realFirstKey);\n\n    // Interpolate all streams up until now.\n    if (key >= realFirstKey) {\n      for (var between = lastKey + step; between < key; between += step) {\n        sendValue(['interpolate', new Date(between), meta.at],\n          new Date(between));\n      }\n      lastKey = key;\n    }\n    \n    // Update the datastream with new values.\n    if (row.value.length > stream_idx && row.value[stream_idx] !== null) {\n      meta.at = row.value[at_idx];\n      var value = row.value[stream_idx];\n      if (value === true || value === false) meta.current_value = '' + +value;\n      else meta.current_value = '' + row.value[stream_idx];\n      if (key >= realFirstKey)\n        sendValue(['value', new Date(key), meta.at], new Date(key));\n\n      if (+meta.current_value > +meta.max_value)\n        meta.max_value = meta.current_value;\n      if (+meta.current_value < +meta.min_value)\n        meta.min_value = meta.current_value;\n    }\n  }\n  \n  var end = map.couchm_to_unix_ts(last);\n  for (var until = lastKey + step; until < end; until += step) {\n    sendValue(['finish', new Date(until), meta.at], new Date(until));\n  }\n  send('\\n  ]');\n  for (var key in meta)\n    send(',\\n  ' + JSON.stringify(key) + ': ' + JSON.stringify(meta[key]));\n  meta.endkey = last;\n  meta.endstamp = end;\n  meta.origend = req.query.endkey;\n  send('\\n}\\n');\n}",
       "feeds_and_datastreams": "function (head, req) {\n  start({\n    headers: { 'Content-Type': 'application/json' }\n  });\n  \n  var map = eval(this.views.by_source_and_time.map)();\n  \n  var result = {\n    feeds: []\n  };\n  \n  var row;\n  while (row = getRow()) {\n    result.feeds.push(row.key[0]);\n  }\n  \n  result.datastreams = map.fields.slice(1);\n\n  result.at_idx = 0;\n  result.datastream_idx = {};\n  for (var i = 1; i < map.fields.length; i++) {\n    result.datastream_idx[map.fields[i]] = i;\n  }\n  \n  result.intervals = map.intervals.slice(1, -1);\n  \n  send(JSON.stringify(result, null, 2));\n}"
   },
   "shows": {
       "historical": "function (doc, req) {\n  // This show function builds the right query URL based on a Cosm-like URL.\n  var url = '/' + req.path.splice(0, 3).join('/') + '/_list/interpolate_datastream/by_source_and_time?';\n  var params = {};\n  \n  // Get intervals and the key function from the map function.\n  var map = eval(this.views.by_source_and_time.map)();\n  \n  // Which group level does this belong to?\n  var interval = parseInt(req.query.interval) || 0;\n  var index = map.intervals.indexOf(interval);\n  if (index == -1) index = 0;\n  params.group_level = map.intervals.length - index;\n  \n  // Determine start and end timestamps.\n  var units = {\n    second: 1, seconds: 1,\n    minute: 60, minutes: 60,\n    hour: 60 * 60, hours: 60 * 60,\n    day: 60 * 60 * 24, days: 60 * 60 * 24,\n    week: 60 * 60 * 24 * 7, weeks: 60 * 60 * 24 * 7,\n    month: 60 * 60 * 24 * 31, months: 60 * 60 * 24 * 31,\n    year: 60 * 60 * 24 * 366, years: 60 * 60 * 24 * 366\n  };\n  var duration = /(\\d+)([a-z]+)/.exec(req.query.duration);\n  var ms = parseInt(duration[1]) * units[duration[2]] * 1000;\n  var start = req.query.start ? +new Date(req.query.start) : +new Date - ms;\n  var end = start + ms;\n\n  // Fetch extra points at the start.\n  start -= map.extra_time_before;\n\n  // Use the map key function to determine the boundaries.\n  params.startkey = JSON.stringify(map.unix_to_couchm_ts(start, req.query.feed, true));\n  params.endkey = JSON.stringify(map.unix_to_couchm_ts(end, req.query.feed, true));\n  \n  params.datastream = req.query.datastream;\n  \n  // Finish the URL.\n  url += Object.keys(params).map(function(key) {\n    return key + '=' + encodeURIComponent(params[key]);\n  }).join('&');\n\n  return {\n    code: 302, // Found\n    headers: { 'Location': url, 'Content-Type': 'application/json' }\n  };\n}",
       "unix_to_couchm_ts": "function (doc, req) {\n  var map = eval(this.views.by_source_and_time.map)();\n  var timestamp = parseInt(req.query.timestamp);\n  var feed = req.query.feed;\n  var result = map.unix_to_couchm_ts(timestamp, feed);\n  \n  return {\n    headers: { 'Content-Type': 'application/json' },\n    body: JSON.stringify(result)\n  };\n}"
   },
   "rewrites": [
       {
           "from": "/feeds_and_datastreams",
           "to": "/_list/feeds_and_datastreams/by_source_and_time",
           "query": {
               "group_level": "1"
           }
       }
   ],
   "validate_doc_update": "function (newDoc, oldDoc, userCtx, secObj) {\n  if (userCtx.roles.indexOf('writer') == -1) {\n    throw({ forbidden: 'The \"writer\" role is required to make changes.' });\n  }\n}",
   "_attachments": {
       "config.json": {
           "content_type": "application/json",
           "revpos": 142,
           "digest": "md5-qXzZzrqO9TE7wPhjcnjrOg==",
           "length": 21,
           "stub": true
       },
       "d3.v3.min.js": {
           "content_type": "text/javascript",
           "revpos": 59,
           "digest": "md5-t74VMnPXnYdN3s2u2nCSdA==",
           "length": 126757,
           "stub": true
       },
       "graphs.css": {
           "content_type": "text/css",
           "revpos": 85,
           "digest": "md5-LnZWDl7LHpb0po0CUoaqqQ==",
           "length": 1331,
           "stub": true
       },
       "graphs.html": {
           "content_type": "text/html",
           "revpos": 85,
           "digest": "md5-8H6LuBWGHBbkeyQl9lNJEw==",
           "length": 1578,
           "stub": true
       },
       "graphs.js": {
           "content_type": "text/javascript",
           "revpos": 85,
           "digest": "md5-5Af+xF1jV94c6+Ow7zwHiw==",
           "length": 8483,
           "stub": true
       },
       "d3.html": {
           "content_type": "text/html",
           "revpos": 115,
           "digest": "md5-pR9kvO6DOd3PAHBOmH97GA==",
           "length": 497,
           "stub": true
       },
       "d3.v3.js": {
           "content_type": "text/javascript",
           "revpos": 119,
           "digest": "md5-wptS01wXnIKYltgcdovWJw==",
           "length": 293430,
           "stub": true
       },
       "config.json.new": {
           "content_type": "application/octet-stream",
           "revpos": 85,
           "digest": "md5-k1clu7cAj7oezcZQ2MEkhA==",
           "length": 67,
           "stub": true
       },
       "graphs.css.new": {
           "content_type": "application/octet-stream",
           "revpos": 85,
           "digest": "md5-a8JX+Pb21cNsN7HEwXUbWA==",
           "length": 1344,
           "stub": true
       },
       "graphs.html.new": {
           "content_type": "application/octet-stream",
           "revpos": 85,
           "digest": "md5-B9pT1iIJIbVbRU6en8ObqA==",
           "length": 1578,
           "stub": true
       },
       "graphs.js.new": {
           "content_type": "application/octet-stream",
           "revpos": 85,
           "digest": "md5-Nc/sN4dBaU7L366FiT17bw==",
           "length": 6437,
           "stub": true
       },
       "d3.css": {
           "content_type": "text/css",
           "revpos": 119,
           "digest": "md5-I1IyVs0z+c/fbADWsrdS/w==",
           "length": 1730,
           "stub": true
       },
       "d3main.js": {
           "content_type": "text/javascript",
           "revpos": 119,
           "digest": "md5-sEDeYKFgc3O3vXMTuqKnog==",
           "length": 15942,
           "stub": true
       },
       "app-mockup.png": {
           "content_type": "image/png",
           "revpos": 119,
           "digest": "md5-pdBa5xjuoQ7tiSmjFANFyA==",
           "length": 20773,
           "stub": true
       },
       "touchtest.html": {
           "content_type": "text/html",
           "revpos": 116,
           "digest": "md5-xsqoqR50oRxaamOIo1/UFA==",
           "length": 493,
           "stub": true
       },
       "button-wh.png": {
           "content_type": "image/png",
           "revpos": 119,
           "digest": "md5-YVr4nV0aOBQmmYrd83H/7Q==",
           "length": 1659,
           "stub": true
       },
       "zoomer-handle.png": {
           "content_type": "image/png",
           "revpos": 119,
           "digest": "md5-NwHJS2nW0i485eAohB4uuQ==",
           "length": 2514,
           "stub": true
       },
       "zoomer.png": {
           "content_type": "image/png",
           "revpos": 119,
           "digest": "md5-zSVb9SZdqH7jps8zxjmG0Q==",
           "length": 1689,
           "stub": true
       }
   }
}