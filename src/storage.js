let database;
function openDatabase() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open("drawsketch-studio", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("documents", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = null;
      reject(request.error);
    };
    request.onblocked = () => {
      database = null;
      reject(new Error("Storage upgrade blocked"));
    };
  });
  return database;
}
export async function saveDocument(record) {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("documents", "readwrite");
    transaction.objectStore("documents").put(record);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
export async function getDocument(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("documents")
      .objectStore("documents")
      .get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function listDocuments() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("documents")
      .objectStore("documents")
      .getAll();
    request.onsuccess = () =>
      resolve(request.result.sort((a, b) => b.updatedAt - a.updatedAt));
    request.onerror = () => reject(request.error);
  });
}
