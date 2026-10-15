let database;
function openDatabase() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open("drawsketch-studio", 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("documents"))
        db.createObjectStore("documents", { keyPath: "id" });
      if (!db.objectStoreNames.contains("versions"))
        db.createObjectStore("versions", { keyPath: "key" }).createIndex(
          "documentId",
          "documentId",
        );
    };
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
export async function saveDocument(record, forceCheckpoint = false) {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(["documents", "versions"], "readwrite");
    transaction.objectStore("documents").put(record);
    const versions = transaction.objectStore("versions"),
      query = versions.index("documentId").getAll(record.id);
    query.onsuccess = () => {
      const previous = query.result.sort((a, b) => b.createdAt - a.createdAt);
      if (
        forceCheckpoint ||
        !previous.length ||
        record.updatedAt - previous[0].createdAt >= 60_000
      ) {
        versions.put({
          key: `${record.id}:${record.updatedAt}:${crypto.randomUUID()}`,
          documentId: record.id,
          createdAt: record.updatedAt,
          title: record.title,
          data: record.data,
        });
        for (const old of previous.slice(11)) versions.delete(old.key);
      }
    };
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
export async function listVersions(documentId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("versions")
      .objectStore("versions")
      .index("documentId")
      .getAll(documentId);
    request.onsuccess = () =>
      resolve(request.result.sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(request.error);
  });
}
export async function importDocuments(records) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("documents", "readwrite");
    for (const record of records) tx.objectStore("documents").put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
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
