import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url),
  cache =
    process.env.DRAWSKETCH_NATIVE_CACHE ||
    "/workspace/.cache/drawsketch-native";
let configured = {};
try {
  configured = JSON.parse(
    readFileSync(join(cache, "environment.json"), "utf8"),
  );
} catch {}
const env = { ...process.env, ...configured };
const signed = process.argv.includes("--release");
if (signed) {
  for (const key of [
    "DRAWSKETCH_ANDROID_KEYSTORE",
    "DRAWSKETCH_ANDROID_STORE_PASSWORD",
    "DRAWSKETCH_ANDROID_KEY_ALIAS",
    "DRAWSKETCH_ANDROID_KEY_PASSWORD",
  ])
    if (!env[key])
      throw new Error(
        `Configure ${key} securely before building Android release packages.`,
      );
  if (!existsSync(env.DRAWSKETCH_ANDROID_KEYSTORE))
    throw new Error("The Android signing keystore file is unavailable.");
}
if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) {
  console.error(
    "Set ANDROID_HOME and JAVA_HOME, or run: python3 scripts/setup-android.py",
  );
  process.exit(1);
}
for (const args of [
  ["run", "build"],
  ["exec", "--", "cap", "sync", "android"],
]) {
  const result = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    args,
    { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
const wrapper = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const result = spawnSync(
  wrapper,
  [
    "--no-daemon",
    "--max-workers=2",
    ...(signed ? ["assembleRelease", "bundleRelease"] : ["assembleDebug"]),
  ],
  {
    cwd: new URL("../android/", import.meta.url),
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);
if (result.status !== 0) process.exit(result.status || 1);
const apk = new URL(
  signed
    ? "../android/app/build/outputs/apk/release/app-release.apk"
    : "../android/app/build/outputs/apk/debug/app-debug.apk",
  import.meta.url,
);
if (!existsSync(apk))
  throw new Error("The Android build completed without the expected APK");
const version = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
mkdirSync(new URL("../release/", import.meta.url), { recursive: true });
const destination = new URL(
  `../release/DrawSketch-${version}-android-${signed ? "signed" : "debug"}.apk`,
  import.meta.url,
);
copyFileSync(apk, destination);
console.log(`Installable test APK: ${destination.pathname}`);
if (signed)
  copyFileSync(
    new URL(
      "../android/app/build/outputs/bundle/release/app-release.aab",
      import.meta.url,
    ),
    new URL(`../release/DrawSketch-${version}-android.aab`, import.meta.url),
  );
