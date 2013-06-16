    class @Bubble
      constructor: (node) ->
        return node.bubble if node.bubble?

        @container = d3.select node
        d = @container.datum()

        node.bubble = @
        @[k] = v for k, v of d

        if not @note? and @at
          time = "#{@at.getHours()}:"
          time += '0' if @at.getMinutes() < 10
          time += @at.getMinutes()
          @note = "measured at #{time}"

        @createDom()
        @position()

        @_dispatch = d3.dispatch 'close'
        @publish @_dispatch, ['on']

      publish: (obj, methods) ->
        methods.map (name) => @[name] = obj[name].bind obj

      createDom: ->
        @_el = @container
          .append('g')
            .attr('class', 'popup')
            .on('touchstart', (d, i) =>
              if @container.classed 'current'
                if @closesOnTouch
                  d3.event.stopPropagation()
                  @close()
                else
                  @toggleSeeThrough true
                  id = "touchend.bubble#{+d.at}"
                  d3.select('body').on id, =>
                    d3.select('body').on id, null
                    @toggleSeeThrough false
              else
                @chart.bringIntoView @at)
        labelBackground = @_el.append('rect')
            .attr('x', 63)
            .attr('y', -20)
            .attr('height', 40)
            .attr('rx', 20)
            .attr('ry', 20)
        @_el.append('path')
            .attr('d', 'M 16 -8 A 48 48 340 1 1 16 8 L 0 0 L 16 -8')
        @_el.append('text')
            .attr('class', 'value')
            .text("#{value(@value)} #{@value_type}")
            .attr('text-anchor', 'middle')
            .attr('alignment-baseline', 'central')
            .attr('dx', 63)
            .attr('dy', 0)
        labelText = @_el.append('text')
            .attr('class', 'note')
            .text(@note)
            .attr('text-anchor', 'start')
            .attr('alignment-baseline', 'central')
            .attr('dx', 120)
            .attr('dy', 0)
        labelBackground.attr('width', 76 + labelText.node().getBBox().width)
        @

      close: ->
        @_el.remove()
        @_dispatch.close()
        @

      position: (transition, x, y) ->
        unless x? and y?
          x = @chart.x @at
          y = @chart.y @value
        (if transition then @_el.transition().duration(300) else @_el)
            .attr 'transform', "translate(#{x}, #{y})"
        @

      toggleSeeThrough: (bool) ->
        @_seeThrough = if bool? then bool else not @_seeThrough
        @_el.attr 'opacity', if @_seeThrough then .2 else 1
        @

    value = (v) -> if v < 1000 then Math.round(v * 10) / 10 else Math.round v

    @bubble = (node) -> new Bubble node
