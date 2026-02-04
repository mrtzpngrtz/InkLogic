# InkLogic Android App

An Android port of InkLogic using Capacitor - Connect your Neo Smartpen to Gemini AI.

## Overview

This is a native Android application built with Capacitor that allows you to:
- Connect to a Neo Smartpen via Web Bluetooth
- Capture pen strokes in real-time
- Process sketches with Google Gemini AI (text responses and image generation)
- View history of generated content
- Manage settings and API configuration

## Key Features

- **Clean Mobile UI**: Based on the preview interface with mobile-optimized controls
- **Pen Integration**: Uses `web_pen_sdk` for Neo Smartpen connectivity
- **AI Processing**: Gemini API for text and image generation from sketches
- **Trigger Regions**: Automatic processing when drawing in specific areas
- **History Gallery**: Browse and manage previously generated content
- **Touch Gestures**: Pinch-to-zoom and pan for viewing images

## Prerequisites

- Node.js (v18+ recommended, though v21.7.3 works)
- npm or yarn
- Android Studio (for building and running the app)
- Java Development Kit (JDK) 17+
- Google Gemini API key

## Installation

### 1. Install Dependencies

```bash
cd android_app
npm install
```

### 2. Build the Web Assets

```bash
npm run build
```

### 3. Sync with Android Project

```bash
npx cap sync android
```

## Configuration

### Gemini API Setup

1. Obtain an API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Open the app and navigate to Settings (⚙ icon)
3. Enter your API key in the "Gemini API" section
4. Select your preferred model (Gemini 3 Flash or Pro)

### Trigger Regions (Optional)

The app uses predefined regions on the smartpen paper to trigger processing:
- **Text Trigger**: X: 50-60, Y: 80-88 (bottom-right area)
- **Image Trigger**: X: 40-50, Y: 80-88 (bottom-left area)

These can be adjusted in Settings.

## Running the App

### Development Mode

```bash
cd android_app
npm run dev
```

This starts a Vite development server at http://localhost:3000

### Build for Android

1. Open Android Studio:
```bash
cd android_app
npx cap open android
```

2. In Android Studio:
   - Wait for Gradle sync to complete
   - Connect an Android device or start an emulator
   - Click "Run" (green play button)

### Build APK

In Android Studio:
1. Go to `Build > Build Bundle(s) / APK(s) > Build APK(s)`
2. APK will be generated in `android_app/android/app/build/outputs/apk/`

## Project Structure

```
2026_02_inklogic_android/
├── android_app/                # Main application directory
│   ├── src/
│   │   ├── services/
│   │   │   ├── PenManager.js       # Neo Smartpen SDK integration
│   │   │   ├── GeminiService.js    # Gemini AI API calls
│   │   │   └── StorageManager.js   # LocalStorage & IndexedDB
│   │   ├── main.js                 # Application entry point
│   │   └── style.css              # Mobile-optimized styles
│   ├── index.html                  # Main HTML template
│   ├── vite.config.js             # Vite build configuration
│   ├── capacitor.config.json      # Capacitor configuration
│   └── android/                    # Native Android project
├── design/                     # Design assets
└── README.md                   # This file
```

## Architecture

### Browser-Compatible Services

All services have been refactored from the original Electron/Node.js version:

- **PenManager**: ES6 module, uses Web Bluetooth API
- **GeminiService**: Returns data URLs instead of file paths for images
- **StorageManager**: Uses localStorage and IndexedDB instead of filesystem

### Build System

- **Vite**: Fast web build tool with custom plugin for `.nproj` files
- **Capacitor**: Native runtime for web apps on mobile platforms
- **Polyfills**: Includes browserify-zlib, stream-browserify, and buffer for Node.js compatibility

## Troubleshooting

### Web Bluetooth Issues

- Ensure your Android device supports Bluetooth Low Energy (BLE)
- Grant Bluetooth permissions when prompted
- The app requires secure context (HTTPS or localhost)

### Build Errors

If you encounter module resolution errors:
```bash
cd android_app
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Gemini API Errors

- Verify your API key is correct
- Check API quota limits in Google Cloud Console
- Ensure you have the correct model name selected

## Known Limitations

- Web Bluetooth support varies by device and Android version
- Some PostCSS packages show engine warnings but work correctly
- The `web_pen_sdk` relies on browser APIs that may not be fully stable

## Development

### Adding New Features

1. Modify source files in `android_app/src/`
2. Rebuild: `npm run build`
3. Sync: `npx cap sync android`
4. Test in Android Studio

### Debugging

- Use Chrome DevTools for web debugging: `chrome://inspect`
- Use Android Studio's Logcat for native logs
- Enable verbose logging in `capacitor.config.json`

## License

This project is based on [InkLogic](https://github.com/mrtzpngrtz/InkLogic) by mrtzpngrtz.

## Credits

- Original InkLogic application
- Capacitor by Ionic
- web_pen_sdk for Neo Smartpen integration
- Google Gemini API
