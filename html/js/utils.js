var utils = {};

utils.array = function(arrayLike) {
  return Array.prototype.slice.call(arrayLike)
}

utils.curry = function(f, args, that) {
  return function() {
    return f.apply(this, args.concat(utils.array(arguments)))
  }.bind(that || this)
}

utils.extend = function(obj, props) {
  for (var key in props) if (props.hasOwnProperty(key)) obj[key] = props[key]
  return obj
}
