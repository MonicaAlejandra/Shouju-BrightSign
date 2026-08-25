# BrightSign standalone panel prototype

This folder is a self-contained, offline HTML application. It does not require ChatGPT, a web server, an account, or an internet connection. The supplied 1280×800 PNG files preserve the page backgrounds, while every visible control is a real HTML button positioned and styled to match the reference screens.

## Open on a Windows or Mac computer

Open `index.html` in Chrome or Edge. The 1280×800 panel scales to fit the browser window. A mouse, touchscreen, and keyboard focus all work.

## Modify the prototype

- Replace PNG files in `assets` to change the visible page designs.
- Edit button text, coordinates, and page flow in `app.js`.
- Edit button styling and stage scaling in `styles.css`.
- Reload `index.html` after saving.

Keep `index.html`, `styles.css`, `app.js`, and the `assets` folder together. Do not add web-hosted fonts or scripts if the player must remain offline.

The `fonts` folder contains a local Noto Sans JP variable font so Japanese button labels render consistently on BrightSignOS. Keep this folder with the site when publishing.

Action buttons use a continuous multi-stage blend from gray through a pale white highlight into red, without an immediate browser press-color jump, then briefly hold the pressed color. For red buttons that change pages, the page dissolve begins just before the button reaches its final red color so the two animations overlap smoothly. Bottom navigation tabs change pages immediately without a page dissolve and keep their existing green selected-state behavior.

The 24 introduction-selection buttons map in row order to `assets/video-playback-01.png` through `assets/video-playback-24.png`. This includes the six enabled `予備` buttons, mapped to panels 19–24.

## Introduction-video UDP command test

The introduction-video section uses UDP when the panel runs in a BrightSign HTML widget with **Node.js enabled**:

- Introduction videos: `PLAY_1` through `PLAY_24`
- Video playback: `STOP_VIDEO`; incoming `VIDEO_FINISHED` clears the playing state

The footer selects the corresponding US-41 input when configured: PC (HDMI) → IN 1, introduction video → IN 2, BD → IN 3, and PC (VGA) → IN 4. Projector control uses PJLink separately from the introduction-video UDP functions.

## HDMI switcher control (IMAGENICS US-41)

The footer navigation sends the IMAGENICS standard matrix command `IN,OUT` followed by a carriage return. The configured mapping sends `1,1[CR]` for PC (HDMI), `2,1[CR]` for introduction video, `3,1[CR]` for BD, and `4,1[CR]` for PC (VGA).

Before testing, edit `switcher-config.js`:

1. Set `host` to the US-41 LAN IP address.
2. Confirm `port`. The US-41 factory default is `1300`.
3. Leave `protocol` as `"tcp"` unless the switcher has been explicitly reconfigured for UDP/IP.
4. Set `enabled: true`.
5. Adjust `maxAttempts`, `retryDelayMs`, and the TCP verification options only if the installation needs different timing.
6. Keep Node.js enabled for the BrightSign HTML widget/presentation. A normal browser cannot open the required TCP or UDP socket.

The US-41 permits one TCP/IP connection at a time. With TCP, the panel waits briefly and sends `z1[CR]` to confirm the selected input; connection errors, send errors, timeouts, and mismatched readback values are retried up to `maxAttempts`. UDP retries send errors but cannot perform this readback verification. The most recently selected footer input always takes priority: selecting another input cancels any pending retry and active socket for the old input.

## Projector control (PJLink)

The Panasonic PT-REZ80 is controlled over PJLink Class 2 using TCP. The panel supports both PJLink authentication modes: no authentication and the standard MD5 challenge-response mode.

Before testing, edit `projector-config.js`:

1. Set `host` to the projector's IP address.
2. Leave `port` at the PJLink default, `4352`, unless the installation settings require another port.
3. Set `password` to the password configured for PJLink on the projector. Leave it empty only when the projector has no PJLink password.
4. Set `enabled: true` after confirming the address and password.
5. Set `pollingEnabled: true` to detect power changes made with the projector remote, or `false` to disable automatic status checks.
6. Set `mutePollingEnabled: true` to synchronize MUTE with the projector's real AV-mute state. Set it to `false` to make MUTE a momentary button that shows only its normal press animation.
7. Set `pollIntervalMs` to the desired interval in milliseconds. The default is `5000` (five seconds), and the minimum accepted value is `1000`.
8. Keep Node.js enabled for the BrightSign HTML widget/presentation. A normal Chrome/Edge browser cannot open the required TCP socket.

The buttons send the following PJLink Class 1 commands, which are supported by Class 2 projectors:

- **ON:** `%1POWR 1` — power on
- **OFF:** when fully on, sends `%1AVMT 30` to clear retained mute before `%1POWR 0` places the projector in standby
- **MUTE:** first verifies `%1POWR ?`, then—only when the projector reports fully on—queries `%1AVMT ?` and sends `%1AVMT 31` to enable video/audio mute or `%1AVMT 30` to disable it

ON and OFF form a mutually exclusive status pair. OFF is selected in red when the panel starts. The panel queries `%1POWR ?` when the projector page opens and, when polling is enabled, repeats the query at the configured interval while that page remains visible. It displays ON in red for the on/warming states and OFF in red for the standby/cooling states, including power changes made with the projector remote. If a power query or command loses its PJLink connection, the panel clears ON and MUTE and selects OFF as its safe visual fallback; polling continues, and the next successful query restores the projector's real state. Before sending standby while the projector is fully on, the panel sends `%1AVMT 30` to clear mute so it is not retained across the power cycle. After ON, polling waits for the fully-on state and then reads `%1AVMT ?` immediately. MUTE commands and status queries are permitted only when `%1POWR ?` reports fully on (`1`), not during standby (`0`), cooling (`2`), or warming (`3`). Whenever standby or cooling is detected, the MUTE indicator is cleared. When `mutePollingEnabled` is true, activating MUTE uses the normal gray-to-red animation and deactivating it uses a dedicated red-to-gray reverse animation. The indicator changes without waiting for the complete PJLink exchange, remains red while video/audio mute is active, clears when mute is released, and reverts to the projector's confirmed state if a query or command fails. When `mutePollingEnabled` is false, pressing MUTE performs a one-time power and mute query and sends the opposite mute command, but the button shows only its normal press animation and never remains red. Polling stops when another panel page is selected. PJLink replies and errors are written to the JavaScript console.

Before testing, edit `udp-config.js`:

1. Set `host` to the IP address of the UDP receiver.
2. Set `port` to the receiver's UDP port.
3. Send the video-finished command to the BrightSign on UDP port `5001`. BrightAuthor continues to use port `5000`.
4. Replace the command strings, including `videoFinished`, with the exact commands required by the target device or controller.
5. Set `enabled: true` for sending and `receiveEnabled: true` for the finish-command receiver.

UDP activity is written to the JavaScript console only, so no status label appears on the panel. A normal Chrome/Edge test cannot send or receive UDP; this is expected browser security behavior. The HTML receiver listens on port `5001` so it does not conflict with BrightAuthor's port `5000`. For a local state test, run `BRIGHTSIGN_PANEL.receiveCommand("VIDEO_FINISHED")` in the browser console.

The first panel renders before the UDP receiver starts. If port `5001` is temporarily unavailable, the receiver failure is contained and the panel remains usable; the application retries the same port every five seconds without changing any UDP commands or destinations.

To confirm packets on a Windows computer, run the included listener in PowerShell:

```powershell
.\tools\Receive-Udp.ps1 -Port 5000
```

Set the computer's LAN address as `host` in `udp-config.js`, deploy the site to the BrightSign player, and press a mapped control. Allow inbound UDP on the selected port in Windows Firewall if prompted.

## Use in BrightSign Author / BrightAuthor:connected

1. Open the desktop BrightSign Author application and select Local content (Simple mode).
2. Create a 1280×800 landscape presentation, or use a full-screen zone with that aspect ratio.
3. Add an HTML5 state/widget to the full-screen zone.
4. Set Site Source to Local Site and select this folder's `index.html`.
5. Enable **Mouse and Touch Events**. Enable **Display Cursor** when testing with a USB mouse.
6. For the visual-only simulation, leave BrightSign JavaScript Objects disabled. For UDP and PJLink control, enable **Node.js** for the HTML widget/presentation, as required by the BrightSign player configuration. The page uses Node's `dgram` API for UDP and the `net`/`crypto` APIs for PJLink TCP and authentication.
7. Publish using Standalone or Local Network mode.

## Run without BrightSign Author

For a simple full-screen test, copy the contents of this folder to the root of an otherwise empty player storage device so `index.html` is at the root. Insert the storage and restart the player.

## Current limitation

Projector ON, OFF, and MUTE are implemented with PJLink, but remain disabled until the installation values are entered in `projector-config.js`. Each introduction-video selection button sends its configured UDP command and shows its corresponding numbered playback panel. While a video is marked as playing, leaving and returning to the Introduction tab restores that playback panel. `STOP_VIDEO` from the on-screen button or the incoming `VIDEO_FINISHED` command clears the state. The first **BD** tab tap from another tab opens the playback-control page. When BD is already selected, each normal BD-tab tap toggles between the playback-control and navigation pages. The BD navigation **BACK** button remains on the navigation page.

Official references:

- https://docs.connect.panasonic.com/projector/products/rez12/spec/
- https://pjlink.jbmia.or.jp/english/data/5-1_PJLink_eng_20131210.pdf
- https://docs.brightsign.biz/user-guides/html5-state
- https://docs.brightsign.biz/developers/displaying-html-with-brightauthorconnected
- https://docs.brightsign.biz/developers/displaying-html-without-brightauthor-connected-or-classic
- https://docs.brightsign.biz/developers/creating-html-pages
- https://imagenics.co.jp/pdf/products/t_us-41_gaibu.20220217.pdf
