class @BubbleBath
  
  bubbles: []
  
  constructor: (@container, @db, @chart) ->
    @container = d3.select @container unless @container.length?
    CANCEL_DISTANCE = 10
    opening = false
    position = null
    timeout = null
    popup = null
    cancel = ->
      opening = false
      timeout = clearTimeout timeout if timeout?
    open = =>
      opening = false
      time = @chart.x.invert position[0]
      data = @chart.time.select('.area').datum()
      dt = Infinity
      for datum in data
        delta = Math.abs +datum.resampledAt - time
        if delta < dt then dt = delta else break
      @container.append('g')
          .attr('class', 'highlight current')
          .datum(
            chart: @chart
            at: datum.resampledAt
            measuredAt: datum.measuredAt
            value: datum.value
            value_type: 'W'
            closesOnTouch: true
          )
          .each(() ->
            bubble(@).position().on 'close', ->
              container.selectAll('.highlight').remove()
              container.selectAll('.bubble').each ->
                bubble(@).toggleSeeThrough false)
        .insert('rect', '.popup')
          .attr('class', 'backdrop')
          .attr('width', @chart.width)
          .attr('height', @chart.height)
          .attr('fill', 'url(#popup-gradient)')
          .on('touchend', -> cancel() if opening)
      @chart.time.select('#popup-gradient')
          .attr('cx', @chart.x datum.resampledAt)
          .attr('cy', @chart.y datum.value)
      @container.selectAll('.bubble')
          .each -> bubble(@).toggleSeeThrough true
    do (@chart, @container) ->
      chart.time
          .on('touchstart', () ->
            return unless chart.display[0].type is 'TotalPower'
            if d3.touches(@).length is 1
              opening = true
              position = d3.touches(@)[0]
              timeout = setTimeout open, 1000
              container.selectAll('.highlight').each () -> bubble(@).close()
            else opening = false)
          .on('touchmove', () ->
            return unless opening
            touch = d3.touches(@)[0]
            distance = Math.sqrt Math.pow(touch[1] - position[1], 2) +
              Math.pow(touch[0] - position[0], 2)
            cancel() if distance > CANCEL_DISTANCE)
          .on('touchend', () -> cancel() if opening
          true)
  
  json: (path, params) ->
    utils.json("#{@db}#{path}?" + Object.keys(params).map((k) ->
      k + '=' + encodeURIComponent JSON.stringify params[k]
    ).join '&')
  
  position: ->
    startts = @chart.x.domain()[0]
    endts = @chart.x.domain()[1]
    chart = @chart
    @container.selectAll('.bubble').each (d) ->
      s = d3.select @
      b = bubble @
      if d.timestamp <= startts
        trans = not @classList.contains 'past'
        s.attr 'class', 'bubble past'
        b.position trans, 10, chart.height - chart.config.padding_bottom
      else if d.timestamp >= endts
        trans = not @classList.contains 'future'
        s.attr 'class', 'bubble future'
        b.position trans, chart.width - 10,
          chart.height - chart.config.padding_bottom
      else
        trans = not @classList.contains 'current'
        s.attr 'class', 'bubble current'
        b.position trans
  
  load: (feeds, start, end) ->
    startts = +start
    endts = +end
    deferred = Q.defer()
    timespan = endts - startts
    return unless @db?
    @json('/_design/events/_view/bubbles_by_feed_and_time', {
      startkey: [feeds[0], startts - timespan],
      endkey: [feeds[0], endts + timespan]
    }).then (result) =>
      bubbles = @container.selectAll('.bubble')
          .data((result.rows.map (row) =>
            extra =
              chart: @chart
              closesOnTouch: false
            if row.value.timestamp
              extra.at = new Date row.value.timestamp
            else if row.value.timestamp_start and row.value.timestamp_end
              extra.interval = [
                new Date row.value.timestamp_start
                new Date row.value.timestamp_end
              ]
            d = utils.extend row.value, extra
            d),
            (d) -> d.at or JSON.stringify d.interval)
      bubbles.enter().append('g')
          .attr('class', 'bubble')
          .classed('past', (d) -> d.timestamp <= startts)
          .classed('future', (d) -> d.timestamp >= endts)
          .classed('current', (d) -> startts < d.timestamp < endts)
          .each(() -> bubble(@).position())
      bubbles.exit()
          .each((d) -> bubble(@).close())
          .remove()
      @position()
      deferred.resolve(bubbles)
    deferred.promise
