window.Remote = function(url) {
  var source = new EventSource(url);
  source.addEventListener('reload', function() {
    location.reload();
  });
};
