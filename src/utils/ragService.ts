import { generateText } from './embedding';
import type { SearchResult } from './vectorSearch';
import { getAllVectors, initDB } from './vectorStore';
import { selectRelevantCategories } from './categoryService';
import { similarity } from 'ml-distance';

export interface RAGAnswer {
  answer: string;
  sources: { title: string; url: string }[];
}

export const generateRAGAnswer = async (
  query: string,
  searchResults: SearchResult[], // 通常の全件検索結果
  apiKey: string,
  modelName: string = 'models/gemini-2.5-flash-lite',
  embeddingModelName: string = 'models/embedding-001',
  skipCategorySelection: boolean = false
): Promise<RAGAnswer> => {
  if (!apiKey) throw new Error('API Key is missing');

  // 1. カテゴリベースの事前絞り込み
  const storage = await chrome.storage.local.get(['aiCategories']);
  const aiCategories = storage.aiCategories;
  let filteredContextItems: any[] = [];
  let selectedCategoryNames: string[] = [];

  if (!skipCategorySelection && aiCategories && Array.isArray(aiCategories) && aiCategories.length > 0) {
      console.log('Phase 1: Selecting relevant categories...');
      selectedCategoryNames = await selectRelevantCategories(query, aiCategories, apiKey, modelName);
      console.log('Selected Categories:', selectedCategoryNames);

      if (selectedCategoryNames.length > 0) {
          // 2. 選択されたカテゴリに属するブックマークをDBから抽出
          await initDB();
          const allVectors = await getAllVectors();
          
          // カテゴリ一致するものをフィルタ
          const bookmarksInCategories = allVectors.filter((v: any) => 
              v.category && selectedCategoryNames.includes(v.category)
          );

          if (bookmarksInCategories.length > 0) {
              // 3. その中でクエリとのコサイン類似度が高いものを抽出
              const queryVector = await (await import('./embedding')).getEmbedding(query, apiKey, embeddingModelName);
              
              const ranked = bookmarksInCategories.map((v: any) => ({
                  ...v,
                  score: similarity.cosine(queryVector, v.vector)
              })).sort((a: any, b: any) => b.score - a.score);

              filteredContextItems = ranked.slice(0, 7).map((v: any) => ({
                 title: v.title,
                 url: v.url,
                 content: v.textContent || v.description || 'No content available',
                 score: v.score,
                 category: v.category
              }));
          }
      }
  }

  // フォールバック: カテゴリ絞り込みで何も得られなかった場合は通常の検索結果を使用
  if (filteredContextItems.length === 0) {
      console.log('Phase 1 Fallback: Using global search results');
      const allVectors = await getAllVectors();
      filteredContextItems = searchResults.slice(0, 5).map((res: SearchResult) => {
        const fullData = allVectors.find((v: any) => v.url === res.url);
        return {
          title: res.title,
          url: res.url,
          content: (fullData as any)?.textContent || res.description || 'No content available',
          score: res.score
        };
      });
  }

  if (filteredContextItems.length === 0) {
    console.log('No context items found even after fallback');
    return {
      answer: "関連するブックマークの情報が不足しているため、適切な回答を生成できませんでした。より具体的なキーワードで検索するか、ブックマークを追加してください。",
      sources: []
    };
  }

  // 2. プロンプトの構築
  const contextString = filteredContextItems
    .map((item, idx) => `[Source ${idx + 1}] (${item.category || 'Global'})\nTitle: ${item.title}\nURL: ${item.url}\nContent: ${item.content}`)
    .join('\n\n');

  const prompt = `あなたはブックマーク管理アシスタントです。
以下の「ユーザーのこれまでのブックマーク内容」を知識ソースとして、ユーザーの質問に日本語で回答してください。

### 回答ルール:
1. **必ず提供されたブックマークの内容を最優先**して回答してください。
2. 回答の中で、どのブックマークの情報を参照したかを **[1], [2] のような形式で必ずインライン引用**してください。
3. 複数のソースにまたがる情報は [1][2] と記述してください。
4. 提供された情報だけでは不十分な場合のみ、一般的な知識で補足してください。その際、補足である旨を明記してください。
5. ユーザーが探している内容がブックマーク内に見当たらない場合は、その旨を正直に伝えてください。

ユーザーの質問: ${query}

---
ユーザーのブックマーク詳細 (引用番号はこのリストの順序 [1]〜[5] に対応):
${contextString}
---

回答はMarkdown形式で出力してください。`;

  // 3. 回答生成
  const answerText = await generateText(prompt, apiKey, modelName);

  return {
    answer: answerText,
    sources: filteredContextItems.map(item => ({ title: item.title, url: item.url }))
  };
};
