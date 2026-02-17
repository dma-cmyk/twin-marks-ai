import { generateText } from './embedding';

export const optimizeTags = async (currentTags: string[], apiKey: string, modelName: string, targetCount?: number): Promise<Record<string, string>> => {
    if (!currentTags || currentTags.length === 0) return {};

    const countInstruction = targetCount 
        ? `目標タグ数: **最大 ${targetCount} 個**\n重要: **この数を絶対に超えないでください。**\n目標数に収めるために、細かい分類は捨てて、大胆に大きなカテゴリ（例: "技術", "デザイン", "ビジネス", "生活", "ツール"）へ統合してください。\nどうしても分類できないものは "その他" にまとめても構いません。多少の意味の広がりは許容します。`
        : `過度な統合（抽象化）は避け、明確な表記揺れや完全な同義語を中心に整理してください。`;

    const prompt = `
以下のタグリストから、タグを整理・統合するためのマッピングを作成してください。

タグリスト:
${JSON.stringify(currentTags)}

${countInstruction}

要件:
1.  **JSON形式** で返してください。
2.  フォーマットは { "変更元のタグ": "変更後のタグ", ... } です。
3.  **すべてのタグ**（変更なしのものも含めて）について、どのタグにマッピングされるかを出力に含めることを推奨します（特に目標数が指定されている場合）。ただし、変更がない場合は省略しても構いませんが、数が減っていることを確認するために主要な統合は必ず含めてください。
4.  変更後のタグは、**原則として日本語**（カタカナ、漢字、ひらがな）を使用してください。ただし、"React", "Python", "AWS" などの一般的な技術用語や固有名詞は英語のままで構いません（和製英語やカタカナ語が一般的な場合はそちらを優先）。
5.  大文字小文字の違いだけの重複も統一してください。
6.  JSON以外のテキストは一切含めないでください。

例（目標数5の場合）:
入力: ["JS", "JavaScript", "React.js", "Python", "人工知能", "機械学習", "財務", "経理", "レシピ"]
出力: { "JS": "プログラミング", "JavaScript": "プログラミング", "React.js": "プログラミング", "Python": "プログラミング", "人工知能": "AI", "機械学習": "AI", "財務": "ビジネス", "経理": "ビジネス", "レシピ": "生活" }
`;

    try {
        const responseText = await generateText(prompt, apiKey, modelName);
        // Clean up response (remove markdown code blocks if any)
        const jsonString = responseText.replace(/```json|```/g, '').trim();
        const mapping = JSON.parse(jsonString);
        return mapping;
    } catch (error) {
        console.error("Tag optimization failed:", error);
        throw new Error("タグの整理に失敗しました。AIモデルの応答を確認してください。");
    }
};
