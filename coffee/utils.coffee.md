# Utility functions

    @utils =

Use `array()` to convert anything that acts like an array to a real array.

      array: (arrayLike) -> Array.prototype.slice.call arrayLike

Use `extent(object, properties)` to add a dictionary of properties to the
object.

      extend: (obj, props) ->
        obj[key] = value if props.hasOwnProperty key for key, value of props
        obj

The custom JSON loader will retry automatically after failed requests. This
seems especially necessary using CouchDB 1.3.0 on OS X.

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
        deferred.promise

