// Generated by CoffeeScript 1.6.3
this.Cardboard = (function() {
  Cardboard.prototype.parameters = function(p) {
    return Object.keys(p).map(function(k) {
      return "" + k + "=" + p[k];
    }).join('&');
  };

  function Cardboard(config) {
    this.config = config;
    this.db = config.database;
  }

  Cardboard.prototype.init = function(containers) {
    var width,
      _this = this;
    width = this.config.card_width;
    this.containers = d3.selectAll(containers).each(function() {
      return d3.select(this).style('width', width + 'px').style('height', this.dataset.height + 'px');
    });
    this.toggleVisible(false);
    /*
    # TODO add new cards instantly instead of the 30s reload
    params = @parameters
      filter: 'event/cards'
      feed: 'eventsource'
      include_docs: true
      since: 'now'
      source: @config.feed
    @source = new EventSource "#{@db}/_changes?#{params}",
      withCredentials: true
    @source.onmessage = (e) =>
      doc = JSON.parse(e.data).doc
      if doc.output
        for key, value of doc.output
          if value.sp_card? and value.feed is @config.feed
            @_add doc._id, key, value.sp_card
    */

    this.load();
    return setInterval((function() {
      return _this.load();
    }), this.config.full_update);
  };

  Cardboard.prototype.load = function() {
    var params, url,
      _this = this;
    params = this.parameters({
      startkey: JSON.stringify([this.config.feed]),
      endkey: JSON.stringify([this.config.feed, {}])
    });
    url = "" + this.db + "/_design/events/_view/cards_by_feed_and_time?" + params;
    return utils.json(url).then(function(result) {
      var row, _i, _len, _ref, _results;
      _this.containers.html('');
      result.rows.sort(function(a, b) {
        if (a.value.priority < b.value.priority) {
          return 1;
        } else if (a.value.priority > b.value.priority) {
          return -1;
        } else if (a.id < b.id) {
          return 1;
        } else {
          return -1;
        }
      });
      _ref = result.rows;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        row = _ref[_i];
        _results.push(_this._add(row.id, row.key[2], row.value));
      }
      return _results;
    });
  };

  Cardboard.prototype.toggleVisible = function(visible) {
    if (this.containers) {
      return this.containers.classed('visible', visible);
    }
  };

  Cardboard.prototype._add = function(_id, key, card) {
    var cards, container, data, element, fits, is_this_card, width, _i, _len, _ref, _results;
    width = this.config.card_width;
    _ref = this.containers[0];
    _results = [];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      element = _ref[_i];
      container = d3.select(element);
      if (card.height <= container.attr('data-height')) {
        data = container.data();
        if (data[0] == null) {
          data = [];
        }
        fits = data.length * 512 < container.attr('data-height');
        is_this_card = function(datum) {
          if (datum._id === _id && datum.key === key) {
            datum.card = card;
            return true;
          } else {
            return false;
          }
        };
        if (fits && !data.some(is_this_card)) {
          data.push({
            _id: _id,
            key: key,
            card: card
          });
          container.data(data);
        } else if (data.some(is_this_card)) {

        } else {
          continue;
        }
        cards = container.selectAll('.card').data(data);
        cards.enter().append('div').classed('card', true).classed(card['class'], true).style('width', width + 'px').style('height', "" + (container.attr('data-height')) + "px").html(card.content);
        cards.exit().remove();
        break;
      } else {
        _results.push(void 0);
      }
    }
    return _results;
  };

  return Cardboard;

})();

/*
//@ sourceMappingURL=cardboard.map
*/
