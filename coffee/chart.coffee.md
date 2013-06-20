# Chart control

On the visualisation page, a single **Chart** instance is used.

    class @Chart

## Utilities

Use `key()` to get the Couchm key for a certain date.

      key: (date) -> utils.json(
          "#{@design}_show/unix_to_couchm_ts?feed=#{@feed}&timestamp=#{+date}")

Use `nowInView()` to check if the user is looking at the current time.

      nowInView: -> +@x.domain()[0] < +new Date < +@x.domain()[1]

## Initialisation

Initialisation goes as follows:

1. Call the constructor as early as possible (in `main.coffee.md`).
2. As soon as the DOM is complete, run `init()`.

      constructor: (@config, @db) ->

### Variable setup

Constants for fetching data:

        @design = "#{@db}/_design/energy_data/"
        @feed = @config.feed

Application state:

        @touching = false
        @transforming = false
        @toDefaultView = false
        @showLoading = false

The currently displayed charts are in the `display` array. Currently only one
chart is supported, but this should be extendable.

        @display = [new TotalPower @]

The same x (time) and y (W or Wh) axes are used for all charts. Time formats
are implemented as in [Custom Time Format] [1].

        @x = d3.time.scale()
        @y = d3.scale.linear()
            .domain [0, @config.y_axis_minimum_size]

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
        @yAxis = d3.svg.axis()
            .scale(@y)
            .orient('left')
            .ticks(5)
            .tickPadding(6)
            .tickFormat((d) => "#{d} #{@display[0].unit}")

In `init()`, d3 objects are created for the most-used elements and cached.

      init: (title, chartTitle, time, zoomer, meter, buttons, fs, today) ->
        @title = d3.select title
        @chartTitle = d3.select chartTitle
        @time = d3.select time
        @zoomer = d3.select zoomer
        @meter = d3.select meter
        @buttons = d3.select buttons
        @fullscreener = d3.select fs
        @today = d3.select today

        @loading = @time.select '.loading'

        @setHeader null, true

The `bubbleBath` object takes care of bubbles on the power chart.

        @bubbleBath = new BubbleBath @time.select('.bubblebath'), @db, @

### General touch responses

We set global overriding touch event listeners with three purposes:

1. The built-in d3 zoom behavior is used for panning and zooming. Its behavior
   is adapted to use the zoom slider instead of built-in scrolling callbacks.
   This is more visible and reliable.
2. Return to the default overview after not having registered touches for a
   while. The amount of milliseconds to wait is configurable.
3. The application state should be changed based on touch events. This also
   affects visibility of the energy meter.

Multitouch events are ignored as they are difficult to debug.

        @zoom = d3.behavior.zoom().on 'zoom', => @transform()
        # TODO need to reset @zoom.scaleExtent on feed change
        @time.call @zoom

        do =>
          returnTimeout = null
          loadTimeout = null
          zoom = []
          cancel = (timeout) -> clearTimeout timeout if timeout?
          preventMultitouch = ->
            if d3.touches(document.body).length > 1
              d3.event.preventDefault()
              d3.event.stopPropagation()
          d3.select(window)
              .on('touchstart', =>
                preventMultitouch()
                @touching = true
                zoom = [@zoom.translate()[0], @zoom.scale()]
                returnTimeout = cancel returnTimeout
              true)
              .on('touchmove', =>
                preventMultitouch()
                unless @transforming
                  @hideMeter()
                  @transforming = true
                returnTimeout = cancel returnTimeout
              true)
              .on('touchend', =>
                preventMultitouch()
                @touching = false
                if @transforming
                  @showMeter()
                  @transforming = false
                loadTimeout = cancel loadTimeout
                if zoom[0] != @zoom.translate()[0] or zoom[1] != @zoom.scale()
                  timeout = setTimeout (=> @loadData()), 500
                returnTimeout = setTimeout(=>
                  @fullscreener.classed 'hidden', false
                  @toggleFullscreen false, =>
                    @transform()
                    @toDefaultView = true
                    @autopan @defaultDomain()
                    @loadData()
                @config.default_view_after)
                @today.classed 'active', false
              true)
              .on('mousewheel', ->
                d3.event.stopPropagation()
                d3.event.preventDefault()
              true)

        document.oncontextmenu = -> false

### Zoom slider

The slider on the button right controls the `zoom` object and calls
`translate()`.

        do (that = @) =>
          offset = 0
          @zoomer = d3.select '.zoomer'
          @zoomer.select('.handle').call d3.behavior.drag()
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
                that.transform())

### Control buttons

These are the buttons on the bottom of the page.

        do =>
          button = (cls, handler, state) =>
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

          overview = button('overview', =>
            @fullscreener.classed 'hidden', false
            @toggleFullscreen false, =>
              @transform()
              @defaultView()
              @loadData()
            overview.classed 'active', true
          true)
          button('watt-hours', (showWh) =>
            @display[0] = new (if showWh then TotalEnergy else TotalPower)(@)
            @display[0].init()
            @loadData()
          false)
          button('highlights', (showHighlights) =>
            d3.select('.bubblebath').classed 'withHighlights', showHighlights
          true)

          @today
              .on('touchstart', => @today.classed('active', true))
              .on('touchend', =>
                @toDefaultView = true
                @autopan @defaultDomain())

### Keeping track of current values

Always keep current power and energy values in memory.

        do =>
          process = (doc) =>
            @doc = doc
            console.log '', doc
          startkey = JSON.stringify([@feed])
          endkey = JSON.stringify([@feed, {}])
          url = "#{@db}/_design/energy_data/_view/by_source_and_time" +
            "?group_level=1&startkey=#{startkey}&endkey=#{endkey}"
          utils.json(url).then (result) =>
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

### Set up updates

        @lastFullUpdate = @lastQuickUpdate = +new Date
        @scheduleUpdate()

### Initialise the chart

This will not load the data yet, but set up the DOM.

        @display[0].init()

### Show the chart in fullscreen

Click on `div.fullscreener` to switch to fullscreen. This is the default mode
to start in as well. As soon as the mode is set, data is loaded.

        fullscreening = false
        @fullscreener.on('touchstart', ->
            d3.select(@).classed 'active', fullscreening = true)
        fullscreen = (transition) =>
          @fullscreener
            .classed('active', false)
            .classed('hidden', true)
          @toggleFullscreen(true, =>
            @transform()
            @defaultView()
            @loadData()
          transition)
        d3.select('body').on('touchend', =>
            return unless fullscreening
            fullscreening = false
            fullscreen true
        )
        fullscreen false

## Getting the total energy at a point in time

Call `energy(date)` to get the interpolated amount of energy in kWh. This
amount only makes sense after subtracting an earlier amount of energy.
Interpolation is done by taking both the ElectricEnergy and the ElectricPower
fields into account.

Values are either fetched from the `doc` property (see _Keeping track of
current values_) or directly from the database. If no date is specified, the
current value is extrapolated.

A limited amount of historical values is buffered, so that other functions
don’t have to worry too much about performance.

Note that no extrapolation is done into the future. This allows for calling
`energy()` on both endpoints of the current display, without getting a higher
amount than is shown in the chart.

      energy: (date) ->
        @energyBufferTime ?= []
        @energyBufferValue ?= []

        deferred = Q.defer()

        index = @energyBufferTime.indexOf +date
        date = null if +date > +new Date # Handle future as now
        if index isnt -1 then deferred.resolve @energyBufferValue[index]
        else
          process = (timestamp, power, energy) =>
            kW = power / 1000
            h = (+date - timestamp) / 1000 / 60 / 60
            energy += kW * h if h > 0
            @energyBufferTime.push +date
            @energyBufferValue.push +energy
            if @energyBufferTime.length > @config.energy_buffer_size
              @energyBufferTime.shift()
              @energyBufferValue.shift()
            deferred.resolve(energy)
          date = +new Date unless date? or @doc
          if date
            @key(date).then (key) =>
              startkey = JSON.stringify([@feed])
              endkey = JSON.stringify(key)
              url = "#{@design}_view/by_source_and_time" +
                "?group_level=1&startkey=#{startkey}&endkey=#{endkey}"
              utils.json(url).then (result) =>
                value = result.rows[0].value
                process(
                  +new Date(value[@config.at_idx])
                  value[@config.datastream_idx.ElectricPower]
                  value[@config.datastream_idx.ElectricEnergy])
          else
            date = +new Date
            process @doc.timestamp, @doc.ElectricPower, @doc.ElectricEnergy

        deferred.promise

## Periodic updates

      scheduleUpdate: ->
        untilQuick = @lastQuickUpdate + @config.quick_update - +new Date
        untilFull = @lastFullUpdate + @config.full_update - +new Date
        if untilFull <= @config.quick_update
          setTimeout (=> @fullUpdate()), untilFull
        else
          setTimeout (=> @quickUpdate()), untilQuick

A quick update updates the display with extrapolated cached information.

      quickUpdate: ->
        @lastQuickUpdate = +new Date
        @scheduleUpdate()

        unless @touching
          if @nowInView()
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

## The ‘today’ view

The default domain should always be a sensible day view containing the current
moment.

      defaultDomain: ->
        n = new Date
        startH = if n.getHours() > @config.work_day_hours[0]
          @config.work_day_hours[0]
        else
          @config.work_day_hours[0] - 24
        start = new Date n.getFullYear(), n.getMonth(), n.getDate(), startH
        ###
        endH = if n.getHours() < @config.work_day_hours[0] - 1
          @config.work_day_hours[1]
        else
          startH + 24
          ###
        endH = @config.work_day_hours[1]
        end = new Date n.getFullYear(), n.getMonth(), n.getDate(), endH
        [start, end]

To go to the default view, the time domain is changed. This requires resetting
the extents of the zoom scale as well.

      defaultView: ->
        @x.domain domain = @defaultDomain()

        defaultTimeInView = domain[1] - domain[0]
        @zoom.x(@x).scaleExtent [
          defaultTimeInView / @config.max_time_in_view
          defaultTimeInView / @config.min_time_in_view
        ]

        @today.style 'opacity', 0

        @transform()

## Automatic panning

Use autopan to bring a specific domain into view. The transition should make
clear to the user what exactly is going on.

Note: right now the chart is hidden during autopan, as it doesn’t pan along
nicely. This can be improved.

      autopan: (domain) ->
        @today.style 'opacity', 1 unless @toDefaultView
        d3.transition().duration(1000).tween 'zoom', =>
          inter = d3.interpolate @x.domain().map(Number), domain.map(Number)
          (t) =>
            @x.domain inter t
            @zoom.x @x
            @transform()
            # TODO translate and zoom display, don't recalculate
        zooms = @time.select('.zooms').style 'opacity', 0
        @showLoading = false
        @loadData(true, domain).then => zooms.style 'opacity', 1

        @setHeader domain

Use this method to bring a certain time into view, by navigating in steps
using the same interval as was displayed. This is for example used to browse
between days using the offscreen bubbles.

      bringIntoView: (time) ->
        [start, end] = @x.domain().map (d) -> +d
        interval = end - start
        add = 0
        add -= interval while +time < start + add
        add += interval while +time > end + add
        @autopan [new Date(start + add), new Date(end + add)]

## The chart header

The header is kept up to date with the current view.

      setHeader: (domain = @x.domain(), today = false) ->
        text = if today then 'Today’s electricity usage' else
          format = d3.time.format '%b %d, %H:%M'
          start = format domain[0]
          end = format domain[1]
          "Electricity usage: #{start} – #{end}"
        d3.select('.chart-title').text text

## The energy meter

When visible, the energy meter shows the amount of Wh that is currently shown.

      hideMeter: ->
        @meter.classed 'hidden', true

      showMeter: ->
        if @nowInView()
          @meter.classed 'hidden', false
          @meter.select('.now').style 'opacity', 0
          @quickUpdate()
        else
          start = @x.domain()[0]
          end = @x.domain()[1]
          Q.spread [@energy(start), @energy(end)], (e0, e1) ->
            energy = (e1 - e0) * 1000
            value = Math.round(energy)
            @meter.select('text').text("#{value} Wh")
            @meter.classed 'hidden', false
            @meter.select('.now').style 'opacity', 0

## Getting time axis tick info

The `getTickInfo()` method tells about the first x axis tick in the DOM, and the
smallest distance (duration) between two ticks. This is useful for drawing bar
charts with bars that correspond to the visible lines.

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

## Fetching and showing the data

URL parameters are set by the currently displayed chart. Once the data and
corresponding bubbles are loaded, the promise is resolved and
`updateWithData()` is called.

      loadData: (first, domain = @x.domain()) ->
        deferred = Q.defer()

        params = @display[0].getParameters domain
        params.feed = @display[0].feed
        params.datastream = @display[0].datastream
        url = "#{@db}/_design/energy_data/_show/historical?" +
          ("#{k}=#{encodeURIComponent(v)}" for k, v of params).join '&'

        Q.spread [
          utils.json url
          @bubbleBath.load [@display[0].feed], @x.domain()...
        ], (result, @bubbles) =>
          @data = @display[0].getDataFromRequest params, result
          @updateWithData true
          deferred.resolve()

        if @showLoading
          @loading.attr 'opacity', .6
          @showLoading = false
          deferred.resolve()
        deferred.promise

In `updateWithData()`, the new data is visualised and positioned.

      updateWithData: (stay = false, @data = @data, @bubbles = @bubbles) ->

If the y axis domain should be larger or significantly smaller, it will be
animated to a recalculated domain.

        # Make transition to new domain on y axis
        oldDomain = @y.domain()[1]
        newDomain = d3.max(@data.map (d) -> d.value)
        if @bubbles? then @bubbles.each (d) ->
          newDomain = d3.max [newDomain, parseFloat(d.value)]
        newDomain = @config.y_axis_minimum_size if newDomain is 0
        if oldDomain * @config.y_axis_shrink_factor < newDomain < oldDomain
          newDomain = oldDomain
        else
          newDomain *= @config.y_axis_factor
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

        @bubbleBath.position()

        @loading.attr 'opacity', 0 

## Transformations

These methods update the SVG elements using the current zoom setting. They are
called on a high frequency, so optimising these will improve animations.

If it exists, `transformExtras()` is called on the currently displayed chart.
This transforms for example the ‘now’ dot and line.

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

        @bubbleBath.position()

        @display[0].transformExtras?()

        if @toDefaultView
          @setHeader null, true
          @toDefaultView = false
          @today.style 'opacity', 0
        else if @transforming
          @setHeader()
          @today.style 'opacity', 1

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
        if ticks[0]?.length >= 2
          left1 = ticks[0][0].transform.baseVal.getItem(0).matrix.e
          left2 = ticks[0][1].transform.baseVal.getItem(0).matrix.e
          tickDistance = left2 - left1
          axis.selectAll('line')
              .attr('stroke-width', tickDistance)
              .attr('x1', tickDistance / 2)
              .attr('x2', tickDistance / 2)

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

## Sizing

Call `toggleFullscreen(true, callback)` to show the chart on the full screen and
get a notification after the animation.

If a falsey third argument is not provided, the function doesn’t animate.

The animation is rather sloppy: it hides the axis labels and stretches or
squeezes the graphic. Play it fast and people hopefully won’t notice.

      toggleFullscreen: (fullscreen, callback, transition = true) ->
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

        cardboard.toggleVisible not @fullscreen
        @title.classed 'visible', not @fullscreen

        @buttons.classed 'visible', @fullscreen
        @zoomer.classed 'visible', @fullscreen

        @meter.classed 'fullscreen', @fullscreen
        @chartTitle.classed 'fullscreen', @fullscreen
        d3.select('.chart-subtitle').classed 'fullscreen', @fullscreen

        unless @fullscreen
          @today.style 'opacity', 0
          @loadData()
          @setHeader null, true

Call `adjustToSize()` each time the chart’s root element changes in size. The
method adjusts ranges, scales and dimensions accordingly.

      adjustToSize: ->
        @x.range [0, @width]
        @y.range [@height - @config.padding_bottom, @config.padding_top]

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

[1]: http://bl.ocks.org/mbostock/4149176
