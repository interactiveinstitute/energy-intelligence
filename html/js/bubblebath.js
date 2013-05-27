// TODO on .position(), if a bubble is out of view, render a link to it in-view

var BubbleBath = function() {
  var db, container, bubbles, json

  bubbles = []

  json = function(path, params, cb) {
    var req = new XMLHttpRequest
    var url = db + path + '?' + Object.keys(params).map(function(k) {
      return k + '=' + encodeURIComponent(JSON.stringify(params[k]))
    }).join('&')
    req.open('GET', url, true)
    req.withCredentials = true
    req.onload = function(e) { cb(JSON.parse(req.response)) }
    req.send()
  }

  return {
    set container(el) { container = el.length ? el : d3.select(el) },
    set db(url) { db = url },
    load: function(feeds, start, end) {
      container.selectAll('*').remove()
      json('/_design/events/_view/bubbles_by_feed_and_time', {
        startkey: [feeds[0], +start],
        endkey: [feeds[0], +end]
      }, function(result) {
        result.rows.forEach(function(row) {
          row.value.chart = chart
          row.value.container = container
          row.value.at = new Date(row.value.timestamp)
          var bubble = new Bubble(row.value)
          bubble.position()
          bubbles.push(bubble)
        })
      })
      return this
    },
    position: function() { bubbles.map(function(b) { b.position() }) }
  }
}()
