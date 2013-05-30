#!/usr/bin/env node

var events = require('events');
var http = require('http');

var config = require('./config');

var emitter = new events.EventEmitter;

var commands = ['reload'];

var log = function(ip, message) {
  console.log(new Date().toJSON(), ip, message);
};

http.createServer(function(request, response) {
  if (request.method == 'GET' && request.url == '/') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    var ip = request.connection.remoteAddress;
    var listener = function(command, data) { response.write([
      'event: ', command,
      '\ndata: ', JSON.stringify(data), '\n\n'
    ].join('')); };
    var close = function() {
      response.end();
      emitter.removeListener('command', listener);
      log(ip, 'closed');
    };
    emitter.on('command', listener);
    response.on('close', close);
    response.setTimeout(config.remote_timeout, close);
    log(ip, 'connected');
  } else if (request.method == 'GET' && commands.indexOf(request.url.slice(1)) != -1) {
    var command = request.url.slice(1);
    emitter.emit('command', command);
    log(request.connection.remoteAddress, 'command: ' + command);
    response.end();
  } else {
    response.end();
  }
}).listen(config.remote_port, '0.0.0.0');

console.log('Running on port', config.remote_port);
