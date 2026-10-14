// IMAGENICS US-41 switcher connection settings.
//
// The US-41 factory network settings are TCP on port 1300. Set ipAddress to the
// address assigned to the switcher, then set enabled to true. If the US-41
// has deliberately been reconfigured for UDP/IP, change protocol to "udp".
// The unit accepts only one TCP/IP connection at a time.
window.BRIGHTSIGN_SWITCHER_CONFIG = {
  enabled: true,
  // Keep false when the switcher is already on the correct input at startup.
  selectOnStartup: false,
  ipAddress: "192.180.10.113",
  port: 1300,
  protocol: "tcp",
  timeoutMs: 5000,
  maxAttempts: 1,
  retryDelayMs: 500,
  verifyEnabled: true,
  verifyDelayMs: 250,
  inputBySection: {
    hdmi: 1,
    intro: 2,
    bd: 3,
    bdControls: 3,
    vga: 4
  }
};
