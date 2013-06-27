energy-screen
=============

This is a visualisation touch screen app for SP house 14.


Installation
------------

Upload the `html/` directory to a web server. Configure CouchDB’s
`[cors]` section so that `credentials = true` and `origins` contains
the web server (e.g. `http://example.com`).


Usage
-----

Access `html/index.html` through the web server using Google Chrome.


Remote access
-------------

Run `./remote.js` (requires Node). To reload all clients, run

    curl http://localhost:8002/reload


Documentation
-------------

The structure of all code involved in this project:

![See structure.png](structure.png?raw=true)

To understand the client code, get comfortable with using d3.js with
SVG. Then read the scripts in `coffee/` using a Markdown viewer,
like the GitHub website.
