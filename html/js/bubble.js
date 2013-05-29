function Bubble(properties) {
  for (key in properties) this[key] = properties[key]

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
}

Bubble.prototype.publish = function(obj, methods) {
  methods.map(function(name) { this[name] = obj[name].bind(obj) }, this)
}

Bubble.prototype.createDom = function() {
  var onTouchEnd = utils.curry(this.toggleSeeThrough, [false]).bind(this)
  d3.select('.surface').on('touchend', onTouchEnd)

  this._el = this.container
    .append('g')
      .attr('class', 'popup')
      .attr('filter', 'url(#popup-shadow)')
      .on('touchstart', function() {
        d3.event.stopPropagation()
        if (this.closesOnTouch) this.close()
        else this.toggleSeeThrough(true)
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
      .text(this.value + ' ' + this.value_type)
      .attr('text-anchor', 'middle')
      .attr('alignment-baseline', 'central')
      .attr('dx', 63)
      .attr('dy', 0)
  var labelText = this._el.append('text')
      .attr('class', 'time')
      .text(this.note)
      .attr('text-anchor', 'start')
      .attr('alignment-baseline', 'central')
      .attr('dx', 120)
      .attr('dy', 0)

  labelBackground.attr('width', 76 + labelText.node().getBBox().width)
}

Bubble.prototype.close = function() {
  this._el.remove()
  this._dispatch.close()
}

Bubble.prototype.position = function() {
  var x = this.chart.x(this.at)
  var y = this.chart.y(this.value)

  this._el
      .attr('transform', 'translate(' + x + ',' + y + ')')
}

Bubble.prototype.toggleSeeThrough = function(bool) {
  if (bool === undefined) this._seeThrough = !this._seeThrough
  else this._seeThrough = bool

  this._el.attr('opacity', this._seeThrough ? .2 : 1)
}
