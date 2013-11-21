class @Cardboard
	constructor: (@config) -> @db = config.database
	
	parameters: (p) -> Object.keys(p).map((k) -> "#{k}=#{p[k]}").join '&'

	init: (containers) ->
		width = @config.card_width
		@containers = d3.selectAll(containers)
				.each ->
					d3.select(@)
							.style('width', width + 'px')
							.style('height', @dataset.height + 'px')
		@toggleVisible false
		@load()
		setInterval (=> @load()), @config.full_update
	
	load: ->
		params = @parameters
			startkey: JSON.stringify [@config.feed]
			endkey: JSON.stringify [@config.feed, {}]
		url =
			"#{@db}/_design/events/_view/cards_by_feed_and_time?#{params}"
		utils.json(url).then (result) =>
			@containers.html ''
			result.rows.sort (a, b) ->
				if a.value.priority < b.value.priority then 1
				else if a.value.priority > b.value.priority then -1
				else if a.id < b.id then 1
				else -1
			@_add row.id, row.key[2], row.value for row in result.rows
	
	toggleVisible: (visible) ->
		@containers.classed 'visible', visible if @containers
	
	_add: (_id, key, card) ->
		width = @config.card_width
		for element in @containers[0]
			container = d3.select element
			if card.height <= container.attr 'data-height'
				data = container.data()
				data = [] unless data[0]?
				fits = data.length * 512 < container.attr 'data-height'
				is_this_card = (datum) ->
					if datum._id is _id and datum.key is key
						datum.card = card
						true 
					else
						false
				if fits and not data.some is_this_card
					data.push _id: _id, key: key, card: card
					container.data data
				else if data.some is_this_card
				else
					continue
				cards = container.selectAll('.card').data data
				cards.enter().append('div')
						.classed('card', true)
						.classed(card['class'], true)
						.style('width', width + 'px')
						.style('height', "#{container.attr 'data-height'}px")
						.html card.content
				cards.exit().remove()
				break
