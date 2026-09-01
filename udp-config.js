// UDP destination and command map.
// Set enabled to true only after setting ipAddress and port to a receiver that is
// safe to test. Commands are UTF-8 text packets with no line ending.
window.BRIGHTSIGN_UDP_CONFIG = {
  enabled: true,
  ipAddress: "192.180.10.111",
  port: 5001,
  receiveEnabled: true,
  receiveIpAddress: "0.0.0.0",
  receivePort: 5000,
  commands: {
    videoPrefix: "BS_PLAY",
    videoStop: "BS_STOP",
    videoFinished: "BS_HOME"
  }
};
