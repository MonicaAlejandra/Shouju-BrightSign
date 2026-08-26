(function () {
  "use strict";

  var DESIGN_WIDTH = 1280;
  var DESIGN_HEIGHT = 800;
  var BUTTON_ACTION_DELAY_MS = 520;
  var BUTTON_COLOR_REMAINDER_MS = 100;
  var BUTTON_FEEDBACK_MS = 780;
  var PAGE_TRANSITION_MS = 700;
  var UDP_RECEIVER_INITIAL_DELAY_MS = 1500;
  var UDP_RECEIVER_RETRY_MS = 5000;
  var udpConfig = window.BRIGHTSIGN_UDP_CONFIG || {};
  var projectorConfig = window.BRIGHTSIGN_PROJECTOR_CONFIG || {};
  var switcherConfig = window.BRIGHTSIGN_SWITCHER_CONFIG || {};
  var blurayConfig = window.BRIGHTSIGN_BLURAY_CONFIG || {};

  var pages = {
    projector: { image: "assets/projector-control-panel.png", alt: "プロジェクター操作" },
    intro: { image: "assets/intro-video-selection.png", alt: "紹介映像 選択" },
    playback: { image: "assets/video-playback.png", alt: "紹介映像 再生中" },
    bdDisc: { image: "assets/bluray-disc-control.png", alt: "ブルーレイディスク 再生操作" },
    bdNavigation: { image: "assets/bluray-navigation.png", alt: "ブルーレイディスク メニュー操作" },
    hdmi: { image: "assets/pc-hdmi-control.png", alt: "PC HDMI 表示" },
    vga: { image: "assets/pc-VGA-control.png", alt: "PC VGA 表示" }
  };

  var navigation = [
    { id: "projector", label: "プロジェクター", page: "projector", x: 0 },
    { id: "intro", label: "紹介映像", page: "intro", x: 256 },
    { id: "bd", label: "ＢＤ", page: "bdDisc", x: 512 },
    { id: "hdmi", label: "PC (HDMI)", page: "hdmi", x: 768 },
    { id: "vga", label: "PC (VGA)", page: "vga", x: 1024 }
  ];

  var activeNavigation = {
    projector: "projector",
    intro: "intro",
    playback: "intro",
    bdDisc: "bd",
    bdNavigation: "bd",
    hdmi: "hdmi",
    vga: "vga"
  };

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
    { ja: "大人用", en: "Adult" },
    { ja: "子ども用", en: "Children" },
    { ja: "予備（1）", en: "Spare (1)", spare: true },
    { ja: "予備（2）", en: "Spare (2)", spare: true },
    { ja: "予備（3）", en: "Spare (3)", spare: true },
    { ja: "予備（4）", en: "Spare (4)", spare: true },
    { ja: "予備（5）", en: "Spare (5)", spare: true },
    { ja: "予備（6）", en: "Spare (6)", spare: true }
  ];

  var stage = document.getElementById("stage");
  var panelImage = document.getElementById("panel-image");
  var buttonLayer = document.getElementById("hotspots");
  var currentPage = "projector";
  var selectedPlaybackImage = "assets/video-playback-01.png";
  var selectedPlaybackLabel = introButtons[0].ja;
  var isVideoPlaying = false;
  var projectorPowerState = "off";
  var projectorAcceptsMute = false;
  var projectorMuteState = false;
  var projectorPowerQueryInFlight = false;
  var projectorPowerQueryCallbacks = [];
  var projectorMuteQueryInFlight = false;
  var projectorPowerPollTimer = 0;
  var projectorPowerOnPending = false;
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

    if (delayMs > 0) {
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
    if (value >= 0x20 && value <= 0x7F) {
      bdSerialReceiveBuffer += String.fromCharCode(value);
      if (bdSerialReceiveBuffer.length > 600) {
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

  function sendBdCommand(commandName) {
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
    var host = udpConfig.host;
    var port = Number(udpConfig.port);

    if (!udpConfig.enabled) {
      console.warn("UDP is disabled. Enable it in udp-config.js to send commands.");
      return false;
    }

    if (!host || !port || port < 1 || port > 65535) {
      console.error("UDP configuration error: set a valid host and port.");
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
      socket.send(payload, port, host, function (error) {
        socket.close();
        if (error) {
          console.error("UDP send failed: " + error.message);
          return;
        }
        console.log("UDP sent to " + host + ":" + port + " — " + command);
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
    var host = switcherConfig.host;
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
        console.log("US-41 command sent to " + host + ":" + port + " — " + command.replace(/\r$/, "[CR]"));
      }
      complete(error, response);
    }

    if (!switcherConfig.enabled) {
      finish(new Error("switcher control is disabled in switcher-config.js"));
      return false;
    }

    if (!host || !port || port < 1 || port > 65535) {
      finish(new Error("set a valid switcher host and port in switcher-config.js"));
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
        udpSocket.send(Buffer.from(command, "ascii"), port, host, function (error) {
          udpSocket.close();
          finish(error || null);
        });
        return true;
      }

      var net = require("net");
      socket = net.createConnection({ host: host, port: port });
      switcherActiveSocket = socket;
      var responseBuffer = "";
      socket.setTimeout(timeoutMs);
      socket.setEncoding("ascii");
      socket.once("connect", function () {
        console.log("US-41 connected to " + host + ":" + port + ".");
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

    if (attempt >= maxAttempts) {
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
    var host = projectorConfig.host;
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
        console.log("PJLink " + commandName + " response from " + host + ":" + port + " — " + response);
      }
      complete(error, response);
    }

    if (!projectorConfig.enabled) {
      finish(new Error("projector control is disabled in projector-config.js"));
      return false;
    }

    if (!host || !port || port < 1 || port > 65535) {
      finish(new Error("set a valid projector host and port in projector-config.js"));
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

      socket = net.createConnection({ host: host, port: port });
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
            socket.write(authenticationPrefix + "%1" + command + "\r", "utf8");
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
      if (isActive) {
        button.classList.add("is-active");
      } else {
        button.classList.remove("is-active");
      }
      button.setAttribute("aria-pressed", String(isActive));
    }
  }

  function clearProjectorPowerOnPending() {
    projectorPowerOnPending = false;
  }

  function applyProjectorPowerResponse(value) {
    if (value === "0") {
      clearProjectorPowerOnPending();
      projectorPowerState = "off";
      projectorAcceptsMute = false;
      projectorMuteState = false;
    } else if (value === "2") {
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
    } else if (value === "1" || value === "3") {
      projectorPowerState = "on";
      projectorAcceptsMute = value === "1";
      if (value === "1") clearProjectorPowerOnPending();
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

  function refreshProjectorStatus() {
    refreshProjectorPowerState(function (error) {
      if (error) return;
      if (projectorAcceptsMute && projectorConfig.mutePollingEnabled) {
        refreshProjectorMuteState();
      } else if (!projectorAcceptsMute) {
        projectorMuteState = false;
        updateProjectorMuteButton();
      }
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
    function sendPowerCommand() {
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
        if (turnOn) refreshProjectorStatus();
      });
    }

    if (turnOn) {
      projectorPowerOnPending = true;
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
    var receiveHost = udpConfig.receiveHost || "0.0.0.0";

    if (!udpConfig.receiveEnabled || typeof require !== "function") return;
    if (udpReceiverSocket || udpReceiverStarting) return;
    if (!receivePort || receivePort < 1 || receivePort > 65535) {
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
        console.log("UDP finish-command receiver listening on " + receiveHost + ":" + receivePort);
      });
      socket.on("error", function (error) {
        if (udpReceiverSocket !== socket) return;
        console.error("UDP receive failed: " + error.message);
        udpReceiverSocket = null;
        udpReceiverStarting = false;
        closeUdpReceiverSocket(socket);
        scheduleUdpReceiverRetry();
      });
      socket.bind(receivePort, receiveHost);
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
      var image = new Image();
      image.src = pages[pageNames[i]].image;
      preloadedPageImages.push(image);
    }

    for (var playbackIndex = 0; playbackIndex < introButtons.length; playbackIndex += 1) {
      var playbackImage = new Image();
      playbackImage.src = getPlaybackImagePath(playbackIndex);
      preloadedPageImages.push(playbackImage);
    }
  }

  function getPlaybackImagePath(index) {
    var number = index + 1;
    var paddedNumber = number < 10 ? "0" + number : String(number);
    return "assets/video-playback-" + paddedNumber + ".png";
  }

  function resizeStage() {
    var scale = Math.min(window.innerWidth / DESIGN_WIDTH, window.innerHeight / DESIGN_HEIGHT);
    stage.style.setProperty("--scale", String(scale));
  }

  function addButton(options) {
    var button = document.createElement("button");
    var actionTimer = 0;
    var feedbackTimer = 0;
    var feedbackActive = false;
    button.type = "button";
    button.className = "ui-button " + options.className;
    button.setAttribute("aria-label", options.label);
    button.style.left = options.x + "px";
    button.style.top = options.y + "px";
    button.style.width = options.width + "px";
    button.style.height = options.height + "px";
    button.innerHTML = options.content;
    button.disabled = Boolean(options.disabled);

    if (!button.disabled && button.className.indexOf("nav-button") === -1) {
      button.addEventListener("pointerdown", function () {
        if (!feedbackActive) {
          if (options.reverseWhenActive && button.classList.contains("is-active")) {
            button.classList.add("deactivating");
          }
          button.classList.add("pressed");
        }
      });

      button.addEventListener("pointercancel", function () {
        if (!feedbackActive) {
          button.classList.remove("pressed");
          button.classList.remove("deactivating");
        }
      });

      button.addEventListener("pointerleave", function (event) {
        if (!feedbackActive && event.buttons) {
          button.classList.remove("pressed");
          button.classList.remove("deactivating");
        }
      });

      button.addEventListener("click", function () {
        if (feedbackActive) return;
        feedbackActive = true;
        if (options.reverseWhenActive && button.classList.contains("is-active")) {
          button.classList.add("deactivating");
        }
        button.classList.add("pressed");
        window.clearTimeout(actionTimer);
        window.clearTimeout(feedbackTimer);
        if (options.onClick) {
          actionTimer = window.setTimeout(function () {
            options.onClick();
          }, BUTTON_ACTION_DELAY_MS);
        }
        feedbackTimer = window.setTimeout(function () {
          if (button.isConnected) {
            button.classList.remove("pressed");
            button.classList.remove("deactivating");
            feedbackActive = false;
          }
        }, BUTTON_FEEDBACK_MS);
      });
    } else if (!button.disabled && options.onClick) {
      button.addEventListener("click", options.onClick);
    }

    buttonLayer.appendChild(button);
  }

  function addNavigation() {
    for (var i = 0; i < navigation.length; i += 1) {
      (function (item) {
        addButton({
          label: item.label,
          className: "nav-button" + (activeNavigation[currentPage] === item.id ? " active" : ""),
          x: item.x,
          y: 680,
          width: 256,
          height: 120,
          content: item.label,
          onClick: function () {
            var isNewSection = activeNavigation[currentPage] !== item.id;
            if (item.id === "bd") {
              if (isNewSection) selectSwitcherInputForSection(item.id);
              handleBdTabTap();
            } else {
              if (isNewSection) selectSwitcherInputForSection(item.id);
              showPage(item.id === "intro" && isVideoPlaying ? "playback" : item.page, false);
            }
          }
        });
      }(navigation[i]));
    }
  }

  function handleBdTabTap() {
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
    var columns = [48, 348, 647, 947];
    var widths = [285, 285, 286, 285];
    var rows = [134, 224, 314, 404, 494, 584];

    for (var index = 0; index < introButtons.length; index += 1) {
      (function (item, itemIndex) {
        var column = itemIndex % 4;
        var row = Math.floor(itemIndex / 4);
        addButton({
          label: item.ja,
          className: "intro-button" + (item.spare ? " spare-button" : itemIndex >= 16 ? " category-button" : ""),
          x: columns[column],
          y: rows[row],
          width: widths[column],
          height: 76,
          content: '<span class="ja">' + item.ja + '</span><span class="en">' + item.en + "</span>",
          onClick: function () {
            selectedPlaybackImage = getPlaybackImagePath(itemIndex);
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
    addButton({
      label: "再生中止",
      className: "playback-stop",
      x: 1012,
      y: 540,
      width: 220,
      height: 100,
      content: "再生中止",
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
    panelImage.src = pageName === "playback" ? selectedPlaybackImage : page.image;
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
      finishingButtons[finishingIndex].style.setProperty("transition", "background-color " + BUTTON_COLOR_REMAINDER_MS + "ms linear", "important");
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
  showPage("projector");
  window.setTimeout(preloadPageImages, 0);
  window.setTimeout(startUdpReceiver, UDP_RECEIVER_INITIAL_DELAY_MS);
}());
