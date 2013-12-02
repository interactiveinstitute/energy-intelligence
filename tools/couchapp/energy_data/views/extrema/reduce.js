function (keys, values, rereduce) {
    if (rereduce)
      values = Array.prototype.concat.apply([], values.map(function(v) {
        return [v.min, v.max];
      }));
    values.sort(function(a, b) { return a[1] > b[1]; });
    return { min: values[0], max: values[values.length - 1] };
  }