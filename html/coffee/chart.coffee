class @Chart
	constructor: (@config, @db) ->
		@design = "#{@db}/_design/energy_data/"
		@feed = @config.feed
		@touching = false
		@transforming = false
		@toDefaultView = false
		@showLoading = false
		
		@momentum = {
			# Don't touch the _* properties!
			fallOff: 1.1,	# The 'friction coefficient'
			maxScrollTime: 2500,	# Stop after this many ms
			stopThreshold: 1, 	# Min speed after which to to cancel the animation.
			_speed: 0.0,	# Current scrolling _speed - should be reset after a touchEnd event!
			_previousDragFrame: []	# Used for _speed calculations
		}

		@display = [new EfficiencyPlot(@)]
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
		@bubbleBath = new BubbleBath @time.select('.bubblebath'), @db, @
		@zoom = d3.behavior.zoom().on 'zoom', => @transform()
		# TODO need to reset @zoom.scaleExtent on feed change
		@time.call @zoom
		do =>
			returnTimeout = null
			loadTimeout = null
			zoom = []   # The starting zoom! Set on touchStart, compared to on touchEnd events
			cancel = (timeout) -> clearTimeout timeout if timeout?
			preventMultitouch = ->
				if d3.touches(document.body).length > 1
					d3.event.preventDefault()
					d3.event.stopPropagation()
			d3.select(window)
					.on('touchstart', =>
						preventMultitouch()
						@touching = true
						@time.transition()	# Reset any previous momentum scroll transitions
						zoom = [@zoom.translate()[0], @zoom.scale()]
						@momentum._previousDragFrame = @zoom.translate()[0]  #Store the starting x position!
						returnTimeout = cancel returnTimeout
					true)
					.on('touchmove', =>
						preventMultitouch()
						#This is where we update the current '_speed' of the scroll
						@momentum._speed = @zoom.translate()[0] - @momentum._previousDragFrame;
						@momentum._previousDragFrame = @zoom.translate()[0]
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
							#This is where we trigger the momentum animation
							@setScrollMomentumTransition();
							@momentum._previousDragFrame = []	#Reset! Will give null errors if called
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
				#FIXME: Conversion to EfficiencyPlot!
				#@display[0] = new (if showWh then TotalEnergy else TotalPower)(@)
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
		do =>
			process = (doc) =>
				@doc = doc
			startkey = JSON.stringify([@feed])
			endkey = JSON.stringify([@feed, {}])
			url = "#{@db}/_design/energy_data/_view/by_source_and_time" +
				"?group_level=1&startkey=#{startkey}&endkey=#{endkey}"
			utils.json(url).then (result) =>
				value = result.rows[0].value
				doc = {
					timestamp: +new Date(value[@config.at_idx]),
					ElectricPower: value[@config.datastream_id.ElectricPower],
					ElectricEnergy: value[@config.datastream_idx.ElectricEnergy],
					ElectricEnergyUnoccupied: value[@config.datastream_idx.ElectricEnergyUnoccupied],
					}
				process(doc)
				url = "#{@db}/_changes?filter=energy_data/" +
						"measurements&include_docs=true&source=#{@feed}"
				url = "#{url}&feed=eventsource&since=now"
				source = new EventSource(url, withCredentials: true)
				source.onmessage = (e) => process JSON.parse(e.data).doc
		@lastFullUpdate = @lastQuickUpdate = +new Date
		@scheduleUpdate()
		@display[0].init()
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
	
	energy: (date) ->
		@energyBufferTime ?= []
		@energyBufferValue ?= []
		deferred = Q.defer()
		index = @energyBufferTime.indexOf +date
		date = null if +date > +new Date # Handle future as now
		if index isnt -1 then deferred.resolve @energyBufferValue[index]
		else
			process = (timestamp, power, energy, absence) =>
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
							value[@config.datastream_idx.ElectricEnergy]
							value[@config.datastream_idx.ElectricEnergyUnoccupied])	#THIJS
			else
				date = +new Date
				process @doc.timestamp, @doc.ElectricPower, @doc.ElectricEnergy, @doc.ElectricEnergyUnoccupied
		deferred.promise
	
	scheduleUpdate: ->
		untilQuick = @lastQuickUpdate + @config.quick_update - +new Date
		untilFull = @lastFullUpdate + @config.full_update - +new Date
		if untilFull <= @config.quick_update
			setTimeout (=> @fullUpdate()), untilFull
		else
			setTimeout (=> @quickUpdate()), untilQuick
	
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
				'''
				if @data? and @doc?
					@data.push
						at: new Date @doc.timestamp
						resampledAt: new Date
						value: parseFloat @doc.ElectricPower
						absence: parseFloat(@doc.ElectricEnergyUnoccupied) #THIJS
					@updateWithData()
				'''
				@display[0].transformExtras?()
	
	fullUpdate: ->
		@lastFullUpdate = @lastQuickUpdate = +new Date
		@scheduleUpdate()
		@loadData()
	
	defaultDomain: ->
		n = new Date
		if @config.work_day_hours[0] < n.getHours() < @config.work_day_hours
			startH = @config.work_day_hours[0]
			endH = @config.work_day_hours[1]
		else
			startH = 0
			endH = 24
		start = new Date n.getFullYear(), n.getMonth(), n.getDate(), startH
		end = new Date n.getFullYear(), n.getMonth(), n.getDate(), endH
		[start, end]
	
	defaultView: ->
		@x.domain domain = @defaultDomain()
		defaultTimeInView = domain[1] - domain[0]
		@zoom.x(@x).scaleExtent [
			defaultTimeInView / @config.max_time_in_view
			defaultTimeInView / @config.min_time_in_view
		]
		@today.style 'opacity', 0
		@transform()
	
	autopan: (domain) ->
		# TODO use @zoom.translate instead of resetting @x.domain in order to
		# keep @zoom.scale constant (and not let it turn to 1)
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
	
	bringIntoView: (time) ->
		[start, end] = @x.domain().map (d) -> +d
		interval = end - start
		add = 0
		add -= interval while +time < start + add
		add += interval while +time > end + add
		@autopan [new Date(start + add), new Date(end + add)]
	
	setHeader: (domain = @x.domain(), today = false) ->
		text = if today then 'Today’s electricity usage' else
			format = d3.time.format '%b %d, %H:%M'
			start = format domain[0]
			end = format domain[1]
			"Electricity usage: #{start} – #{end}"
		d3.select('.chart-title').text text
	
	hideMeter: ->
		@meter.classed 'hidden', true
	
	showMeter: ->
		@meter.classed 'hidden', false
		if @nowInView()
			@meter.select('.now').style 'opacity', 1
			@quickUpdate()
		else
			@meter.select('.now').style 'opacity', 0
			start = @x.domain()[0]
			end = @x.domain()[1]
			Q.spread [@energy(start), @energy(end)], (e0, e1) =>
				energy = (e1 - e0) * 1000
				value = Math.round(energy)
				@meter.select('text').text("#{value} Wh")
				@meter.classed 'hidden', false
				@meter.select('.now').style 'opacity', 0
	
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
			utils.json url
			@bubbleBath.load [@display[0].feed], @x.domain()...
		], (result, wasteResult, @bubbles) =>
			@data = @display[0].getDataFromRequest params, result
			@updateWithData true
			deferred.resolve()
		if @showLoading
			@loading.attr 'opacity', .6
			@showLoading = false
			deferred.resolve()
		deferred.promise
	
	updateWithData: (stay = false, @data = @data, @bubbles = @bubbles) ->
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
	
	setScrollMomentumTransition: ->
		# Create a code-only transition that modifies the x domain
		# Assigned to @time so it can be cancelled/referenced again
		@time.transition()
		.duration(@momentum.maxScrollTime)
		.tween('zoom', =>
			# Return a custom tweener (t=0..1), periodically run by d3
			return (t) =>
				# Don't do anything if _speed is under stopThreshold
				@time.transition() if Math.abs(@momentum._speed) < @momentum.stopThreshold
				@momentum._speed /= @momentum.fallOff
				newTranslate = [@zoom.translate()[0] + @momentum._speed, @zoom.translate()[1]]
				@zoom
					.translate(newTranslate)
				@transform()  # Trigger a redraw/reassign of everything
			)
		.ease()

	key: (date) -> utils.json(
			"#{@design}_show/unix_to_couchm_ts?feed=#{@feed}&timestamp=#{+date}")
	
	nowInView: -> +@x.domain()[0] < +new Date < +@x.domain()[1]