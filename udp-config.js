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
    projectorOn: "PROJECTOR_ON",
    projectorOff: "PROJECTOR_OFF",
    projectorMute: "PROJECTOR_MUTE",
    videoPrefix: "PLAY_",
    videoStop: "STOP_VIDEO",
    videoFinished: "VIDEO_FINISHED",
    bdPlay: "BD_PLAY",
    bdStop: "BD_STOP",
    bdMenuUp: "BD_MENU_UP",
    bdMenuLeft: "BD_MENU_LEFT",
    bdMenuRight: "BD_MENU_RIGHT",
    bdMenuDown: "BD_MENU_DOWN",
    bdMenuOk: "BD_MENU_OK",
    bdMenuBack: "BD_MENU_BACK"
  }
};
