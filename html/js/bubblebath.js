// TODO on .position(), if a bubble is out of view, render a link to it in-view

var BubbleBath = function() {
  var db, container, bubbles, json, position, chart, startts, endts

  bubbles = []

  json = function(path, params) {
    var deferred = Q.defer()
    var req = new XMLHttpRequest
    var url = db + path + '?' + Object.keys(params).map(function(k) {
      return k + '=' + encodeURIComponent(JSON.stringify(params[k]))
    }).join('&')
    req.open('GET', url, true)
    req.withCredentials = true
    req.onload = function(e) { deferred.resolve(JSON.parse(req.response)) }
    req.send()
    return deferred.promise
  }

  position = function() {
    startts = chart.x.domain()[0]
    endts = chart.x.domain()[1]
    container.selectAll('.bubble').each(function(d) {
      if (d.timestamp <= startts) {
        var trans = !this.classList.contains('past')
        d3.select(this).attr('class', 'bubble past')
        bubble(this).position(trans, 10, chart.height - Chart.PADDING_BOTTOM)
      } else if (d.timestamp >= endts) {
        var trans = !this.classList.contains('future')
        d3.select(this).attr('class', 'bubble future')
        bubble(this).position(trans,
            chart.width - 10, chart.height - Chart.PADDING_BOTTOM)
      } else {
        var trans = !this.classList.contains('current')
        d3.select(this).attr('class', 'bubble current')
        bubble(this).position(trans)
      }
    })
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
        
        var data = chart.time.select('.area').datum()
        var dt = Infinity
        for (var i = 0; i < data.length; i++) {
          var delta = Math.abs(+data[i].resampledAt - time)
          if (delta < dt) dt = delta
          else break
        }
        var datum = data[i]

        container.append('g')
            .attr('class', 'highlight current')
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
            .attr('class', 'backdrop')
            .attr('width', chart.width)
            .attr('height', chart.height)
            .attr('fill', 'url(#popup-gradient)')
            .on('touchend', function() { if (opening) cancel() })
        chart.time.select('#popup-gradient')
            .attr('cx', chart.x(datum.resampledAt))
            .attr('cy', chart.y(datum.value))

        container.selectAll('.bubble')
            .each(function() { bubble(this).toggleSeeThrough(true) })
      }
      chart.time
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
      startts = +start
      endts = +end
      var deferred = Q.defer();
      var timespan = endts - startts
      json('/_design/events/_view/bubbles_by_feed_and_time', {
        startkey: [feeds[0], startts - timespan],
        endkey: [feeds[0], endts + timespan]
      }).then(function(result) {
        var that = this;
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
            .classed('past', function(d) { return d.timestamp <= startts })
            .classed('future', function(d) { return d.timestamp >= endts })
            .classed('current', function(d) {
              return startts < d.timestamp && d.timestamp < endts
            })
            .each(function() { bubble(this).position() })
        bubbles.exit()
            .each(function(d) { bubble(this).close() })
            .remove()
        position()
        deferred.resolve(bubbles)
      })
      return deferred.promise
    },
    position: position
  }
}()
