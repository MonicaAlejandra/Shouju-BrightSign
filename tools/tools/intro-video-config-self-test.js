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
    disabled: false,
    isConnected: true,
    listeners: {},
    offsetWidth: 1280,
    style: { setProperty: function () {} },
    addEventListener: function (name, callback) { element.listeners[name] = callback; },
    appendChild: function (child) { element.children.push(child); },
    cloneNode: function () { return createElementStub(); },
    querySelectorAll: function (selector) {
      return element.children.filter(function (child) {
        return child.classList.contains(selector.slice(1));
      });
    },
    removeAttribute: function () {},
    setAttribute: function (name, value) { element.attributes[name] = value; }
  };
  element.classList = {
    add: function (name) {
      if (!element.classList.contains(name)) element.className += " " + name;
    },
    contains: function (name) { return element.className.split(/\s+/).indexOf(name) !== -1; },
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

var projectRoot = path.join(__dirname, "..");
var config = JSON.parse(fs.readFileSync(path.join(projectRoot, "intro-videos.json"), "utf8"));
config.videos[0].ja = "外部設定テスト";
config.videos[0].en = "External Config Test";
var externalConfigText = "\uFEFF" + JSON.stringify(config, null, 2).replace(/\n/g, "\r\n") + "\r\n";
var requestedPath = "";
var elements = {
  stage: createElementStub(),
  "panel-image": createElementStub(),
  hotspots: createElementStub()
};
var context = {
  Buffer: Buffer,
  console: { error: function () {}, log: function () {}, warn: function () {} },
  document: {
    createElement: createElementStub,
    getElementById: function (id) { return elements[id]; }
  },
  Image: function () {},
  require: function (name) {
    if (name !== "fs") throw new Error("Unexpected device module: " + name);
    return {
      readFile: function (filePath, encoding, callback) {
        requestedPath = filePath;
        callback(null, externalConfigText);
      }
    };
  },
  window: {
    BRIGHTSIGN_BLURAY_CONFIG: {},
    BRIGHTSIGN_PROJECTOR_CONFIG: {},
    BRIGHTSIGN_SWITCHER_CONFIG: {},
    BRIGHTSIGN_UDP_CONFIG: {},
    addEventListener: function () {},
    clearInterval: function () {},
    clearTimeout: function () {},
    getComputedStyle: function () { return { backgroundColor: "#000" }; },
    innerHeight: 800,
    innerWidth: 1280,
    setInterval: function () { return 0; },
    setTimeout: function () { return 0; }
  }
};

var appPath = path.join(projectRoot, "app.js");
vm.runInNewContext(fs.readFileSync(appPath, "utf8"), context, { filename: "app.js" });
assert.strictEqual(requestedPath, "/storage/sd/intro-videos.json");

var introTab = elements.hotspots.children.filter(function (button) {
  return button.attributes["aria-label"] === "紹介映像";
})[0];
introTab.listeners.click();

var externalButton = elements.hotspots.children.filter(function (button) {
  return button.attributes["aria-label"] === "外部設定テスト";
})[0];
assert.ok(externalButton, "Expected the external JSON name to override the bundled name");
assert.strictEqual(externalButton.children[1].textContent, "External Config Test");

console.log("Intro-video config self-test passed: BOM and CRLF were accepted and external SD names took priority.");
