function (doc) {
    if (doc.type == 'measurement') {
      var timestamp = parseInt(doc.timestamp);
      timestamp = (timestamp > 10 * 365 * 24 * 60 * 60 * 1000) ? timestamp : timestamp * 1000;
      if (timestamp < 50 * 365 * 24 * 60 * 60 * 1000) {
        emit(doc.source, timestamp);
      }
    }
  }