class @TotalPower
	type: 'TotalPower'
	unit: 'W'
	feed: 'allRooms'
	datastream: 'ElectricPower'
	
	constructor: (@chart) ->
		@area = d3.svg.area()
				.x((d) => @chart.x d.resampledAt)
				.y0((d) => @chart.height - @chart.config.padding_bottom)
				.y1((d) => @chart.y d.value)
		@line = d3.svg.line()
				.x((d) => @chart.x d.resampledAt)
				.y((d) => @chart.y d.value)
	
	init: ->
		container = @chart.time.select('.container')
				.attr('transform', '')
		container.selectAll('*').remove()
		container.append('path')
				.attr('class', 'area')
				.datum([])
				.attr('d', @area)
		container.append('path')
				.attr('class', 'line')
				.datum([])
				.attr('d', @line)
		@chart.time.select('.extras')
			.append('rect')
				.attr('class', 'nowLine')
				.attr('fill', 'url(#now-line-gradient)')
				.attr('width', @chart.config.now_bar_width)
		@chart.time.select('.extras')
			.append('circle')
				.attr('class', 'nowDot')
				.attr('fill', 'url(#now-dot-gradient)')
				.attr('r', @chart.config.now_bar_width)
	
	getDataFromRequest: (params, result) ->
		resample = +new Date params.start
		result.datapoints.map (d, i) ->
			at: new Date d.at
			resampledAt: new Date resample + i * params.interval * 1000
			value: parseFloat d.value ? 0
			measuredAt: new Date d.debug[2]
	
	transformExtras: () ->
		return unless @chart.doc?
		y = @chart.y @chart.doc.ElectricPower
		@chart.time.select('.nowLine')
				.attr('x', @chart.x(new Date) - @chart.config.now_bar_width/ 2)
				.attr('y', y)
				.attr('height',
					@chart.height - @chart.config.padding_bottom - y)
		@chart.time.select('.nowDot')
				.attr('cx', @chart.x new Date)
				.attr('cy', y)
	
	setDataAndTransform: (data, from, to, transition = true) ->
		if transition
			@chart.time.select('.area')
					.datum(data)
					.attr('d', @area)
					.attr('transform', from)
				.transition()
					.duration(1000)
					.attr('transform', to)
			@chart.time.select('.line')
					.datum(data)
					.attr('d', @line)
					.attr('transform', from)
				.transition()
					.duration(1000)
					.attr('transform', to)
		else
			@chart.time.select('.area')
					.datum(data)
					.attr('d', @area)
					.attr('transform', to)
			@chart.time.select('.line')
					.datum(data)
					.attr('d', @line)
					.attr('transform', to)
	
	transform: ->
		@chart.time.select('.area').attr 'd', @area
		@chart.time.select('.line').attr 'd', @line
	
	getParameters: (domain) ->
		start = domain[0]
		duration = +domain[1] - +domain[0]
		actualStart = +start - duration
		actualEnd = Math.min(+start + 2 * duration, +new Date)
		actualDuration = Math.max(+actualStart, actualEnd) - +actualStart
		n = @chart.width / @chart.config.sample_size
		for interval, i in @chart.config.intervals
			break if interval > duration / n / 1000
		interval = @chart.config.intervals[i - 1] ? 1
		n = Math.ceil duration * 3 / interval / 1000
		interval: interval
		duration: "#{parseInt actualDuration / 1000}seconds"
		start: new Date(actualStart).toJSON()


class @EfficiencyPlot
	type: 'EfficiencyPlot'
	unit: 'Wh'
	feed: 'allRooms',             #TODO
	datastream: 'ElectricEnergy'  #TODO


	constructor: (@chart)->
		@energyLine = d3.svg.line()
			.x((d) => @chart.x(d.resampledAt))
			.y((d) => @chart.y(d.value))
		@energyArea = d3.svg.area()
			.x((d) => @chart.x(d.resampledAt))
			.y0((d) => @chart.height - @chart.config.padding_bottom)
			.y1((d) => @chart.y(d.value))
		@wasteLine = d3.svg.line()
			.x((d) => @chart.x(d.resampledAt))
			.y((d) => @chart.y(d.value))
		@wasteArea = d3.svg.area()
			.x((d) => @chart.x(d.resampledAt))
			.y0((d) => @chart.height - @chart.config.padding_bottom)
			.y1((d) => @chart.y(d.value))

	init: ()->
		container = @chart.time.select('.container')
			.attr('transform', '')
		container.selectAll('*').remove()
		# Energy Area
		container.append('path')
			.classed('area', true)
			.classed('energy', true)
			.datum([])
			.attr('d', @energyArea)
		# Waste Area
		container.append('path')
			.classed('area', true)
			.classed('waste', true)
			.datum([])
			.attr('d', @wasteArea)
		# Waste line
		container.append('path')
			.classed('line', true)
			.classed('waste', true)
			.datum([])
			.attr('d', @wasteLine)
		# Energy Line
		container.append('path')
			.classed('line', true)
			.classed('energy', true)
			.datum([])
			.attr('d', @energyLine)
	
	getDataFromRequest: (params, result) ->
		''' I guess this is where received data is sent and formatted? '''
		resample = +new Date(params.start)
		result.datapoints.map (d, i) ->
			at: new Date(d.at)
			resampledAt: new Date(resample + i * params.interval * 1000)
			value: parseFloat(d.value ? 0)
			measuredAt: new Date(d.debug[2])

	transformExtras: () ->
		if !@chart.doc?
			return
		y = @chart.y(@chart.doc.ElectricPower)
		@chart.time.select('.nowLine')
			.attr('x', @chart.x(new Date) - @chart.config.now_bar_width)
			.attr('y', y)
			.attr('height', @chart.height - @chart.config.padding_bottom - y)
		@chart.time.select('.nowDot')
			.attr('cx', @chart.x(new Date()))
			.attr('cy', y)

	setDataAndTransform: (data, from, to, transition = true) ->
		transitionLength = if transition then 1000 else 1
		# Assign new data and set a transition on all the .area elements
		@chart.time.select('.area')
			.datum(data)
			.attr('transform', from)
			.transition()
			.duration(transitionLength)
			.attr('transform', to)
		@chart.time.select('.line')
			.datum(data)
			.attr('transform', from)
			.transition()
			.duration(transitionLength)
			.attr('transform', to)
		# Run the assigned data through the generators and set it as the path.d property
		@transform()

	transform: () ->
		@chart.time.select('.area.energy')
			.attr('d', @energyArea)
		@chart.time.select('.area.waste')
			.attr('d', @wasteArea)
		@chart.time.select('.line.energy')
			.attr('d', @energyLine)
		@chart.time.select('.line.waste')
			.attr('d', @wasteLine)

	getParameters: (domain) ->
		start = domain[0]
		duration = +domain[1] - +domain[0]
		actualStart = +start - duration
		actualEnd = Math.min(+start + 2 * duration, +new Date)
		actualDuration = Math.max(+actualStart, actualEnd) - +actualStart
		n = @chart.width / @chart.config.sample_size
		for interval, i in @chart.config.intervals
			break if interval > duration / n / 1000
		interval = @chart.config.intervals[i - 1] ? 1
		n = Math.ceil duration * 3 / interval / 1000
		interval: interval
		duration: "#{parseInt actualDuration / 1000}seconds"
		start: new Date(actualStart).toJSON()














































class @TotalEnergy
	type: 'TotalEnergy'
	unit: 'Wh'
	feed: 'allRooms'
	datastream: 'ElectricEnergy'
	
	constructor: (@chart) ->
	
	init: ->
		@group = @chart.time.select '.container'
		@group.selectAll('*').remove()
	
	getDataFromRequest: (params, result) ->
		info = @chart.getTickInfo()
		pointsPerBar = info.duration / (params.interval * 1000)
		data = []
		n = []
		while (n + 1) * pointsPerBar < result.datapoints.length
			startIndex = n * pointsPerBar
			endIndex = (n + 1) * pointsPerBar
			end = parseFloat result.datapoints[endIndex]?.value ? 0
			start = parseFloat result.datapoints[startIndex]?.value ? 0
			data[n++] =
				start: new Date result.datapoints[startIndex]?.at
				end: new Date result.datapoints[endIndex]?.at
				value: if 0 < start < end then (end - start) * 1000 else 0
		data
	
	transform: ->
		@group.selectAll('.bar rect')
				.attr('x', (d) => @chart.x d.start)
				.attr('width', (d) => @chart.x(d.end) - @chart.x(d.start))
		@group.selectAll('.bar text')
				.attr('dx', (d) => @chart.x d.start)
	
	setDataAndTransform: (data, from, to) ->
		@group.attr 'transform', to
		bar = @group.selectAll('.bar')
				.data data, (d) -> "#{+d.start}>#{d.end}"
		g = bar.enter().append('g').attr 'class', 'bar'
		g.append('rect')
				.attr('y', (d) => @chart.y d.value)
				.attr('height', (d) =>
					@chart.height - @chart.config.padding_bottom - @chart.y(d.value))
		bar.exit().remove()
		@transform()
	
	getParameters: ->
		info = @chart.getTickInfo()
		start = @chart.x.domain()[0]
		duration = +@chart.x.domain()[1] - + @chart.x.domain()[0]
		n = @chart.width / @chart.config.sample_size
		for interval, i in @chart.config.intervals
			break if interval > duration / n / 1000
		interval = @chart.config.intervals[i - 1] ? 1
		n = Math.ceil duration * 3 / interval / 1000
		first = +info.first
		earliest = first + info.duration *
			Math.floor (+start - duration - first) / info.duration
		latest = first + 2 * info.duration *
			Math.ceil (+start + duration - first) / info.duration
		interval: interval
		duration: "#{parseInt (latest - earliest) / 1000}seconds"
		start: new Date(earliest).toJSON()
