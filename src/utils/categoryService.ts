import { clusterBookmarks } from './clustering';
import { initDB } from './vectorStore';

export interface CategoryInfo {
  name: string;
  count: number;
}

/**
 * 全ブックマークを20の大カテゴリに分類し直し、DBを更新する
 */
export const syncCategories = async (apiKey: string, modelName: string): Promise<CategoryInfo[]> => {
  console.log('Syncing categories (K=20)...');
  
  // 1. クラスタリング実行
  const clusters = await clusterBookmarks(20, apiKey, modelName, '情報をマッピングするための20個の網羅的で大きなカテゴリ名。例えば「プログラミング・IT技術」「料理・レシピ」「映画・アニメ」など。');
  
  if (clusters.length === 0) return [];

  const db = await initDB();
  const tx = db.transaction('vectors', 'readwrite');
  const store = tx.objectStore('vectors');

  // 2. 各ブックマークにカテゴリ名を書き込む
  for (const cluster of clusters) {
    if (!cluster.name) continue;
    
    for (const item of cluster.items) {
      const existing = await store.get(item.url);
      if (existing) {
        existing.category = cluster.name;
        await store.put(existing);
      }
    }
  }

  await tx.done;

  // 3. キャッシュ用にカテゴリ一覧を返す
  const categoryStats = clusters.map(c => ({
    name: c.name || '未分類',
    count: c.items.length
  }));

  // 保存（RAG時に使用）
  await chrome.storage.local.set({ 
    aiCategories: categoryStats.map(c => c.name),
    lastCategoryUpdate: Date.now()
  });

  return categoryStats;
};

/**
 * クエリに基づいて関連するカテゴリをAIに選択させる
 */
export const selectRelevantCategories = async (
  query: string, 
  categories: string[], 
  apiKey: string, 
  modelName: string = 'gemini-1.5-flash'
): Promise<string[]> => {
  if (categories.length === 0) return [];

  const prompt = `
以下の検索クエリに最も関連性の高いカテゴリを、提供されたリストの中から最大3つ選んでください。
選んだカテゴリ名のみをJSON配列形式で出力してください。

検索クエリ: ${query}

カテゴリリスト:
${categories.join(', ')}

出力形式:
["カテゴリ名A", "カテゴリ名B"]
  `;

  try {
    const { generateText } = await import('./embedding');
    const responseText = await generateText(prompt, apiKey, modelName);
    const jsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const selected = JSON.parse(jsonStr);
    return Array.isArray(selected) ? selected : [];
  } catch (e) {
    console.error('Failed to select categories', e);
    return [];
  }
};
