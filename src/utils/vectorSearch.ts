import { similarity } from 'ml-distance';
import { getAllVectors } from './vectorStore';

export interface SearchResult {
  url: string;
  title: string;
  score: number;
  description?: string;
}

export const findSimilarPages = async (targetVector: number[], limit: number = 5): Promise<SearchResult[]> => {
  const allVectors = await getAllVectors();
  
  if (!allVectors || allVectors.length === 0) return [];

  const results = allVectors.map(item => {
    // Cosine similarity
    const score = similarity.cosine(targetVector, item.vector);
    return {
      url: item.url,
      title: item.title,
      score: score,
      description: item.description
    };
  });

  // Sort by score descending (1 is identical, 0 is orthogonal)
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
};
