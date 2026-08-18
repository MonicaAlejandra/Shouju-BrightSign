(function () {
  "use strict";

  var DESIGN_WIDTH = 1280;
  var DESIGN_HEIGHT = 800;
  var BUTTON_ACTION_DELAY_MS = 750;
  var BUTTON_COLOR_REMAINDER_MS = 150;
  var BUTTON_FEEDBACK_MS = 1050;
  var PAGE_TRANSITION_MS = 950;
  var udpConfig = window.BRIGHTSIGN_UDP_CONFIG || {};

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
  var udpReceiverSocket = null;
  var lastBdTabTap = 0;
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

  function startUdpReceiver() {
    var receivePort = Number(udpConfig.receivePort);
    var receiveHost = udpConfig.receiveHost || "0.0.0.0";

    if (!udpConfig.receiveEnabled || typeof require !== "function") return;
    if (!receivePort || receivePort < 1 || receivePort > 65535) {
      console.error("UDP receive configuration error: set a valid receivePort.");
      return;
    }

    try {
      var dgram = require("dgram");
      udpReceiverSocket = dgram.createSocket("udp4");
      udpReceiverSocket.on("message", function (message) {
        handleIncomingUdpCommand(message.toString("utf8"));
      });
      udpReceiverSocket.on("error", function (error) {
        console.error("UDP receive failed: " + error.message);
        udpReceiverSocket.close();
        udpReceiverSocket = null;
      });
      udpReceiverSocket.bind(receivePort, receiveHost, function () {
        console.log("UDP finish-command receiver listening on " + receiveHost + ":" + receivePort);
      });
    } catch (error) {
      udpReceiverSocket = null;
      console.error("UDP receiver is unavailable: " + error.message);
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
              lastBdTabTap = 0;
              showPage(item.id === "intro" && isVideoPlaying ? "playback" : item.page, true);
            }
          }
        });
      }(navigation[i]));
    }
  }

  function handleBdTabTap() {
    var now = Date.now();
    if (now - lastBdTabTap <= 500) {
      lastBdTabTap = 0;
      showPage("bdNavigation", true);
    } else {
      lastBdTabTap = now;
      showPage("bdDisc", true);
    }
  }

  function addProjectorControls() {
    addButton({ label: "プロジェクター ON", className: "power-button", x: 48, y: 194, width: 220, height: 100, content: "ON" });
    addButton({ label: "プロジェクター OFF", className: "power-button", x: 310, y: 194, width: 220, height: 100, content: "OFF" });
    addButton({ label: "MUTE", className: "power-button", x: 968, y: 194, width: 220, height: 100, content: "MUTE" });
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
          className: "intro-button",
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
            sendUdpCommand(prefix + String(itemIndex + 1));
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
    if (udpReceiverSocket) udpReceiverSocket.close();
  });
  window.BRIGHTSIGN_PANEL = {
    receiveCommand: handleIncomingUdpCommand,
    videoIsPlaying: function () { return isVideoPlaying; }
  };
  preloadPageImages();
  resizeStage();
  showPage("projector");
  window.setTimeout(startUdpReceiver, 250);
}());
