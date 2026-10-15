import { Capacitor } from "@capacitor/core";

export async function saveFile(blob, name) {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const path = `exports/${name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").slice(0, 100)}`;
  const result = await Filesystem.writeFile({
    path,
    data,
    directory: Directory.Cache,
    recursive: true,
  });
  await Share.share({ title: name, url: result.uri });
}
saveFile.isNative = () => Capacitor.isNativePlatform();
