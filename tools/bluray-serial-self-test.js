"use strict";

var fs = require("fs");
var path = require("path");

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
var openedPorts = [];
var serialClock = 1000;
var originalDateNow = Date.now;
Date.now = function () { return serialClock; };

function MockBSSerialPort(port) {
  this.port = port;
  this.sentFrames = [];
  this.closed = false;
  openedPorts.push(this);
}

MockBSSerialPort.prototype.SetBaudRate = function (value) { this.baudRate = value; };
MockBSSerialPort.prototype.SetDataBits = function (value) { this.dataBits = value; };
MockBSSerialPort.prototype.SetStopBits = function (value) { this.stopBits = value; };
MockBSSerialPort.prototype.SetParity = function (value) { this.parity = value; };
MockBSSerialPort.prototype.SetEcho = function (value) { this.echo = value; };
MockBSSerialPort.prototype.SetFlowControl = function (value) { this.flowControl = value; };
MockBSSerialPort.prototype.SetGenerateByteEvent = function (value) { this.generateByteEvent = value; };
MockBSSerialPort.prototype.SendBytes = function (value) {
  this.sentFrames.push(value);
  return true;
};
MockBSSerialPort.prototype.SendByte = function (value) {
  this.sentBytes = this.sentBytes || [];
  this.sentBytes.push(value);
  return true;
};
MockBSSerialPort.prototype.Close = function () { this.closed = true; };

global.BSSerialPort = MockBSSerialPort;
global.window = {
  BRIGHTSIGN_UDP_CONFIG: {},
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
window.BRIGHTSIGN_BLURAY_CONFIG.transport = "serial";
eval(fs.readFileSync(path.join(root, "app.js"), "utf8"));

var expectedFrames = {
  play: "@02353\r",
  stop: "@02354\r",
  back: "@0PCRTN\r",
  left: "@0PCCUSR1\r",
  right: "@0PCCUSR2\r",
  up: "@0PCCUSR3\r",
  down: "@0PCCUSR4\r",
  enter: "@0PCENTR\r"
};

Object.keys(expectedFrames).forEach(function (commandName) {
  serialClock += 31;
  if (!window.BRIGHTSIGN_PANEL.sendBdCommand(commandName)) {
    throw new Error("Command was not accepted: " + commandName);
  }
  openedPorts[0].onserialbyte({ sbyte: 0x06 });
});

if (openedPorts.length !== 1) {
  throw new Error("Expected one serial-port instance, got " + openedPorts.length + ".");
}

var serialPort = openedPorts[0];
if (serialPort.port !== 0 || serialPort.baudRate !== 115200 || serialPort.dataBits !== 8 || serialPort.stopBits !== 1 || serialPort.parity !== "none") {
  throw new Error("Unexpected serial settings: " + JSON.stringify(serialPort));
}

var actualFrames = serialPort.sentFrames;
var expectedFrameList = Object.keys(expectedFrames).map(function (commandName) { return expectedFrames[commandName]; });
if (JSON.stringify(actualFrames) !== JSON.stringify(expectedFrameList)) {
  throw new Error("Unexpected frames: " + JSON.stringify(actualFrames));
}

window.BRIGHTSIGN_PANEL.closeBdSerialPort();
Date.now = originalDateNow;
if (!serialPort.closed) {
  throw new Error("Serial port was not closed.");
}

console.log("Blu-ray serial self-test passed: 8 DN-500BD MKII commands, 115200 8N1, CR terminated.");
