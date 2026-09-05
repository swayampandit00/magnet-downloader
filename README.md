# Magnet Downloader

WebTorrent backend + React web UI + Expo React Native WebView app.

Use this to search/add magnet torrents, stream files, and download social-media videos (Instagram, TikTok, YouTube, and more) through `yt-dlp`.

## Download the source


## Project layout

```text
.
├── src/                 Backend Express + WebTorrent API
├── web/                 Vite React UI (loaded by Expo WebView)
├── app/                 Expo React Native shell (WebView)
├── data/                Torrent records and social job history
├── downloads/           Torrent files
├── social-downloads/    yt-dlp output
├── start.sh             Starts backend + web UI together
└── package.json         Backend package
```

API base: `http://localhost:4000/api`  
Web UI: `http://localhost:5173` (proxies `/api` to the backend)

## Prerequisites

Install these on the machine that runs the backend:

- Node.js 18 or newer
- npm
- Python 3 (for yt-dlp)
- yt-dlp
- ffmpeg (needed to merge video+audio; `ffmpeg-static` is already a backend dependency)

```bash
node -v
npm -v

# Social downloads
pip3 install --break-system-packages -U yt-dlp
```

`ffmpeg-static` is installed with backend `npm install`. If you prefer a system ffmpeg:

```bash
# Debian/Ubuntu
sudo apt-get update
sudo apt-get install -y ffmpeg
```

For the Expo app (phone/simulator):

- Node.js 18+
- Expo Go app on a physical device, **or** Android Studio / Xcode
- EAS CLI only if you want APK / IPA builds (`npm install -g eas-cli`)

## 1. Backend

From the repo root:

```bash
npm install
npm start
```

Server listens on `http://localhost:4000`.

Health check:

```bash
curl http://localhost:4000/api/health
```

Expected:

```json
{"ok":true,"version":"webtorrent","downloads":0,"ytDlp":true,"ffmpeg":true}
```

If `ytDlp` is `false`, social downloads will fail until yt-dlp is on `PATH`.

Useful env vars:

```bash
PORT=4000
DOWNLOAD_DIR=./downloads
SOCIAL_DIR=./social-downloads
DATA_DIR=./data
YT_DLP_PATH=/usr/local/bin/yt-dlp
```

### Backend API (used by the UI)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Server + yt-dlp/ffmpeg status |
| GET | `/api/torrents` | Active torrents |
| POST | `/api/torrents` | Body `{ magnet, name? }` |
| GET | `/api/torrents/:infoHash` | One torrent |
| POST | `/api/torrents/:infoHash/select` | Body `{ fileIndices }` |
| DELETE | `/api/torrents/:infoHash?rm=true` | Remove torrent |
| GET | `/api/torrents/:infoHash/stream/:fileIndex` | Stream file |
| GET | `/api/torrents/:infoHash/download/:fileIndex` | Download file |
| GET | `/api/search?q=` | Torrent search |
| GET | `/api/settings` | Speed limits |
| POST | `/api/settings/speed` | Body `{ downloadLimit, uploadLimit }` |
| GET | `/api/storage` | Disk usage |
| POST | `/api/social/info` | Body `{ url }` |
| POST | `/api/social/download` | Body `{ url, quality, audioOnly, subtitles, playlist }` |
| GET | `/api/social/jobs` | Job list |
| GET | `/api/social/jobs/:id` | Job detail |
| GET | `/api/social/jobs/:id/file?index=0` | Saved media |
| DELETE | `/api/social/jobs/:id` | Remove job |

## 2. Web UI

The Expo app is a WebView around this UI.

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to `http://localhost:4000`.

Or start backend + web together from the repo root:

```bash
chmod +x start.sh
./start.sh
```

Production web build:

```bash
cd web
npm run build
npm run preview
```

## 3. Expo app setup

The native app lives in `app/`. It loads the web UI in `react-native-webview`.

### Install

```bash
cd app
npm install
```

### Point the WebView at your UI

Default URL is `http://localhost:5173` (`app/app.json` extra.webUrl).

On a **physical phone**, `localhost` is the phone itself, not your computer. Use your PC LAN IP, for example:

```text
http://192.168.1.20:5173
```

Ways to set it:

1. Copy `app/.env.example` to `app/.env`:

```bash
EXPO_PUBLIC_WEB_URL=http://192.168.1.20:5173
```

2. Or change `expo.extra.webUrl` in `app/app.json`.

3. Or long-press the Magnet header in the running app, paste the URL, tap Load.

Android emulator maps `localhost` to `10.0.2.2` automatically.

Phone and computer must be on the same Wi-Fi. Keep backend (`4000`) and web (`5173`) running.

### Run in Expo Go

```bash
cd app
npx expo start
```

- Scan the QR code with Expo Go (Android) or the Camera app (iOS)
- Press `a` for Android emulator
- Press `i` for iOS simulator
- Press `w` for web

Scripts:

```bash
npm start
npm run android
npm run ios
npm run web
```

First start can take a few minutes while Metro bundler warms up.

### WebView URL checklist

1. Backend: `npm start` in repo root (port 4000)
2. Web UI: `npm run dev` in `web/` (port 5173)
3. Expo: `npx expo start` in `app/`
4. WebView URL reachable from the device
5. `/api/health` works through the web origin (`http://YOUR-IP:5173/api/health`)

## 4. Development build (native WebView, not Expo Go)

`react-native-webview` works in Expo Go. A custom dev client is only needed if you add extra native modules.

```bash
cd app
npx expo install expo-dev-client
npx expo prebuild
npx expo run:android
npx expo run:ios
```

`expo prebuild` generates `android/` and `ios/` folders.

## 5. Expo se online APK (EAS Build) — step by step

Android Studio ki zaroorat nahi. Expo servers (EAS) cloud mein APK banate hain.

Yeh app WebView hai: APK ke andar UI nahi chhapti. Phone us URL ko kholta hai jo aap build time par set karte ho. `localhost` APK mein **kaam nahi karega**. Pehle web UI + backend kisi public HTTPS URL par chalao, phir wahi URL WebView mein do.

### Step 0 — accounts aur tools

1. Node.js 18+ install karo: `https://nodejs.org`
2. Free Expo account banao: `https://expo.dev/signup`
3. Computer par yeh commands chalao:

```bash
node -v
npm install -g eas-cli
eas --version
eas login
```

Browser khulega (ya email/password). Login ke baad:

```bash
eas whoami
```

### Step 1 — project unzip / clone

Source zip: `https://5173-016bb285b92f88f8.monkeycode-ai.live/magnet-downloader.zip`

```bash
unzip magnet-downloader.zip
cd magnet-downloader
```

Expo app folder `app/` hai, root nahi.

### Step 2 — WebView ke liye public URL taiyar karo

APK phone par chalega, isliye UI internet se reachable honi chahiye.

Option A — pehle local test (APK nahi, Expo Go): PC aur phone same Wi-Fi, URL `http://192.168.x.x:5173`.

Option B — real APK: backend + `web/` ko kisi VPS / Render / Railway / Cloudflare par host karo. Example:

```text
https://magnet.example.com
```

Us origin par `/api/health` 200 dena chahiye (same host, `/api` reverse proxy to backend port 4000).

Vite production example (`web/vite.config.js` already `/api` proxy karta hai dev mein). Production mein nginx / Caddy:

```text
location /api/ {
  proxy_pass http://127.0.0.1:4000;
}
location / {
  proxy_pass http://127.0.0.1:5173;
}
```

### Step 3 — APK mein woh URL hard-code / env set karo

File `app/eas.json`, profile `preview` ke andar:

```json
"env": {
  "EXPO_PUBLIC_WEB_URL": "https://magnet.example.com"
}
```

`https://YOUR-PUBLIC-WEB-UI` ko apni asl URL se replace karo.

Ya `app/.env`:

```bash
EXPO_PUBLIC_WEB_URL=https://magnet.example.com
```

Ya `app/app.json`:

```json
"extra": {
  "webUrl": "https://magnet.example.com"
}
```

`App.js` yeh order use karta hai: `EXPO_PUBLIC_WEB_URL` → `extra.webUrl` → `http://localhost:5173`.

Phone par baad mein URL badalni ho to Magnet header **long-press** karke naya URL paste kar sakte ho.

### Step 4 — Expo project `app/` folder se link karo

```bash
cd app
npm install
eas init
```

Pehla baar poochhega: Expo account par naya project banao? **Yes**.

`app.json` / `app.config` mein `extra.eas.projectId` aa jayega. Usse mat hatao.

Agar `eas init` ke bajay website se karna ho: `https://expo.dev` → Create a project → slug `magnet-downloader`.

### Step 5 — Android package name check

`app/app.json` mein pehle se hai:

```text
android.package = com.magnet.downloader
```

Play Store ke liye unique rakhna. Sirf APK sideload ke liye yahi theek hai.

### Step 6 — Cloud par APK build start

`app/` ke andar (zaroor):

```bash
cd app
eas build -p android --profile preview
```

Pehli baar yeh poochh sakta hai:

1. **Generate a new Android Keystore?** → `Yes` (EAS keystore sambhalega)
2. **Install the Expo Application Services plugin / log in** → already `eas login`
3. Free plan par queue lag sakti hai (10–20 min typical)

Profile `preview` `app/eas.json` mein `android.buildType: "apk"` set karta hai. Isi se **APK** milta hai, AAB nahi.

Build status:

```bash
eas build:list
```

Ya browser: `https://expo.dev/accounts/<your-username>/projects/magnet-downloader/builds`

### Step 7 — APK download aur phone par install

Build **finished** hone ke baad:

```bash
eas build:download --latest
```

Ya Expo dashboard se **Download** button.

Phone par:

1. File manager se APK open karo
2. Android: Settings → Security → **Install unknown apps** allow karo
3. Install → open **Magnet Downloader**

Agar WebView blank ho: header long-press → apni public UI URL paste → Load.

### Step 8 — Play Store ke liye (AAB, optional)

APK sideload ke liye Step 6 kaafi hai. Store upload:

```bash
cd app
eas build -p android --profile production
eas submit -p android
```

`production` profile `app-bundle` (`.aab`) banata hai, APK nahi.

Google Play Console app, package `com.magnet.downloader`, signing EAS credentials use karo (`eas credentials`).

### Common errors

| Error | Fix |
| --- | --- |
| `not logged in` | `eas login` |
| `Must be run from expo project` | command `app/` folder se chalao, root se nahi |
| `Invalid applicationId` / package | `app.json` android.package unique rakho |
| Build OK, app blank | `EXPO_PUBLIC_WEB_URL` localhost hai; public HTTPS URL do, rebuild |
| `Unable to resolve module react-native-webview` | `cd app && npm install` |
| Queue / payment | Expo free plan limits; dashboard par wait, ya paid slot |
| `Keystore` prompt | first Android build par Yes; credentials Expo account mein save |

### Local APK (bina Expo cloud, optional)

Android Studio + JDK chahiye. Online EAS se alag path:

```bash
cd app
npx expo prebuild -p android
npx expo run:android --variant release
```

APK: `app/android/app/build/outputs/apk/release/`

### iOS IPA (cloud, optional)

Apple Developer Program ($99/year) chahiye.

```bash
cd app
eas build -p ios --profile production
```

### Before har naya APK

1. Public UI URL confirm: browser se phone par `https://your-ui/api/health`
2. `EXPO_PUBLIC_WEB_URL` / `eas.json` env update
3. Zarurat ho to `app.json` `version` aur `android.versionCode` badhao
4. `eas build -p android --profile preview` dubara chalao

## 6. Using the app

1. Start backend + web UI.
2. Open the web UI or the Expo WebView.
3. **Downloads** — paste a `magnet:?xt=urn:btih:...` link.
4. **Search** — query torrents, then Add magnet.
5. **Social** — paste Instagram / TikTok / YouTube URL, tap Download. Playlist is off by default.
6. Expand a torrent to play or save files.

Notes:

- YouTube may return a bot / cookies error from some IPs. Instagram and TikTok usually work.
- Torrent speed depends on peers. Metadata can take a while.
- Speed limits are in **bytes per second** (empty = unlimited).

## 7. Typical local session

Terminal 1 — backend:

```bash
npm start
```

Terminal 2 — web UI:

```bash
cd web
npm run dev
```

Terminal 3 — Expo:

```bash
cd app
npx expo start
```

Phone: Expo Go, same Wi-Fi, WebView URL `http://<pc-lan-ip>:5173`.

## Troubleshooting

**Expo WebView is blank / failed to load**  
`localhost` on a phone is wrong. Use the PC LAN IP. Long-press the header and paste `http://192.168.x.x:5173`.

**Server offline in the UI**  
Backend is not running, or the Vite `/api` proxy cannot reach port 4000.

**Social download: spawn yt-dlp ENOENT**  
Install yt-dlp and restart the backend. `GET /api/health` should show `"ytDlp": true`.

**YouTube: Sign in to confirm you are not a bot**  
yt-dlp is blocked. Try Instagram/TikTok, or pass cookies via `YT_DLP_PATH` / yt-dlp config on the server.

**Torrent added but stuck on Meta**  
No peers yet, or UDP trackers blocked. Wait, or try another magnet.

**Play does not start**  
File is still fetching. For social jobs, Play uses `inline=1` so the browser/WebView can stream.

**Android cleartext HTTP blocked**  
`app.json` already sets `usesCleartextTraffic: true` and iOS ATS `NSAllowsArbitraryLoads`. Rebuild the native app if you changed this after prebuild.

**EAS build cannot find icon**  
Keep `app/assets/icon.png`.

## License

Private / local use. Respect copyright and site terms when downloading media.
