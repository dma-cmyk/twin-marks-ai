import { GoogleGenerativeAI } from '@google/generative-ai';

export const getEmbedding = async (text: string, apiKey: string, modelName: string = 'text-embedding-004'): Promise<number[]> => {
  if (!apiKey) throw new Error('API Key is missing');

  // Pass the raw model name. The user/settings should provide the correct format (e.g. 'models/text-embedding-004').
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  // Text verification and truncation if necessary (Gemini has limits, but usually large context)
  // Simple truncation to safely fit reasonably large text (e.g. 8000 chars roughly)
  const safeText = text.substring(0, 8000); 

  const result = await model.embedContent(safeText);
  return result.embedding.values;
};

export const generateText = async (prompt: string, apiKey: string, modelName: string = 'gemini-1.5-flash', imageData?: string): Promise<string> => {
    if (!apiKey) throw new Error('API Key is missing');
  
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });
  
    let result;
    if (imageData) {
        // Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
        
        const parts = [
            { text: prompt },
            {
                inlineData: {
                    mimeType: "image/jpeg",
                    data: base64Data
                }
            }
        ];
        result = await model.generateContent({ contents: [{ role: 'user', parts }] });
    } else {
        result = await model.generateContent(prompt);
    }

    return result.response.text();
};
