/*
 * UDP destination and command map.
 * Set enabled to true only after setting host and port to a receiver that is
 * safe to test. Commands are UTF-8 text packets with no line ending.
 */
window.BRIGHTSIGN_UDP_CONFIG = {
  enabled: true,
  host: "192.180.10.109",
  port: 5000,
  receiveEnabled: true,
  receiveHost: "0.0.0.0",
  receivePort: 5001,
  commands: {
    videoPrefix: "PLAY_",
    videoStop: "STOP_VIDEO",
    videoFinished: "VIDEO_FINISHED"
  }
};
