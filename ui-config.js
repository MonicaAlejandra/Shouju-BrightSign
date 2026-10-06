// Control-panel tab availability.
//
// Set a tab to false to hide it. At least one tab must remain enabled. If all
// tabs are set to false, the application keeps the projector tab available so
// the panel cannot start with an unusable blank screen.
window.BRIGHTSIGN_UI_CONFIG = {
  defaultTab: "intro",
  tabs: {
    projector: false,
    intro: true,
    bd: false,
    // Optional legacy tab with Play/Stop and menu-navigation controls.
    bdControls: false,
    hdmi: false,
    vga: false
  }
};
