/*
 * UDP destination and command map.
 * Set enabled to true only after setting host and port to a receiver that is
 * safe to test. Commands are UTF-8 text packets with no line ending.
 */
window.BRIGHTSIGN_UDP_CONFIG = {
  enabled: true,
  host: "192.180.10.109",
  port: 5000,
  commands: {
    projectorOn: "PROJECTOR_ON",
    projectorOff: "PROJECTOR_OFF",
    projectorMute: "PROJECTOR_MUTE",
    videoPrefix: "PLAY_VIDEO_",
    videoStop: "STOP_VIDEO",
    bdPlay: "BD_PLAY",
    bdStop: "BD_STOP",
    bdMenuUp: "BD_MENU_UP",
    bdMenuLeft: "BD_MENU_LEFT",
    bdMenuRight: "BD_MENU_RIGHT",
    bdMenuDown: "BD_MENU_DOWN",
    bdMenuOk: "BD_MENU_OK"
  }
};
