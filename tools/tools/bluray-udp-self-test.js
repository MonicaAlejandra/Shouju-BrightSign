"use strict";

var fs = require("fs");
var path = require("path");
var Module = require("module");

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
var sentPackets = [];
var openedSerialPorts = 0;
var originalRequire = Module.prototype.require;

function MockBSSerialPort() {
  openedSerialPorts += 1;
}

Module.prototype.require = function (request) {
  if (request !== "dgram") return originalRequire.apply(this, arguments);
  return {
    createSocket: function () {
      return {
        send: function (payload, port, ipAddress, callback) {
          sentPackets.push({ payload: payload.toString("utf8"), port: port, ipAddress: ipAddress });
          callback(null);
        },
        close: function () {}
      };
    }
  };
};

global.BSSerialPort = MockBSSerialPort;
global.window = {
  BRIGHTSIGN_UDP_CONFIG: {
    enabled: true,
    ipAddress: "192.0.2.10",
    port: 5000,
    receiveEnabled: false,
    commands: {}
  },
  BRIGHTSIGN_PROJECTOR_CONFIG: {},
  BRIGHTSIGN_SWITCHER_CONFIG: {},
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

var root = path.join(__dirname, "..");
eval(fs.readFileSync(path.join(root, "bluray-config.js"), "utf8"));
eval(fs.readFileSync(path.join(root, "app.js"), "utf8"));

var expectedCommands = [
  "BD_PLAY",
  "BD_STOP",
  "BD_BACK",
  "BD_LEFT",
  "BD_RIGHT",
  "BD_UP",
  "BD_DOWN",
  "BD_ENTER"
];

Object.keys(window.BRIGHTSIGN_BLURAY_CONFIG.udpCommands).forEach(function (commandName) {
  if (!window.BRIGHTSIGN_PANEL.sendBdCommand(commandName)) {
    throw new Error("UDP command was not accepted: " + commandName);
  }
});

Module.prototype.require = originalRequire;

if (openedSerialPorts !== 0) {
  throw new Error("UDP transport unexpectedly opened a serial port.");
}
if (sentPackets.length !== expectedCommands.length) {
  throw new Error("Expected " + expectedCommands.length + " UDP packets, got " + sentPackets.length + ".");
}

sentPackets.forEach(function (packet, index) {
  if (packet.payload !== expectedCommands[index]) {
    throw new Error("Unexpected UDP payload: " + JSON.stringify(packet));
  }
  if (packet.ipAddress !== "192.0.2.10" || packet.port !== 5000) {
    throw new Error("UDP packet used the wrong introduction-video destination: " + JSON.stringify(packet));
  }
});

console.log("Blu-ray UDP self-test passed: 8 event commands used the introduction-video destination and serial stayed closed.");
