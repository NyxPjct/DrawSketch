# Native builds and device validation

DrawSketch shares its drawing engine and translated interface between the PWA, Electron, and Capacitor. Native mobile exports write temporary files to the application's cache and open the system share sheet. Projects, masks, groups, backups, and PNGs use the same formats across platforms.

## Build prerequisites

Use Node.js 24 and `npm ci`. Electron 44 downloads its platform binary on first use. On a restricted cloud machine, keep caches writable and use Node's supported environment proxy:

```sh
export XDG_CACHE_HOME=/workspace/.cache
export electron_config_cache=/workspace/.cache/electron
export ELECTRON_BUILDER_CACHE=/workspace/.cache/electron-builder
export NODE_USE_ENV_PROXY=1
```

These settings select caches and existing proxy configuration; they do not disable TLS, checksums, or signing checks. Electron and builder tool archives are checked against their published package checksums. Do not change `HOME` or disable certificate verification.

### Desktop

```sh
npm run desktop
npm run desktop:pack
npm run test:native
```

The pack command builds fresh web assets and packages for the host OS. Linux produces AppImage and Debian packages. Windows produces an NSIS setup executable and a separate portable executable. macOS produces DMG and ZIP packages. Outputs go to `release/`, which is excluded from Git.

The desktop renderer has no Node.js access, uses context isolation and a sandbox, denies permission requests and external navigation, and loads local assets through a secure application protocol. Its preload exposes a platform flag only. Native smoke validation checks isolation, drawing pixels, IndexedDB recovery, and worker fill.

To cross-package a Windows ZIP on Linux without Wine:

```sh
npm run desktop:pack -- --win zip --x64
```

NSIS and portable executable creation additionally need a working Wine installation when cross-building. The bundled Wine 11 toolset did not load its required runtime DLLs on this cloud host; the native Windows CI job builds those installers on Windows.

Linux may need desktop runtime libraries (GTK 3, NSS, ALSA, and related Chromium libraries). The smoke script uses headless Ozone; its `--no-sandbox` switch is restricted to cloud automation. Normal app launch retains Electron sandboxing.

Desktop packages are unsigned test builds. Signed Windows/macOS distribution requires the publisher's certificates. macOS notarization and real macOS execution require macOS and the relevant Apple configuration.

### Android

Install JDK 21, Android SDK platform 36, build tools 35/36, and accept the SDK licenses. Set `JAVA_HOME` and `ANDROID_HOME` to these installations, or open `android/` in Android Studio.

For this Linux x86-64 cloud environment, the optional helper installs verified official Android tools and Temurin JDK into workspace-local caches:

```sh
python3 scripts/setup-android.py
npm run mobile:android
```

The helper uses official checksums and the provided environment CA when present. Java proxy properties are saved in its local Gradle cache. It preserves an existing Gradle configuration rather than overwriting it. Gradle's wrapper distribution has a pinned SHA-256.

`npm run mobile:android` builds current web assets, syncs Capacitor, compiles the debug application, and copies the APK to `release/DrawSketch-0.3.0-android-debug.apk`. Android 7/API 24 or later is required, with a current Android System WebView. The APK is installable for testing and uses Android debug signing. A Play Store release requires a publisher-controlled signing key and release AAB build; keys are never committed.

### iPhone and iPad

On macOS with the Xcode version required by Capacitor 8:

```sh
npm ci
npm run mobile:ios
```

This syncs the project and compiles an unsigned simulator application to `ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app`. Open `ios/App/App.xcodeproj` to select a physical device, configure the development team, and build with Apple provisioning. The checked-in privacy manifest declares the filesystem timestamp API reason used by the Filesystem plugin. Swift package dependencies are resolved by Xcode.

A simulator archive is not an installable IPA. This Linux cloud host cannot compile or run iOS or macOS apps.

## Automated package publication

[Native packages](../.github/workflows/native.yml) runs manually or on version tags. It validates the editor, builds desktop packages on each native host, builds the Android test APK, and compiles an iOS simulator app on macOS. Successful jobs upload artifacts. After editor validation succeeds, a tagged run publishes the packages from successful jobs to a GitHub Release. A failed platform job does not block packages that built successfully, and its missing package must not be described as available.

The workflow uses GitHub's repository-scoped token for release assets. It does not sign store packages, publish to app stores, or invent developer certificates. Check its status before downloading a package.

## Verification scope

The Linux cloud build verifies the browser editor, compiles an Android debug APK, Linux AppImage/Debian packages, and a Windows ZIP. The Windows NSIS/portable executable cross-build is blocked by the Wine runtime on this host and is handled by the native Windows job. Electron runtime automation checks the actual desktop engine. Windows cross-compilation does not establish Windows runtime compatibility. macOS/iOS compilation and execution are delegated to the native-host workflow and must be confirmed in its results. No physical pen or tablet is connected to this environment.

## Physical-device acceptance matrix

Record the device, OS, app build, WebView/browser version, pen model, and results for each run:

| Target                 | Required checks                                                                                                                       | Current hardware status               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| iPad + Apple Pencil    | Light/heavy pressure, upright/tilted strokes, palm resting before and during pen contact, hover where available, rotate, native share | Not run                               |
| Galaxy Tab + S Pen     | Pressure/tilt, palm before/during contact, finger drawing toggle, portrait/landscape, native share                                    | Not run                               |
| Windows + Wacom/Huion  | Driver pressure/tilt, pen-to-mouse transitions, high-DPI coordinates, shortcuts, file export/reopen                                   | Not run                               |
| Desktop mouse/trackpad | Selection transforms, zoom anchoring, layer/mask recovery, file exports                                                               | Browser and Linux Electron automation |
| Touch phone/tablet     | Two/three-finger tap, pinch/pan/rotate, hold eyedropper, drawer controls, backup import                                               | Synthetic Chromium multitouch only    |

For each physical target, draw with a resting palm, lift the pen while leaving the palm in place, and confirm no unintended marks or navigation occur. The app ignores touch during an active pen stroke and cancels provisional finger ink when multitouch navigation begins. Distinguishing a palm before the OS reports pen contact still depends on hardware and platform support; automated events do not prove it works on a real device.

Also reopen a masked/grouped project after force-closing the app, restore a checkpoint, export/import a whole-sketchbook backup, draw offline, and test a dense multilayer canvas near the intended size on the lowest-memory supported device. The 16-megapixel limit is a software bound, not a guarantee of low memory use on every device.
