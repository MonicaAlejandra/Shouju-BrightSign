"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function createElementStub() {
  var element = {
    className: "",
    disabled: false,
    attributes: {},
    children: [],
    listeners: {},
    style: { setProperty: function () {} },
    isConnected: true,
    offsetWidth: 1280,
    setAttribute: function (name, value) { element.attributes[name] = value; },
    addEventListener: function (name, callback) { element.listeners[name] = callback; },
    appendChild: function (child) { element.children.push(child); },
    querySelectorAll: function (selector) {
      return element.children.filter(function (child) {
        return child.classList.contains(selector.slice(1));
      });
    },
    removeAttribute: function () {},
    cloneNode: function (deep) {
      var clone = createElementStub();
      clone.className = element.className;
      if (deep) {
        clone.children = element.children.map(function (child) { return child.cloneNode(true); });
      }
      return clone;
    },
    dispatch: function (name, event) {
      var input = event || {};
      input.preventDefault = input.preventDefault || function () {};
      if (element.listeners[name]) element.listeners[name](input);
    }
  };
  element.classList = {
    contains: function (name) { return element.className.split(/\s+/).indexOf(name) !== -1; },
    add: function (name) {
      if (!element.classList.contains(name)) element.className += " " + name;
    },
    remove: function (name) {
      element.className = element.className.split(/\s+/).filter(function (value) {
        return value !== name;
      }).join(" ");
    }
  };
  Object.defineProperty(element, "innerHTML", {
    set: function () { element.children = []; }
  });
  return element;
}

function createClock() {
  var now = 0;
  var nextId = 0;
  var timers = new Map();

  function setTimeout(callback, delay) {
    nextId += 1;
    timers.set(nextId, { callback: callback, due: now + delay });
    return nextId;
  }

  function advance(delay) {
    var target = now + delay;
    while (true) {
      var nextTimerId = null;
      var nextTimer = null;
      timers.forEach(function (timer, id) {
        if (timer.due <= target && (!nextTimer || timer.due < nextTimer.due)) {
          nextTimerId = id;
          nextTimer = timer;
        }
      });
      if (!nextTimer) break;
      now = nextTimer.due;
      timers.delete(nextTimerId);
      nextTimer.callback();
    }
    now = target;
  }

  return {
    advance: advance,
    setTimeout: setTimeout,
    clearTimeout: function (id) { timers.delete(id); },
    setInterval: function () { return 0; },
    clearInterval: function () {}
  };
}

var clock = createClock();
var elements = { stage: createElementStub(), "panel-image": createElementStub(), hotspots: createElementStub() };
var sentPackets = [];
var mockDgram = {
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
var context = {
  Buffer: Buffer,
  console: { log: function () {}, warn: function () {}, error: function () {} },
  Image: function () {},
  require: function (name) {
    if (name === "dgram") return mockDgram;
    throw new Error("Unexpected device module: " + name);
  },
  document: {
    getElementById: function (id) { return elements[id]; },
    createElement: createElementStub
  },
  window: {
    BRIGHTSIGN_UDP_CONFIG: {
      enabled: true, ipAddress: "192.0.2.10", port: 5001, receiveEnabled: false, commands: {}
    },
    BRIGHTSIGN_PROJECTOR_CONFIG: {},
    BRIGHTSIGN_SWITCHER_CONFIG: {},
    BRIGHTSIGN_BLURAY_CONFIG: {
      enabled: true,
      transport: "udp",
      udpCommands: { play: "BD_PLAY", stop: "BD_STOP" }
    },
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener: function () {},
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    getComputedStyle: function () { return { backgroundColor: "#000" }; }
  }
};

var appPath = path.join(__dirname, "..", "app.js");
vm.runInNewContext(fs.readFileSync(appPath, "utf8"), context, { filename: "app.js" });

var introNavigationButton = elements.hotspots.children.filter(function (button) {
  return button.attributes["aria-label"] === "紹介映像";
})[0];
introNavigationButton.dispatch("click");

var introButtons = elements.hotspots.querySelectorAll(".intro-button");
assert.strictEqual(introButtons.length, 24, "Expected introduction-video buttons");

introButtons[0].dispatch("pointerdown", { pointerId: 1, pointerType: "touch", buttons: 1 });
introButtons[1].dispatch("pointerdown", { pointerId: 2, pointerType: "touch", buttons: 1 });
assert.strictEqual(introButtons[0].classList.contains("pressed"), true, "First touch should show feedback");
assert.strictEqual(introButtons[1].classList.contains("pressed"), false, "Second simultaneous touch must be ignored");

introButtons[1].dispatch("pointerup", { pointerId: 2, pointerType: "touch", buttons: 0 });
introButtons[1].dispatch("click");
clock.advance(520);
assert.strictEqual(sentPackets.length, 0, "Ignored second touch must not send a command");

introButtons[0].dispatch("pointerup", { pointerId: 1, pointerType: "touch", buttons: 0 });
introButtons[0].dispatch("click");
clock.advance(519);
assert.strictEqual(sentPackets.length, 0, "Accepted command must keep its normal feedback delay");
clock.advance(1);
assert.deepStrictEqual(sentPackets, [{ payload: "PLAY_01", port: 5001, ipAddress: "192.0.2.10" }]);
clock.advance(260);
assert.strictEqual(introButtons[0].classList.contains("pressed"), false, "Accepted button must clear red feedback");
assert.strictEqual(introButtons[1].classList.contains("pressed"), false, "Ignored button must remain clear");

console.log("Multi-touch self-test passed: first touch sent once, second touch was ignored, and feedback cleared.");
