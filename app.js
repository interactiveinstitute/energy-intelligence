var couchapp = require('couchapp');
var path = require('path');

var ddoc = {
  _id: '_design/energy_data'
};

ddoc.views = {
  by_time: {
    map: function(doc) {
      if (doc.type == 'measurement') {
        var data = {};
        for (var key in doc) {
          if (['_id',
               '_rev',
               'type',
               'timestamp',
               'user',
               'source'].indexOf(key) == -1) {
            data[key] = doc[key];
          }
        }
        emit (new Date(doc.timestamp).getTime(), {
          source: doc.source,
          data: data
        });
      }
    }
  },
  total: {
    map: function(doc) {
      if (doc.type == 'measurement' && doc.source == 'Totals') {
        var date = new Date(doc.timestamp);
        emit([
          date.getUTCFullYear(),
          date.getUTCMonth(),
          date.getUTCDate(),
          date.getUTCHours(),
          date.getUTCMinutes(),
          date.getUTCSeconds(),
          date.getUTCMilliseconds()
        ], {
          time: doc.timestamp,
          power: doc['ElectricPower']
        });
      }
    },
    reduce: function(keys, values, rereduce) {
      var energy = 0;
      var min = Infinity;
      var max = 0;
      var scale = 1 / 1000 / 60 / 60; // convert from Wms to Wh
      if (rereduce) {
        //log(JSON.stringify(values, null, 2));
        for (var i = 0; i < values.length; i++) {
          if (values[i].max > max) max = values[i].max;
          if (values[i].min < min) min = values[i].min;
        }
        for (var i = 0; i < values.length - 1; i++)
          energy += values[i].energy + (values[i + 1].first.time - values[i].last.time) * values[i].last.power * scale;
        return {
          energy: energy,
          first: values[0].first,
          last: values[values.length - 1].last,
          min: min,
          max: max
        };
      } else {
        for (var i = 0; i < values.length; i++) {
          if (values[i].power > max) max = values[i].power;
          if (values[i].power < min) min = values[i].power;
        }
        for (var i = 0; i < values.length - 1; i++) {
          //log(new Date(values[i+1].time) + '-----' +  new Date(values[i].time));
          energy += Math.abs(values[i].time - values[i + 1].time) * values[i + 1].power * scale;
        }
        return {
          energy: energy,
          first: values[0],
          last: values[i],
          min: min,
          max: max
        };
      }
    }
  }
};

ddoc.lists = {
  by_time: function(head, req) {
    var row;
    start({
      headers: { 'Content-Type': 'text/html' }
    });
    var number = req.query.group_level || 1;
    send('<style>body{font:13px sans-serif}td:first-child{width:200px}</style><input type=number value=' + number + ' onchange="change(this)"><script>');
    send('function change(input) { location.href = "http://sp.sanderdijkhuis.nl:5985/sp/_design/energy_data/_list/by_time/total?group_level=" + input.value; }')
    send('</script><table>');
    while (row = getRow()) {
      send('<tr><td>' + row.key.join('-') + '<td>' + row.value.max);
    }
    send('</table>');
  },
  aggregate: function(head, req) {
    var row;
    var result = [];
    var apply = function(constructor, args) {
      var args = [null].concat(args);
      var factoryFunction = constructor.bind.apply(constructor, args);
      return new factoryFunction();
    };
    start({
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '"*"'
      }
    });
    while (row = getRow()) {
      var obj = {
        time: apply(Date, row.key),
        value: row.value,
        energy: row.value.energy
      };
      // not accurate: we ignore the beginning of the interval
      var level = parseInt(req.query.group_level) || 0;
      var lfrom = row.value.last.time;
      var lstart = row.value.first.time;
      row.key[Math.max(level - 1, 0)]++;
      var lto = apply(Date, row.key).getTime();
      obj.dbg = {rkey:row.key,lfrom:lfrom,lto:lto,pwr:row.value.last.power,lvl:level}
      obj.energy += (lto - lfrom) * row.value.last.power * (1 / 1000 / 60 / 60);
      obj.average = obj.energy / (lto - lstart) / (1 / 1000 / 60 / 60);
      result.push(obj);
    }
    return JSON.stringify(result, null, 2);
  },
  rows: function(head, req) {
    var row;
    var result = [];
    start({
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      }
    });
    while (row = getRow()) result.push(row);
    return JSON.stringify(result, null, 2);
  }
};

ddoc.filters = {
};

ddoc.updates = {
  measurement: function(doc, req) {
    doc = JSON.parse(req.body);
    doc._id = req.uuid;
    doc.type = 'measurement';
    if (!doc.timestamp) doc.timestamp = new Date().getTime();
    doc.user = req.userCtx.name;
    return [doc, 'Thanks\n'];
  }
};

couchapp.loadAttachments(ddoc, path.join(__dirname, 'ui'));

module.exports = ddoc;
