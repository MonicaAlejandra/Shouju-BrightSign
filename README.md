# BrightSign standalone panel prototype

This folder is a self-contained, offline HTML application. It does not require ChatGPT, a web server, an account, or an internet connection. The supplied 1280×800 PNG files preserve the page backgrounds, while every visible control is a real HTML button positioned and styled to match the reference screens.

## Open on a Windows or Mac computer

Open `index.html` in Chrome or Edge. The 1280×800 panel scales to fit the browser window. A mouse, touchscreen, and keyboard focus all work.

## Modify the prototype

- Replace PNG files in `assets` to change the visible page designs.
- Edit button text, coordinates, and page flow in `app.js`.
- Edit button styling and stage scaling in `styles.css`.
- See `COMMAND_PROTOCOL_MEMO.md` for the current device addresses, command frames, and official protocol references.
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

The footer navigation sends the IMAGENICS standard matrix command `IN,OUT` followed by a carriage return when the selected source changes. The configured mapping sends `1,1[CR]` for PC (HDMI), `2,1[CR]` for introduction video, `3,1[CR]` for BD, and `4,1[CR]` for PC (VGA). Tapping the selected BD tab only changes between its playback and navigation pages, so it does not resend the BD switch command.

Before testing, edit `switcher-config.js`:

1. Set `ipAddress` to the US-41 LAN IP address.
2. Confirm `port`. The US-41 factory default is `1300`.
3. Leave `protocol` as `"tcp"` unless the switcher has been explicitly reconfigured for UDP/IP.
4. Set `enabled: true`.
5. Adjust `maxAttempts`, `retryDelayMs`, and the TCP verification options only if the installation needs different timing.
6. Keep Node.js enabled for the BrightSign HTML widget/presentation. A normal browser cannot open the required TCP or UDP socket.

The US-41 permits one TCP/IP connection at a time. With TCP, the panel waits briefly and sends `z1[CR]` to confirm the selected input; connection errors, send errors, timeouts, and mismatched readback values are retried up to `maxAttempts`. UDP retries send errors but cannot perform this readback verification. The most recently selected footer input always takes priority: selecting another input cancels any pending retry and active socket for the old input.

## Blu-ray control (Denon Professional DN-500BD MKII)

The BD playback and navigation buttons use the transport selected by `transport` in `bluray-config.js`. The current value is `"udp"`: the panel sends the `BD_*` event below to the same `ipAddress` and `port` used by the introduction-video controls in `udp-config.js`. UDP payloads are UTF-8 text with no line ending.

| Panel control | UDP event | Receiver serial frame |
| --- | --- | --- |
| 再生 / Play | `BD_PLAY` | `@02353[CR]` |
| 停止 / Stop | `BD_STOP` | `@02354[CR]` |
| BACK | `BD_BACK` | `@0PCRTN[CR]` |
| Left | `BD_LEFT` | `@0PCCUSR1[CR]` |
| Right | `BD_RIGHT` | `@0PCCUSR2[CR]` |
| Up | `BD_UP` | `@0PCCUSR3[CR]` |
| Down | `BD_DOWN` | `@0PCCUSR4[CR]` |
| OK / Enter | `BD_ENTER` | `@0PCENTR[CR]` |

On the receiving BrightSign presentation, create UDP input events for the eight `BD_*` names and make each event send the corresponding serial frame in the last column. Configure that player's serial output for `115200` baud, 8 data bits, no parity, 1 stop bit, and no flow control. The carriage return belongs on the receiver's serial output; do not add it to the UDP event.

To restore direct serial control from this panel later, change only `transport: "udp"` to `transport: "serial"` in `bluray-config.js`. The original Denon serial command map and queue remain in place. In direct mode, serial port `0` opens on the first BD command and remains open until the page unloads. Commands are queued with at least 30 ms between transmissions. The sender waits up to 500 ms for Denon ACK (`0x06`) or NACK (`0x15`) before allowing the next queued command to continue. CR-terminated Denon status notifications are logged and acknowledged with `0x06`.

For an XC4055-to-PC output test, connect a real RS-232 adapter—not a TTL UART adapter—and set the PC terminal to `115200 8N1`, with flow control disabled. The BrightSign 3.5 mm port is tip = RX, ring = TX, sleeve = ground, so connect tip to the PC adapter's TX (DE9 pin 3), ring to its RX (DE9 pin 2), and sleeve to ground (DE9 pin 5). Verify the cable pinout with a continuity tester because commercial 3.5 mm serial adapters are not wired consistently.

Run the offline framing self-test from this folder with:

```powershell
node .\tools\bluray-serial-self-test.js
node .\tools\bluray-udp-self-test.js
```

For a direct command test on a BrightSign player, the console API is `BRIGHTSIGN_PANEL.sendBdCommand("play")`; replace `play` with `stop`, `back`, `left`, `right`, `up`, `down`, or `enter`.

## Projector control (PJLink)

The Panasonic PT-REZ80 is controlled over PJLink Class 2 using TCP. The panel supports both PJLink authentication modes: no authentication and the standard MD5 challenge-response mode.

Before testing, edit `projector-config.js`:

1. Set `ipAddress` to the projector's IP address.
2. Leave `port` at the PJLink default, `4352`, unless the installation settings require another port.
3. Set `password` to the password configured for PJLink on the projector. Leave it empty only when the projector has no PJLink password.
4. Set `enabled: true` after confirming the address and password.
5. Set `pollingEnabled: true` to detect power changes made with the projector remote, or `false` to disable automatic status checks.
6. Set `mutePollingEnabled: true` to synchronize MUTE with the projector's real AV-mute state. Set it to `false` to make MUTE a momentary button that shows only its normal press animation.
7. Set `pollIntervalMs` to the desired interval in milliseconds. The default is `5000` (five seconds), and the minimum accepted value is `1000`.
8. Set `powerOnResponseTimeoutMs` to the maximum time allowed for startup status to progress after ON. The default is `15000` (15 seconds), and the minimum accepted value is `1000`.
9. Keep Node.js enabled for the BrightSign HTML widget/presentation. A normal Chrome/Edge browser cannot open the required TCP socket.

The buttons send the following PJLink Class 1 commands, which are supported by Class 2 projectors:

- **ON:** `%1POWR 1` — power on
- **OFF:** when fully on, sends `%1AVMT 30` to clear retained mute before `%1POWR 0` places the projector in standby
- **MUTE:** first verifies `%1POWR ?`, then—only when the projector reports fully on—queries `%1AVMT ?` and sends `%1AVMT 31` to enable video/audio mute or `%1AVMT 30` to disable it

While OFF is disabled during startup, it uses a pale gray background and muted gray text, without an outline or extra visible text. Its normal color returns when the waiting period ends.

ON and OFF form a mutually exclusive status pair. OFF is selected in red when the panel starts. After ON is pressed, ON remains selected while startup is pending. During this pending period, OFF is disabled: taps have no press animation and send no commands. OFF becomes usable again when fully ON is confirmed or the startup timeout expires. The ON command does not start a separate immediate status query; the existing periodic poll performs the next `%1POWR ?` query. A fully-off reply (`%1POWR=0`) received while startup is pending does not clear ON or restart its timeout. Warming (`3`) and cooling (`2`) responses keep ON selected and restart the response watchdog. A fully-on response (`%1POWR=1`) confirms startup and stops the watchdog. If startup does not progress before `powerOnResponseTimeoutMs`, the panel selects OFF so a disconnected projector cannot leave ON selected indefinitely. Outside a pending startup, a fully-off response selects OFF normally. The panel continues querying `%1POWR ?` at the configured interval while the projector page remains visible. Before sending standby while the projector is fully on, the panel sends `%1AVMT 30` to clear mute so it is not retained across the power cycle. After fully on is confirmed, it reads `%1AVMT ?` immediately. MUTE commands and status queries are permitted only when `%1POWR ?` reports fully on (`1`), not during standby (`0`), cooling (`2`), or warming (`3`). Whenever fully-off or cooling is detected outside a pending ON request, the MUTE indicator is cleared. When `mutePollingEnabled` is true, activating MUTE uses the normal gray-to-red animation and deactivating it uses a dedicated red-to-gray reverse animation. The indicator changes without waiting for the complete PJLink exchange, remains red while video/audio mute is active, clears when mute is released, and reverts to the projector's confirmed state if a query or command fails. When `mutePollingEnabled` is false, pressing MUTE performs a one-time power and mute query and sends the opposite mute command, but the button shows only its normal press animation and never remains red. Polling stops when another panel page is selected. PJLink replies and errors are written to the JavaScript console.

Before testing, edit `udp-config.js`:

1. Set `ipAddress` to the IP address of the UDP receiver.
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

Set the computer's LAN address as `ipAddress` in `udp-config.js`, deploy the site to the BrightSign player, and press a mapped control. Allow inbound UDP on the selected port in Windows Firewall if prompted.

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

Projector ON, OFF, and MUTE are implemented with PJLink. Each introduction-video selection button sends its configured UDP command and shows its corresponding numbered playback panel. While a video is marked as playing, leaving and returning to the Introduction tab restores that playback panel. `STOP_VIDEO` from the on-screen button or the incoming `VIDEO_FINISHED` command clears the state. The first **BD** tab tap from another tab opens the playback-control page. When BD is already selected, each normal BD-tab tap toggles between the playback-control and navigation pages. The BD buttons currently send `BD_*` UDP events to the introduction-video destination; the receiving presentation must provide the UDP-to-serial mapping. The BD navigation **BACK** button remains on the navigation page. The target Bluefin BSBI touch panel must be published using the exact internal HS model reported by that unit and its native `1280x800x60` mode; the current test presentation remains targeted to the XC4055.

Official references:

- https://docs.connect.panasonic.com/projector/products/rez12/spec/
- https://pjlink.jbmia.or.jp/english/data/5-1_PJLink_eng_20131210.pdf
- https://docs.brightsign.biz/user-guides/html5-state
- https://docs.brightsign.biz/developers/displaying-html-with-brightauthorconnected
- https://docs.brightsign.biz/developers/displaying-html-without-brightauthor-connected-or-classic
- https://docs.brightsign.biz/developers/creating-html-pages
- https://imagenics.co.jp/pdf/products/t_us-41_gaibu.20220217.pdf
