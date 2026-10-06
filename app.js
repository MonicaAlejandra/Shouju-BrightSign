(function () {
  "use strict";

  var DESIGN_WIDTH = 1280;
  var DESIGN_HEIGHT = 800;
  var DEFAULT_BUTTON_ANIMATION_MS = 620;
  var DEFAULT_BUTTON_ACTION_DELAY_MS = 520;
  var DEFAULT_BUTTON_FEEDBACK_MS = 780;
  var DEFAULT_BUTTON_RETURN_MS = 420;
  var DEFAULT_PAGE_TRANSITION_MS = 700;
  var UDP_RECEIVER_INITIAL_DELAY_MS = 1500;
  var UDP_RECEIVER_RETRY_MS = 5000;
  var INTRO_VIDEO_CONFIG_TIMEOUT_MS = 3000;
  var EXTERNAL_INTRO_VIDEO_CONFIG_PATH = "/storage/sd/intro-videos.json";
  var udpConfig = window.BRIGHTSIGN_UDP_CONFIG || {};
  var projectorConfig = window.BRIGHTSIGN_PROJECTOR_CONFIG || {};
  var switcherConfig = window.BRIGHTSIGN_SWITCHER_CONFIG || {};
  var blurayConfig = window.BRIGHTSIGN_BLURAY_CONFIG || {};
  var uiConfig = window.BRIGHTSIGN_UI_CONFIG || {};

  function getPageTransitionDuration() {
    var configuredDuration = Number(uiConfig.pageTransitionMs);
    var duration = DEFAULT_PAGE_TRANSITION_MS;
    if (Number.isFinite(configuredDuration) && 100 <= configuredDuration && configuredDuration <= 5000) {
      duration = Math.round(configuredDuration);
    } else if (Object.prototype.hasOwnProperty.call(uiConfig, "pageTransitionMs")) {
      console.warn("UI configuration warning: pageTransitionMs must be between 100 and 5000; using " + DEFAULT_PAGE_TRANSITION_MS + ".");
    }
    return duration;
  }

  function getButtonAnimationDuration() {
    var configuredDuration = Number(uiConfig.buttonAnimationMs);
    var duration = DEFAULT_BUTTON_ANIMATION_MS;
    if (Number.isFinite(configuredDuration) && 100 <= configuredDuration && configuredDuration <= 5000) {
      duration = Math.round(configuredDuration);
    } else if (Object.prototype.hasOwnProperty.call(uiConfig, "buttonAnimationMs")) {
      console.warn("UI configuration warning: buttonAnimationMs must be between 100 and 5000; using " + DEFAULT_BUTTON_ANIMATION_MS + ".");
    }
    return duration;
  }

  function getPageTransitionOverlapDuration() {
    var configuredDuration = Number(uiConfig.pageTransitionOverlapMs);
    var duration = BUTTON_COLOR_REMAINDER_MS;
    if (Number.isFinite(configuredDuration) && 0 <= configuredDuration && configuredDuration <= BUTTON_ANIMATION_MS) {
      duration = Math.round(configuredDuration);
    } else if (Object.prototype.hasOwnProperty.call(uiConfig, "pageTransitionOverlapMs")) {
      console.warn("UI configuration warning: pageTransitionOverlapMs must be between 0 and buttonAnimationMs; using " + BUTTON_COLOR_REMAINDER_MS + ".");
    }
    return duration;
  }

  var PAGE_TRANSITION_MS = getPageTransitionDuration();
  var BUTTON_ANIMATION_MS = getButtonAnimationDuration();
  var BUTTON_ACTION_DELAY_MS = Math.round(BUTTON_ANIMATION_MS * DEFAULT_BUTTON_ACTION_DELAY_MS / DEFAULT_BUTTON_ANIMATION_MS);
  var BUTTON_COLOR_REMAINDER_MS = BUTTON_ANIMATION_MS - BUTTON_ACTION_DELAY_MS;
  var PAGE_TRANSITION_OVERLAP_MS = getPageTransitionOverlapDuration();
  var PAGE_BUTTON_ACTION_DELAY_MS = BUTTON_ANIMATION_MS - PAGE_TRANSITION_OVERLAP_MS;
  var BUTTON_FEEDBACK_MS = Math.round(BUTTON_ANIMATION_MS * DEFAULT_BUTTON_FEEDBACK_MS / DEFAULT_BUTTON_ANIMATION_MS);
  var BUTTON_RETURN_MS = Math.round(BUTTON_ANIMATION_MS * DEFAULT_BUTTON_RETURN_MS / DEFAULT_BUTTON_ANIMATION_MS);

  var pages = {
    projector: { image: "assets/projector-control-panel.png", alt: "プロジェクター操作" },
    intro: {
      image: "assets/intro-video-selection.png?v=20261006-3",
      alt: "紹介映像 選択",
      navigationY: 736,
      navigationHeight: 64
    },
    playback: {
      image: "assets/video-playback.png?v=20261006-2",
      alt: "紹介映像 再生中",
      navigationY: 736,
      navigationHeight: 64
    },
    bdSource: { image: "assets/bd-simple-control.png", alt: "ブルーレイディスク 操作" },
    bdDisc: { image: "assets/bluray-disc-control.png", alt: "ブルーレイディスク 再生操作" },
    bdNavigation: { image: "assets/bluray-navigation.png", alt: "ブルーレイディスク メニュー操作" },
    hdmi: { image: "assets/pc-hdmi-control.png", alt: "PC HDMI 表示" },
    vga: { image: "assets/pc-VGA-control.png", alt: "PC VGA 表示" }
  };

  var navigation = [
    { id: "projector", label: "プロジェクター", page: "projector" },
    { id: "intro", label: "紹介映像", page: "intro" },
    { id: "bd", label: "ＢＤ", page: "bdSource" },
    { id: "bdControls", label: "ＢＤ操作", page: "bdDisc", defaultEnabled: false },
    { id: "hdmi", label: "PC (HDMI)", page: "hdmi" },
    { id: "vga", label: "PC (VGA)", page: "vga" }
  ];

  var activeNavigation = {
    projector: "projector",
    intro: "intro",
    playback: "intro",
    bdSource: "bd",
    bdDisc: "bdControls",
    bdNavigation: "bdControls",
    hdmi: "hdmi",
    vga: "vga"
  };

  function getAvailableNavigation() {
    var tabConfig = uiConfig.tabs || {};
    var availableNavigation = [];
    for (var i = 0; i < navigation.length; i += 1) {
      var navigationItem = navigation[i];
      var hasConfiguredValue = Object.prototype.hasOwnProperty.call(tabConfig, navigationItem.id);
      var isEnabled = hasConfiguredValue
        ? tabConfig[navigationItem.id] !== false
        : navigationItem.defaultEnabled !== false;
      if (isEnabled) availableNavigation.push(navigationItem);
    }
    if (availableNavigation.length === 0) {
      console.error("UI configuration error: at least one tab must be enabled; keeping the projector tab available.");
      availableNavigation.push(navigation[0]);
    }
    return availableNavigation;
  }

  var availableNavigation = getAvailableNavigation();

  function getInitialNavigation() {
    var requestedNavigationId = typeof uiConfig.defaultTab === "string" ? uiConfig.defaultTab.trim() : "";
    var initialNavigation = availableNavigation[0];
    for (var i = 0; i < availableNavigation.length; i += 1) {
      if (availableNavigation[i].id === requestedNavigationId) {
        initialNavigation = availableNavigation[i];
        break;
      }
    }
    if (requestedNavigationId && initialNavigation.id !== requestedNavigationId) {
      console.warn("UI configuration warning: defaultTab " + requestedNavigationId + " is unavailable; using " + initialNavigation.id + ".");
    }
    return initialNavigation;
  }

  var initialNavigation = getInitialNavigation();

  function isNavigationAvailable(navigationId) {
    var isAvailable = false;
    for (var i = 0; i < availableNavigation.length; i += 1) {
      if (availableNavigation[i].id === navigationId) isAvailable = true;
    }
    return isAvailable;
  }

  function isPageAvailable(pageName) {
    var navigationId = activeNavigation[pageName];
    return Boolean(navigationId) && isNavigationAvailable(navigationId);
  }

  var introButtons = [
    { ja: "しょうゆの不思議", en: "The Wonders of Shoyu" },
    { ja: "しょうゆっちとしょうゆ工場", en: "Shoyucchi & Factory" },
    { ja: "世界の食卓を彩る", en: "Coloring the World's Table" },
    { ja: "英語", en: "English" },
    { ja: "中国語", en: "Chinese" },
    { ja: "韓国語", en: "Korean" },
    { ja: "タイ語", en: "Thai" },
    { ja: "インドネシア語", en: "Indonesian" },
    { ja: "ベトナム語", en: "Vietnamese" },
    { ja: "タガログ語", en: "Tagalog" },
    { ja: "ドイツ語", en: "German" },
    { ja: "フランス語", en: "French" },
    { ja: "イタリア語", en: "Italian" },
    { ja: "スペイン語", en: "Spanish" },
    { ja: "ロシア語", en: "Russian" },
    { ja: "ポルトガル語", en: "Portuguese" },
    { ja: "大人用（日本語）", en: "Adult (Japanese)" },
    { ja: "大人用（英語）", en: "Adult (English)" },
    { ja: "子ども用", en: "Children" },
    { ja: "予備（1）", en: "Spare (1)", spare: true },
    { ja: "予備（2）", en: "Spare (2)", spare: true },
    { ja: "予備（3）", en: "Spare (3)", spare: true },
    { ja: "予備（4）", en: "Spare (4)", spare: true },
    { ja: "予備（5）", en: "Spare (5)", spare: true }
  ];

  var stage = document.getElementById("stage");
  var panelImage = document.getElementById("panel-image");
  var buttonLayer = document.getElementById("hotspots");
  stage.style.setProperty("--page-transition-ms", PAGE_TRANSITION_MS + "ms");
  stage.style.setProperty("--button-animation-ms", BUTTON_ANIMATION_MS + "ms");
  stage.style.setProperty("--button-return-ms", BUTTON_RETURN_MS + "ms");
  var currentPage = initialNavigation.page;
  var selectedPlaybackLabel = introButtons[0].ja;
  var selectedPlaybackIndex = 0;
  var isVideoPlaying = false;
  var projectorPowerState = "off";
  var projectorAcceptsMute = false;
  var projectorMuteState = false;
  var projectorPowerQueryInFlight = false;
  var projectorPowerQueryCallbacks = [];
  var projectorMuteQueryInFlight = false;
  var projectorPowerPollTimer = 0;
  var projectorPowerOnPending = false;
  var projectorPowerResponseTimeoutTimer = 0;
  var udpReceiverSocket = null;
  var udpReceiverRetryTimer = 0;
  var udpReceiverStarting = false;
  var pageTransitionTimer = 0;
  var preloadedPageImages = [];
  var switcherCommandInFlight = false;
  var pendingSwitcherInput = null;
  var switcherRetryTimer = 0;
  var switcherRequestId = 0;
  var switcherActiveSocket = null;
  var bdSerialPort = null;
  var bdSerialReceiveBuffer = "";
  var bdSerialQueue = [];
  var bdPendingCommand = null;
  var bdAckTimeoutTimer = 0;
  var bdQueueTimer = 0;
  var bdLastCommandTime = 0;
  var activeActionButton = null;
  var activeActionPointerId = null;

  function parseIntroVideoConfig(content) {
    var normalizedContent = String(content).replace(/^\uFEFF/, "");
    normalizedContent = normalizedContent.replace(/\r\n?/g, "\n");
    return JSON.parse(normalizedContent);
  }

  function applyIntroVideoConfig(config) {
    var configuredButtons = new Array(introButtons.length);
    var seenIds = {};
    var videos = config && config.videos;

    if (!Array.isArray(videos) || videos.length !== introButtons.length) {
      throw new Error("intro-videos.json must contain exactly " + introButtons.length + " videos.");
    }

    for (var index = 0; index < videos.length; index += 1) {
      var video = videos[index];
      var id = Number(video && video.id);
      var japaneseName = video && typeof video.ja === "string" ? video.ja.trim() : "";
      var englishName = video && typeof video.en === "string" ? video.en.trim() : "";

      if (!Number.isInteger(id) || id < 1 || introButtons.length < id) {
        throw new Error("Each intro video needs an id from 1 to " + introButtons.length + ".");
      }
      if (seenIds[id]) {
        throw new Error("Duplicate intro-video id: " + id + ".");
      }
      if (!japaneseName || !englishName) {
        throw new Error("Intro-video id " + id + " needs both ja and en names.");
      }

      seenIds[id] = true;
      configuredButtons[id - 1] = {
        ja: japaneseName,
        en: englishName,
        spare: introButtons[id - 1].spare
      };
    }

    introButtons = configuredButtons;
    selectedPlaybackLabel = introButtons[selectedPlaybackIndex].ja;
  }

  function loadBundledIntroVideoConfig(callback) {
    var completed = false;
    var request;

    function finish() {
      if (completed) return;
      completed = true;
      callback();
    }

    if (typeof XMLHttpRequest !== "function") {
      console.warn("Bundled intro-videos.json could not be loaded; built-in button names will be used.");
      finish();
      return;
    }

    try {
      request = new XMLHttpRequest();
      request.open("GET", "intro-videos.json?v=" + Date.now(), true);
      request.timeout = INTRO_VIDEO_CONFIG_TIMEOUT_MS;
      request.onreadystatechange = function () {
        if (request.readyState !== 4 || completed) return;
        try {
          if (request.status !== 0 && request.status !== 200) {
            throw new Error("HTTP status " + request.status);
          }
          applyIntroVideoConfig(parseIntroVideoConfig(request.responseText));
          console.log("Introduction-video names loaded from bundled intro-videos.json.");
        } catch (error) {
          console.error("Invalid bundled intro-videos.json; built-in button names will be used: " + error.message);
        }
        finish();
      };
      request.onerror = function () {
        console.error("Bundled intro-videos.json could not be loaded; built-in button names will be used.");
        finish();
      };
      request.ontimeout = function () {
        console.error("Bundled intro-videos.json load timed out; built-in button names will be used.");
        finish();
      };
      request.send();
    } catch (error) {
      console.error("Bundled intro-videos.json could not be loaded; built-in button names will be used: " + error.message);
      finish();
    }
  }

  function loadIntroVideoConfig(callback) {
    var fileSystem;

    if (typeof require !== "function") {
      loadBundledIntroVideoConfig(callback);
      return;
    }

    try {
      fileSystem = require("fs");
    } catch (error) {
      console.warn("External intro-video configuration is unavailable: " + error.message);
      loadBundledIntroVideoConfig(callback);
      return;
    }

    fileSystem.readFile(EXTERNAL_INTRO_VIDEO_CONFIG_PATH, "utf8", function (readError, content) {
      if (readError) {
        if (readError.code === "ENOENT") {
          console.log("No external intro-videos.json found; loading the bundled configuration.");
        } else {
          console.warn("External intro-videos.json could not be read; loading the bundled configuration: " + readError.message);
        }
        loadBundledIntroVideoConfig(callback);
        return;
      }

      try {
        applyIntroVideoConfig(parseIntroVideoConfig(content));
        console.log("Introduction-video names loaded from " + EXTERNAL_INTRO_VIDEO_CONFIG_PATH + ".");
        callback();
      } catch (error) {
        console.error("Invalid external intro-videos.json; loading the bundled configuration: " + error.message);
        loadBundledIntroVideoConfig(callback);
      }
    });
  }

  function closeBdSerialPort() {
    window.clearTimeout(bdAckTimeoutTimer);
    window.clearTimeout(bdQueueTimer);
    bdAckTimeoutTimer = 0;
    bdQueueTimer = 0;
    bdPendingCommand = null;
    bdSerialQueue = [];
    if (bdSerialPort) {
      try {
        bdSerialPort.Close();
      } catch (error) {
        console.warn("BD serial port close failed: " + error.message);
      }
    }
    bdSerialPort = null;
    bdSerialReceiveBuffer = "";
  }

  function scheduleNextBdCommand() {
    if (bdPendingCommand || !bdSerialQueue.length || bdQueueTimer) return;
    var commandIntervalMs = Math.max(30, Number(blurayConfig.commandIntervalMs || 30));
    var elapsedMs = Date.now() - bdLastCommandTime;
    var delayMs = Math.max(0, commandIntervalMs - elapsedMs);

    if (0 < delayMs) {
      bdQueueTimer = window.setTimeout(function () {
        bdQueueTimer = 0;
        transmitNextBdCommand();
      }, delayMs);
      return;
    }
    transmitNextBdCommand();
  }

  function finishPendingBdCommand(result) {
    if (!bdPendingCommand) return;
    window.clearTimeout(bdAckTimeoutTimer);
    bdAckTimeoutTimer = 0;
    console.log("BD serial command " + bdPendingCommand.name + ": " + result + ".");
    bdPendingCommand = null;
    scheduleNextBdCommand();
  }

  function handleBdSerialByte(event) {
    var value = Number(event && event.sbyte);
    if (!Number.isFinite(value)) return;

    if (value === 0x06) {
      console.log("DN-500BD MKII serial response: ACK (0x06)");
      finishPendingBdCommand("acknowledged");
      return;
    }
    if (value === 0x15) {
      console.error("DN-500BD MKII serial response: NACK (0x15)");
      finishPendingBdCommand("rejected");
      return;
    }
    if (value === 0x0D) {
      if (bdSerialReceiveBuffer) {
        var response = bdSerialReceiveBuffer;
        bdSerialReceiveBuffer = "";
        console.log("DN-500BD MKII serial response: " + response + "[CR]");
        if (blurayConfig.acknowledgeStatus && bdSerialPort && response.indexOf("@0") === 0) {
          try {
            bdSerialPort.SendByte(0x06);
            console.log("DN-500BD MKII status acknowledged with ACK (0x06).");
          } catch (error) {
            console.error("DN-500BD MKII status ACK failed: " + error.message);
          }
        }
      }
      return;
    }
    if (0x20 <= value && value <= 0x7F) {
      bdSerialReceiveBuffer += String.fromCharCode(value);
      if (600 < bdSerialReceiveBuffer.length) {
        console.warn("DN-500BD MKII serial response exceeded 600 bytes; clearing receive buffer.");
        bdSerialReceiveBuffer = "";
      }
      return;
    }

    console.log("DN-500BD MKII serial response byte: 0x" + value.toString(16).toUpperCase().padStart(2, "0"));
  }

  function openBdSerialPort() {
    if (bdSerialPort) return bdSerialPort;

    if (!blurayConfig.enabled) {
      console.warn("BD serial control is disabled. Enable it in bluray-config.js to send commands.");
      return null;
    }
    if (typeof BSSerialPort !== "function") {
      console.warn("BD serial command was not sent: BSSerialPort is unavailable outside a BrightSign player.");
      return null;
    }

    var port = Number(blurayConfig.port);
    var baudRate = Number(blurayConfig.baudRate || 115200);
    var dataBits = Number(blurayConfig.dataBits || 8);
    var stopBits = Number(blurayConfig.stopBits || 1);
    var parity = String(blurayConfig.parity || "none").toLowerCase();

    if (!Number.isInteger(port) || port < 0) {
      console.error("BD serial configuration error: port must be a non-negative integer.");
      return null;
    }
    if (!Number.isInteger(baudRate) || baudRate < 1) {
      console.error("BD serial configuration error: baudRate must be a positive integer.");
      return null;
    }

    try {
      var serialPort = new BSSerialPort(port);
      serialPort.SetBaudRate(baudRate);
      serialPort.SetDataBits(dataBits);
      serialPort.SetStopBits(stopBits);
      serialPort.SetParity(parity);
      serialPort.SetEcho(Boolean(blurayConfig.echo));
      serialPort.SetFlowControl(Boolean(blurayConfig.flowControl));
      serialPort.SetGenerateByteEvent(true);
      serialPort.onserialbyte = handleBdSerialByte;
      bdSerialPort = serialPort;
      console.log("BD serial port " + port + " opened at " + baudRate + " baud, " + dataBits + parity.charAt(0).toUpperCase() + stopBits + ".");
      return bdSerialPort;
    } catch (error) {
      closeBdSerialPort();
      console.error("BD serial port could not be opened: " + error.message);
      return null;
    }
  }

  function sendBdSerialCommand(commandName) {
    var commands = blurayConfig.commands || {};
    var configuredCommand = commands[commandName];
    if (!configuredCommand) {
      console.error("BD serial configuration error: no command is configured for " + commandName + ".");
      return false;
    }

    var command = String(configuredCommand).replace(/[\r\n]+$/g, "");
    var frame = command + "\r";
    var serialPort = openBdSerialPort();
    if (!serialPort) return false;

    bdSerialQueue.push({ name: commandName, frame: frame, display: command + "[CR]" });
    scheduleNextBdCommand();
    return true;
  }

  function sendBdUdpCommand(commandName) {
    var commands = blurayConfig.udpCommands || {};
    var configuredCommand = commands[commandName];
    if (!configuredCommand) {
      console.error("BD UDP configuration error: no command is configured for " + commandName + ".");
      return false;
    }

    var command = String(configuredCommand).replace(/[\0\r\n]+$/g, "").trim();
    if (!command) {
      console.error("BD UDP configuration error: command " + commandName + " is empty.");
      return false;
    }

    return sendUdpCommand(command);
  }

  function sendBdCommand(commandName) {
    var transport = String(blurayConfig.transport || "serial").toLowerCase();

    if (!blurayConfig.enabled) {
      console.warn("BD control is disabled. Enable it in bluray-config.js to send commands.");
      return false;
    }
    if (transport === "udp") return sendBdUdpCommand(commandName);
    if (transport === "serial") return sendBdSerialCommand(commandName);

    console.error('BD configuration error: transport must be "udp" or "serial".');
    return false;
  }

  function transmitNextBdCommand() {
    if (bdPendingCommand || !bdSerialQueue.length) return;
    var serialPort = openBdSerialPort();
    if (!serialPort) {
      bdSerialQueue = [];
      return;
    }

    bdPendingCommand = bdSerialQueue.shift();
    console.log("BD serial command: " + bdPendingCommand.display);
    try {
      if (serialPort.SendBytes(bdPendingCommand.frame) === false) {
        throw new Error("BSSerialPort rejected the command");
      }
      bdLastCommandTime = Date.now();
      var ackTimeoutMs = Math.max(300, Number(blurayConfig.ackTimeoutMs || 500));
      bdAckTimeoutTimer = window.setTimeout(function () {
        bdAckTimeoutTimer = 0;
        if (!bdPendingCommand) return;
        console.warn("BD serial command " + bdPendingCommand.name + " timed out without ACK/NACK; continuing.");
        bdPendingCommand = null;
        scheduleNextBdCommand();
      }, ackTimeoutMs);
    } catch (error) {
      console.error("BD serial send failed: " + error.message);
      closeBdSerialPort();
    }
  }

  function udpCommand(key, fallback) {
    var commands = udpConfig.commands || {};
    return commands[key] || fallback;
  }

  function sendUdpCommand(command) {
    var ipAddress = udpConfig.ipAddress;
    var port = Number(udpConfig.port);

    if (!udpConfig.enabled) {
      console.warn("UDP is disabled. Enable it in udp-config.js to send commands.");
      return false;
    }

    if (!ipAddress || !port || port < 1 || 65535 < port) {
      console.error("UDP configuration error: set a valid ipAddress and port.");
      return false;
    }

    // Web browsers cannot open UDP sockets. BrightSign provides Node.js in an
    // HTML widget when Node.js is enabled for the presentation/player.
    if (typeof require !== "function") {
      console.warn("UDP was not sent: this browser has no BrightSign Node.js runtime.");
      return false;
    }

    try {
      var dgram = require("dgram");
      var socket = dgram.createSocket("udp4");
      var payload = Buffer.from(command, "utf8");
      socket.send(payload, port, ipAddress, function (error) {
        socket.close();
        if (error) {
          console.error("UDP send failed: " + error.message);
          return;
        }
        console.log("UDP sent to " + ipAddress + ":" + port + " — " + command);
      });
      return true;
    } catch (error) {
      console.error("UDP is unavailable: " + error.message);
      return false;
    }
  }

  function sendSwitcherCommand(command, expectResponse, callback) {
    if (typeof expectResponse === "function") {
      callback = expectResponse;
      expectResponse = false;
    }
    var complete = typeof callback === "function" ? callback : function () {};
    var ipAddress = switcherConfig.ipAddress;
    var port = Number(switcherConfig.port || 1300);
    var timeoutMs = Number(switcherConfig.timeoutMs || 5000);
    var protocol = String(switcherConfig.protocol || "tcp").toLowerCase();
    var settled = false;
    var socket = null;

    function finish(error, response) {
      if (settled) return;
      settled = true;
      if (switcherActiveSocket === socket) switcherActiveSocket = null;
      if (error) {
        console.error("US-41 command failed: " + error.message);
      } else {
        console.log("US-41 command sent to " + ipAddress + ":" + port + " — " + command.replace(/\r$/, "[CR]"));
      }
      complete(error, response);
    }

    if (!switcherConfig.enabled) {
      finish(new Error("switcher control is disabled in switcher-config.js"));
      return false;
    }

    if (!ipAddress || !port || port < 1 || 65535 < port) {
      finish(new Error("set a valid switcher ipAddress and port in switcher-config.js"));
      return false;
    }

    if (!timeoutMs || timeoutMs < 250) {
      finish(new Error("set switcher timeoutMs to 250 or greater"));
      return false;
    }

    if (protocol !== "tcp" && protocol !== "udp") {
      finish(new Error('switcher protocol must be "tcp" or "udp"'));
      return false;
    }

    if (typeof require !== "function") {
      finish(new Error("this browser has no BrightSign Node.js runtime"));
      return false;
    }

    try {
      if (protocol === "udp") {
        if (expectResponse) {
          finish(new Error("US-41 response verification requires TCP/IP"));
          return false;
        }
        var dgram = require("dgram");
        var udpSocket = dgram.createSocket("udp4");
        udpSocket.send(Buffer.from(command, "ascii"), port, ipAddress, function (error) {
          udpSocket.close();
          finish(error || null);
        });
        return true;
      }

      var net = require("net");
      socket = net.createConnection({ host: ipAddress, port: port });
      switcherActiveSocket = socket;
      var responseBuffer = "";
      socket.setTimeout(timeoutMs);
      socket.setEncoding("ascii");
      socket.once("connect", function () {
        console.log("US-41 connected to " + ipAddress + ":" + port + ".");
        if (expectResponse) {
          socket.write(command, "ascii", function (error) {
            if (error) finish(error);
          });
          return;
        }
        socket.end(command, "ascii", function () {
          // The US-41 accepts one TCP/IP connection at a time. Close this
          // one before allowing the queued footer selection to connect.
          socket.destroy();
          finish(null);
        });
      });
      socket.on("data", function (data) {
        if (!expectResponse || settled) return;
        responseBuffer += data;
        var delimiterIndex = responseBuffer.indexOf("\r");
        if (delimiterIndex === -1) return;
        var response = responseBuffer.slice(0, delimiterIndex).replace(/\n/g, "").trim();
        socket.destroy();
        finish(null, response);
      });
      socket.once("timeout", function () {
        socket.destroy();
        finish(new Error("connection timed out"));
      });
      socket.once("error", function (error) {
        socket.destroy();
        finish(error);
      });
      socket.once("close", function () {
        if (!settled) {
          finish(new Error(expectResponse ? "connection closed before verification reply" : "connection closed before command completed"));
        }
      });
      return true;
    } catch (error) {
      finish(error);
      return false;
    }
  }

  function isCurrentSwitcherRequest(requestId) {
    return requestId === switcherRequestId;
  }

  function cancelActiveSwitcherRequest() {
    window.clearTimeout(switcherRetryTimer);
    switcherRetryTimer = 0;
    if (switcherActiveSocket && !switcherActiveSocket.destroyed) {
      switcherActiveSocket.destroy();
    }
    switcherActiveSocket = null;
    switcherCommandInFlight = false;
  }

  function retrySwitcherInput(input, output, attempt, reason, requestId, callback) {
    if (!isCurrentSwitcherRequest(requestId)) return;
    var configuredAttempts = Number(switcherConfig.maxAttempts);
    var configuredRetryDelayMs = Number(switcherConfig.retryDelayMs);
    var maxAttempts = isFinite(configuredAttempts) ? Math.max(1, Math.floor(configuredAttempts)) : 3;
    var retryDelayMs = isFinite(configuredRetryDelayMs) ? Math.max(0, configuredRetryDelayMs) : 500;

    if (maxAttempts <= attempt) {
      console.error("US-41 input " + input + " failed after " + attempt + " attempts: " + reason);
      callback(false);
      return;
    }

    console.warn("US-41 input " + input + " " + reason + "; retrying (attempt " + (attempt + 1) + " of " + maxAttempts + ").");
    switcherRetryTimer = window.setTimeout(function () {
      switcherRetryTimer = 0;
      if (!isCurrentSwitcherRequest(requestId)) return;
      setSwitcherInputWithRetry(input, output, attempt + 1, requestId, callback);
    }, retryDelayMs);
  }

  function setSwitcherInputWithRetry(input, output, attempt, requestId, callback) {
    if (!isCurrentSwitcherRequest(requestId)) return;
    var protocol = String(switcherConfig.protocol || "tcp").toLowerCase();
    var verifyEnabled = Boolean(switcherConfig.verifyEnabled) && protocol === "tcp";
    var configuredVerifyDelayMs = Number(switcherConfig.verifyDelayMs);
    var verifyDelayMs = isFinite(configuredVerifyDelayMs) ? Math.max(0, configuredVerifyDelayMs) : 250;
    var command = input + "," + output + "\r";

    sendSwitcherCommand(command, false, function (sendError) {
      if (!isCurrentSwitcherRequest(requestId)) return;
      if (sendError) {
        retrySwitcherInput(input, output, attempt, "send failed (" + sendError.message + ")", requestId, callback);
        return;
      }

      if (!verifyEnabled) {
        callback(true);
        return;
      }

      switcherRetryTimer = window.setTimeout(function () {
        switcherRetryTimer = 0;
        if (!isCurrentSwitcherRequest(requestId)) return;
        // The US-41 returns the selected input as three digits for zOUT[CR].
        sendSwitcherCommand("z" + output + "\r", true, function (verifyError, response) {
          if (!isCurrentSwitcherRequest(requestId)) return;
          var selectedInput = /^\d+$/.test(response || "") ? String(Number(response)) : "";
          if (!verifyError && selectedInput === input) {
            console.log("US-41 input " + input + " verified on output " + output + ".");
            callback(true);
            return;
          }

          var reason = verifyError
            ? "verification failed (" + verifyError.message + ")"
            : "verification returned " + (response || "an empty response");
          retrySwitcherInput(input, output, attempt, reason, requestId, callback);
        });
      }, verifyDelayMs);
    });
  }

  function selectSwitcherInput(input) {
    var output = String(switcherConfig.output || 1);
    if (!/^[1-9][0-9]*$/.test(String(input)) || !/^[1-9][0-9]*$/.test(output)) {
      console.error("US-41 input mapping error: input and output must be positive whole numbers.");
      return;
    }

    if (!switcherConfig.enabled) {
      console.warn("US-41 switcher control is disabled in switcher-config.js.");
      return;
    }

    switcherRequestId += 1;
    pendingSwitcherInput = String(input);
    if (switcherCommandInFlight || switcherRetryTimer || switcherActiveSocket) {
      cancelActiveSwitcherRequest();
    }

    function sendNextSwitcherInput() {
      var inputToSend = pendingSwitcherInput;
      pendingSwitcherInput = null;
      if (!inputToSend) {
        switcherCommandInFlight = false;
        return;
      }

      switcherCommandInFlight = true;
      var requestId = switcherRequestId;
      setSwitcherInputWithRetry(inputToSend, output, 1, requestId, function () {
        if (!isCurrentSwitcherRequest(requestId)) return;
        switcherCommandInFlight = false;
        sendNextSwitcherInput();
      });
    }

    sendNextSwitcherInput();
  }

  function selectSwitcherInputForSection(section) {
    var inputBySection = switcherConfig.inputBySection || {};
    if (!Object.prototype.hasOwnProperty.call(inputBySection, section)) return;
    selectSwitcherInput(inputBySection[section]);
  }

  function sendPjLinkCommand(command, callback) {
    var ipAddress = projectorConfig.ipAddress;
    var port = Number(projectorConfig.port || 4352);
    var timeoutMs = Number(projectorConfig.timeoutMs || 5000);
    var complete = typeof callback === "function" ? callback : function () {};
    var settled = false;
    var socket = null;
    var buffer = "";
    var waitingForGreeting = true;
    var commandName = String(command || "").split(" ")[0];

    function finish(error, response) {
      if (settled) return;
      settled = true;
      if (socket && !socket.destroyed) socket.destroy();
      if (error) {
        console.error("PJLink " + commandName + " failed: " + error.message);
      } else {
        console.log("PJLink " + commandName + " response from " + ipAddress + ":" + port + " — " + response);
      }
      complete(error, response);
    }

    if (!projectorConfig.enabled) {
      finish(new Error("projector control is disabled in projector-config.js"));
      return false;
    }

    if (!ipAddress || !port || port < 1 || 65535 < port) {
      finish(new Error("set a valid projector ipAddress and port in projector-config.js"));
      return false;
    }

    if (!timeoutMs || timeoutMs < 250) {
      finish(new Error("set timeoutMs to 250 or greater in projector-config.js"));
      return false;
    }

    if (!/^(?:POWR [01?]|AVMT (?:3[01]|\?))$/.test(command)) {
      finish(new Error("unsupported PJLink command"));
      return false;
    }

    if (typeof require !== "function") {
      finish(new Error("this browser has no BrightSign Node.js runtime"));
      return false;
    }

    try {
      var net = require("net");
      var crypto = require("crypto");

      socket = net.createConnection({ host: ipAddress, port: port });
      socket.setEncoding("utf8");
      socket.setTimeout(timeoutMs);

      socket.on("data", function (data) {
        buffer += data;

        while (buffer.indexOf("\r") !== -1 && !settled) {
          var delimiterIndex = buffer.indexOf("\r");
          var line = buffer.slice(0, delimiterIndex).replace(/\n/g, "").trim();
          buffer = buffer.slice(delimiterIndex + 1);

          if (waitingForGreeting) {
            var greeting = /^PJLINK ([01])(?: ([0-9a-fA-F]{8}))?$/.exec(line);
            if (!greeting) {
              finish(new Error("unexpected projector greeting: " + line));
              return;
            }

            waitingForGreeting = false;
            var authenticationPrefix = "";
            if (greeting[1] === "1") {
              if (!greeting[2]) {
                finish(new Error("PJLink authentication challenge was missing"));
                return;
              }
              authenticationPrefix = crypto
                .createHash("md5")
                .update(greeting[2] + String(projectorConfig.password || ""), "utf8")
                .digest("hex");
            }
            var payload = authenticationPrefix + "%1" + command + "\r";
            socket.write(payload, "utf8");
            continue;
          }

          if (line === "PJLINK ERRA") {
            finish(new Error("authentication failed; check the PJLink password"));
            return;
          }

          var expectedPrefix = "%1" + commandName + "=";
          if (line.indexOf(expectedPrefix) !== 0) {
            finish(new Error("unexpected projector response: " + line));
            return;
          }

          var value = line.slice(expectedPrefix.length);
          if (/^ERR[1-4]$/.test(value)) {
            finish(new Error("projector returned " + value));
            return;
          }

          finish(null, value);
        }
      });

      socket.on("timeout", function () {
        finish(new Error("connection timed out"));
      });
      socket.on("error", function (error) {
        finish(error);
      });
      socket.on("end", function () {
        if (!settled) finish(new Error("projector closed the connection before replying"));
      });
      return true;
    } catch (error) {
      finish(error);
      return false;
    }
  }

  function updateProjectorPowerButtons() {
    var buttons = buttonLayer.querySelectorAll(".projector-power-button");
    for (var index = 0; index < buttons.length; index += 1) {
      var button = buttons[index];
      var representsOn = button.classList.contains("projector-power-on");
      var isActive = projectorPowerState === (representsOn ? "on" : "off");
      button.disabled = representsOn ? projectorPowerState === "on" : projectorPowerOnPending;
      button.setAttribute("aria-disabled", String(button.disabled));
      if (!representsOn) {
        button.setAttribute("aria-label", button.disabled ? "プロジェクター OFF（応答待ち）" : "プロジェクター OFF");
      }
      if (button.disabled) {
        button.classList.remove("pressed");
        button.classList.remove("deactivating");
      }
      if (isActive) {
        button.classList.add("is-active");
      } else {
        button.classList.remove("is-active");
      }
      button.setAttribute("aria-pressed", String(isActive));
    }
  }

  function stopProjectorPowerResponseTimeout() {
    window.clearTimeout(projectorPowerResponseTimeoutTimer);
    projectorPowerResponseTimeoutTimer = 0;
  }

  function startProjectorPowerResponseTimeout() {
    var configuredTimeoutMs = Number(projectorConfig.powerOnResponseTimeoutMs || 15000);
    var timeoutMs = isFinite(configuredTimeoutMs) && 1000 <= configuredTimeoutMs
      ? configuredTimeoutMs
      : 15000;
    stopProjectorPowerResponseTimeout();
    projectorPowerResponseTimeoutTimer = window.setTimeout(function () {
      projectorPowerResponseTimeoutTimer = 0;
      if (!projectorPowerOnPending) return;
      projectorPowerOnPending = false;
      console.error("PJLink power-on status timed out; selecting OFF.");
      showProjectorDisconnectedState();
    }, timeoutMs);
  }

  function clearProjectorPowerOnPending() {
    projectorPowerOnPending = false;
    stopProjectorPowerResponseTimeout();
  }

  function applyProjectorPowerResponse(value) {
    if (value === "0") {
      if (projectorPowerOnPending) {
        projectorPowerState = "on";
        projectorAcceptsMute = false;
        projectorMuteState = false;
        updateProjectorPowerButtons();
        updateProjectorMuteButton();
        return;
      }
      clearProjectorPowerOnPending();
      projectorPowerState = "off";
      projectorAcceptsMute = false;
      projectorMuteState = false;
    } else if (value === "2") {
      if (projectorPowerOnPending) {
        startProjectorPowerResponseTimeout();
        projectorPowerState = "on";
        projectorAcceptsMute = false;
        projectorMuteState = false;
        updateProjectorPowerButtons();
        updateProjectorMuteButton();
        return;
      }
      projectorPowerState = "off";
      projectorAcceptsMute = false;
      projectorMuteState = false;
    } else if (value === "1" || value === "3") {
      projectorPowerState = "on";
      projectorAcceptsMute = value === "1";
      if (value === "1") {
        clearProjectorPowerOnPending();
      } else if (projectorPowerOnPending) {
        startProjectorPowerResponseTimeout();
      }
    } else {
      return;
    }
    updateProjectorPowerButtons();
    updateProjectorMuteButton();
  }

  function showProjectorDisconnectedState() {
    if (projectorPowerOnPending) {
      projectorPowerState = "on";
      projectorAcceptsMute = false;
      projectorMuteState = false;
      updateProjectorPowerButtons();
      updateProjectorMuteButton();
      return;
    }
    projectorPowerState = "off";
    projectorAcceptsMute = false;
    projectorMuteState = false;
    updateProjectorPowerButtons();
    updateProjectorMuteButton();
  }

  function updateProjectorMuteButton() {
    var buttons = buttonLayer.querySelectorAll(".projector-mute-button");
    for (var index = 0; index < buttons.length; index += 1) {
      var button = buttons[index];
      if (projectorMuteState) {
        button.classList.add("is-active");
      } else {
        button.classList.remove("is-active");
      }
      button.setAttribute("aria-pressed", String(projectorMuteState));
    }
  }

  function applyProjectorMuteResponse(value) {
    if (!/^(?:10|11|20|21|30|31)$/.test(value)) return;
    projectorMuteState = value === "11" || value === "21" || value === "31";
    updateProjectorMuteButton();
  }

  function refreshProjectorMuteState() {
    if (!projectorConfig.enabled || !projectorConfig.mutePollingEnabled || projectorMuteQueryInFlight || !projectorAcceptsMute) return;
    projectorMuteQueryInFlight = true;
    sendPjLinkCommand("AVMT ?", function (error, value) {
      projectorMuteQueryInFlight = false;
      if (!error && projectorAcceptsMute) applyProjectorMuteResponse(value);
    });
  }

  function refreshProjectorPowerState(callback) {
    if (typeof callback === "function") projectorPowerQueryCallbacks.push(callback);
    if (!projectorConfig.enabled) {
      var disabledCallbacks = projectorPowerQueryCallbacks.splice(0);
      for (var disabledIndex = 0; disabledIndex < disabledCallbacks.length; disabledIndex += 1) {
        disabledCallbacks[disabledIndex](new Error("projector control is disabled"));
      }
      return;
    }
    if (projectorPowerQueryInFlight) return;
    projectorPowerQueryInFlight = true;
    sendPjLinkCommand("POWR ?", function (error, value) {
      projectorPowerQueryInFlight = false;
      if (error) {
        showProjectorDisconnectedState();
      } else {
        applyProjectorPowerResponse(value);
      }
      var callbacks = projectorPowerQueryCallbacks.splice(0);
      for (var index = 0; index < callbacks.length; index += 1) {
        callbacks[index](error, value);
      }
    });
  }

  function refreshProjectorStatus(callback) {
    var complete = typeof callback === "function" ? callback : function () {};
    refreshProjectorPowerState(function (error) {
      if (!error && projectorAcceptsMute && projectorConfig.mutePollingEnabled) {
        refreshProjectorMuteState();
      } else if (!error && !projectorAcceptsMute) {
        projectorMuteState = false;
        updateProjectorMuteButton();
      }
      complete(error);
    });
  }

  function stopProjectorPowerPolling() {
    if (!projectorPowerPollTimer) return;
    window.clearInterval(projectorPowerPollTimer);
    projectorPowerPollTimer = 0;
  }

  function startProjectorPowerPolling() {
    var intervalMs = Number(projectorConfig.pollIntervalMs || 5000);
    stopProjectorPowerPolling();

    if (!projectorConfig.enabled || !projectorConfig.pollingEnabled || currentPage !== "projector") return;
    if (intervalMs < 1000) {
      console.error("PJLink polling configuration error: set pollIntervalMs to 1000 or greater.");
      return;
    }

    projectorPowerPollTimer = window.setInterval(function () {
      if (currentPage !== "projector") {
        stopProjectorPowerPolling();
        return;
      }
      refreshProjectorStatus();
    }, intervalMs);
  }

  function setProjectorPower(turnOn) {
    if (turnOn && projectorPowerState === "on") return;
    if (!turnOn && projectorPowerOnPending) return;

    function sendPowerCommand() {
      if (!turnOn && projectorPowerOnPending) return;
      sendPjLinkCommand("POWR " + (turnOn ? "1" : "0"), function (error, value) {
        if (error || value !== "OK") {
          showProjectorDisconnectedState();
          return;
        }
        projectorPowerState = turnOn ? "on" : "off";
        projectorAcceptsMute = false;
        if (!turnOn) projectorMuteState = false;
        updateProjectorPowerButtons();
        updateProjectorMuteButton();
      });
    }

    if (turnOn) {
      projectorPowerOnPending = true;
      startProjectorPowerResponseTimeout();
      projectorPowerState = "on";
      projectorAcceptsMute = false;
      projectorMuteState = false;
      updateProjectorPowerButtons();
      updateProjectorMuteButton();
      sendPowerCommand();
      return;
    }

    clearProjectorPowerOnPending();
    refreshProjectorPowerState(function (powerQueryError) {
      if (projectorPowerOnPending) return;
      if (powerQueryError || !projectorAcceptsMute) {
        sendPowerCommand();
        return;
      }

      sendPjLinkCommand("AVMT 30", function (muteError, value) {
        if (!muteError && value === "OK") {
          projectorMuteState = false;
          updateProjectorMuteButton();
        }
        sendPowerCommand();
      });
    });
  }

  function toggleProjectorMute() {
    var showPersistentState = Boolean(projectorConfig.mutePollingEnabled);
    var previousMuteState = projectorMuteState;

    if (showPersistentState) {
      projectorMuteState = !previousMuteState;
      updateProjectorMuteButton();
    }

    refreshProjectorPowerState(function (powerError) {
      if (powerError || !projectorAcceptsMute) {
        projectorMuteState = false;
        updateProjectorMuteButton();
        return;
      }

      sendPjLinkCommand("AVMT ?", function (queryError, currentValue) {
        if (queryError || !projectorAcceptsMute) {
          if (showPersistentState && projectorAcceptsMute) {
            projectorMuteState = previousMuteState;
            updateProjectorMuteButton();
          }
          return;
        }
        var muteIsActive = currentValue === "11" || currentValue === "21" || currentValue === "31";
        var requestedMuteState = !muteIsActive;

        if (showPersistentState && projectorMuteState !== requestedMuteState) {
          projectorMuteState = requestedMuteState;
          updateProjectorMuteButton();
        }

        sendPjLinkCommand("AVMT " + (requestedMuteState ? "31" : "30"), function (setError, value) {
          if (setError || value !== "OK" || !projectorAcceptsMute) {
            if (showPersistentState) {
              projectorMuteState = projectorAcceptsMute ? muteIsActive : false;
              updateProjectorMuteButton();
            }
            return;
          }
          if (showPersistentState) {
            projectorMuteState = requestedMuteState;
            updateProjectorMuteButton();
          }
        });
      });
    });
  }

  function finishVideoPlayback(source) {
    if (!isVideoPlaying) return;
    isVideoPlaying = false;
    console.log("Introduction video finished: " + source);
    if (currentPage === "playback") showPage("intro", true);
  }

  function handleIncomingUdpCommand(message) {
    var command = String(message || "").replace(/[\0\r\n]+$/g, "").trim();
    if (!command) return;

    console.log("UDP received: " + command);
    if (command === udpCommand("videoFinished", "VIDEO_FINISHED")) {
      finishVideoPlayback("UDP " + command);
    }
  }

  function scheduleUdpReceiverRetry() {
    if (!udpConfig.receiveEnabled || typeof require !== "function") return;
    if (udpReceiverSocket || udpReceiverStarting || udpReceiverRetryTimer) return;

    udpReceiverRetryTimer = window.setTimeout(function () {
      udpReceiverRetryTimer = 0;
      startUdpReceiver();
    }, UDP_RECEIVER_RETRY_MS);
  }

  function closeUdpReceiverSocket(socket) {
    if (!socket) return;
    try {
      socket.close();
    } catch (closeError) {
      console.warn("UDP receiver close skipped: " + closeError.message);
    }
  }

  function startUdpReceiver() {
    var receivePort = Number(udpConfig.receivePort);
    var receiveIpAddress = udpConfig.receiveIpAddress || "0.0.0.0";

    if (!udpConfig.receiveEnabled || typeof require !== "function") return;
    if (udpReceiverSocket || udpReceiverStarting) return;
    if (!receivePort || receivePort < 1 || 65535 < receivePort) {
      console.error("UDP receive configuration error: set a valid receivePort.");
      return;
    }

    try {
      var dgram = require("dgram");
      var socket = dgram.createSocket("udp4");
      udpReceiverSocket = socket;
      udpReceiverStarting = true;

      socket.on("message", function (message) {
        handleIncomingUdpCommand(message.toString("utf8"));
      });
      socket.once("listening", function () {
        if (udpReceiverSocket !== socket) return;
        udpReceiverStarting = false;
        console.log("UDP finish-command receiver listening on " + receiveIpAddress + ":" + receivePort);
      });
      socket.on("error", function (error) {
        if (udpReceiverSocket !== socket) return;
        console.error("UDP receive failed: " + error.message);
        udpReceiverSocket = null;
        udpReceiverStarting = false;
        closeUdpReceiverSocket(socket);
        scheduleUdpReceiverRetry();
      });
      socket.bind(receivePort, receiveIpAddress);
    } catch (error) {
      closeUdpReceiverSocket(udpReceiverSocket);
      udpReceiverSocket = null;
      udpReceiverStarting = false;
      console.error("UDP receiver is unavailable: " + error.message);
      scheduleUdpReceiverRetry();
    }
  }

  function preloadPageImages() {
    var pageNames = Object.keys(pages);
    for (var i = 0; i < pageNames.length; i += 1) {
      if (!isPageAvailable(pageNames[i])) continue;
      var image = new Image();
      image.src = pages[pageNames[i]].image;
      preloadedPageImages.push(image);
    }
  }

  function resizeStage() {
    var scale = Math.min(window.innerWidth / DESIGN_WIDTH, window.innerHeight / DESIGN_HEIGHT);
    stage.style.setProperty("--scale", String(scale));
  }

  function addButton(options) {
    var button = document.createElement("button");
    var actionTimer = 0;
    var actionDelayMs = Number.isFinite(options.actionDelayMs) ? Math.max(0, Math.round(options.actionDelayMs)) : BUTTON_ACTION_DELAY_MS;
    var feedbackTimer = 0;
    var feedbackActive = false;
    var pointerPressed = false;
    var ignoredPointerId = null;
    var suppressNextClick = false;
    var clickSuppressionTimer = 0;
    button.type = "button";
    button.className = "ui-button " + options.className;
    button.setAttribute("aria-label", options.label);
    button.style.left = options.x + "px";
    button.style.top = options.y + "px";
    button.style.width = options.width + "px";
    button.style.height = options.height + "px";
    if (Array.isArray(options.contentLines)) {
      for (var contentIndex = 0; contentIndex < options.contentLines.length; contentIndex += 1) {
        var contentLine = document.createElement("span");
        contentLine.className = options.contentLines[contentIndex].className;
        contentLine.textContent = options.contentLines[contentIndex].text;
        button.appendChild(contentLine);
      }
    } else {
      button.innerHTML = options.content;
    }
    button.disabled = Boolean(options.disabled);

    if (!button.disabled && button.className.indexOf("nav-button") === -1) {
      function clearPressedState() {
        button.classList.remove("pressed");
        button.classList.remove("deactivating");
      }

      function beginFeedback() {
        if (button.disabled || feedbackActive) return false;
        feedbackActive = true;
        if (options.reverseWhenActive && button.classList.contains("is-active")) {
          button.classList.add("deactivating");
        }
        button.classList.add("pressed");
        window.clearTimeout(actionTimer);
        window.clearTimeout(feedbackTimer);
        if (options.onClick) {
          actionTimer = window.setTimeout(function () {
            if (!button.disabled && button.isConnected) options.onClick();
          }, actionDelayMs);
        }
        feedbackTimer = window.setTimeout(function () {
          if (button.isConnected) {
            clearPressedState();
            feedbackActive = false;
          }
        }, BUTTON_FEEDBACK_MS);
        return true;
      }

      function releaseActionPointer() {
        if (activeActionButton !== button) return;
        activeActionButton = null;
        activeActionPointerId = null;
      }

      function suppressCompatibilityClick() {
        suppressNextClick = true;
        window.clearTimeout(clickSuppressionTimer);
        clickSuppressionTimer = window.setTimeout(function () {
          clickSuppressionTimer = 0;
          suppressNextClick = false;
        }, 0);
      }

      button.addEventListener("pointerdown", function (event) {
        if (button.disabled || feedbackActive) return;
        if (activeActionButton && activeActionButton !== button) {
          ignoredPointerId = event.pointerId;
          return;
        }
        if (activeActionButton === button && activeActionPointerId !== event.pointerId) {
          ignoredPointerId = event.pointerId;
          return;
        }

        activeActionButton = button;
        activeActionPointerId = event.pointerId;
        pointerPressed = true;
        if (options.reverseWhenActive && button.classList.contains("is-active")) {
          button.classList.add("deactivating");
        }
        button.classList.add("pressed");
        if (typeof button.setPointerCapture === "function") {
          try {
            button.setPointerCapture(event.pointerId);
          } catch (error) {
            console.warn("Pointer capture was unavailable: " + error.message);
          }
        }
      });

      button.addEventListener("pointerup", function (event) {
        if (ignoredPointerId === event.pointerId) {
          ignoredPointerId = null;
          suppressCompatibilityClick();
          if (event.preventDefault) event.preventDefault();
          return;
        }
        if (!pointerPressed || activeActionPointerId !== event.pointerId) return;
        pointerPressed = false;
        releaseActionPointer();
        suppressCompatibilityClick();
        if (event.preventDefault) event.preventDefault();
        beginFeedback();
      });

      button.addEventListener("pointercancel", function (event) {
        if (ignoredPointerId === event.pointerId) {
          ignoredPointerId = null;
          return;
        }
        if (!pointerPressed || activeActionPointerId !== event.pointerId) return;
        pointerPressed = false;
        releaseActionPointer();
        if (!feedbackActive) clearPressedState();
      });

      button.addEventListener("pointerleave", function (event) {
        if (event.pointerType === "mouse" && pointerPressed && event.buttons) {
          pointerPressed = false;
          releaseActionPointer();
          if (!feedbackActive) clearPressedState();
        }
      });

      button.addEventListener("click", function () {
        if (suppressNextClick) {
          window.clearTimeout(clickSuppressionTimer);
          clickSuppressionTimer = 0;
          suppressNextClick = false;
          return;
        }
        beginFeedback();
      });
    } else if (!button.disabled && options.onClick) {
      button.addEventListener("click", options.onClick);
    }

    buttonLayer.appendChild(button);
  }

  function addNavigation() {
    var page = pages[currentPage];
    var navigationY = page.navigationY || 680;
    var navigationHeight = page.navigationHeight || 120;
    var navigationCount = availableNavigation.length;
    for (var i = 0; i < navigationCount; i += 1) {
      (function (item, itemIndex) {
        var itemX = Math.round(itemIndex * DESIGN_WIDTH / navigationCount);
        var nextItemX = Math.round((itemIndex + 1) * DESIGN_WIDTH / navigationCount);
        addButton({
          label: item.label,
          className: "nav-button" + (activeNavigation[currentPage] === item.id ? " active" : ""),
          x: itemX,
          y: navigationY,
          width: nextItemX - itemX,
          height: navigationHeight,
          content: item.label,
          onClick: function () {
            var isNewSection = activeNavigation[currentPage] !== item.id;
            if (isNewSection) selectSwitcherInputForSection(item.id);
            if (item.id === "bd" && !isNewSection) return;
            if (item.id === "bdControls") {
              handleBdControlsTabTap();
            } else {
              showPage(item.id === "intro" && isVideoPlaying ? "playback" : item.page, false);
            }
          }
        });
      }(availableNavigation[i], i));
    }
  }

  function handleBdControlsTabTap() {
    if (currentPage === "bdDisc") {
      showPage("bdNavigation", false);
      return;
    }
    if (currentPage === "bdNavigation") {
      showPage("bdDisc", false);
      return;
    }
    showPage("bdDisc", false);
  }

  function addProjectorControls() {
    addButton({
      label: "プロジェクター ON",
      className: "power-button projector-power-button projector-power-on" + (projectorPowerState === "on" ? " is-active" : ""),
      x: 48,
      y: 194,
      width: 220,
      height: 100,
      content: "ON",
      onClick: function () { setProjectorPower(true); }
    });
    addButton({
      label: "プロジェクター OFF",
      className: "power-button projector-power-button projector-power-off" + (projectorPowerState === "off" ? " is-active" : ""),
      x: 310,
      y: 194,
      width: 220,
      height: 100,
      content: "OFF",
      onClick: function () { setProjectorPower(false); }
    });
    addButton({
      label: "MUTE",
      className: "power-button projector-mute-button" + (projectorMuteState ? " is-active" : ""),
      x: 968,
      y: 194,
      width: 220,
      height: 100,
      content: "MUTE",
      reverseWhenActive: true,
      onClick: toggleProjectorMute
    });
    updateProjectorPowerButtons();
    updateProjectorMuteButton();
    refreshProjectorStatus();
  }

  function addIntroControls() {
    var columns = [49, 349, 648, 948];
    var rows = [131, 231, 331, 431, 531, 631];

    for (var index = 0; index < introButtons.length; index += 1) {
      (function (item, itemIndex) {
        var column = itemIndex % 4;
        var row = Math.floor(itemIndex / 4);
        var className = "intro-button" + (item.spare ? " spare-button" : 16 <= itemIndex ? " category-button" : "");
        if (11 <= item.ja.length) className += " compact-title";
        addButton({
          label: item.ja,
          className: className,
          x: columns[column],
          y: rows[row],
          width: 283,
          height: 84,
          contentLines: [
            { className: "ja", text: item.ja },
            { className: "en", text: item.en }
          ],
          actionDelayMs: PAGE_BUTTON_ACTION_DELAY_MS,
          onClick: function () {
            if (isVideoPlaying || currentPage !== "intro") return;
            selectedPlaybackIndex = itemIndex;
            selectedPlaybackLabel = item.ja;
            isVideoPlaying = true;
            var prefix = udpCommand("videoPrefix", "PLAY_");
            var videoNumber = itemIndex + 1;
            var formattedVideoNumber = videoNumber < 10 ? "0" + videoNumber : String(videoNumber);
            sendUdpCommand(prefix + formattedVideoNumber);
            showPage("playback", true);
          }
        });
      }(introButtons[index], index));
    }
  }

  function addPlaybackControls() {
    var playbackLabel = document.createElement("div");
    var playbackTitle = document.createElement("span");
    playbackLabel.className = "playback-label";
    playbackLabel.setAttribute("aria-hidden", "true");
    playbackTitle.textContent = selectedPlaybackLabel;
    playbackLabel.appendChild(playbackTitle);
    buttonLayer.appendChild(playbackLabel);

    addButton({
      label: "再生中止",
      className: "playback-stop",
      x: 947,
      y: 630,
      width: 285,
      height: 86,
      content: "再生中止",
      actionDelayMs: PAGE_BUTTON_ACTION_DELAY_MS,
      onClick: function () {
        sendUdpCommand(udpCommand("videoStop", "STOP_VIDEO"));
        finishVideoPlayback("STOP button");
      }
    });
  }

  function addBdDiscControls() {
    addButton({
      label: "再生",
      className: "bd-playback-button",
      x: 388,
      y: 385,
      width: 220,
      height: 124,
      content: '<span class="label">再生</span><span class="disc-icon"><span class="play-triangle"></span></span>',
      onClick: function () { sendBdCommand("play"); }
    });
    addButton({
      label: "停止",
      className: "bd-playback-button",
      x: 672,
      y: 385,
      width: 220,
      height: 124,
      content: '<span class="label">停止</span><span class="disc-icon"><span class="stop-square"></span></span>',
      onClick: function () { sendBdCommand("stop"); }
    });
  }

  function bdArrowIcon(rotation) {
    return '<svg class="bd-arrow-icon" viewBox="0 0 64 64" aria-hidden="true">' +
      '<g transform="rotate(' + rotation + ' 32 32)">' +
      '<path d="M32 5 L13 25 L24 25 L24 58 L40 58 L40 25 L51 25 Z"></path>' +
      '</g></svg>';
  }

  function addBdNavigationControls() {
    addButton({ label: "BACK", className: "bd-text-button", x: 68, y: 223, width: 220, height: 100, content: "BACK", onClick: function () { sendBdCommand("back"); } });
    addButton({ label: "上", className: "bd-arrow-button", x: 530, y: 223, width: 220, height: 100, content: bdArrowIcon(0), onClick: function () { sendBdCommand("up"); } });
    addButton({ label: "左", className: "bd-arrow-button", x: 408, y: 347, width: 220, height: 100, content: bdArrowIcon(-90), onClick: function () { sendBdCommand("left"); } });
    addButton({ label: "右", className: "bd-arrow-button", x: 652, y: 347, width: 220, height: 100, content: bdArrowIcon(90), onClick: function () { sendBdCommand("right"); } });
    addButton({ label: "下", className: "bd-arrow-button", x: 530, y: 471, width: 220, height: 100, content: bdArrowIcon(180), onClick: function () { sendBdCommand("down"); } });
    addButton({ label: "OK", className: "bd-text-button", x: 992, y: 471, width: 220, height: 100, content: "OK", onClick: function () { sendBdCommand("enter"); } });
  }

  function removeTransitionOverlays() {
    var overlays = stage.querySelectorAll(".page-transition-overlay");
    for (var i = 0; i < overlays.length; i += 1) {
      if (overlays[i].parentNode) overlays[i].parentNode.removeChild(overlays[i]);
    }
  }

  function renderPage(pageName) {
    var page = pages[pageName];
    if (!page) return;
    currentPage = pageName;
    panelImage.src = page.image;
    panelImage.alt = pageName === "playback" ? selectedPlaybackLabel + " 再生中" : page.alt;
    buttonLayer.innerHTML = "";
    addNavigation();
    if (currentPage === "projector") addProjectorControls();
    if (currentPage === "intro") addIntroControls();
    if (currentPage === "playback") addPlaybackControls();
    if (currentPage === "bdDisc") addBdDiscControls();
    if (currentPage === "bdNavigation") addBdNavigationControls();
    if (currentPage === "projector") {
      startProjectorPowerPolling();
    } else {
      stopProjectorPowerPolling();
    }
  }

  function showPage(pageName, useCrossfade) {
    if (!pages[pageName]) return;
    if (!isPageAvailable(pageName)) {
      console.warn("Page " + pageName + " is unavailable because its tab is disabled in ui-config.js.");
      return;
    }

    if (!useCrossfade || pageName === currentPage) {
      renderPage(pageName);
      return;
    }

    window.clearTimeout(pageTransitionTimer);
    stage.classList.remove("page-transitioning");
    removeTransitionOverlays();

    var outgoingPage = document.createElement("div");
    var outgoingImage = panelImage.cloneNode(true);
    var outgoingButtons = buttonLayer.cloneNode(true);
    var sourceButtonElements = buttonLayer.querySelectorAll(".ui-button");
    var clonedButtonElements = outgoingButtons.querySelectorAll(".ui-button");
    var finishingButtons = [];

    for (var buttonIndex = 0; buttonIndex < sourceButtonElements.length; buttonIndex += 1) {
      var sourceButton = sourceButtonElements[buttonIndex];
      var clonedButton = clonedButtonElements[buttonIndex];
      clonedButton.style.setProperty("background-color", window.getComputedStyle(sourceButton).backgroundColor, "important");
      if (sourceButton.classList.contains("pressed")) finishingButtons.push(clonedButton);
    }

    outgoingPage.className = "page-transition-overlay transition-page";
    outgoingImage.removeAttribute("id");
    outgoingImage.className = "transition-panel-image";
    outgoingButtons.removeAttribute("id");
    outgoingButtons.className = "transition-hotspots";

    outgoingPage.appendChild(outgoingImage);
    outgoingPage.appendChild(outgoingButtons);
    stage.appendChild(outgoingPage);

    renderPage(pageName);
    void outgoingPage.offsetWidth;
    for (var finishingIndex = 0; finishingIndex < finishingButtons.length; finishingIndex += 1) {
      finishingButtons[finishingIndex].style.setProperty("transition", "background-color " + PAGE_TRANSITION_OVERLAP_MS + "ms linear", "important");
      finishingButtons[finishingIndex].style.setProperty("background-color", "var(--power-red)", "important");
    }
    stage.classList.add("page-transitioning");

    pageTransitionTimer = window.setTimeout(function () {
      stage.classList.remove("page-transitioning");
      removeTransitionOverlays();
    }, PAGE_TRANSITION_MS);
  }

  window.addEventListener("resize", resizeStage);
  window.addEventListener("orientationchange", resizeStage);
  window.addEventListener("beforeunload", function () {
    stopProjectorPowerPolling();
    clearProjectorPowerOnPending();
    window.clearTimeout(udpReceiverRetryTimer);
    udpReceiverRetryTimer = 0;
    window.clearTimeout(switcherRetryTimer);
    switcherRetryTimer = 0;
    closeUdpReceiverSocket(udpReceiverSocket);
    udpReceiverSocket = null;
    udpReceiverStarting = false;
    closeBdSerialPort();
  });
  window.BRIGHTSIGN_PANEL = {
    receiveCommand: handleIncomingUdpCommand,
    videoIsPlaying: function () { return isVideoPlaying; },
    sendProjectorCommand: sendPjLinkCommand,
    selectSwitcherInput: selectSwitcherInput,
    sendBdCommand: sendBdCommand,
    closeBdSerialPort: closeBdSerialPort
  };
  resizeStage();
  showPage(currentPage);
  if (activeNavigation[currentPage] !== "projector") selectSwitcherInputForSection(activeNavigation[currentPage]);
  loadIntroVideoConfig(function () {
    preloadPageImages();
    if (currentPage === "intro" || currentPage === "playback") renderPage(currentPage);
  });
  window.setTimeout(startUdpReceiver, UDP_RECEIVER_INITIAL_DELAY_MS);
}());
