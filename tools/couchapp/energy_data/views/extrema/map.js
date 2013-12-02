function (doc) {
    if (doc.type == 'measurement') {
      var ignore = ['_id', '_rev', 'source', 'type', 'user'];
      for (var name in doc) {
        if (ignore.indexOf(name) == -1) {
          var timestamp = parseInt(doc.timestamp);
          var key = [doc.source, name, timestamp];
          var value = doc[name];
          timestamp = (timestamp > 10 * 365 * 24 * 60 * 60 * 1000) ? timestamp : timestamp * 1000;
          if (timestamp > 50 * 365 * 24 * 60 * 60 * 1000) return;
          if (value === true || value === false) {
            emit(key, [timestamp, +value]);
          } else {
            var parsed = parseFloat(value);
            if (!isNaN(parsed)) {
              emit(key, [timestamp, parsed]);
            }
          }
        }
      }
    }
  }