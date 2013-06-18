# Chart control

On the visualisation page, a single **Chart** instance is used.

All datastream-specific code happens in `data.coffee.md`.

    class @Chart
      @SAMPLE_SIZE = 2
      @EXTRA_UNITS_ABOVE = 50
      @Y_AXIS_FACTOR = 1.2
      @Y_AXIS_MINIMUM_SIZE = 100
      @Y_AXIS_SHRINK_FACTOR = .05
      @PADDING_BOTTOM = 48
      @PADDING_TOP = 48
      @BAR_SPACING = 4
      @NOW_BAR_WIDTH = 8
      @MIN_TIME_IN_VIEW = 60 * 60 * 1000
      @MAX_TIME_IN_VIEW = 2 * 7 * 24 * 60 * 60 * 1000
      @QUICK_UPDATE = 1000
      @FULL_UPDATE = 30000
      @ENERGY_BUFFER_SIZE = 10

      constructor: (@config, @db) ->
        @design = "#{@db}/_design/energy_data/"
        @feed = 'allRooms'

        @touching = false

        @energyBufferTime = []
        @energyBufferValue = []

        @display = [new TotalPower this]

        @x = d3.time.scale()
        @y = d3.scale.linear()
            .domain [0, Chart.Y_AXIS_MINIMUM_SIZE]

Time formats are implemented as in [Custom Time Format] [1].

        formats = [
          [d3.time.format('%Y'), -> true]
          [d3.time.format('%b'), (d) -> d.getMonth()]
          [d3.time.format('%b %_d'), (d) -> d.getDate() != 1]
          [d3.time.format('%a %_d'), (d) -> d.getDay() and d.getDate() != 1]
          [d3.time.format('%_H:%M'), (d) -> d.getHours() ]
          [d3.time.format('%_H:%M'), (d) -> d.getMinutes() ]
          [d3.time.format(':%S'), (d) -> d.getSeconds() ]
          [d3.time.format('.%L'), (d) -> d.getMilliseconds() ]
        ]

        @xAxis = d3.svg.axis()
            .orient('bottom')
            .scale(@x)
            .ticks(10)
            .tickPadding(6)
            .tickFormat((date) ->
              i = formats.length - 1
              f = formats[i]
              f = formats[--i] until f[1](date)
              f[0](date))

        # TODO add another axis for global labels?

        @yAxis = d3.svg.axis()
            .scale(@y)
            .orient('left')
            .ticks(5)
            .tickPadding(6)
            .tickFormat((d) => "#{d} #{@display[0].unit}")

        # Used to determine x axis stroke width
        @tickDistance = 0

        @zoom = d3.behavior.zoom().on 'zoom', => @transform()
        # TODO need to reset @zoom.scaleExtent on feed change

      getJSON: (url) ->
        deferred = Q.defer()
        request = new XMLHttpRequest
        request.open 'GET', url, true
        request.withCredentials = true
        request.onload = ->
          deferred.resolve JSON.parse request.response
        request.send()
        deferred.promise

      init: (title, chartTitle, time, zoomer, meter, buttons, fs) ->
        @title = d3.select title
        @chartTitle = d3.select chartTitle
        @time = d3.select time
        @zoomer = d3.select zoomer
        @meter = d3.select meter
        @buttons = d3.select buttons
        @fullscreener = d3.select fs

        @loading = @time.select '.loading'

        @time.call @zoom

        @toggleFullscreen false
        @defaultView()

        @display[0].init()

Return to the default overview after inactivity. The amount of milliseconds
to wait is set in the config value `default_view_after`.

        returnTimeout = null
        loadTimeout = null
        zoom = []
        cancel = (timeout) =>
          if timeout?
            clearTimeout timeout
            timeout = null
        preventMultitouch = ->
          if d3.touches(document.body).length > 1
            d3.event.preventDefault()
            d3.event.stopPropagation()
        d3.select(window)
            .on('touchstart', =>
              preventMultitouch()
              @touching = true
              zoom = [@zoom.translate()[0], @zoom.scale()]
              cancel returnTimeout
            true)
            .on('touchmove', =>
              preventMultitouch()
              cancel returnTimeout
            true)
            .on('touchend', =>
              preventMultitouch()
              @touching = false
              cancel loadTimeout
              if zoom[0] != @zoom.translate()[0] or zoom[1] != @zoom.scale()
                timeout = setTimeout (=> @loadData()), 500
              returnTimeout = setTimeout(=>
                @fullscreener.classed 'hidden', false
                @toggleFullscreen false, =>
                  @transform()
                  @autopan @defaultDomain()
                  @loadData()
              @config.default_view_after)
            true)
            .on('mousewheel', ->
              d3.event.stopPropagation()
              d3.event.preventDefault()
            true)

        BubbleBath.db = @db
        BubbleBath.chart = @
        BubbleBath.container = @time.select '.bubblebath'

        that = @
        offset = 0
        drag = d3.behavior.drag()
            .on('dragstart', ->
              offset = -d3.touches(@)[0][0] if d3.touches(@).length)
            .on('drag', ->
              position = (d3.event.x + offset) /
                (that.zoomer.node().clientWidth - @clientWidth)
              position = 0 if position < 0
              position = 1 if position > 1

              ext = that.zoom.scaleExtent()
              scale = ext[0] + Math.pow(position, 4) * (ext[1] - ext[0])

              origin = that.width / 2
              translate = origin - (origin - that.zoom.translate()[0]) *
                scale / that.zoom.scale()
              that.zoom.translate [translate, 0]
              that.zoom.scale scale
              that.transform()
            )
        @zoomer = d3.select '.zoomer'
        @zoomer.select('.handle').call drag

        @transform()
        @loadData true

        button = @button('overview', =>
          @fullscreener.classed 'hidden', false
          @toggleFullscreen false, =>
            @transform()
            @defaultView()
            @loadData()
          button.classed 'active', true
        true)
        @button('watt-hours', (showWh) =>
          @display[0] = new (if showWh then TotalEnergy else TotalPower)(@)
          @display[0].init()
          @loadData()
        false)
        @button('highlights', (showHighlights) =>
          d3.select('.bubblebath').classed 'withHighlights', showHighlights
          # TODO: not enough, can't get popup bubble now
        true)

        @meter.on('touchstart', => @autopan @defaultDomain())

        fullscreening = false
        @fullscreener.on('touchstart', ->
            d3.select(@).classed 'active', fullscreening = true)
        d3.select('body').on('touchend', =>
            return unless fullscreening
            fullscreening = false
            @fullscreener
                .classed('active', false)
                .classed('hidden', true)
            @toggleFullscreen(true, =>
              @transform()
              @defaultView()
              @loadData()
            )
        )

Always keep current power and energy values in memory.

        process = (doc) =>
          @doc = doc
          console.log 'got update', doc
        startkey = JSON.stringify([@feed])
        endkey = JSON.stringify([@feed, {}])
        url = "#{@db}/_design/energy_data/_view/by_source_and_time" +
          "?group_level=1&startkey=#{startkey}&endkey=#{endkey}"
        @getJSON(url).then (result) =>
          value = result.rows[0].value
          process
            timestamp: +new Date(value[@config.at_idx])
            ElectricPower: value[@config.datastream_idx.ElectricPower]
            ElectricEnergy: value[@config.datastream_idx.ElectricEnergy]
          url = "#{@db}/_changes?filter=energy_data/" +
              "measurements&include_docs=true&source=#{@feed}"
          url = "#{url}&feed=eventsource&since=now"
          source = new EventSource(url, withCredentials: true)
          source.onmessage = (e) => process JSON.parse(e.data).doc

        @lastFullUpdate = @lastQuickUpdate = +new Date
        @scheduleUpdate()

        # TODO for debugging
        setTimeout(=>
          @toggleFullscreen(true, =>
            @transform()
            @defaultView()
            @loadData()
          )
          @fullscreener.classed 'hidden', true
        0)

      energy: (date) ->
        deferred = Q.defer()
        # TODO do the index check only if we were planning to do a request (?)
        index = @energyBufferTime.indexOf +date
        date = null if +date > +new Date # Handle future as now
        if index isnt -1
          deferred.resolve @energyBufferValue[index]
        else
          process = (timestamp, power, energy) =>
            kW = power / 1000
            h = (+date - timestamp) / 1000 / 60 / 60
            energy += kW * h if h > 0
            @energyBufferTime.push +date
            @energyBufferValue.push +energy
            if @energyBufferTime.length > Chart.ENERGY_BUFFER_SIZE
              @energyBufferTime.shift()
              @energyBufferValue.shift()
            deferred.resolve(energy)
          date = +new Date unless date? or @doc
          if date
            url = "#{@design}_show/unix_to_couchm_ts" +
              "?feed=#{@feed}&timestamp=#{+date}"
            @getJSON(url).then (key) =>
              startkey = JSON.stringify([@feed])
              endkey = JSON.stringify(key)
              url = "#{@design}_view/by_source_and_time" +
                "?group_level=1&startkey=#{startkey}&endkey=#{endkey}"
              @getJSON(url).then (result) =>
                value = result.rows[0].value
                process(
                  +new Date(value[@config.at_idx])
                  value[@config.datastream_idx.ElectricPower]
                  value[@config.datastream_idx.ElectricEnergy])
          else
            date = +new Date
            process @doc.timestamp, @doc.ElectricPower, @doc.ElectricEnergy
        deferred.promise

A quick update updates the display with extrapolated cached information.

      quickUpdate: ->
        @lastQuickUpdate = +new Date
        @scheduleUpdate()

        unless @touching
          if +@x.domain()[0] < +new Date < +@x.domain()[1]
            Q.spread [@energy(), @energy(@defaultDomain()[0])], (e1, e0) =>
              energy = (e1 - e0) * 1000
              value = Math.round(energy)
              @meter.select('text').text("#{value} Wh")

            # Add an extrapolated data point. TODO: do this in TotalPower or
            # TotalEnergy, since the kind of datapoint we want depends on that.
            if @data? and @doc?
              @data.push
                at: new Date @doc.timestamp
                resampledAt: new Date
                value: parseFloat @doc.ElectricPower
              @updateWithData()

            @display[0].transformExtras?()

A full update (re-)requests the data needed for the current view, in order to
get consistent with the database.

      fullUpdate: ->
        @lastFullUpdate = @lastQuickUpdate = +new Date
        @scheduleUpdate()
        @loadData()

      scheduleUpdate: ->
        untilQuick = @lastQuickUpdate + Chart.QUICK_UPDATE - +new Date
        untilFull = @lastFullUpdate + Chart.FULL_UPDATE - +new Date
        if untilFull <= Chart.QUICK_UPDATE
          setTimeout (=> @fullUpdate()), untilFull
        else
          setTimeout (=> @quickUpdate()), untilQuick

      adjustToSize: ->
        @x.range [0, @width]
        @y.range [@height - Chart.PADDING_BOTTOM, Chart.PADDING_TOP]

        @xAxis.scale(@x).tickSize(@height)
        @yAxis.scale(@y).tickSize(-@width)

        @time.select('.x.axis').call(@xAxis)
        @transformYAxis()

        @time
            .attr('width', @width)
            .attr('height', @height)
        @time.select('.leftGradientBox')
            .attr('height', @height)

        @loading.select('rect')
            .attr('width', @width)
            .attr('height', @height)
        @loading.select('text')
            .attr('dx', @width / 2)
            .attr('dy', @height / 2)

        @display[0].transform()

      button: (cls, handler, state) ->
        that = @
        @buttons.append('div')
            .classed(cls, true)
            .classed('button', true)
            .classed('active', state)
            .on('touchstart', ->
              el = d3.select @
              state = !el.classed 'active'
              el.classed 'active', state
              handler.bind(that)(state, @)
            )

      defaultDomain: ->
        n = new Date
        startH = if n.getHours() > @config.work_day_hours[0]
          @config.work_day_hours[0]
        else
          @config.work_day_hours[0] - 24
        start = new Date n.getFullYear(), n.getMonth(), n.getDate(), startH
        endH = if n.getHours() < @config.work_day_hours[0] - 1
          @config.work_day_hours[1]
        else
          startH + 24
        end = new Date n.getFullYear(), n.getMonth(), n.getDate(), endH
        [start, end]

      defaultView: ->
        domain = @defaultDomain()
        @x.domain domain

        defaultTimeInView = domain[1] - domain[0]
        minScale = defaultTimeInView / Chart.MAX_TIME_IN_VIEW
        maxScale = defaultTimeInView / Chart.MIN_TIME_IN_VIEW
        @zoom.x(@x).scaleExtent [minScale, maxScale]

      autopan: (domain) ->
        @showLoading = true
        d3.transition().duration(1000).tween('zoom', =>
          oldStart = @x.domain()[0]
          oldEnd = @x.domain()[1]
          interpolate = d3.interpolate(
            [+oldStart, +oldEnd]
            [+domain[0], +domain[1]]
          )
          (t) =>
            @x.domain interpolate t
            @zoom.x @x
            @transform()
            # TODO translate and zoom display, don't recalculate
            BubbleBath.position()
        ).each('end', =>
          @showLoading = true
          @loadData(true, domain).then =>
            @time.select('.zooms').style 'opacity', 1
        )
        @time.select('.zooms').style 'opacity', 0

      bringIntoView: (time) ->
        [start, end] = @x.domain().map (d) -> +d
        interval = end - start
        add = 0
        add -= interval while +time < start + add
        add += interval while +time > end + add
        @autopan [new Date(start + add), new Date(end + add)]

      transform: ->
        @transformXAxis()

        @time.select('.zooms')
            .attr('transform'
              "translate(#{@zoom.translate()[0]}, 0) scale(#{@zoom.scale()}, 1)"
            )

        handle = @zoomer.select('.handle').node()
        scale = @zoom.scale()
        [zmin, zmax] = @zoom.scaleExtent()
        width = @zoomer.node().clientWidth - handle.clientWidth
        handle.style.left =
          Math.pow((scale - zmin) / (zmax - zmin), 1/4) * width + 'px'

        BubbleBath.position()

        @display[0].transformExtras?()

      transformXAxis: ->
        axis = @time.select('.x.axis')
            .call(@xAxis)
        oi = 0 # odd index
        axis.selectAll('.tick')
            .sort((a, b) -> +a - +b)
            .each((_, i) -> oi = i if oi is 0 and d3.select(@).classed 'odd')
            .each((_, i) -> d3.select(@).classed 'odd', oi % 2 is i % 2)
        axis.selectAll('text')
            .attr('x', 16)
            .attr('y', @height - 32)

        # Set x axis line width
        ticks = axis.selectAll '.tick'
        left1 = ticks[0][0].transform.baseVal.getItem(0).matrix.e
        left2 = ticks[0][1].transform.baseVal.getItem(0).matrix.e
        @tickDistance = left2 - left1
        axis.selectAll('line')
            .attr('stroke-width', @tickDistance)
            .attr('x1', @tickDistance / 2)
            .attr('x2', @tickDistance / 2)

      transformYAxis: (transition = false) ->
        axis = @time.select '.y.axis'
        axis = axis.transition().duration 1000 if transition
        axis.call @yAxis
        axis = @time.select '.yText.axis'
        axis = axis.transition().duration 1000 if transition
        axis.call @yAxis
        axis.selectAll('text')
            .attr('x', 5)
            .attr('y', -16)

**getTickInfo()** tells about the first x axis tick in the DOM, and the
smallest distance (duration) between two ticks.

We could assume that this duration equals the distance between the first
two ticks, but d3 might put faulty ticks somewhere.

      getTickInfo: ->
        ticks = @time.selectAll('.x.axis .tick')
        if ticks[0]?.length
          dts = []
          ticks.each (d) -> dts.push new Date d
          dts = dts.sort((a, b) -> +a - +b)

          smallest = Infinity
          for date, i in dts
            if i > 0
              distance = +date - +dts[i - 1]
              smallest = distance if distance < smallest

          { duration: smallest, first: dts[0] } if smallest < Infinity

      loadData: (first, domain = @x.domain()) ->
        deferred = Q.defer()

        params = @display[0].getParameters domain
        params.feed = @display[0].feed
        params.datastream = @display[0].datastream
        url = "#{@db}/_design/energy_data/_show/historical?" +
          ("#{k}=#{encodeURIComponent(v)}" for k, v of params).join '&'

        Q.spread [
          @getJSON url
          BubbleBath.load [@display[0].feed], @x.domain()...
        ], (result, @bubbles) =>
          @data = @display[0].getDataFromRequest params, result
          @updateWithData true
          deferred.resolve()

        if @showLoading
          @loading.attr 'opacity', .6
          @showLoading = false

        deferred.promise

      updateWithData: (stay = false, @data = @data, @bubbles = @bubbles) ->
        # Make transition to new domain on y axis
        oldDomain = @y.domain()[1]
        newDomain = d3.max(@data.map (d) -> d.value)
        @bubbles.each (d) ->
          newDomain = d3.max [newDomain, parseFloat(d.value)]
        newDomain = Chart.Y_AXIS_MINIMUM_SIZE if newDomain is 0
        if oldDomain * Chart.Y_AXIS_SHRINK_FACTOR < newDomain < oldDomain
          newDomain = oldDomain
        else
          newDomain *= Chart.Y_AXIS_FACTOR
        tempScale = newDomain / oldDomain

        unless newDomain is oldDomain
          @y.domain [0, newDomain]
          @transformYAxis true

          from = "matrix(1, 0, 0,
            #{tempScale}, 0, #{(@height - 48) * (1 - tempScale)})
            scale(#{1 / @zoom.scale()}, 1)
            translate(#{-@zoom.translate()[0]}, 0)"
          to = "scale(#{1 / @zoom.scale()}, 1)
            translate(#{-@zoom.translate()[0]}, 0)"
          from = to if stay

          @display[0].setDataAndTransform @data, from, to
        else
          to = "scale(#{1 / @zoom.scale()}, 1)
            translate(#{-@zoom.translate()[0]}, 0)"
          @display[0].setDataAndTransform @data, null, to, false

        @display[0].transformExtras?()

        BubbleBath.position()

        @loading.attr 'opacity', 0 

      toggleFullscreen: (fullscreen, callback) ->
        transition = not fullscreen?
        @fullscreen = fullscreen ? !@fullscreen

        change = (x, y, @width, @height, bubbleOpacity) =>
          @time.style '-webkit-transform', "translate(#{x}px, #{y}px)"
          @adjustToSize()
          @time.select('.bubblebath').attr 'opacity', bubbleOpacity

        resize = (x, y, width, height, bubbleOpacity) =>
          if transition
            @time
                .classed('resizing', true)
                .style('-webkit-transform', "
                  translate(#{x}px, #{y}px)
                  scale(#{width / @width}, #{height / @height})")
                .on('webkitTransitionEnd', ->
                  d3.select(@).on('webkitTransitionEnd', null)
                  change x, y, width, height, bubbleOpacity
                  @classList.remove 'resizing'
                  callback?()
                )
          else
            change x, y, width, height, bubbleOpacity
            callback?()

        width = document.body.clientWidth
        height = document.body.clientHeight
        if @fullscreen
          resize 0, 200, width, height - 366, 1
        else
          resize 64 + 512, 192, width - 2 * (64 + 512), height - 192 - 32, 0

        Cardboard.toggleVisible not @fullscreen
        @title.classed 'visible', not @fullscreen

        @buttons.classed 'visible', @fullscreen
        @zoomer.classed 'visible', @fullscreen

        @meter.classed 'fullscreen', @fullscreen
        @chartTitle.classed 'fullscreen', @fullscreen

[1]: http://bl.ocks.org/mbostock/4149176
