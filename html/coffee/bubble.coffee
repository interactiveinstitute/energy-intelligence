@bubble = (node) -> new Bubble node

class @Bubble

	constructor: (node) ->
		return node.bubble if node.bubble?
		node.bubble = @
		@chart = window.chart
		@container = d3.select node
		d = @container.datum()
		@[k] = v for k, v of d
		@id = if @at? then +@at else JSON.stringify @interval
		@middle = new Date((+@interval[0] + +@interval[1]) / 2) if @interval?
		if @value_type is 'W'
			@str = if @value < 1000
				Math.round(@value * 10) / 10
			else
				Math.round @value
			@str += ' W'
			@W = true
		else if @value_type is 'Wh'
			@str = "#{Math.round @value} Wh"
			@_value = @value
			@hours = (+@interval[1] - +@interval[0]) / 60 / 60 / 1000
			@value = @value / @hours
			@Wh = true
		if not @note? and @measuredAt
			time = "#{@measuredAt.getHours()}:"
			time += '0' if @measuredAt.getMinutes() < 10
			time += @measuredAt.getMinutes()
			@note = "measured at #{time}"
		@mobile = true
		@createDom()
		@position()
		@_dispatch = d3.dispatch 'close'
		@publish @_dispatch, ['on']

	publish: (obj, methods) ->
		methods.map (name) => @[name] = obj[name].bind obj

	close: ->
		@_el.remove()
		@_dispatch.close()
		@

	createDom: ->
		if @interval? then @_ival = @container.append('rect')
				.classed('interval', true)
				.attr('x', 0)
				.attr('y', 0)
				.attr('width', 0)
				.attr('height', 0)
		@_el = @container.append('g')
				.attr('class', 'popup')
				.classed('energy', @value_type is 'Wh')
				.on('touchstart', (d, i) =>
					if @container.classed 'current'
						if @closesOnTouch
							d3.event.stopPropagation()
							@close()
						else
							@toggleSeeThrough true
							id = "touchend.bubble#{@id}"
							d3.select('body').on id, =>
								d3.select('body').on id, null
								@toggleSeeThrough false
					else
						@chart.bringIntoView @at)
		labelBackground = @_el.append('rect')
				.classed('back', true)
				.attr('x', 63)
				.attr('y', -20)
				.attr('height', 40)
				.attr('rx', 20)
				.attr('ry', 20)
		@_el.append('path')
				.attr('d', 'M 16 -8 A 48 48 340 1 1 16 8 L 0 0 L 16 -8')
		@_el.append('text')
				.attr('class', 'value')
				.text(@str)
				.attr('text-anchor', 'middle')
				.attr('alignment-baseline', 'central')
				.attr('dx', if @W? then 63 else 44)
				.attr('dy', if @W? then 0 else -45)
		labelText = @_el.append('text')
				.attr('class', 'note')
				.text(@note)
				.attr('text-anchor', if @W? then 'start' else 'middle')
				.attr('alignment-baseline', 'central')
				.attr('dx', if @W? then 120 else 32)
				.attr('dy', if @W? then 0 else -80)
		labelBackground.attr('width', 76 + labelText.node().getBBox().width)
		@

	position: (transition, x, y) ->
		return unless @mobile
		fixed = x? and y?
		unless fixed
			x = @chart.x @at ? @middle
			y = @chart.y @value
		if transition
			obj = @_el
					.on('webkitTransitionEnd', =>
						@_el.on('webkitTransitionEnd', null)
						@mobile = true
						@position true)
				.transition().duration(300)
			@mobile = false if fixed
		else
			obj = @_el
		obj.attr 'transform', "translate(#{x}, #{y})"
		if @Wh
			y = @chart.y @value
			@_ival
					.attr('x', @chart.x @interval[0])
					.attr('width', @chart.x(@interval[1]) - @chart.x(@interval[0]))
					.attr('y', y)
					.attr('height', @chart.height - @chart.config.padding_bottom - y)
		@

	toggleSeeThrough: (bool) ->
		@_seeThrough = if bool? then bool else not @_seeThrough
		@_el.attr 'opacity', if @_seeThrough then .2 else 1
		@
