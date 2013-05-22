function Bubble(kwargs) {
  for (kw in kwargs) this[kw] = kwargs[kw];

  this.events = document.createElement('div');
  this.addEventListener = this.events.addEventListener.bind(this.events);

  this.createDom();

  this._dispatch = d3.dispatch('close');
  this.publish(this._dispatch, ['on']);//'addEventListener', 'removeEventListener', 'dispatchEvent');
}

Bubble.prototype.publish = function(obj, methods) {
  methods.map(function(name) {
    this[name] = obj[name].bind(obj);
  }, this);
};

Bubble.prototype.createDom = function() {
  this._el = this.chart.chart
    .append('g')
      .attr('class', 'popup')
      .attr('transform', 'translate(' + this.chart.x(this.at) + ',' + this.chart.y(this.watt) + ')')
      .attr('filter', 'url(#popup-shadow)')
      .on('touchstart', function() {
        this.close();
        d3.event.stopPropagation();
      }.bind(this));
  this._el.append('rect')
      .attr('x', 63)
      .attr('y', -20)
      .attr('width', 128)
      .attr('height', 40)
      .attr('rx', 20)
      .attr('ry', 20);
  this._el.append('path')
      .attr('d', 'M 16 -8 A 48 48 340 1 1 16 8 L 0 0 L 16 -8');
  this._el.append('text')
      .attr('class', 'value')
      .text(this.watt + ' W')
      .attr('text-anchor', 'middle')
      .attr('alignment-baseline', 'central')
      .attr('dx', 63)
      .attr('dy', 0);

  var time = this.at.getHours() + ':';
  if (this.at.getMinutes() < 10) time += '0';
  time += this.at.getMinutes();

  this._el.append('text')
      .attr('class', 'time')
      .text(time)
      .attr('text-anchor', 'start')
      .attr('alignment-baseline', 'central')
      .attr('dx', 120)
      .attr('dy', 0);
}

Bubble.prototype.close = function() {
  this._el.remove();
  this._dispatch.close();
};
