# JambGenius Mobile App

A React Native mobile app for [JambGenius](https://jambgenius.app) — an AI-powered JAMB exam preparation platform. This app wraps the JambGenius website in a polished native shell for iOS and Android, providing a seamless mobile experience with full camera, microphone, and storage access.

---

## Features

- **WebView shell** — loads `https://jambgenius.app` with full session/cookie support
- **Native splash screen** — branded loading screen on app launch
- **Loading indicator** — spinner shown while pages load
- **Error / offline screen** — friendly retry UI when there is no internet
- **Back navigation** — header back button + Android hardware back key
- **External link handling** — non-JambGenius links open in the device browser
- **Camera, microphone & storage permissions** — requested on iOS and Android
- **Inline media playback** — audio/video plays without leaving the page
- **File upload support** — camera roll and file system access for uploads

---

## Tech Stack

| Library | Version | Purpose |
|---|---|---|
| Expo SDK | ~51 | Project tooling and native modules |
| React Native | 0.74 | Mobile framework |
| react-native-webview | 13 | WebView component |
| expo-splash-screen | ~0.27 | Splash screen control |
| expo-camera | ~15 | Camera permission plugin |
| expo-av | ~14 | Microphone permission plugin |
| expo-media-library | ~16 | Storage/media permission plugin |
| @react-native-community/netinfo | 11 | Network state detection |

---

## Prerequisites

| Tool | Minimum version | Install guide |
|---|---|---|
| Node.js | 18.x | https://nodejs.org |
| npm or Yarn | npm 9+ / Yarn 3+ | bundled with Node |
| Expo CLI | latest | `npm install -g expo-cli` or use `npx expo` |
| Expo Go app | latest | iOS App Store / Google Play (for development) |

**For native builds only:**

| Tool | Platform | Install guide |
|---|---|---|
| Xcode 15+ | macOS (iOS) | Mac App Store |
| Android Studio | Windows/macOS/Linux (Android) | https://developer.android.com/studio |
| EAS CLI | both | `npm install -g eas-cli` |

---

## Quick Start (Expo Go)

```bash
# 1. Clone the repo
git clone https://github.com/bossgpt8/jambmobile.git
cd jambmobile

# 2. Install dependencies
npm install

# 3. Start the development server
npx expo start
```

Then:
- **iOS**: Scan the QR code with your iPhone Camera app to open in **Expo Go**
- **Android**: Scan the QR code with the **Expo Go** app

> **Note:** Camera, microphone and file-upload features require a real device and a native build — they cannot be tested in Expo Go.

---

## Running on a Simulator / Emulator

```bash
# iOS Simulator (macOS only)
npx expo start --ios

# Android Emulator
npx expo start --android
```

---

## Building a Native App (EAS Build)

EAS Build is the recommended way to create production-ready `.ipa` and `.apk`/`.aab` files without needing a Mac for Android.

### 1. Install EAS CLI and log in

```bash
npm install -g eas-cli
eas login
```

### 2. Configure EAS in your project

```bash
eas build:configure
```

This creates an `eas.json` file. A minimal example:

```json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  },
  "submit": {
    "production": {}
  }
}
```

### 3. Run a build

```bash
# Android (.apk for testing, .aab for Play Store)
eas build --platform android

# iOS (.ipa — requires Apple Developer account)
eas build --platform ios

# Both platforms
eas build --platform all
```

### 4. Local builds (without EAS cloud)

```bash
# Requires Xcode / Android Studio installed locally
eas build --platform android --local
eas build --platform ios --local
```

---

## Permissions

### Android

Declared in `app.json` under `android.permissions`:

| Permission | Purpose |
|---|---|
| `CAMERA` | Camera access for photo capture |
| `RECORD_AUDIO` | Microphone for audio recording |
| `READ_EXTERNAL_STORAGE` | Read media from device storage |
| `WRITE_EXTERNAL_STORAGE` | Save files to device storage |
| `READ_MEDIA_IMAGES` | Read images (Android 13+) |
| `READ_MEDIA_VIDEO` | Read video files (Android 13+) |
| `READ_MEDIA_AUDIO` | Read audio files (Android 13+) |
| `INTERNET` | Network access |
| `ACCESS_NETWORK_STATE` | Check network connectivity |

### iOS

Declared in `app.json` under `ios.infoPlist`:

| Key | Purpose |
|---|---|
| `NSCameraUsageDescription` | Camera access for photo capture |
| `NSMicrophoneUsageDescription` | Microphone for audio recording |
| `NSPhotoLibraryUsageDescription` | Access photo library for uploads |
| `NSPhotoLibraryAddUsageDescription` | Save images to photo library |

---

## Project Structure

```
jambmobile/
├── App.tsx                # Main application entry point
├── app.json               # Expo + native configuration
├── babel.config.js        # Babel configuration
├── tsconfig.json          # TypeScript configuration
├── package.json           # Dependencies
├── assets/
│   ├── icon.png           # App icon (replace with real artwork)
│   ├── adaptive-icon.png  # Android adaptive icon foreground
│   ├── splash.png         # Splash screen image
│   └── favicon.png        # Web favicon
└── README.md
```

---

## Customising the App Icon and Splash Screen

Replace the placeholder images in `assets/` with your real artwork:

| File | Recommended size | Notes |
|---|---|---|
| `icon.png` | 1024×1024 px | No transparency |
| `adaptive-icon.png` | 1024×1024 px | Android adaptive icon foreground |
| `splash.png` | 1284×2778 px | iPhone 14 Pro Max size works well |
| `favicon.png` | 48×48 px | Used for web target |

After replacing, rebuild the app to see the new assets.

---

## Environment Variables

No environment variables are required. The target URL is hardcoded in `App.tsx`:

```typescript
const APP_URL = 'https://jambgenius.app';
```

To change the target URL, edit that constant in `App.tsx`.

---

## Troubleshooting

| Issue | Solution |
|---|---|
| Camera/mic not working | Test on a real device with a native build, not Expo Go |
| Site loads with desktop layout | The app passes a custom `applicationNameForUserAgent`; ensure the website responds to mobile `User-Agent` |
| White flash on startup | This is the WebView initialising; the loading overlay covers it |
| Android back button exits app | Normal behaviour when there is no more history to go back through |
| iOS file upload doesn't work | Ensure the app is built with EAS and photo library permissions are granted |

---

## Disclaimer

This is a legitimate native mobile wrapper for [JambGenius](https://jambgenius.app). The app loads the website inside a WebView and does not modify or scrape the website content. All intellectual property belongs to the JambGenius team.
