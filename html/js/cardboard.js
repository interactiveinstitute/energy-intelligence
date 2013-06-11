function Cardboard(db, width, height) {
  this.db = db;
  this.width = width;
  this.height = height;
  this.ready = false;
  this.onReady = [];

  this.construct();
  
  var callback;
  while (callback = this.onReady.shift())
    callback(this);
  this.ready = true;
}

Cardboard.COLUMN_COUNT = 3;

Cardboard.prototype.then = function(callback) {
  if (this.ready) callback(this);
  else this.onReady.push(callback);
};

Cardboard.prototype.construct = function() {
};

Cardboard.prototype.init = function(container) {
  this.el = d3.select(container).append('div')
      .attr('class', 'cardboard')
      .style('width', this.width + 'px')
      .style('height', this.height + 'px');

  this.columns = [];
  for (var i = 0; i < Cardboard.COLUMN_COUNT; i++) {
    this.columns[i] = this.el.append('div')
        .attr('class', 'column')
        .style('width', this.width / Cardboard.COLUMN_COUNT + 'px')
        .attr('height', this.height + 'px');
  }
};
