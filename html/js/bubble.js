var bubble = (function() {
  var Bubble;

  function bubble(node) {
    if (node.bubble) return node.bubble

    var selection = d3.select(node)
    var d = selection.datum()

    var obj = new Bubble

    ;(function() {
      node.bubble = this

      for (key in d) this[key] = d[key]
      this.container = selection

      if (!this.note && this.at) {
        // Generate a note
        var time = this.at.getHours() + ':'
        if (this.at.getMinutes() < 10) time += '0'
        time += this.at.getMinutes()
        this.note = 'measured at ' + time
      }

      this.createDom()
      this.position()

      this._dispatch = d3.dispatch('close')
      this.publish(this._dispatch, ['on'])
    }).bind(obj)()

    return obj
  }

  function value(v) {
    if (v < 1000) return Math.round(v * 10) / 10
    else return Math.round(v)
  }

  Bubble = function() {}
  Bubble.prototype = {
    publish: function(obj, methods) {
      methods.map(function(name) { this[name] = obj[name].bind(obj) }, this)
    },
    createDom: function() {
      var onTouchEnd = utils.curry(this.toggleSeeThrough, [false], this)
      d3.select('.surface').on('touchend', onTouchEnd)

      this._el = this.container
        .append('g')
          .attr('class', 'popup')
          //.attr('filter', 'url(#popup-shadow)')
          // TODO add shadow when still
          .on('touchstart', function() {
            if (this.container.classed('current')) {
              if (this.closesOnTouch) {
                d3.event.stopPropagation()
                this.close()
              } else this.toggleSeeThrough(true)
            } else {
              this.chart.bringIntoView(this.at);
            }
          }.bind(this))
          .on('touchend', onTouchEnd)
      var labelBackground = this._el.append('rect')
          .attr('x', 63)
          .attr('y', -20)
          .attr('height', 40)
          .attr('rx', 20)
          .attr('ry', 20);
      this._el.append('path')
          .attr('d', 'M 16 -8 A 48 48 340 1 1 16 8 L 0 0 L 16 -8')
      this._el.append('text')
          .attr('class', 'value')
          .text(value(this.value) + ' ' + this.value_type)
          .attr('text-anchor', 'middle')
          .attr('alignment-baseline', 'central')
          .attr('dx', 63)
          .attr('dy', 0)
      var labelText = this._el.append('text')
          .attr('class', 'note')
          .text(this.note)
          .attr('text-anchor', 'start')
          .attr('alignment-baseline', 'central')
          .attr('dx', 120)
          .attr('dy', 0)

      labelBackground.attr('width', 76 + labelText.node().getBBox().width)

      return this
    },
    close: function() {
      this._el.remove()
      this._dispatch.close()
      return this
    },
    position: function(transition, x, y) {
      if (x === undefined || y === undefined) {
        x = this.chart.x(this.at)
        y = this.chart.y(this.value)
      }

      (transition ? this._el.transition().duration(300) : this._el)
          .attr('transform', 'translate(' + x + ',' + y + ')')

      return this
    },
    toggleSeeThrough: function(bool) {
      if (bool === undefined) this._seeThrough = !this._seeThrough
      else this._seeThrough = bool

      this._el
          .attr('opacity', this._seeThrough ? .2 : 1)

      return this
    }
  }

  return bubble
})()
