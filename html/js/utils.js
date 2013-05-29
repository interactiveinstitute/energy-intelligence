var utils = {};

utils.array = function(arrayLike) {
  return Array.prototype.slice.call(arrayLike)
}

utils.curry = function(fn, args) {
  return function() {
    return fn.apply(this, args.concat(utils.array(arguments)))
  }
}
