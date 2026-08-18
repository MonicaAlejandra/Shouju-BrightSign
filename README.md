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

Action buttons use a continuous multi-stage blend from gray through a pale white highlight into red, without an immediate browser press-color jump, then briefly hold the pressed color. Every page change uses a GPU-friendly soft dissolve without the white gradient, including changes made with the bottom navigation tabs. Navigation tabs keep their existing green selected-state behavior.

The 24 introduction-selection buttons map in row order to `assets/video-playback-01.png` through `assets/video-playback-24.png`. This includes the six enabled `予備` buttons, mapped to panels 19–24.

## UDP command test

UDP is used only by the introduction-video section when the panel runs in a BrightSign HTML widget with **Node.js enabled**:

- Introduction videos: `PLAY_1` through `PLAY_24`
- Video playback: `STOP_VIDEO`; incoming `VIDEO_FINISHED` clears the playing state

Projector, BD, HDMI, and VGA controls keep their normal button feedback and navigation, but do not send UDP. Their control protocol can be connected separately without changing the introduction-video UDP functions.

Before testing, edit `udp-config.js`:

1. Set `host` to the IP address of the UDP receiver.
2. Set `port` to the receiver's UDP port.
3. Send the video-finished command to the BrightSign on UDP port `5001`. BrightAuthor continues to use port `5000`.
4. Replace the command strings, including `videoFinished`, with the exact commands required by the target device or controller.
5. Set `enabled: true` for sending and `receiveEnabled: true` for the finish-command receiver.

UDP activity is written to the JavaScript console only, so no status label appears on the panel. A normal Chrome/Edge test cannot send or receive UDP; this is expected browser security behavior. The HTML receiver listens on port `5001` so it does not conflict with BrightAuthor's port `5000`. For a local state test, run `BRIGHTSIGN_PANEL.receiveCommand("VIDEO_FINISHED")` in the browser console.

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
6. For the visual-only simulation, leave BrightSign JavaScript Objects disabled. For UDP control, enable **Node.js** for the HTML widget/presentation, as required by the BrightSign player configuration. The page uses Node's `dgram` API to send and receive packets.
7. Publish using Standalone or Local Network mode.

## Run without BrightSign Author

For a simple full-screen test, copy the contents of this folder to the root of an otherwise empty player storage device so `index.html` is at the root. Insert the storage and restart the player.

## Current limitation

Projector, BD, HDMI, and VGA controls are currently visual controls awaiting their separate protocol integration. Each introduction-video selection button sends its configured UDP command and shows its corresponding numbered playback panel. While a video is marked as playing, leaving and returning to the Introduction tab restores that playback panel. `STOP_VIDEO` from the on-screen button or the incoming `VIDEO_FINISHED` command clears the state. Tap the bottom **BD** tab twice consecutively to open the supplied BD navigation page. A single BD-tab tap opens the BD playback-control page. The BD navigation **BACK** button remains on the navigation page.

Official references:

- https://docs.brightsign.biz/user-guides/html5-state
- https://docs.brightsign.biz/developers/displaying-html-with-brightauthorconnected
- https://docs.brightsign.biz/developers/displaying-html-without-brightauthor-connected-or-classic
- https://docs.brightsign.biz/developers/creating-html-pages
