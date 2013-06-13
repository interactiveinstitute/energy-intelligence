/*
 * TODO slide to sides on fullscreen chart
 */

var Cardboard = {
  CARD_WIDTH: 512
};

(function() {
  
var parameters = function(p) {
  return Object.keys(p).map(function(k) { return k+ '=' + p[k]; }).join('&');
};

var json = function(url, cb) {
  var req = new XMLHttpRequest;
  req.open('GET', url, true);
  req.withCredentials = true;
  req.onload = function(e) { cb(JSON.parse(req.response)) };
  req.send();
};

Cardboard.init = function(containers) {
  this.containers = d3.selectAll(containers)
      .each(function() {
        d3.select(this)
            .style('width', Cardboard.CARD_WIDTH + 'px')
            .style('height', this.dataset.height + 'px');
      });
 
  var params = parameters({
    filter: 'events/cards',
    feed: 'eventsource',
    include_docs: true,
    since: 'now',
    source: this.feed
  });
  this.source = new EventSource(this.db + '/_changes?' + params, {
    withCredentials: true
  });
  this.source.onmessage = function(e) {
    var doc = JSON.parse(e.data).doc;
    if (doc.output) for (var key in doc.output)
      if (doc.output[key].sp_card && doc.output[key].feed == this.feed)
        Cardboard._add(doc._id, key, doc.output[key].sp_card);
  };

  params = parameters({
    startkey: JSON.stringify([this.feed]),
    endkey: JSON.stringify([this.feed, {}])
  });
  var url = this.db + '/_design/events/_view/cards_by_feed_and_time?' + params;
  json(url, function(result) {
    result.rows.forEach(function(row) {
      Cardboard._add(row.id, row.key[2], row.value);
    });
  });
};

Cardboard._add = function(_id, key, card) {
  console.log('adding', _id, key);
  this.containers.each(function() {
    var container = d3.select(this);
    if (container.attr('data-height') == card.height) {
      var data = container.data();
      if (!data[0]) data = [];
      if (data.every(function(datum) {
        if (datum._id == _id && datum.key == key) {
          datum.card = card;
          return false;
        } else return true;
      })) data.push({
        _id: _id,
        key: key,
        card: card
      });
      var cards = container.selectAll('.card')
          .data(data);
      cards.enter().append('div')
          .classed('card', true)
          .classed(card['class'], true)
          .style('width', Cardboard.CARD_WIDTH + 'px')
          .style('height', container.attr('data-height') + 'px')
          .html(card.content);
      cards.exit()
          .remove();
    }
  });
};

})();
