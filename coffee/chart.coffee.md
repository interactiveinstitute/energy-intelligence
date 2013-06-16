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

      constructor: (@config, @db) ->
        @display = [new TotalPower this]

        @x = d3.time.scale()
        @y = d3.scale.linear()
            .domain [0, Chart.Y_AXIS_MINIMUM_SIZE]

        @xAxis = d3.svg.axis()
            .orient('bottom')
            .scale(@x)
            .ticks(5)
            .tickSubdivide(true)
            .tickPadding(6)
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

        timeout = null
        zoom = []
        d3.select(window)
            .on('touchstart', => zoom = [@zoom.translate()[0], @zoom.scale()]
            true)
            .on('touchend', =>
              clearTimeout timeout if timeout?
              if zoom[0] != @zoom.translate()[0] or zoom[1] != @zoom.scale()
                timeout = setTimeout (=> @loadData()), 500
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

        # TODO for debugging
        setTimeout(=>
          @toggleFullscreen(true, =>
            @transform()
            @defaultView()
            @loadData()
          )
          @fullscreener.classed 'hidden', true
        0)

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
        axis = @time.select('.x.axis').call @xAxis
        axis.selectAll('text')
            .attr('x', 16)
            .attr('y', @height - 32)

        # Set x axis line width
        lines = axis.selectAll 'line'
        if lines[0]?.length > 1
          left = Infinity
          for line in lines[0]
            transform = line.transform.baseVal
            if transform.numberOfItems
              position = transform.getItem(0).matrix.e
              left = position if 0 <= position < left
          next = Infinity
          for line in lines[0]
            transform = line.transform.baseVal
            if transform.numberOfItems
              position = transform.getItem(0).matrix.e
              next = position if left < position < next
          if left isnt Infinity and next isnt Infinity
            @tickDistance = (next - left) / 2
        lines
            .style('stroke-width', @tickDistance)
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
        ], (result, bubbles) =>
          data = @display[0].getDataFromRequest params, result

          # Make transition to new domain on y axis
          oldDomain = @y.domain()[1]
          newDomain = d3.max(data.map (d) -> d.value)
          bubbles.each (d) ->
            newDomain = d3.max [newDomain, parseFloat(d.value)]
          newDomain = Chart.Y_AXIS_MINIMUM_SIZE if newDomain is 0
          if oldDomain * Chart.Y_AXIS_SHRINK_FACTOR < newDomain < oldDomain
            newDomain = oldDomain
          else
            newDomain *= Chart.Y_AXIS_FACTOR
          # TODO also take bubble height into account
          tempScale = newDomain / oldDomain

          @y.domain [0, newDomain]
          @transformYAxis true

          from = "matrix(1, 0, 0,
            #{tempScale}, 0, #{(@height - 48) * (1 - tempScale)})
            scale(#{1 / @zoom.scale()}, 1)
            translate(#{-@zoom.translate()[0]}, 0)"
          to = "scale(#{1 / @zoom.scale()}, 1)
            translate(#{-@zoom.translate()[0]}, 0)"
          from = to if first

          @display[0].setDataAndTransform data, from, to
          @display[0].transformExtras?()

          BubbleBath.position()

          @loading.attr 'opacity', 0

          deferred.resolve()

        if @showLoading
          @loading.attr 'opacity', .6
          @showLoading = false

        deferred.promise

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
