# Signed distribution and desktop updates

The public 0.4.0 release continues to provide test packages: Windows/Linux packages without a publisher signature, ad hoc signed macOS packages without notarization, a debug Android APK, and an iOS simulator archive. Publisher certificates and physical-device provisioning are not configured in this repository or cloud environment. The signed build paths below are implemented but cannot be validated end to end without the publisher's accounts and credentials. They do not publish to app stores.

## Desktop

On the target native OS, run `npm ci` and configure signing credentials securely outside the repository:

| Target  | Required environment variables                                                                                                                                                                                                                |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows | `CSC_LINK`, `CSC_KEY_PASSWORD`, `WINDOWS_PUBLISHER_NAME` matching the certificate subject                                                                                                                                                     |
| macOS   | `CSC_LINK`, `CSC_KEY_PASSWORD`, `CSC_NAME` selecting a Developer ID Application identity; plus `APPLE_API_KEY` (path), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, or `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` for notarization |

Run `npm run desktop:signed`. The script checks prerequisites, builds fresh web assets, requires code signing, and packages native installers. Mac builds enable hardened runtime, JIT entitlement, signing, and notarization for Intel and Apple Silicon. Windows keeps signature verification enabled for updates. Missing credentials fail the signed path instead of silently falling back to an unsigned package. `npm run desktop:pack` remains available for test builds.

Signed builds have `drawsketchDistribution: signed` in their packaged metadata. Only packaged Windows/macOS signed builds enable electron-updater. Development, Linux, and test builds show the current version and explain that updates must come from GitHub Releases. They never attempt to install a downloaded executable through this API.

In **Settings → App updates**, checks contact the repository's GitHub release feed over HTTPS. Daily checks are opt-in and saved in the desktop data directory; even when enabled, downloads require a user click. The app prevents downgrades, does not install on quit automatically, and requires a successful drawing autosave before **Save and restart to install**. Only the local studio's main frame can invoke a fixed set of update actions through isolated IPC. No remote URL, arbitrary channel, command, or filesystem path is exposed to the renderer.

To publish a signed update, create a new version tag, verify the signed package signatures and the actual install/update flow on both target OSes, then attach the matching installers, ZIPs, `latest.yml`/`latest-mac.yml`, and blockmaps to that release. Keep the same application ID and publisher identity. The standard test-package workflow does not generate an update feed, preventing test installers from being advertised as signed updates. Signed build artifacts alone do not establish that an update was published or installed.

## Android release APK and AAB

Configure:

- `DRAWSKETCH_ANDROID_KEYSTORE`: absolute path to your existing publisher-controlled keystore.
- `DRAWSKETCH_ANDROID_STORE_PASSWORD`, `DRAWSKETCH_ANDROID_KEY_ALIAS`, `DRAWSKETCH_ANDROID_KEY_PASSWORD`.
- The SDK/JDK prerequisites from [NATIVE.md](NATIVE.md).

Run `npm run mobile:android:release`. It compiles signed release APK and AAB files into `release/`. The helper refuses to run the release path without the keystore and required variables. Keep this key backed up securely; losing or replacing an application signing identity can prevent upgrades. Release package version code 5 corresponds to version 0.4.0. The debug build remains separate and may use a different key, so export a sketchbook backup before replacing a test installation.

## Physical iPhone and iPad

On macOS with compatible Xcode, first configure an Apple signing certificate, a provisioning profile allowing the application ID `com.nyxp.drawsketch`, and the intended devices/distribution method. Set `APPLE_TEAM_ID` and `DRAWSKETCH_IOS_EXPORT_OPTIONS` to the path of your valid Xcode export-options plist. Run `npm run mobile:ios:device`.

The script builds an iPhoneOS Release archive, uses Xcode provisioning, and exports to `release/ios/`. A development or ad hoc IPA installs only where its profile permits; App Store Connect distribution follows Apple's submission process. The existing `npm run mobile:ios` command still produces a simulator app and does not need device signing. This Linux environment cannot compile or install a physical iOS application.

## GitHub Actions

The manual [Signed distribution workflow](../.github/workflows/signed.yml) builds an existing matching version tag after editor validation. It uses the `signed-distribution` GitHub Environment and uploads artifacts for publisher review. It does not upload to stores or promote them to a public signed update automatically.

Configure these GitHub Environment secrets for the chosen target:

| Target  | Secrets                                                                                                                                      |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows | `WINDOWS_CERTIFICATE_BASE64`, `WINDOWS_CERTIFICATE_PASSWORD`, `WINDOWS_PUBLISHER_NAME`                                                       |
| Mac     | `MAC_CERTIFICATE_BASE64`, `MAC_CERTIFICATE_PASSWORD`, `MAC_SIGNING_IDENTITY`, `APPLE_API_KEY_BASE64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` |
| Android | `ANDROID_KEYSTORE_BASE64`, `ANDROID_STORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`                                             |
| iOS     | `IOS_CERTIFICATE_BASE64`, `IOS_CERTIFICATE_PASSWORD`, `IOS_PROFILE_BASE64`, `IOS_EXPORT_OPTIONS_BASE64`, `APPLE_TEAM_ID`                     |

Signing files are decoded only inside the ephemeral runner, excluded from uploaded artifacts, and never committed. The iOS signing helper creates a temporary keychain, installs the publisher's certificate/profile, and removes the temporary keychain in workflow cleanup. Use your GitHub Environment's access controls for these credentials. Do not send passwords, keys, or certificates through chat.

Before promoting any signed distribution, verify signatures with the platform's tools and perform an actual install, save/reopen, update, and native share test. The cloud validation covers test packages and update API isolation; it does not claim publisher signing, notarization, store acceptance, physical stylus validation, or a live signed-update round trip.
