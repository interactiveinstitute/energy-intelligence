// TODO on .position(), if a bubble is out of view, render a link to it in-view

var BubbleBath = function() {
  var db, container, bubbles, json, chart

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
    set chart(ch) {
      chart = ch

      var CANCEL_DISTANCE = 10
      var opening = false
      var position = null
      var timeout
      var popup
      var cancel = function() {
        opening = false
        if (timeout) timeout = clearTimeout(timeout)
      };
      var open = function() {
        opening = false
        
        var time = +chart.x.invert(position[0])
        
        var data = chart.chart.select('.area').datum()
        var dt = Infinity
        for (var i = 0; i < data.length; i++) {
          var delta = Math.abs(+data[i].resampledAt - time)
          if (delta < dt) dt = delta
          else break
        }
        var datum = data[i]

        container.append('g')
            .attr('class', 'highlight')
            .datum({
              chart: chart,
              at: datum.resampledAt,
              value: datum.value,
              value_type: 'W',
              closesOnTouch: true
            })
            .each(function() {
              bubble(this).position().on('close', function() {
                container.selectAll('.highlight').remove()
                container.selectAll('.bubble')
                    .each(function() { bubble(this).toggleSeeThrough(false) })
              })
            })
          .insert('rect', '.popup')
            .attr('width', chart.width)
            .attr('height', chart.height)
            .attr('fill', 'url(#popup-gradient)')
            .on('touchend', function() { if (opening) cancel() })
        chart.chart.select('#popup-gradient')
            .attr('cx', chart.x(datum.resampledAt))
            .attr('cy', chart.y(datum.value))

        container.selectAll('.bubble')
            .each(function() { bubble(this).toggleSeeThrough(true) })
      }
      chart.chart
          .on('touchstart', function() {
            if (chart.display[0].type != 'TotalPower') return
            
            if (d3.touches(this).length == 1) {
              opening = true
              position = d3.touches(this)[0]
              
              timeout = setTimeout(open, 1000)
              
              container.selectAll('.highlight').each(function() {
                bubble(this).close()
              })
            } else opening = false
          })
          .on('touchmove', function() {
            if (!opening) return
            
            var touch = d3.touches(this)[0]
            var distance = Math.sqrt(Math.pow(touch[1] - position[1], 2)
                                     + Math.pow(touch[0] - position[0], 2))
            if (distance > CANCEL_DISTANCE) cancel()
          })
          .on('touchend', function() { if (opening) cancel() }, true);
    },
    load: function(feeds, start, end) {
      json('/_design/events/_view/bubbles_by_feed_and_time', {
        startkey: [feeds[0], +start],
        endkey: [feeds[0], +end]
      }, function(result) {
        var bubbles = container.selectAll('.bubble')
            .data(result.rows.map(function(row) {
              return utils.extend(row.value, {
                chart: chart,
                at: new Date(row.value.timestamp),
                closesOnTouch: false
              })
            }), function(d) { return d.at })
        bubbles.enter().append('g')
            .attr('class', 'bubble')
            .each(function() { bubble(this).position() })
        bubbles.exit()
            .each(function(d) { bubble(this).close() })
            .remove()
      })
      return this
    },
    position: function() {
      container.selectAll('.bubble')
          .each(function() { bubble(this).position() })
    }
  }
}()
