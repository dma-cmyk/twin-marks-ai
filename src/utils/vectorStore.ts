import { openDB } from 'idb';
import type { DBSchema } from 'idb';

interface VectorDB extends DBSchema {
  vectors: {
    key: string; // URL
    value: {
      url: string;
      title: string;
      vector: number[];
      timestamp: number;
      textContent?: string;
      description?: string;
      isSaved?: boolean; // New field
    };
    indexes: { 'by-url': string, 'by-saved': number };
  };
}

const DB_NAME = 'TwinMarksVectorDB';
const STORE_NAME = 'vectors';
const DB_VERSION = 2;

const normalizeUrl = (url: string): string => {
    try {
        const urlObj = new URL(url);
        urlObj.hash = ''; 
        let normalized = urlObj.toString();
        if (normalized.endsWith('/')) {
            normalized = normalized.slice(0, -1);
        }
        return normalized;
    } catch (e) {
        return url;
    }
};

export const initDB = async () => {
  return openDB<VectorDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
        store.createIndex('by-url', 'url');
        store.createIndex('by-saved', 'isSaved');
      }
    },
  });
};

export const storeVector = async (url: string, title: string, vector: number[], textContent?: string, description?: string, isSaved?: boolean) => {
  const normUrl = normalizeUrl(url);
  const db = await initDB();
  const existing = await db.get(STORE_NAME, normUrl);
  await db.put(STORE_NAME, {
    url: normUrl,
    title,
    vector,
    timestamp: Date.now(),
    textContent: textContent?.substring(0, 500),
    description,
    isSaved: isSaved !== undefined ? isSaved : (existing?.isSaved || false)
  });
};

export const getVector = async (url: string) => {
  const normUrl = normalizeUrl(url);
  const db = await initDB();
  return db.get(STORE_NAME, normUrl);
};

export const getAllVectors = async () => {
    const db = await initDB();
    return db.getAll(STORE_NAME);
};

export const removeVector = async (url: string) => {
    const normUrl = normalizeUrl(url);
    const db = await initDB();
    return db.delete(STORE_NAME, normUrl);
};

export const toggleSaved = async (url: string) => {
    const normUrl = normalizeUrl(url);
    const db = await initDB();
    const item = await db.get(STORE_NAME, normUrl);
    if (item) {
        item.isSaved = !item.isSaved;
        await db.put(STORE_NAME, item);
        return item.isSaved;
    }
    return false;
};

export const markAllAsSaved = async () => {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const items = await store.getAll();
    for (const item of items) {
        item.isSaved = true;
        await store.put(item);
    }
    await tx.done;
    return items.length;
};

export const getSavedVectors = async () => {
    const db = await initDB();
    const vectors = await db.getAll(STORE_NAME);
    return vectors.filter(v => v.isSaved);
};

export const exportData = async (): Promise<string> => {
    const vectors = await getAllVectors();
    return JSON.stringify(vectors, null, 2);
};

export const importData = async (jsonString: string): Promise<number> => {
    try {
        const data = JSON.parse(jsonString) as VectorDB['vectors']['value'][];
        if (!Array.isArray(data)) throw new Error('Invalid data format');
        
        const db = await initDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        
        let count = 0;
        for (const item of data) {
            if (item.url && item.vector) {
                item.url = normalizeUrl(item.url);
                await store.put(item);
                count++;
            }
        }
        await tx.done;
        return count;
    } catch (e) {
        console.error('Import failed', e);
        throw e;
    }
};
export const clearAllVectors = async () => {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await tx.objectStore(STORE_NAME).clear();
    await tx.done;
};
