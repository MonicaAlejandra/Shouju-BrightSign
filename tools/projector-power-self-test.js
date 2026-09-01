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
    dispatch: function (name) {
      // Dispatch even when disabled to test the handler's defensive guard.
      if (element.listeners[name]) element.listeners[name]({ buttons: 1 });
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

  function schedule(callback, delay, interval) {
    nextId += 1;
    timers.set(nextId, { id: nextId, callback: callback, due: now + delay, interval: interval });
    return nextId;
  }

  function advance(delay) {
    var target = now + delay;
    while (true) {
      var next = null;
      timers.forEach(function (timer) {
        if (timer.due <= target && (!next || timer.due < next.due)) next = timer;
      });
      if (!next) break;
      now = next.due;
      if (next.interval) next.due += next.interval;
      else timers.delete(next.id);
      next.callback();
    }
    now = target;
  }

  return {
    advance: advance,
    setTimeout: function (callback, delay) { return schedule(callback, delay, 0); },
    setInterval: function (callback, delay) { return schedule(callback, delay, delay); },
    clear: function (id) { timers.delete(id); }
  };
}

function createHarness(source) {
  var clock = createClock();
  var elements = { stage: createElementStub(), "panel-image": createElementStub(), hotspots: createElementStub() };
  var sockets = [];
  var requests = [];
  var mockNet = {
    createConnection: function () {
      var socket = {
        destroyed: false,
        events: {},
        setEncoding: function () {},
        setTimeout: function () {},
        on: function (name, callback) { socket.events[name] = callback; },
        write: function (payload) { requests.push(payload); },
        destroy: function () { socket.destroyed = true; }
      };
      sockets.push(socket);
      return socket;
    }
  };

  function nextSocket() {
    var socket = sockets.find(function (candidate) { return !candidate.destroyed; });
    assert.ok(socket, "Expected a pending PJLink exchange");
    return socket;
  }

  function reply(command, value) {
    var socket = nextSocket();
    socket.events.data("PJLINK 0\r");
    assert.strictEqual(requests[requests.length - 1], "%1" + command + "\r");
    var commandName = command.split(" ")[0];
    socket.events.data("%1" + commandName + "=" + value + "\r");
  }

  var context = {
    console: { log: function () {}, warn: function () {}, error: function () {} },
    Image: function () {},
    require: function (name) {
      if (name === "net") return mockNet;
      if (name === "crypto") return require("crypto");
      throw new Error("Unexpected device module: " + name);
    },
    document: {
      getElementById: function (id) { return elements[id]; },
      createElement: createElementStub
    },
    window: {
      BRIGHTSIGN_PROJECTOR_CONFIG: {
        enabled: true, ipAddress: "127.0.0.1", port: 4352, timeoutMs: 15000,
        pollingEnabled: true, mutePollingEnabled: true, pollIntervalMs: 5000,
        powerOnResponseTimeoutMs: 15000
      },
      innerWidth: 1280,
      innerHeight: 800,
      addEventListener: function () {},
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clear,
      setInterval: clock.setInterval,
      clearInterval: clock.clear
    }
  };
  vm.runInNewContext(source, context, { filename: "app.js" });
  reply("POWR ?", "0");
  return {
    clock: clock,
    requests: requests,
    reply: reply,
    fail: function () { nextSocket().events.error(new Error("Simulated connection loss")); },
    pendingCount: function () {
      return sockets.filter(function (socket) { return !socket.destroyed; }).length;
    },
    button: function (className) { return elements.hotspots.querySelectorAll("." + className)[0]; }
  };
}

function checkOffDisabled(panel, disabled) {
  var button = panel.button("projector-power-off");
  assert.strictEqual(button.disabled, disabled, "OFF disabled state");
  assert.strictEqual(button.attributes["aria-disabled"], String(disabled), "OFF accessibility state");
  var expectedLabel = disabled ? "プロジェクター OFF（応答待ち）" : "プロジェクター OFF";
  assert.strictEqual(button.attributes["aria-label"], expectedLabel, "OFF waiting description");
}

function checkOnDisabled(panel, disabled) {
  var button = panel.button("projector-power-on");
  assert.strictEqual(button.disabled, disabled, "ON disabled state");
  assert.strictEqual(button.attributes["aria-disabled"], String(disabled), "ON accessibility state");
}

function startPowerOn(panel) {
  panel.button("projector-power-on").dispatch("click");
  panel.clock.advance(520);
  checkOffDisabled(panel, true);
  checkOnDisabled(panel, true);
  panel.reply("POWR 1", "OK");
  assert.strictEqual(panel.pendingCount(), 0, "ON must not trigger an immediate status query");
}

function testTimeout(panel) {
  checkOffDisabled(panel, false);
  checkOnDisabled(panel, false);
  startPowerOn(panel);
  var offButton = panel.button("projector-power-off");
  offButton.dispatch("pointerdown");
  offButton.dispatch("click");
  assert.strictEqual(offButton.classList.contains("pressed"), false, "Disabled OFF must not animate");
  panel.clock.advance(4480);
  panel.reply("POWR ?", "0");
  checkOffDisabled(panel, true);
  panel.clock.advance(5000);
  panel.reply("POWR ?", "0");
  panel.clock.advance(5000);
  panel.reply("POWR ?", "0");
  panel.clock.advance(519);
  checkOffDisabled(panel, true);
  assert.strictEqual(panel.requests.indexOf("%1POWR 0\r"), -1, "OFF must not be transmitted while pending");
  panel.clock.advance(1);
  checkOffDisabled(panel, false);
  checkOnDisabled(panel, false);
  assert.strictEqual(offButton.classList.contains("is-active"), true, "Timeout selects OFF");
  offButton.dispatch("click");
  panel.clock.advance(520);
  panel.reply("POWR ?", "0");
  panel.reply("POWR 0", "OK");
}

function testConfirmedOnAndRerender(panel) {
  startPowerOn(panel);
  panel.button("nav-button").dispatch("click");
  panel.reply("POWR ?", "0");
  checkOffDisabled(panel, true);
  panel.clock.advance(5000);
  panel.reply("POWR ?", "1");
  panel.reply("AVMT ?", "30");
  checkOffDisabled(panel, false);
  checkOnDisabled(panel, true);
  assert.strictEqual(panel.button("projector-power-on").classList.contains("is-active"), true);
  panel.button("projector-power-off").dispatch("click");
  panel.clock.advance(520);
  panel.reply("POWR ?", "1");
  panel.reply("AVMT 30", "OK");
  panel.reply("POWR 0", "OK");
  checkOnDisabled(panel, false);
}

function testTransitionAndFailure(panel) {
  startPowerOn(panel);
  panel.clock.advance(4480);
  panel.reply("POWR ?", "3");
  checkOffDisabled(panel, true);
  checkOnDisabled(panel, true);
  panel.clock.advance(5000);
  panel.reply("POWR ?", "2");
  checkOffDisabled(panel, true);
  panel.clock.advance(5000);
  panel.fail();
  checkOffDisabled(panel, true);
  panel.clock.advance(9999);
  checkOffDisabled(panel, true);
  panel.clock.advance(1);
  checkOffDisabled(panel, false);
  checkOnDisabled(panel, false);
}

function testDuplicateOnIgnored(panel) {
  startPowerOn(panel);
  var requestCount = panel.requests.length;
  panel.button("projector-power-on").dispatch("pointerdown");
  panel.button("projector-power-on").dispatch("click");
  panel.clock.advance(520);
  assert.strictEqual(panel.requests.length, requestCount, "Pending ON must not be sent twice");
  assert.strictEqual(panel.button("projector-power-on").classList.contains("pressed"), false);

  panel.clock.advance(3960);
  panel.reply("POWR ?", "1");
  panel.reply("AVMT ?", "30");
  checkOnDisabled(panel, true);
  requestCount = panel.requests.length;
  panel.button("projector-power-on").dispatch("click");
  panel.clock.advance(520);
  assert.strictEqual(panel.requests.length, requestCount, "Confirmed ON must not be sent twice");
}

function testQueuedPress(panel) {
  panel.button("projector-power-on").dispatch("click");
  panel.clock.advance(100);
  panel.button("projector-power-off").dispatch("click");
  panel.clock.advance(420);
  panel.reply("POWR 1", "OK");
  checkOffDisabled(panel, true);
  panel.clock.advance(100);
  assert.strictEqual(panel.pendingCount(), 0, "Delayed OFF action must not send a command");
  assert.strictEqual(panel.button("projector-power-off").classList.contains("pressed"), false);
}

function testOffPreflightDuringOn(panel) {
  panel.button("projector-power-off").dispatch("click");
  panel.clock.advance(520);
  panel.button("projector-power-on").dispatch("click");
  panel.clock.advance(520);
  panel.reply("POWR ?", "0");
  panel.reply("POWR 1", "OK");
  checkOffDisabled(panel, true);
  assert.strictEqual(panel.pendingCount(), 0, "Old OFF preflight must not send OFF during startup");
}

function testOnFailure(panel) {
  panel.button("projector-power-on").dispatch("click");
  panel.clock.advance(520);
  panel.fail();
  checkOffDisabled(panel, true);
  panel.clock.advance(15000);
  checkOffDisabled(panel, false);
}

try {
  var appPath = path.join(__dirname, "..", "app.js");
  var source = fs.readFileSync(appPath, "utf8");
  var tests = [testTimeout, testConfirmedOnAndRerender, testTransitionAndFailure,
    testDuplicateOnIgnored, testQueuedPress, testOffPreflightDuringOn, testOnFailure];
  tests.forEach(function (test) {
    var panel = createHarness(source);
    test(panel);
    console.log("Passed: " + test.name);
  });
  console.log("Projector power-button self-test passed.");
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
