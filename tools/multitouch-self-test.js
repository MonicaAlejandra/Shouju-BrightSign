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
    BRIGHTSIGN_UI_CONFIG: {
      buttonAnimationMs: 450,
      pageTransitionMs: 500,
      pageTransitionOverlapMs: 160
    },
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
assert.strictEqual(introButtons[0].style.left, "49px");
assert.strictEqual(introButtons[0].style.top, "131px");
assert.strictEqual(introButtons[0].style.width, "283px");
assert.strictEqual(introButtons[0].style.height, "84px");
assert.strictEqual(introButtons[0].classList.contains("compact-title"), false);
assert.strictEqual(introButtons[1].classList.contains("compact-title"), true);

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
clock.advance(100);
introButtons[1].dispatch("pointerdown", { pointerId: 3, pointerType: "touch", buttons: 1 });
introButtons[1].dispatch("pointerup", { pointerId: 3, pointerType: "touch", buttons: 0 });
introButtons[1].dispatch("click");
introButtons[2].dispatch("click");
clock.advance(189);
assert.strictEqual(sentPackets.length, 0, "Accepted command must wait for the configured crossfade overlap");
clock.advance(1);
assert.deepStrictEqual(sentPackets, [{ payload: "PLAY_01", port: 5001, ipAddress: "192.0.2.10" }]);
assert.strictEqual(elements["panel-image"].src, "assets/video-playback.png?v=20261006-2");
var playbackLabel = elements.hotspots.querySelectorAll(".playback-label")[0];
assert.strictEqual(playbackLabel.children.length, 1, "Playback must overlay only the selected title");
assert.strictEqual(playbackLabel.children[0].textContent, "しょうゆの不思議");
var playbackStop = elements.hotspots.querySelectorAll(".playback-stop")[0];
assert.strictEqual(playbackStop.style.left, "947px");
assert.strictEqual(playbackStop.style.top, "630px");
assert.strictEqual(playbackStop.style.width, "285px");
assert.strictEqual(playbackStop.style.height, "86px");
assert.strictEqual(elements.hotspots.querySelectorAll(".nav-button")[0].style.top, "736px");
assert.strictEqual(elements.hotspots.querySelectorAll(".nav-button")[0].style.height, "64px");
clock.advance(380);
assert.strictEqual(sentPackets.length, 1, "Rapid subsequent selections must not send additional play commands");
assert.strictEqual(elements.hotspots.querySelectorAll(".playback-label")[0].children[0].textContent,
  "しょうゆの不思議", "Rapid subsequent selections must preserve the first video's title");
assert.strictEqual(introButtons[0].classList.contains("pressed"), false, "Accepted button must clear red feedback");
assert.strictEqual(introButtons[1].classList.contains("pressed"), false, "Subsequent button feedback must clear");

console.log("Multi-touch self-test passed: simultaneous and rapid sequential selections preserve the first video and title.");
