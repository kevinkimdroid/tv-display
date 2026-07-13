# TV Display

A simple Node.js digital signage app: upload photos & videos from an admin
panel, and they play in a fullscreen slideshow on any browser (e.g. a Smart
TV browser, or a laptop/mini-PC plugged into the TV via HDMI).

## Important: this runs on Node, not through XAMPP's Apache/PHP

XAMPP's Apache server runs PHP, not Node.js. Putting this folder inside
`htdocs` is fine for keeping your projects organized, but you won't open it
through Apache — you'll start it with Node directly, and it runs on its own
port (3000 by default). You do **not** need Apache or MySQL running for
this to work.

## Setup

1. **Install Node.js** (if you don't have it): https://nodejs.org (LTS version)

2. **Copy this whole `tv-display` folder** into:
   ```
   C:\xampp\htdocs\sites\tv-display
   ```

3. **Open a terminal / Command Prompt in that folder** and install dependencies:
   ```
   cd C:\xampp\htdocs\sites\tv-display
   npm install
   ```

4. **Start the server:**
   ```
   npm start
   ```
   You should see:
   ```
   TV Display server running!
     Display (open on TV):  http://localhost:3000/
     Admin panel:           http://localhost:3000/admin.html
   ```

## Using it

- **Admin panel** — go to `http://localhost:3000/admin.html` from your
  computer or phone. Drag and drop, or click to select, photos and videos.
  You can reorder items, set how many seconds each photo displays for
  (videos play in full automatically), and delete items.

- **TV display** — open `http://localhost:3000/` in the browser on your
  TV or on a device connected to the TV. Click anywhere once to enter
  fullscreen (browsers require a click before allowing fullscreen).
  The display automatically checks for playlist changes every 10 seconds,
  so anything you add/remove/reorder in the admin panel shows up on the TV
  without needing to reload it.

## Accessing from other devices on your network

By default the server listens on all network interfaces, so other devices
on the same Wi-Fi/LAN can reach it too. Find your computer's local IP
address (e.g. `192.168.1.20`) and use:

- TV:    `http://192.168.1.20:3000/`
- Admin: `http://192.168.1.20:3000/admin.html`

## Notes

- Uploaded files are stored in the `uploads/` folder and tracked in
  `data/playlist.json`. Back up `uploads/` and `data/playlist.json`
  together if you want to preserve your playlist.
- Max upload size is 500MB per file (adjustable in `server.js`,
  search for `fileSize`).
- To run the server in the background permanently (so it survives a
  reboot), consider using a tool like [pm2](https://pm2.keymetrics.io/)
  or Windows Task Scheduler once you're comfortable with the basics.

## Project structure

```
tv-display/
├── server.js           Express server & API
├── package.json
├── data/
│   └── playlist.json   Stores playlist order, filenames, durations
├── uploads/             Uploaded photo/video files
└── public/
    ├── index.html       TV display (fullscreen slideshow)
    ├── display.js
    ├── admin.html        Admin panel UI
    └── admin.js
```
