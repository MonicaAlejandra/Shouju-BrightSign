// Control-panel tab availability.
//
// Set a tab to false to hide it. At least one tab must remain enabled. If all
// tabs are set to false, the application keeps the projector tab available so
// the panel cannot start with an unusable blank screen.
window.BRIGHTSIGN_UI_CONFIG = {
  defaultTab: "intro",
  // Page crossfade duration in milliseconds (100 to 5000).
  pageTransitionMs: 400,
  // Button color-animation duration; related command and feedback timing scale with it.
  buttonAnimationMs: 400,
  // Time that the button animation and page crossfade run together (0 to buttonAnimationMs).
  pageTransitionOverlapMs: 200,
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
