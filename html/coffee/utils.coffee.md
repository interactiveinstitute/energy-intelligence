@utils = {
  array: (arrayLike) -> Array.prototype.slice.call arrayLike,
  extend: (obj, props) ->
    obj[key] = value if props.hasOwnProperty key for key, value of props
    return obj
  ,
  json: (url) ->
    deferred = Q.defer()
    request = ->
      r = new XMLHttpRequest
      r.open 'GET', url, true
      r.withCredentials = true
      r.onload = ->
        switch @status
          when 200
            deferred.resolve JSON.parse @response
          when 500
            setTimeout request, 100
            console.log 'Got a server error, retrying…'
      try
        r.send()
      catch e
        console.log 'error', e
    request()
    return deferred.promise
}