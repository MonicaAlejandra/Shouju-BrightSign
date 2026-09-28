// Control-panel tab availability.
//
// Set a tab to false to hide it. At least one tab must remain enabled. If all
// tabs are set to false, the application keeps the projector tab available so
// the panel cannot start with an unusable blank screen.
window.BRIGHTSIGN_UI_CONFIG = {
  tabs: {
    projector: true,
    intro: true,
    bd: true,
    // Optional legacy tab with Play/Stop and menu-navigation controls.
    bdControls: false,
    hdmi: true,
    vga: true
  }
};
