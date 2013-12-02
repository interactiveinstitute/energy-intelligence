function (doc, req) {
  var map = eval(this.views.by_source_and_time.map)();
  var timestamp = parseInt(req.query.timestamp);
  var feed = req.query.feed;
  var result = map.unix_to_couchm_ts(timestamp, feed);
  
  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result)
  };
}