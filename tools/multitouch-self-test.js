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
    style: { setProperty: function (name, value) { element.style[name] = value; } },
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
      enabled: true, ipAddress: "192.0.2.10", port: 5001, videoSendTrigger: "press",
      pressVideoSendTiming: "crossfade-midpoint", receiveEnabled: false, commands: {}
    },
    BRIGHTSIGN_PROJECTOR_CONFIG: {},
    BRIGHTSIGN_SWITCHER_CONFIG: {},
    BRIGHTSIGN_UI_CONFIG: {
      buttonAnimationMs: 480,
      pageTransitionMs: 240,
      stopPageTransitionMs: 300,
      pageTransitionEasing: "smooth",
      pageTransitionOverlapMs: 180,
      pressPageTransitionExtraDelayMs: 60
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
    getComputedStyle: function (element) {
      var backgroundColor = "rgb(211, 47, 47)";
      if (element.classList.contains("spare-button")) backgroundColor = "rgb(56, 167, 219)";
      return { backgroundColor: backgroundColor };
    }
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
var finalRows = [
  { ja: "大人用（日本語）", en: "Adult (Japanese)" },
  { ja: "大人用（日本語短編）", en: "Adult (Japanese – Short)" },
  { ja: "大人用（英語）", en: "Adult (English)" },
  { ja: "子ども用", en: "Children" },
  { ja: "予備（1）", en: "Spare (1)" },
  { ja: "予備（2）", en: "Spare (2)" },
  { ja: "予備（3）", en: "Spare (3)" },
  { ja: "予備（4）", en: "Spare (4)" }
];
finalRows.forEach(function (expected, offset) {
  var button = introButtons[16 + offset];
  var isSpare = 4 <= offset;
  assert.strictEqual(button.attributes["aria-label"], expected.ja);
  assert.strictEqual(button.children[1].textContent, expected.en);
  assert.strictEqual(button.classList.contains("category-button"), !isSpare);
  assert.strictEqual(button.classList.contains("spare-button"), isSpare);
  assert.strictEqual(button.style.left, ["49px", "349px", "648px", "948px"][offset % 4]);
  assert.strictEqual(button.style.top, isSpare ? "631px" : "531px");
  assert.strictEqual(button.disabled, false);
});

introButtons[0].dispatch("pointerdown", { pointerId: 1, pointerType: "touch", buttons: 1 });
introButtons[1].dispatch("pointerdown", { pointerId: 2, pointerType: "touch", buttons: 1 });
assert.strictEqual(introButtons[0].classList.contains("pressed"), true, "First touch should show feedback");
assert.strictEqual(introButtons[1].classList.contains("pressed"), false, "Second simultaneous touch must be ignored");
assert.strictEqual(sentPackets.length, 0, "Midpoint mode must not send UDP on the first touch");

introButtons[1].dispatch("pointerup", { pointerId: 2, pointerType: "touch", buttons: 0 });
introButtons[1].dispatch("click");
clock.advance(50);
assert.strictEqual(sentPackets.length, 0, "Ignored second touch must not send a command");

introButtons[0].dispatch("pointerup", { pointerId: 1, pointerType: "touch", buttons: 0 });
introButtons[0].dispatch("click");
introButtons[1].dispatch("pointerdown", { pointerId: 3, pointerType: "touch", buttons: 1 });
introButtons[1].dispatch("pointerup", { pointerId: 3, pointerType: "touch", buttons: 0 });
introButtons[1].dispatch("click");
assert.strictEqual(introButtons[1].classList.contains("pressed"), false,
  "Other buttons must remain locked during the pre-crossfade delay");
assert.strictEqual(sentPackets.length, 0, "Locked buttons must not send commands during the pre-crossfade delay");
clock.advance(309);
assert.strictEqual(elements["panel-image"].src, "assets/intro-video-selection.png?v=20261020-1",
  "The page transition must remain aligned to the press-start delay");
clock.advance(1);
assert.strictEqual(sentPackets.length, 0, "UDP must wait until the crossfade midpoint");
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
playbackStop.dispatch("pointerdown", { pointerId: 5, pointerType: "touch", buttons: 1 });
assert.strictEqual(playbackStop.classList.contains("pressed"), false, "Incoming buttons must stay locked during the crossfade");
assert.strictEqual(sentPackets.length, 0, "Incoming buttons must not send commands before the crossfade midpoint");

introButtons[1].dispatch("pointerdown", { pointerId: 6, pointerType: "touch", buttons: 1 });
introButtons[1].dispatch("pointerup", { pointerId: 6, pointerType: "touch", buttons: 0 });
introButtons[1].dispatch("click");
introButtons[2].dispatch("click");
clock.advance(500);
assert.deepStrictEqual(sentPackets, [{ payload: "PLAY_01", port: 5001, ipAddress: "192.0.2.10" }],
  "Play UDP must send at the crossfade midpoint");
assert.strictEqual(sentPackets.length, 1, "Rapid subsequent selections must not send additional play commands");
assert.strictEqual(elements.hotspots.querySelectorAll(".playback-label")[0].children[0].textContent,
  "しょうゆの不思議", "Rapid subsequent selections must preserve the first video's title");
assert.strictEqual(introButtons[0].classList.contains("pressed"), false, "Accepted button must clear red feedback");
assert.strictEqual(introButtons[1].classList.contains("pressed"), false, "Subsequent button feedback must clear");

playbackStop.dispatch("pointerdown", { pointerId: 4, pointerType: "touch", buttons: 1 });
assert.strictEqual(sentPackets.length, 1, "Stop UDP must wait for its crossfade midpoint");
clock.advance(360);
assert.strictEqual(elements["panel-image"].src, "assets/intro-video-selection.png?v=20261020-1");
assert.strictEqual(sentPackets.length, 1, "Stop UDP must not send at the beginning of the crossfade");
  var stopTransitionOverlay = elements.stage.children[elements.stage.children.length - 1];
  var clonedStopButton = stopTransitionOverlay.children[1].querySelectorAll(".playback-stop")[0];
  clock.advance(77);
  assert.strictEqual(clonedStopButton.style["background-color"], "rgb(56, 167, 219)",
    "The outgoing Stop button must blend toward the blue button underneath");
  clock.advance(72);
assert.strictEqual(sentPackets.length, 1, "Stop UDP must remain pending before the crossfade midpoint");
clock.advance(1);
assert.deepStrictEqual(sentPackets[1], { payload: "STOP_VIDEO", port: 5001, ipAddress: "192.0.2.10" },
  "Stop UDP must send at the crossfade midpoint");
  clock.advance(149);
  assert.strictEqual(elements.stage.classList.contains("interaction-locked"), true,
    "Controls must remain locked until the longer Stop crossfade finishes");
  clock.advance(1);
  assert.strictEqual(elements.stage.classList.contains("interaction-locked"), false,
    "Controls must unlock when the Stop crossfade finishes");

finalRows.forEach(function (expected, offset) {
  var button = elements.hotspots.querySelectorAll(".intro-button")[16 + offset];
  button.dispatch("pointerdown", { pointerId: 100 + offset, pointerType: "touch", buttons: 1 });
  button.dispatch("pointerup", { pointerId: 100 + offset, pointerType: "touch", buttons: 0 });
  button.dispatch("click");
  clock.advance(1000);
  var lastPacket = sentPackets[sentPackets.length - 1];
  assert.strictEqual(lastPacket.payload, "PLAY_" + (17 + offset), "Video commands must follow position order");
  var title = elements.hotspots.querySelectorAll(".playback-label")[0];
  assert.strictEqual(title.children[0].textContent, expected.ja, "Playback must use the selected title");
  var stopButton = elements.hotspots.querySelectorAll(".playback-stop")[0];
  stopButton.dispatch("pointerdown", { pointerId: 200 + offset, pointerType: "touch", buttons: 1 });
  clock.advance(1000);
  assert.strictEqual(sentPackets[sentPackets.length - 1].payload, "STOP_VIDEO");
});

console.log("Multi-touch self-test passed: first-touch locking and video titles, styling, positions, and commands for buttons 17–24.");
