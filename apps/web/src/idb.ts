export interface Kv {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

const STORE = "kv";

export function openKv(dbName: string): Promise<Kv> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const run = <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) =>
        new Promise<T>((res, rej) => {
          const tx = db.transaction(STORE, mode);
          const r = fn(tx.objectStore(STORE));
          r.onerror = () => rej(r.error);
          if (mode === "readonly") {
            r.onsuccess = () => res(r.result);
            return;
          }
          // A write is only durable once the transaction commits: resolving on the request's
          // success would hide a later abort (quota exceeded, disk error) and lose the write.
          let result: T;
          r.onsuccess = () => { result = r.result; };
          tx.oncomplete = () => res(result);
          tx.onabort = () => rej(tx.error ?? r.error);
          tx.onerror = () => rej(tx.error ?? r.error);
        });
      resolve({
        get: <T,>(key: string) => run<T | undefined>("readonly", (s) => s.get(key) as IDBRequest<T | undefined>),
        set: (key, value) => run("readwrite", (s) => s.put(value, key)).then(() => undefined),
        del: (key) => run("readwrite", (s) => s.delete(key)).then(() => undefined),
        keys: () => run<IDBValidKey[]>("readonly", (s) => s.getAllKeys()).then((ks) => ks.map(String)),
      });
    };
  });
}
