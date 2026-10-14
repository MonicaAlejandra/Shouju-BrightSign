// Denon Professional DN-500BD MKII RS-232 settings.
//
// Set transport to "udp" to send named BD events to the same destination used
// by the introduction-video controls in udp-config.js. The receiving BrightSign
// must map those events to the matching serial commands below.
//
// Set transport to "serial" to send directly from this player. Port 0 is the
// built-in 3.5 mm serial connector on the XC4055 and on the Bluefin BrightSign
// Built-In touch panel. app.js appends the required carriage return (0x0D) only
// when using the direct serial transport.
//
// Set enabled to false to disable serial output without changing the UI.
window.BRIGHTSIGN_BLURAY_CONFIG = {
  enabled: true,
  transport: "udp",
  port: 0,
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  flowControl: false,
  echo: false,
  ackTimeoutMs: 500,
  commandIntervalMs: 30,
  acknowledgeStatus: true,
  udpCommands: {
    play: "BD_PLAY",
    stop: "BD_STOP",
    back: "BD_BACK",
    left: "BD_LEFT",
    right: "BD_RIGHT",
    up: "BD_UP",
    down: "BD_DOWN",
    enter: "BD_ENTER"
  },
  commands: {
    play: "@02353",
    stop: "@02354",
    back: "@0PCRTN",
    left: "@0PCCUSR1",
    right: "@0PCCUSR2",
    up: "@0PCCUSR3",
    down: "@0PCCUSR4",
    enter: "@0PCENTR"
  }
};
