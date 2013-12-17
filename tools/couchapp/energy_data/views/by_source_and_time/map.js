function (doc) {
    var shared = {};
    shared.fields = [
      'at',
      'ElectricPower',
      'ElectricPowerUnoccupied'
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

// When using the historical API, extra data needs to be loaded from before the start time to ensure that the first datapoint actually contains a measurement. From this extra fetched data, only last datapoint in the interval `[start - extra_time_before, start]` will be used.
    shared.extra_time_before = 24 * 60 * 60 * 1000;
    
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
  }