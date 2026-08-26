// Panasonic PT-REZ80 PJLink connection settings.
//
// PJLink must also be enabled in the projector's Network settings. Replace
// host and password with the values assigned during installation, then set
// enabled to true. PJLink uses TCP port 4352 by default.
window.BRIGHTSIGN_PROJECTOR_CONFIG = {
  enabled: true,
  host: "192.180.10.114",
  port: 10000,
  password: "",
  timeoutMs: 5000,
  pollingEnabled: true,
  mutePollingEnabled: true,
  pollIntervalMs: 5000
};
