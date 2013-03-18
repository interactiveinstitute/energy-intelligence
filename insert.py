import base64
import json
import random
import time
import urllib2

config = {
  'user': 'USER',
  'password': 'PASSWORD',
  'server': 'SERVER:PORT'
}

def post(doc):
  url = 'http://%(server)s/sp/_bulk_docs' % config
  request = urllib2.Request(url, data=json.dumps(doc))
  auth = base64.encodestring('%(user)s:%(password)s' % config).replace('\n', '')
  request.add_header('Authorization', 'Basic ' + auth)
  request.add_header('Content-Type', 'application/json')
  request.get_method = lambda: 'POST'
  urllib2.urlopen(request)

time = int(time.time() * 1000)
total = 0.0
docs = []
for i in range(9001):
  total += random.uniform(-3, 3)
  time += random.randint(100, 10000)
  doc = {
    "_id": "random_%d" % i,
    "type": "measurement",
    "source": "Building 14",
    "timestamp": time,
    "user": "spsensors",
    "OfficeTotal": total
  }
  docs.append(doc)

post({ "docs": docs })
