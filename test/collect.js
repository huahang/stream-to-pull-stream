var pull = require("pull-stream");
var through = require("through");
var toPull = require("../dist/index");

require("tape")("collect", function (t) {
  var values = [0.1, 0.4, 0.6, 0.7, 0.94];
  pull(
    pull.values(values),
    toPull.duplex(through()),
    pull.collect(function (err, _values) {
      t.deepEqual(_values, values);
      t.end();
    })
  );
});
