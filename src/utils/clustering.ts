import { kmeans } from 'ml-kmeans';
import { getAllVectors } from './vectorStore';
import { generateText } from './embedding';

export interface Cluster {
  id: number;
  items: { url: string; title: string; tags?: string[] }[];
  name?: string;
  centroid?: number[];
}

export const nameClusters = async (
    validClusters: Cluster[], 
    apiKey: string, 
    modelName: string, 
    namingInstruction?: string,
    isMapLabel?: boolean,
    forbiddenNames?: string[]
): Promise<void> => {
  if (validClusters.length === 0) return;

  const clustersContext = validClusters.map((c, idx) => {
      const details = c.items.map(i => {
          const tagInfo = (i.tags && i.tags.length > 0) ? ` [Tags: ${i.tags.join(', ')}]` : '';
          return `${i.title}${tagInfo}`;
      }).slice(0, 10).join('\n - ');
      
      const centroidInfo = c.centroid ? `\n[Semantic Centroid Sample: ${c.centroid.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]` : '';
      
      return `### Group ${idx + 1}${centroidInfo}\n${details}`;
  }).join('\n\n');

  const instruction = namingInstruction 
      ? `命名ルール: "${namingInstruction}"。このルールに厳密に従ってください。` 
      : '簡潔で分かりやすい日本語のカテゴリ名（最大3単語）。';

  const prompt = `
    あなたはブックマーク整理と情報の視覚化のプロフェッショナルです。
    提供されたウェブサイトのグループ（タイトル、タグ、およびベクトル空間上の重心情報）を分析し、それぞれの内容を的確に表す詳細なカテゴリ名を生成してください。

    ### 指導原則:
    - 各カテゴリ名は、グループの主要なテーマを具体的に捉えてください（例：「技術」ではなく「React・フロントエンド開発」）。
    - ページに付与されているタグ情報を積極的に活用して、より専門的な名前を付けてください。
    - 名前は簡潔な日本語で、最大3〜4単語程度に収めてください。
    - 各グループにつき1つの名前を出力してください。
    ${isMapLabel ? `- **最優先事項: 全てのカテゴリ名は完全な一意（ユニーク）であり、互いに類似・重複しないようにしてください。**` : ''}
    ${isMapLabel ? `- **類似性の考慮: 重心ベクトル情報に基づき、意味的に近いグループ同士であっても、その微細な違い（例：一方は「基本」、もう一方は「応用」など）を反映して区別できる名前を付けてください。**` : ''}
    ${isMapLabel ? `- **禁止事項: 「(2)」「(3)」のような数値サフィックス（付番）による重複回避は「絶対に」行わないでください。代わりに、より具体的で詳細な、文脈に沿った別の名前を考案してください。**` : ''}
    ${(isMapLabel && forbiddenNames && forbiddenNames.length > 0) ? `- **禁止事項: 以下の名前は既に使用中、または使用予定のため絶対に使用しないでください: [${forbiddenNames.join(', ')}]**` : ''}

    ### グループ情報:
    ${clustersContext}

    ${instruction}
    
    出力は以下のJSON形式（文字列の配列）のみで行ってください。余計な説明は一切不要です。
    ["カテゴリ名1", "カテゴリ名2", ...]
  `;

  try {
      const responseText = await generateText(prompt, apiKey, modelName);
      const jsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const names = JSON.parse(jsonStr);
      
      if (Array.isArray(names) && names.length === validClusters.length) {
          const usedInBatch = new Set<string>(forbiddenNames || []);
          
          validClusters.forEach((c, i) => {
              let name = names[i];
              
              // Post-processing deduplication
              if (usedInBatch.has(name)) {
                  // Try to differentiate using tags
                  const clusterTags = [...new Set(c.items.flatMap(item => item.tags || []))];
                  const primaryTag = clusterTags.length > 0 ? clusterTags[0] : null;
                  
                  if (primaryTag && !usedInBatch.has(`${name} (${primaryTag})`)) {
                      name = `${name} (${primaryTag})`;
                  } else {
                      // Use a piece of the most unique-looking title in the cluster
                      const titleSnippet = c.items[0].title.split(/[\s・|/-]/)[0].substring(0, 8);
                      const altName = `${name} (${titleSnippet})`;
                      if (!usedInBatch.has(altName)) {
                          name = altName;
                      } else {
                          // Absolute fallback: still avoid numbers if possible, maybe add more context
                          name = `${name}・${c.items[0].title.substring(0, 12)}`;
                      }
                  }
              }
              
              // Last resort technical uniqueness (rarely reached if above logic works)
              let finalName = name;
              if (usedInBatch.has(finalName)) {
                // If we absolutely must, append a hash or unique ID snippet, but try to keep it semantic
                finalName = `${name} #${c.id + 1}`;
              }
              
              c.name = finalName;
              usedInBatch.add(finalName);
          });
      } else {
          throw new Error('Response length mismatch');
      }
  } catch (e) {
      console.error('Failed to name clusters in batch', e);
      // Re-throw to inform the caller that AI naming failed
      throw e;
  }
};

export const clusterBookmarks = async (k: number, apiKey: string, modelName: string, namingInstruction?: string): Promise<Cluster[]> => {
  const vectors = await getAllVectors();
  if (vectors.length === 0) return [];

  const n = vectors.length;
  const actualK = Math.min(k, n);
  
  const data = vectors.map(v => v.vector);
  const result = kmeans(data, actualK, { initialization: 'kmeans++' });

  const clusters: Cluster[] = Array.from({ length: actualK }).map((_, i) => ({
      id: i,
      items: []
  }));

  result.clusters.forEach((clusterIndex, i) => {
      clusters[clusterIndex].items.push({
          url: vectors[i].url,
          title: vectors[i].title
      });
  });

  const validClusters = clusters.filter(c => c.items.length > 0);
  
  // Assign centroids to valid clusters
  if (result.centroids) {
      validClusters.forEach(vc => {
          vc.centroid = result.centroids[vc.id];
      });
  }

  await nameClusters(validClusters, apiKey, modelName, namingInstruction);
  return validClusters;
};
