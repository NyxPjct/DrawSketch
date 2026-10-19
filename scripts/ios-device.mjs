import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
if (process.platform !== "darwin")
  throw new Error("An installable iOS archive requires macOS and Xcode.");
if (
  !process.env.APPLE_TEAM_ID ||
  !process.env.DRAWSKETCH_IOS_EXPORT_OPTIONS ||
  !existsSync(process.env.DRAWSKETCH_IOS_EXPORT_OPTIONS)
)
  throw new Error(
    "Configure APPLE_TEAM_ID, a valid DRAWSKETCH_IOS_EXPORT_OPTIONS plist, and Apple signing/provisioning in Xcode first.",
  );
const root = new URL("../", import.meta.url);
mkdirSync(new URL("../release/ios", import.meta.url), { recursive: true });
for (const [command, args] of [
  ["npm", ["run", "build"]],
  ["npm", ["exec", "--", "cap", "sync", "ios"]],
  [
    "xcodebuild",
    [
      "-project",
      "ios/App/App.xcodeproj",
      "-scheme",
      "App",
      "-configuration",
      "Release",
      "-sdk",
      "iphoneos",
      "-destination",
      "generic/platform=iOS",
      "-archivePath",
      "release/DrawSketch.xcarchive",
      `DEVELOPMENT_TEAM=${process.env.APPLE_TEAM_ID}`,
      ...(process.env.DRAWSKETCH_IOS_PROFILE_UUID
        ? [
            "CODE_SIGN_STYLE=Manual",
            `PROVISIONING_PROFILE_SPECIFIER=${process.env.DRAWSKETCH_IOS_PROFILE_UUID}`,
            `CODE_SIGN_IDENTITY=${process.env.DRAWSKETCH_IOS_SIGNING_IDENTITY || "Apple Distribution"}`,
          ]
        : []),
      "-allowProvisioningUpdates",
      "archive",
    ],
  ],
  [
    "xcodebuild",
    [
      "-exportArchive",
      "-archivePath",
      "release/DrawSketch.xcarchive",
      "-exportPath",
      "release/ios",
      "-exportOptionsPlist",
      process.env.DRAWSKETCH_IOS_EXPORT_OPTIONS,
      "-allowProvisioningUpdates",
    ],
  ],
]) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(
  "Signed iOS export: release/ios. Install only on devices permitted by the provisioning profile.",
);
