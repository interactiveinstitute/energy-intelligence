this.utils = {
  array: function(arrayLike) {
    return Array.prototype.slice.call(arrayLike);
  },
  extend: function(obj, props) {
    var key, value;
    if ((function() {
      var _results;
      _results = [];
      for (key in props) {
        value = props[key];
        _results.push(props.hasOwnProperty(key));
      }
      return _results;
    })()) {
      obj[key] = value;
    }
    return obj;
  },
  json: function(url) {
    var deferred, request;
    deferred = Q.defer();
    request = function() {
      var e, r;
      r = new XMLHttpRequest;
      r.open('GET', url, true);
      r.withCredentials = true;
      r.onload = function() {
        switch (this.status) {
          case 200:
            return deferred.resolve(JSON.parse(this.response));
          case 500:
            setTimeout(request, 100);
            return console.log('Got a server error, retryingâ€¦');
        }
      };
      try {
        return r.send();
      } catch (_error) {
        e = _error;
        return console.log('error', e);
      }
    };
    request();
    return deferred.promise;
  }
};
