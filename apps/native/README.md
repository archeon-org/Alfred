# Archeon Native (React Native / Expo)

The mobile application for Archeon, built with **React Native**, **Expo**, and **NativeWind** (TailwindCSS). Available for both iOS and Android.

## Features

- 📄 **Document Upload** - Capture photos or select files to upload
- 📷 **Document Scanner** - Built-in document scanning with edge detection
- 🔍 **Search** - Semantic and keyword search across all documents
- 🧠 **Second Brain Q&A** - Ask questions and get AI-powered answers
- 🔐 **Secure Authentication** - JWT-based auth with biometric support
- 📱 **Offline Support** - View cached documents without internet

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **Expo** | React Native framework & build tools (SDK 54) |
| **React Native** | Cross-platform mobile development |
| **NativeWind** | TailwindCSS for React Native |
| **Expo Router** | File-based navigation |
| **React Query** | Data fetching & caching |
| **React Hook Form + Zod** | Form handling & validation |

## Prerequisites

Before running the native app, ensure you have:

- **Node.js 20+** and **Yarn**
- **Backend services running** (Gate API at minimum)
- For iOS: macOS with Xcode installed
- For Android: Android Studio with emulator configured
- For physical device: Expo Go app installed

## Quick Start

### 1. Start Backend Services

First, ensure the backend is running:

```bash
# From the archeon root directory
cd /path/to/archeon

# Start all backend services with Docker
yarn docker:dev

# Wait until Gate is ready (http://localhost:3000)
```

### 2. Install Dependencies

```bash
cd apps/native

# Install dependencies
yarn install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your API URL:

```bash
# For iOS Simulator
EXPO_PUBLIC_API_URL=http://localhost:3000/api

# For Android Emulator
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api

# For physical device (use ngrok)
# 1. Run: ngrok http 3000
# 2. Use the https URL
EXPO_PUBLIC_API_URL=https://your-ngrok-url.ngrok-free.app/api
```

### 4. Build Shared Packages

The native app depends on shared TypeScript packages:

```bash
# From project root
yarn build:packages
```

### 5. Run the App

**Option A: Expo Development Server (Expo Go)**

```bash
cd apps/native

# Start Expo dev server
yarn start:dev

# Press 'i' for iOS Simulator
# Press 'a' for Android Emulator
# Scan QR code with Expo Go app for physical device
```

**Option B: Native Build (Development Client)**

```bash
cd apps/native

# iOS (requires macOS + Xcode)
yarn ios

# Android (requires Android Studio)
yarn android

# Run on specific physical device
yarn run:ios:device
yarn run:android:device
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `yarn start:dev` | Start Expo development server |
| `yarn start:clean` | Start with cache cleared |
| `yarn ios` | Build and run on iOS Simulator |
| `yarn android` | Build and run on Android Emulator |
| `yarn run:ios:device` | Run on physical iOS device |
| `yarn run:android:device` | Run on physical Android device |
| `yarn prebuild:ios` | Generate native iOS project |
| `yarn prebuild:android` | Generate native Android project |

## Connecting to Local Backend

### iOS Simulator

The simulator can access `localhost` directly:

```bash
EXPO_PUBLIC_API_URL=http://localhost:3000/api
```

### Android Emulator

Android emulator uses a special IP for host machine:

```bash
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api
```

### Physical Device

Physical devices cannot access `localhost`. Use one of these options:

**Option 1: ngrok (Recommended)**

```bash
# Terminal 1: Start your backend
yarn docker:dev

# Terminal 2: Expose local API via ngrok
ngrok http 3000

# Copy the HTTPS URL to .env
EXPO_PUBLIC_API_URL=https://abc123.ngrok-free.app/api
```

**Option 2: Local Network IP**

Find your computer's IP address and use it:

```bash
# macOS
ipconfig getifaddr en0

# Then in .env
EXPO_PUBLIC_API_URL=http://192.168.1.XXX:3000/api
```

## Building for Production

### Using EAS Build (Recommended)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build for iOS
eas build --platform ios --profile production

# Build for Android
eas build --platform android --profile production
```

### Local Production Builds

```bash
# iOS (requires Apple Developer account)
yarn build:ios:local:prod

# Android
yarn build:android:local:prod
```

## Troubleshooting

### "Cannot connect to API"

1. Ensure backend is running: `curl http://localhost:3000/api/health`
2. Check `.env` has correct `EXPO_PUBLIC_API_URL`
3. For physical device, use ngrok or local IP (not localhost)

### "Build failed" on iOS

```bash
# Clean and reinstall pods
cd ios
rm -rf Pods Podfile.lock
pod install
cd ..
yarn ios
```

### "Metro bundler stuck"

```bash
# Clear all caches
yarn start:clean

# Or manually clear
npx expo start --clear
rm -rf node_modules/.cache
```

### "@archeon-org/types not found"

Rebuild shared packages:

```bash
# From project root
yarn build:packages

# Then restart metro
yarn start:clean
```

### White screen on app launch

Check that the API URL is correctly configured:

```bash
# Verify .env is loaded
console.log(process.env.EXPO_PUBLIC_API_URL);
```

## Development Tips

### Hot Reload

Expo provides instant hot reload - changes to your code are reflected immediately in the app without restarting.

### Debugging

- **React Native Debugger**: Press `j` in the terminal to open debugger
- **Expo DevTools**: Access via the Expo dashboard
- **Console Logs**: Visible in the terminal running Metro

### Styling with NativeWind

```tsx
import { View, Text } from "react-native";

export function MyComponent() {
  return (
    <View className="flex-1 bg-white p-4">
      <Text className="text-xl font-bold text-gray-900">
        Hello, Archeon!
      </Text>
    </View>
  );
}
```

## License

UNLICENSED - Archeon Organization
