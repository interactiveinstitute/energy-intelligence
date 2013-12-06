function (head, req) {
  // Create an HTTP response
  start({
    headers: { 'Content-Type': 'application/json' }
  });
  
  // Get variables from the map function's "shared" property
  var map = eval(this.views.by_source_and_time.map)();
  
  var stream = req.query.datastream;
  var at_idx = map.field('at');
  var stream_idx = map.field(stream);
  var absence_idx = map.field("ElectricEnergyUnoccupied");	// THIJS
  
  send('{\n  "id": ' + JSON.stringify(stream) + ',\n  "datapoints": [\n');
  
  var level = req.query.group_level;

  var first = req.query.startkey.slice(0, level);
  var last = req.query.endkey.slice(0, level);
  var step = map.intervals[map.intervals.length - level] * 1000;
  
  var meta = {
    min_value: Infinity,
    max_value: -Infinity,
    current_value: null,
    at: new Date(map.couchm_to_unix_ts(first)),
    current_absence: null	// THIJS
  };
  
  var realFirstKey = map.couchm_to_unix_ts(first) + map.extra_time_before;
  var lastKey = realFirstKey - step;
  
  var isFirst = true;
  var sendValue = function(dbg, key) {
    var obj = {
      at: key,
      value: meta.current_value || 0,
      absence: meta.current_absence || 0	// THIJS
    };
    if (dbg) obj.debug = dbg;
    send((isFirst ? '' : ',\n') + '    ' + JSON.stringify(obj));
    isFirst = false;
  };
  
  var row;
  while (row = getRow()) {
    var origkey = JSON.parse(JSON.stringify(row.key));
    var key = map.couchm_to_unix_ts(row.key);

    log('keys ' + key + ' ??? ' + realFirstKey);

    // Interpolate all streams up until now.
    /*
    if (key >= realFirstKey) {
      for (var between = lastKey + step; between < key; between += step) {
        sendValue(['interpolate', new Date(between), meta.at],
          new Date(between));
      }
      lastKey = key;
    }
    */
    
    // Update the datastream with new values.
    if (row.value.length > stream_idx && row.value[stream_idx] !== null) {
      meta.at = row.value[at_idx];
      var value = row.value[stream_idx];
      var absence = row.value[absence_idx];	// THIJS
      // wat?
      if (value === true || value === false) meta.current_value = '' + +value;
      else meta.current_value = '' + row.value[stream_idx];
      // THIJS
      if (absence === true || absence === false) meta.current_absence = '' + +absence;
      else meta.current_absence = '' + row.value[absence_idx];
      if (key >= realFirstKey)
        sendValue(['value', new Date(key), meta.at], new Date(key));

      if (+meta.current_value > +meta.max_value)
        meta.max_value = meta.current_value;
      if (+meta.current_value < +meta.min_value)
        meta.min_value = meta.current_value;
    }
  }
  
  var end = map.couchm_to_unix_ts(last);
  for (var until = lastKey + step; until < end; until += step) {
    sendValue(['finish', new Date(until), meta.at], new Date(until));
  }
  send('\n  ]');
  for (var key in meta)
    send(',\n  ' + JSON.stringify(key) + ': ' + JSON.stringify(meta[key]));
  meta.endkey = last;
  meta.endstamp = end;
  meta.origend = req.query.endkey;
  send('\n}\n');
}
