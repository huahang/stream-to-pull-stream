var pull = require("pull-stream");
var fs = require("fs");
var tape = require("tape");

var toPullStream = require("../dist/index");

pull(pull.values(["hello\n", "  there\n"]), toPullStream.sink(process.stdout));

tape("get end callback even with stdout", function (t) {
  pull(
    toPullStream.source(fs.createReadStream(__filename)),
    pull.map(function (e) {
      return e.toString().toUpperCase();
    }),
    toPullStream.sink(process.stdout, function () {
      console.log("----END!");
      t.end();
    })
  );
});
