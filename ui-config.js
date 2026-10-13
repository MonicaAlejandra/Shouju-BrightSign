// Control-panel tab availability.
//
// Set a tab to false to hide it. At least one tab must remain enabled. If all
// tabs are set to false, the application keeps the projector tab available so
// the panel cannot start with an unusable blank screen.
window.BRIGHTSIGN_UI_CONFIG = {
  defaultTab: "intro",
  // Page crossfade duration in milliseconds (100 to 5000).
  pageTransitionMs: 240,
  // Slightly longer crossfade when the Stop button returns to the selection page.
  stopPageTransitionMs: 300,
  // Crossfade curve: "smooth", "standard", or "linear".
  pageTransitionEasing: "smooth",
  // Button color-animation duration; related command and feedback timing scale with it.
  buttonAnimationMs: 480,
  // Time that the button animation and page crossfade run together (0 to buttonAnimationMs).
  pageTransitionOverlapMs: 180,
  // Extra wait before the crossfade when UDP video commands are sent on first touch.
  pressPageTransitionExtraDelayMs: 60,
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
