"use strict";

var crypto = require("crypto");
var fs = require("fs");
var net = require("net");

function elementStub() {
  return {
    style: { setProperty: function () {} },
    classList: { add: function () {}, remove: function () {}, contains: function () { return false; } },
    setAttribute: function () {},
    addEventListener: function () {},
    appendChild: function () {},
    querySelectorAll: function () { return []; },
    removeAttribute: function () {},
    cloneNode: function () { return elementStub(); },
    innerHTML: "",
    isConnected: true,
    offsetWidth: 1280
  };
}

var stage = elementStub();
var image = elementStub();
var buttons = elementStub();

global.window = {
  BRIGHTSIGN_UDP_CONFIG: {},
  BRIGHTSIGN_PROJECTOR_CONFIG: {
    enabled: false,
    ipAddress: "127.0.0.1",
    port: 4352,
    password: "",
    timeoutMs: 2000
  },
  innerWidth: 1280,
  innerHeight: 800,
  addEventListener: function () {},
  clearTimeout: function () {},
  setTimeout: function () { return 0; },
  getComputedStyle: function () { return { backgroundColor: "#000" }; }
};
global.document = {
  getElementById: function (id) {
    if (id === "stage") return stage;
    if (id === "panel-image") return image;
    return buttons;
  },
  createElement: elementStub
};
global.Image = function () {};

eval(fs.readFileSync(require("path").join(__dirname, "..", "app.js"), "utf8"));
window.BRIGHTSIGN_PROJECTOR_CONFIG.enabled = true;

function runExchange(options) {
  return new Promise(function (resolve, reject) {
    var server = net.createServer(function (socket) {
      socket.setEncoding("utf8");
      socket.write(options.greeting);
      socket.once("data", function (data) {
        try {
          if (data !== options.expectedRequest) {
            throw new Error("Unexpected request: " + JSON.stringify(data));
          }
          socket.write(options.response);
        } catch (error) {
          reject(error);
        }
      });
    });

    server.listen(0, "127.0.0.1", function () {
      window.BRIGHTSIGN_PROJECTOR_CONFIG.port = server.address().port;
      window.BRIGHTSIGN_PROJECTOR_CONFIG.password = options.password || "";
      window.BRIGHTSIGN_PANEL.sendProjectorCommand(options.command, function (error, response) {
        server.close();
        if (error) {
          reject(error);
          return;
        }
        if (response !== options.expectedResponse) {
          reject(new Error("Unexpected response value: " + response));
          return;
        }
        resolve();
      });
    });
  });
}

(async function () {
  await runExchange({
    greeting: "PJLINK 0\r",
    command: "POWR 1",
    expectedRequest: "%1POWR 1\r",
    response: "%1POWR=OK\r",
    expectedResponse: "OK"
  });

  var challenge = "498e4a67";
  var password = "JBMIAProjectorLink";
  var digest = crypto.createHash("md5").update(challenge + password, "utf8").digest("hex");
  await runExchange({
    greeting: "PJLINK 1 " + challenge + "\r",
    password: password,
    command: "AVMT ?",
    expectedRequest: digest + "%1AVMT ?\r",
    response: "%1AVMT=30\r",
    expectedResponse: "30"
  });

  console.log("PJLink self-test passed (no authentication and MD5 authentication)." );
}()).catch(function (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
