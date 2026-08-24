/*
 * Panasonic PT-REZ80 PJLink connection settings.
 *
 * PJLink must also be enabled in the projector's Network settings. Replace
 * host and password with the values assigned during installation, then set
 * enabled to true. PJLink uses TCP port 4352 by default.
 */
window.BRIGHTSIGN_PROJECTOR_CONFIG = {
  enabled: false,
  host: "192.180.10.109",
  port: 4352,
  password: "",
  timeoutMs: 5000
};
