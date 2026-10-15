import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
if (process.platform !== "darwin") {
  console.error(
    "iOS compilation requires macOS and Xcode. The complete project is in ios/App/App.xcodeproj.",
  );
  process.exit(1);
}
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
      "Debug",
      "-sdk",
      "iphonesimulator",
      "-destination",
      "generic/platform=iOS Simulator",
      "-derivedDataPath",
      "ios/DerivedData",
      "CODE_SIGNING_ALLOWED=NO",
      "build",
    ],
  ],
]) {
  const result = spawnSync(command, args, {
    cwd: new URL("../", import.meta.url),
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
mkdirSync(new URL("../release/", import.meta.url), { recursive: true });
console.log(
  "Built simulator application: ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app",
);
