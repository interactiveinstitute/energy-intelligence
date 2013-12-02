function (keys, values, rereduce) {
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