import { build } from "electron-builder";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const fail = (message) => {
  throw new Error(message);
};
if (!["darwin", "win32"].includes(process.platform))
  fail("Signed desktop distribution requires a native Windows or macOS host.");
for (const key of ["CSC_LINK", "CSC_KEY_PASSWORD"])
  if (!process.env[key])
    fail(`Configure ${key} securely before building signed packages.`);
if (process.platform === "darwin") {
  if (!process.env.CSC_NAME)
    fail("CSC_NAME must select your Developer ID Application certificate.");
  const api = ["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"].every(
    (key) => process.env[key],
  );
  const account = [
    "APPLE_ID",
    "APPLE_APP_SPECIFIC_PASSWORD",
    "APPLE_TEAM_ID",
  ].every((key) => process.env[key]);
  if (!api && !account)
    fail(
      "Configure Apple notarization credentials before building signed Mac packages.",
    );
}
if (process.platform === "win32" && !process.env.WINDOWS_PUBLISHER_NAME)
  fail(
    "WINDOWS_PUBLISHER_NAME must match your code-signing certificate subject.",
  );
const result = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "build"],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32" },
);
if (result.status !== 0) process.exit(result.status || 1);
await build({
  projectDir: root,
  config: {
    extends: fileURLToPath(new URL("../electron-builder.yml", import.meta.url)),
    forceCodeSigning: true,
    publish: { provider: "github", owner: "NyxPjct", repo: "DrawSketch" },
    extraMetadata: { drawsketchDistribution: "signed" },
    ...(process.platform === "darwin"
      ? {
          mac: {
            identity: process.env.CSC_NAME,
            hardenedRuntime: true,
            notarize: true,
            entitlements: "electron/entitlements.mac.plist",
            entitlementsInherit: "electron/entitlements.mac.plist",
            target: [
              { target: "dmg", arch: ["x64", "arm64"] },
              { target: "zip", arch: ["x64", "arm64"] },
            ],
          },
        }
      : {
          win: {
            signExecutable: true,
            verifyUpdateCodeSignature: true,
            signtoolOptions: {
              publisherName: process.env.WINDOWS_PUBLISHER_NAME,
            },
          },
        }),
  },
  publish: "never",
});
