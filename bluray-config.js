// Denon Professional DN-500BD MKII RS-232 settings.
//
// Port 0 is the built-in 3.5 mm serial connector on the XC4055 and on the
// Bluefin BrightSign Built-In touch panel. Commands are sent as ASCII and
// app.js appends the required carriage return (0x0D).
//
// Set enabled to false to disable serial output without changing the UI.
window.BRIGHTSIGN_BLURAY_CONFIG = {
  enabled: true,
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
