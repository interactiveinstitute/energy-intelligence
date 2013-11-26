function (head, req) {
	start({
		headers: { 'Content-Type': 

		'application/json' }
	});

	var map = eval(this.views.by_source_and_time.map)();

	var result = {
		feeds: []
	};

	var row;
	while (row = getRow()) {
		result.feeds.push(row.key[0]);
	}

	result.datastreams = map.fields.slice(1);

	result.at_idx = 0;
	result.datastream_idx = {};
	for (var i = 1; i < map.fields.length; i++) 
	{
		result.datastream_idx[map.fields[i]] = i;
	}

	result.intervals = 
	map.intervals.slice(1, -1);
	send(JSON.stringify(result, null, 2));
}