import { openDB } from 'idb';
import type { DBSchema } from 'idb';

interface VectorDB extends DBSchema {
  vectors: {
    key: string; // URL
    value: {
      url: string;
      title: string;
      vector: number[];
      semanticVector?: number[]; // New field for summary+tag based vector
      timestamp: number;
      textContent?: string;
      description?: string;
      isSaved?: boolean;
      tags?: string[];
      category?: string; // New field for RAG optimization
    };
    indexes: { 'by-url': string, 'by-saved': number, 'by-category': string, 'by-semantic': number };
  };
}

const DB_NAME = 'TwinMarksVectorDB';
const STORE_NAME = 'vectors';
const DB_VERSION = 5;

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
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
        store.createIndex('by-url', 'url');
        store.createIndex('by-saved', 'isSaved');
      }
      if (oldVersion < 4) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
          store.createIndex('by-url', 'url');
          store.createIndex('by-saved', 'isSaved');
          store.createIndex('by-category', 'category');
        } else {
          const store = transaction.objectStore(STORE_NAME);
          if (store && !store.indexNames.contains('by-category')) {
            (store as any).createIndex('by-category', 'category');
          }
        }
      }
      if (oldVersion < 5) {
        const store = transaction.objectStore(STORE_NAME);
        if (store && !store.indexNames.contains('by-semantic')) {
           // We can't easily index the vector itself, but we can't hide it either
           // Actually, indexing a regular field is fine if needed for existence checks
        }
      }
    },
  });
};

export const storeVector = async (
  url: string, 
  title: string, 
  vector: number[], 
  textContent?: string, 
  description?: string, 
  isSaved?: boolean, 
  newAITags?: string[],
  semanticVector?: number[]
) => {
  const normUrl = normalizeUrl(url);
  const db = await initDB();
  const existing = await db.get(STORE_NAME, normUrl);

  let mergedTags: string[] = [];
  const existingTags = existing?.tags || [];
  const incomingTags = newAITags || [];

  // 既存タグと新規AIタグをマージし、重複を排除
  const allTagsSet = new Set([...existingTags, ...incomingTags]);
  mergedTags = Array.from(allTagsSet).sort(); // タグをソートして一貫性を保つ (任意)

  await db.put(STORE_NAME, {
    url: normUrl,
    title,
    vector,
    semanticVector: semanticVector || existing?.semanticVector,
    timestamp: Date.now(),
    textContent: textContent?.substring(0, 2000),
    description,
    isSaved: isSaved !== undefined ? isSaved : (existing?.isSaved || false),
    tags: mergedTags,
    category: existing?.category // カテゴリ情報を保持
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
            if (item && item.url && item.vector) { // Added item existence check
                const normalizedItem = {
                    ...item,
                    url: normalizeUrl(item.url)
                };
                await store.put(normalizedItem);
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
export const updateItemTags = async (url: string, tags: string[]) => {
    const normUrl = normalizeUrl(url);
    const db = await initDB();
    const item = await db.get(STORE_NAME, normUrl);
    if (item) {
        item.tags = tags;
        await db.put(STORE_NAME, item);
    }
};

export const clearAllVectors = async () => {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await tx.objectStore(STORE_NAME).clear();
    await tx.done;
};

export const getCategoryStats = async (): Promise<{ name: string; count: number }[]> => {
    const db = await initDB();
    const items = await db.getAll(STORE_NAME);
    const stats: Record<string, number> = {};
    
    items.forEach(item => {
        const cat = item.category || '未分類';
        stats[cat] = (stats[cat] || 0) + 1;
    });
    
    return Object.entries(stats)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
};
