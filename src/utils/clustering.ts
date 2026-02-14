import { kmeans } from 'ml-kmeans';
import { getAllVectors } from './vectorStore';
import { generateText } from './embedding';

interface Cluster {
  id: number;
  items: { url: string; title: string }[];
  name?: string;
}

export const clusterBookmarks = async (k: number, apiKey: string, modelName: string, namingInstruction?: string): Promise<Cluster[]> => {
  const vectors = await getAllVectors();
  if (vectors.length === 0) return [];

  // Prepare data for k-means
  const data = vectors.map(v => v.vector);
  
  // Perform k-means
  // Since ml-kmeans expects a 2D array, and our vectors are arrays of numbers, it fits.
  // Note: ml-kmeans initialization can be random.
  const result = kmeans(data, k, { initialization: 'kmeans++' });

  // Group items by cluster
  const clusters: Cluster[] = Array.from({ length: k }).map((_, i) => ({
      id: i,
      items: []
  }));

  result.clusters.forEach((clusterIndex, i) => {
      clusters[clusterIndex].items.push({
          url: vectors[i].url,
          title: vectors[i].title
      });
  });

  // Filter out empty clusters
  const validClusters = clusters.filter(c => c.items.length > 0);

  // Generate names for ALL clusters in a single batch to avoid Rate Limit (429)
  const clustersContext = validClusters.map((c, idx) => {
      const titles = c.items.map(i => i.title).slice(0, 3).join(', '); // Use top 3 titles
      return `Group ${idx + 1}: ${titles}`;
  }).join('\n\n');

  const instruction = namingInstruction 
      ? `命名ルール: "${namingInstruction}"。このルールに厳密に従ってください。` 
      : '簡潔で分かりやすい日本語のカテゴリ名（最大3単語）。';

  const prompt = `
    あなたはブックマーク整理アシスタントです。
    以下のウェブサイトのグループそれぞれに対して、適切なカテゴリ名を生成してください。

    ${clustersContext}

    ${instruction}
    
    出力は以下のJSON形式のみで行ってください。余計なマークダウンや説明は不要です。
    ["Group 1のカテゴリ名", "Group 2のカテゴリ名", ...]
  `;

  try {
      const responseText = await generateText(prompt, apiKey, modelName);
      // Clean up markdown code blocks if present
      const jsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const names = JSON.parse(jsonStr);
      
      if (Array.isArray(names) && names.length === validClusters.length) {
          validClusters.forEach((c, i) => {
              c.name = names[i];
          });
      } else {
          throw new Error('Response length mismatch');
      }
  } catch (e) {
      console.error('Failed to name clusters in batch', e);
      // Fallback
      validClusters.forEach((c) => {
          c.name = `カテゴリ ${c.id + 1}`;
      });
  }

  return validClusters;
};
