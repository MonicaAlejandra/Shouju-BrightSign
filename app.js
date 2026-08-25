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
  var projectorMuteState = false;
  var projectorPowerQueryInFlight = false;
  var projectorMuteQueryInFlight = false;
  var projectorPowerPollTimer = 0;
  var udpReceiverSocket = null;
  var udpReceiverRetryTimer = 0;
  var udpReceiverStarting = false;
  var pageTransitionTimer = 0;
  var preloadedPageImages = [];
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

  function applyProjectorPowerResponse(value) {
    if (value === "0" || value === "2") {
      projectorPowerState = "off";
    } else if (value === "1" || value === "3") {
      projectorPowerState = "on";
    } else {
      return;
    }
    updateProjectorPowerButtons();
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
    if (!projectorConfig.enabled || !projectorConfig.mutePollingEnabled || projectorMuteQueryInFlight || projectorPowerState !== "on") return;
    projectorMuteQueryInFlight = true;
    sendPjLinkCommand("AVMT ?", function (error, value) {
      projectorMuteQueryInFlight = false;
      if (!error) applyProjectorMuteResponse(value);
    });
  }

  function refreshProjectorPowerState(callback) {
    var complete = typeof callback === "function" ? callback : function () {};
    if (!projectorConfig.enabled || projectorPowerQueryInFlight) return;
    projectorPowerQueryInFlight = true;
    sendPjLinkCommand("POWR ?", function (error, value) {
      projectorPowerQueryInFlight = false;
      if (!error) applyProjectorPowerResponse(value);
      complete(error, value);
    });
  }

  function refreshProjectorStatus() {
    refreshProjectorPowerState(function (error) {
      if (error) return;
      if (projectorPowerState === "on" && projectorConfig.mutePollingEnabled) {
        refreshProjectorMuteState();
      } else if (projectorPowerState !== "on") {
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
    sendPjLinkCommand("POWR " + (turnOn ? "1" : "0"), function (error, value) {
      if (error || value !== "OK") return;
      projectorPowerState = turnOn ? "on" : "off";
      if (!turnOn) projectorMuteState = false;
      updateProjectorPowerButtons();
      updateProjectorMuteButton();
    });
  }

  function toggleProjectorMute() {
    if (!projectorConfig.mutePollingEnabled) {
      sendPjLinkCommand("AVMT ?", function (queryError, currentValue) {
        if (queryError) return;
        var muteIsActive = currentValue === "11" || currentValue === "21" || currentValue === "31";
        sendPjLinkCommand("AVMT " + (muteIsActive ? "30" : "31"));
      });
      return;
    }

    sendPjLinkCommand("AVMT ?", function (queryError, currentValue) {
      if (queryError) return;
      var muteIsActive = currentValue === "11" || currentValue === "21" || currentValue === "31";
      applyProjectorMuteResponse(currentValue);
      sendPjLinkCommand("AVMT " + (muteIsActive ? "30" : "31"), function (setError, value) {
        if (setError || value !== "OK") return;
        projectorMuteState = !muteIsActive;
        updateProjectorMuteButton();
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
        if (!feedbackActive) button.classList.add("pressed");
      });

      button.addEventListener("pointercancel", function () {
        if (!feedbackActive) button.classList.remove("pressed");
      });

      button.addEventListener("pointerleave", function (event) {
        if (!feedbackActive && event.buttons) button.classList.remove("pressed");
      });

      button.addEventListener("click", function () {
        if (feedbackActive) return;
        feedbackActive = true;
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
            if (item.id === "bd") {
              handleBdTabTap();
            } else {
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
      content: '<span class="label">再生</span><span class="disc-icon"><span class="play-triangle"></span></span>'
    });
    addButton({
      label: "停止",
      className: "bd-playback-button",
      x: 672,
      y: 385,
      width: 220,
      height: 124,
      content: '<span class="label">停止</span><span class="disc-icon"><span class="stop-square"></span></span>'
    });
  }

  function bdArrowIcon(rotation) {
    return '<svg class="bd-arrow-icon" viewBox="0 0 64 64" aria-hidden="true">' +
      '<g transform="rotate(' + rotation + ' 32 32)">' +
      '<path d="M32 5 L13 25 L24 25 L24 58 L40 58 L40 25 L51 25 Z"></path>' +
      '</g></svg>';
  }

  function addBdNavigationControls() {
    addButton({ label: "BACK", className: "bd-text-button", x: 68, y: 223, width: 220, height: 100, content: "BACK" });
    addButton({ label: "上", className: "bd-arrow-button", x: 530, y: 223, width: 220, height: 100, content: bdArrowIcon(0) });
    addButton({ label: "左", className: "bd-arrow-button", x: 408, y: 347, width: 220, height: 100, content: bdArrowIcon(-90) });
    addButton({ label: "右", className: "bd-arrow-button", x: 652, y: 347, width: 220, height: 100, content: bdArrowIcon(90) });
    addButton({ label: "下", className: "bd-arrow-button", x: 530, y: 471, width: 220, height: 100, content: bdArrowIcon(180) });
    addButton({ label: "OK", className: "bd-text-button", x: 992, y: 471, width: 220, height: 100, content: "OK" });
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
    window.clearTimeout(udpReceiverRetryTimer);
    udpReceiverRetryTimer = 0;
    closeUdpReceiverSocket(udpReceiverSocket);
    udpReceiverSocket = null;
    udpReceiverStarting = false;
  });
  window.BRIGHTSIGN_PANEL = {
    receiveCommand: handleIncomingUdpCommand,
    videoIsPlaying: function () { return isVideoPlaying; },
    sendProjectorCommand: sendPjLinkCommand
  };
  resizeStage();
  showPage("projector");
  window.setTimeout(preloadPageImages, 0);
  window.setTimeout(startUdpReceiver, UDP_RECEIVER_INITIAL_DELAY_MS);
}());
