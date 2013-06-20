    class @Remote
      constructor: (url) ->
        source = new EventSource url
        source.addEventListener 'reload', -> location.reload()
