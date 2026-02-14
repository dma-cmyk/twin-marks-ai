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
    };
    indexes: { 'by-url': string };
  };
}

const DB_NAME = 'TwinMarksVectorDB';
const STORE_NAME = 'vectors';

export const initDB = async () => {
  return openDB<VectorDB>(DB_NAME, 1, {
    upgrade(db) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
      store.createIndex('by-url', 'url');
    },
  });
};

export const storeVector = async (url: string, title: string, vector: number[], textContent?: string, description?: string) => {
  const db = await initDB();
  await db.put(STORE_NAME, {
    url,
    title,
    vector,
    timestamp: Date.now(),
    textContent: textContent?.substring(0, 200), // Store only snippet to save space
    description
  });
};

export const getVector = async (url: string) => {
  const db = await initDB();
  return db.get(STORE_NAME, url);
};

export const getAllVectors = async () => {
    const db = await initDB();
    return db.getAll(STORE_NAME);
};

export const removeVector = async (url: string) => {
    const db = await initDB();
    return db.delete(STORE_NAME, url);
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
