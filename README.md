# Couchm: Cosm-like APIs to CouchDB

## Introduction

Couchm aims to imitate part of the [Historical feed queries v2 API](https://cosm.com/docs/v2/history.html) as closely as possible.

## Installation

First, set up a CouchDB database. Then follow these steps to set up the CouchDB design document defined in `app.js`.

1. Install [node.js](http://nodejs.org/).
2. Run `./node_modules/couchapp/bin.js push app.js http://`_user_`:`_password_`@`_server_`:`_port_`/`_database_.

Now the design document should be in the database with `"_id": "_design/energy_data"`.

## Usage

To store measurement data, do an HTTP POST request to

    _design/energy_data/_update/measurement

with content type `application/json` and a JSON body like this:

    {
      "source": "room1",
      "timestamp": 1363709900728,
      "ElectricEnergy": 30.0,
      "ElectricPower": 2.0,
      "OfficeOccupied": false
    }
  
In fact, any amount of keys can be used except for the reserved ones:

- `source`: an identifier for the measurement location;
- `timestamp`: the amount of milliseconds since the Unix epoch;
- `type`: automatically set to `measurement` by the update function;
- `user`: automatically set to the authenticated user’s name.

To query the database, do HTTP GET requests to

    _design/energy_data/_show/historical

using the following URL parameters:

- `source`: a measurement location identifier;
- `interval`: an interval value as defined in the `by_source_and_time` map function in `app.js`. Currently, in addition to Cosm’s value, also 1s intervals are allowed;
- `duration`: query duration in Cosm’s format, e.g. `2weeks`;
- `start` (optional): starting point of the query in JSON format.

Example:

    _design/energy_data/_show/historical?source=room261&interval=43200&duration=1week&start=2013-03-10T09:00:00Z

If possible, use caching to keep keep track of HTTP 301 Moved Permanently responses, as they will be used to redirect the client to the actual query URL.

Note that just like in Cosm, for every sample point the last value just before that sample point is used. Other data is ignored.

Couchm doesn’t support Cosm’s `end`, `find_previous`, `limit` and `interval_type` arguments and will ignore these if provided. Couchm acts as if these values are set:

- `find_previous`: `false`
- `limit`: infinity
- `interval_type`: `discrete`

The response format is similar to Cosm’s, except:

- apart from `datastream` no fields are set;
- for each datastream, `current_value` and `at` reflect the last sample in the query, and not the actual current measurement.

## How it works

Read [CouchDB: The Definitive Guide](http://guide.couchdb.org/draft/) for a nice introduction to CouchDB views, shows and lists.

The `by_source_and_time` map-reduce view indexes the data in a way that any historical query can be fetched very quickly. Generating this index from scratch can take a long time but then changes are processed rather quickly. To speed client requests up, have a cronjob query this view regularly.

The `_show` function named `historical` redirects clients to the right `by_source_and_time` query, passed through the `_list` function `interpolate`.

(To be continued.)
