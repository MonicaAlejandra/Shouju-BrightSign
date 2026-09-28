"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function createElementStub() {
  var element = {
    attributes: {},
    children: [],
    className: "",
    listeners: {},
    style: { setProperty: function () {} },
    addEventListener: function (name, callback) { element.listeners[name] = callback; },
    appendChild: function (child) { element.children.push(child); },
    setAttribute: function (name, value) { element.attributes[name] = value; },
    querySelectorAll: function (selector) {
      return element.children.filter(function (child) {
        return child.classList.contains(selector.slice(1));
      });
    },
    dispatch: function (name) {
      if (element.listeners[name]) element.listeners[name]();
    }
  };
  element.classList = {
    contains: function (name) { return element.className.split(/\s+/).indexOf(name) !== -1; },
    add: function (name) { element.className += " " + name; },
    remove: function () {}
  };
  Object.defineProperty(element, "innerHTML", {
    set: function () { element.children = []; }
  });
  return element;
}

function createPanel(tabConfig, switcherConfig) {
  var elements = {
    stage: createElementStub(),
    "panel-image": createElementStub(),
    hotspots: createElementStub()
  };
  var errors = [];
  var switcherCommands = [];
  var mockDgram = {
    createSocket: function () {
      return {
        close: function () {},
        send: function (payload, port, ipAddress, callback) {
          switcherCommands.push(payload.toString("ascii"));
          callback(null);
        }
      };
    }
  };
  var context = {
    Buffer: Buffer,
    console: {
      error: function (message) { errors.push(message); },
      log: function () {},
      warn: function () {}
    },
    Image: function () {},
    require: function (name) {
      if (name === "dgram") return mockDgram;
      throw new Error("Unexpected device module: " + name);
    },
    document: {
      createElement: createElementStub,
      getElementById: function (id) { return elements[id]; }
    },
    window: {
      BRIGHTSIGN_BLURAY_CONFIG: {},
      BRIGHTSIGN_PROJECTOR_CONFIG: {},
      BRIGHTSIGN_SWITCHER_CONFIG: switcherConfig || {},
      BRIGHTSIGN_UDP_CONFIG: {},
      BRIGHTSIGN_UI_CONFIG: { tabs: tabConfig },
      addEventListener: function () {},
      clearInterval: function () {},
      clearTimeout: function () {},
      innerHeight: 800,
      innerWidth: 1280,
      setInterval: function () { return 0; },
      setTimeout: function () { return 0; }
    }
  };
  var appPath = path.join(__dirname, "..", "app.js");
  vm.runInNewContext(fs.readFileSync(appPath, "utf8"), context, { filename: "app.js" });
  return { elements: elements, errors: errors, switcherCommands: switcherCommands };
}

function navigationButtons(panel) {
  return panel.elements.hotspots.querySelectorAll(".nav-button");
}

var configuredPanel = createPanel({ projector: false, intro: true, bd: false, hdmi: true, vga: false });
var configuredNavigation = navigationButtons(configuredPanel);
assert.deepStrictEqual(configuredNavigation.map(function (button) {
  return button.attributes["aria-label"];
}), ["紹介映像", "PC (HDMI)"]);
assert.strictEqual(configuredNavigation[0].style.left, "0px");
assert.strictEqual(configuredNavigation[0].style.width, "640px");
assert.strictEqual(configuredNavigation[1].style.left, "640px");
assert.strictEqual(configuredNavigation[1].style.width, "640px");
assert.strictEqual(configuredPanel.elements["panel-image"].src, "assets/intro-video-selection.png?v=20260903-1");

configuredNavigation[1].dispatch("click");
configuredNavigation = navigationButtons(configuredPanel);
assert.strictEqual(configuredPanel.elements["panel-image"].src, "assets/pc-hdmi-control.png");
assert.strictEqual(configuredNavigation[1].classList.contains("active"), true);

var fallbackPanel = createPanel({ projector: false, intro: false, bd: false, hdmi: false, vga: false });
var fallbackNavigation = navigationButtons(fallbackPanel);
assert.strictEqual(fallbackNavigation.length, 1);
assert.strictEqual(fallbackNavigation[0].attributes["aria-label"], "プロジェクター");
assert.strictEqual(fallbackNavigation[0].style.width, "1280px");
assert.strictEqual(fallbackPanel.elements["panel-image"].src, "assets/projector-control-panel.png");
assert.strictEqual(fallbackPanel.errors.length, 1);

var bdPanel = createPanel(
  { projector: true, intro: false, bd: true, hdmi: false, vga: false },
  {
    enabled: true,
    inputBySection: { bd: 3 },
    ipAddress: "192.0.2.20",
    port: 1300,
    protocol: "udp",
    timeoutMs: 5000
  }
);
var bdNavigation = navigationButtons(bdPanel);
bdNavigation[1].dispatch("click");
assert.deepStrictEqual(bdPanel.switcherCommands, ["3,1\r"]);
assert.strictEqual(bdPanel.elements["panel-image"].src, "assets/bd-simple-control.png");
assert.strictEqual(bdPanel.elements.hotspots.querySelectorAll(".ui-button").length, 2, "BD page must contain only navigation buttons");
assert.strictEqual(bdPanel.elements.hotspots.children.length, 2, "BD artwork must not require extra overlay elements");
var bdPageChildren = bdPanel.elements.hotspots.children;
navigationButtons(bdPanel)[1].dispatch("click");
assert.strictEqual(bdPanel.elements.hotspots.children, bdPageChildren, "A repeated BD tap must not rerender or change the page");
assert.deepStrictEqual(bdPanel.switcherCommands, ["3,1\r"], "A repeated BD tap must not resend the switcher command");

var bdControlsPanel = createPanel(
  { projector: false, intro: false, bd: false, bdControls: true, hdmi: false, vga: false },
  {
    enabled: true,
    inputBySection: { bdControls: 3 },
    ipAddress: "192.0.2.20",
    port: 1300,
    protocol: "udp",
    timeoutMs: 5000
  }
);
var bdControlsNavigation = navigationButtons(bdControlsPanel);
assert.strictEqual(bdControlsNavigation.length, 1);
assert.strictEqual(bdControlsNavigation[0].attributes["aria-label"], "ＢＤ操作");
assert.strictEqual(bdControlsPanel.elements.hotspots.querySelectorAll(".bd-playback-button").length, 2);
assert.deepStrictEqual(bdControlsPanel.switcherCommands, ["3,1\r"]);
bdControlsNavigation[0].dispatch("click");
assert.strictEqual(bdControlsPanel.elements["panel-image"].src, "assets/bluray-navigation.png");
assert.strictEqual(bdControlsPanel.elements.hotspots.querySelectorAll(".bd-arrow-button").length, 4);
assert.deepStrictEqual(bdControlsPanel.switcherCommands, ["3,1\r"], "Toggling legacy BD controls must not resend the switcher command");

console.log("UI configuration self-test passed: tab settings, fallback, passive BD display, and switcher selection work.");
