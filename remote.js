#!/usr/bin/env node

var events = require('events');
var http = require('http');

var config = require('./config');

var emitter = new events.EventEmitter;

var commands = ['reload'];

http.createServer(function(request, response) {
  if (request.method == 'GET' && request.url == '/') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    var listener = function(command, data) {
      response.write([
        'event: ', command,
        '\ndata: ', JSON.stringify(data), '\n\n'
      ].join(''));
    };
    emitter.on('command', listener);
    emitter.on('close', function() {
      emitter.removeListener('command', listener);
    });
    console.log('connected', request.connection.remoteAddress);
  } else if (request.method == 'GET' && commands.indexOf(request.url.slice(1)) != -1) {
    var command = request.url.slice(1);
    emitter.emit('command', command);
    console.log('command', command, 'from', request.connection.remoteAddress);
    response.end();
  } else {
    response.end();
  }
}).listen(config.remote_port, '127.0.0.1');

console.log('Running on port', config.remote_port);
