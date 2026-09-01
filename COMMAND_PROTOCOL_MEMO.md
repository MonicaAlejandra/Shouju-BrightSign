# Device command memo

## Connections

| Device | Connection |
| --- | --- |
| Video controller | UDP `192.180.10.111:5001` |
| Incoming video-finished command | UDP listen port `5000` |
| IMAGENICS US-41 | TCP `192.180.10.113:1300` |
| Panasonic PT-REZ80 | PJLink TCP `192.180.10.114:10000` |
| Denon DN-500BD MKII | RS-232 port `0`, `115200 8N1` |

## Video controller — UDP

 These are custom project commands and have no CR/LF line ending.

- Play: `BS_PLAY01` through `BS_PLAY24`
- Stop: `BS_STOP`
- Video finished, controller → BrightSign: `BS_HOME`

## IMAGENICS US-41 — TCP

The switcher receives ASCII commands over TCP. Each command must end with `[CR]`. 

| Panel section | Command |
| --- | --- |
| PC (HDMI) | `1,1[CR]` |
| Introduction video | `2,1[CR]` |
| BD | `3,1[CR]` |
| PC (VGA) | `4,1[CR]` |
| Verify output 1 | `z1[CR]` |

The verification reply is a three-digit input number, such as `002` for input 2.

## Panasonic PT-REZ80 — PJLink

PJLink is a TCP request/response protocol. Class 1 commands begin with `%1` and end with `[CR]`. The projector returns values such as `%1POWR=1[CR]` or `%1POWR=OK[CR]`.

- Power on: `%1POWR 1[CR]`
- Power off: `%1POWR 0[CR]`
- Query power: `%1POWR ?[CR]`
- Mute audio and video: `%1AVMT 31[CR]`
- Clear mute: `%1AVMT 30[CR]`
- Query mute: `%1AVMT ?[CR]`

PJLink normally uses TCP port `4352`;

## Denon DN-500BD MKII — RS-232

The serial connection uses `115200 8N1` with no flow control. Command packets begin with `@0` and end with `[CR]`. The player replies with ACK (`0x06`) for success or NACK (`0x15`) for failure, so the application waits for a reply before sending the next queued command.

| Control | Command |
| --- | --- |
| Play | `@02353[CR]` |
| Stop | `@02354[CR]` |
| BACK | `@0PCRTN[CR]` |
| Left / Right | `@0PCCUSR1[CR]` / `@0PCCUSR2[CR]` |
| Up / Down | `@0PCCUSR3[CR]` / `@0PCCUSR4[CR]` |
| OK / Enter | `@0PCENTR[CR]` |

## Protocol documents

- [IMAGENICS US-41 external-control manual](https://imagenics.co.jp/pdf/products/t_us-41_gaibu.20220217.pdf)
- [PJLink specification](https://pjlink.jbmia.or.jp/english/data/5-1_PJLink_eng_20131210.pdf)
- [Panasonic PT-REZ80 specifications](https://docs.connect.panasonic.com/projector/products/rez12/spec/)
- [Denon DN-500BD MKII protocol guide](https://cdn.inmusicbrands.com/DenonPro/cdn/1841/documents/DN-500BD_MKII_Protocol_Guide_v1.1.pdf)
- [BrightSign BSSerialPort reference](https://docs.brightsign.biz/developers/bsserialport)
