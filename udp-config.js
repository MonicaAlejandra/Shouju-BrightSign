// UDP destination and command map.
// Set enabled to true only after setting ipAddress and port to a receiver that is
// safe to test. Commands are UTF-8 text packets with no line ending.
window.BRIGHTSIGN_UDP_CONFIG = {
  enabled: true,
  ipAddress: "192.168.0.2",
  port: 5001,
  // Use "press" to start on first touch or "release" to wait for touch release.
  videoSendTrigger: "press",
  // In press mode, send UDP "immediate" or at the "crossfade-midpoint".
  pressVideoSendTiming: "crossfade-midpoint",
  receiveEnabled: true,
  receiveIpAddress: "0.0.0.0",
  receivePort: 5000,
  commands: {
    videoPrefix: "BS_PLAY",
    videoStop: "BS_STOP",
    videoFinished: "BS_HOME"
  }
};
