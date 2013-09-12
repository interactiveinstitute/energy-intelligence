# Remote access

A `Remote` object watches an event source for `reload` commans.

    class @Remote
      constructor: (url) ->
        source = new EventSource url
        source.addEventListener 'reload', -> location.reload()
