    class @Cardboard
      parameters: (p) -> Object.keys(p).map((k) -> "#{k}=#{p[k]}").join '&'
      constructor: (config) ->
        @width = config.card_width
        @db = config.database
        @feed = config.feed
      init: (containers) ->
        width = @width
        @containers = d3.selectAll(containers)
            .each ->
              d3.select(@)
                  .style('width', width + 'px')
                  .style('height', @dataset.height + 'px')

        @toggleVisible false

        params = @parameters
          filter: 'event/cards'
          feed: 'eventsource'
          include_docs: true
          since: 'now'
          source: @feed
        @source = new EventSource "#{@db}/_changes?#{params}",
          withCredentials: true
        @source.onmessage = (e) =>
          doc = JSON.parse(e.data).doc
          if doc.output
            for key, value of doc.output
              if value.sp_card? and value.feed is @feed
                @_add doc._id, key, value.sp_card

        params = @parameters
          startkey: JSON.stringify [@feed]
          endkey: JSON.stringify [@feed, {}]
        url =
          "#{@db}/_design/events/_view/cards_by_feed_and_time?#{params}"
        utils.json(url).then (result) =>
          @_add row.id, row.key[2], row.value for row in result.rows
      toggleVisible: (visible) ->
        @containers.classed 'visible', visible if @containers
      _add: (_id, key, card) ->
        console.log 'adding', _id, key
        width = @width
        @containers.each () ->
          container = d3.select @
          return unless card.height is container.attr 'data-height'
          data = container.data()
          data = [] unless data[0]?
          if data.every((datum) ->
            if datum._id is _id and datum.key is key
              datum.card = card
              false
            else true)
            data.push
              _id: _id
              key: key
              card: card
          cards = container.selectAll('.card').data data
          cards.enter().append('div')
              .classed('card', true)
              .classed(card['class'], true)
              .style('width', width + 'px')
              .style('height', "#{container.attr 'data-height'}px")
              .html card.content
          cards.exit().remove()
