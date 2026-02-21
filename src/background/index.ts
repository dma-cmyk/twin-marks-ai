import { getEmbedding, generateText } from '../utils/embedding';
import { storeVector, getVector } from '../utils/vectorStore';

console.log('Twin Marks AI Background Script Loaded');

// アイコンクリック時にメイン画面を開く
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'index.html' });
});

// Helper functions to safely update badge (ignoring errors if tab is closed)
const safeSetBadgeText = async (details: chrome.action.BadgeTextDetails) => {
    try {
        await chrome.action.setBadgeText(details);
    } catch (e) {
        // Tab might be closed, ignore
    }
};

const safeSetBadgeBackgroundColor = async (details: { tabId?: number; color: string | [number, number, number, number] }) => {
    try {
        await chrome.action.setBadgeBackgroundColor(details);
    } catch (e) {
        // Tab might be closed, ignore
    }
};

// コンテキストメニューの作成関数
function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'analyze-page',
      title: 'Twin Marksに追加して分析',
      contexts: ['page', 'action']
    }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error creating context menu:", chrome.runtime.lastError.message);
      }
    });
  });
}

createContextMenus();
chrome.runtime.onInstalled.addListener(createContextMenus);
chrome.runtime.onStartup.addListener(createContextMenus);

// コンテクストメニュークリック時の処理
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'analyze-page' && tab?.id) {
    console.log('Starting analysis for:', tab.title);
    
    try {
      await chrome.storage.local.set({ analyzing: true, analyzingTitle: tab.title });

      const settings = await chrome.storage.local.get(['geminiApiKey', 'embeddingModel', 'generationModel', 'extractionEngine', 'useImageAnalysis']);
      const apiKey = settings.geminiApiKey as string;
      const embedModelName = (settings.embeddingModel || 'models/embedding-001') as string;
      const genModelName = (settings.generationModel || 'models/gemini-2.5-flash-lite') as string;
      const engine = (settings.extractionEngine || 'defuddle') as 'defuddle' | 'turndown';
      const useImageAnalysis = settings.useImageAnalysis !== false; // Default true

      if (!apiKey) {
        console.error('API Key not found');
        await chrome.storage.local.set({ analyzing: false });
        return;
      }

      await safeSetBadgeText({ tabId: tab.id, text: '...' });
      await safeSetBadgeBackgroundColor({ tabId: tab.id, color: '#3B82F6' });

      // 制限されたURLのチェック
      if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('https://chrome.google.com/webstore')) {
          throw new Error('このページはブラウザのセキュリティ制限により分析できません。');
      }

      // content script に抽出を依頼（再試行ロジック付き）
      let response = null;
      try {
          response = await chrome.tabs.sendMessage(tab.id, { 
              type: 'EXTRACT_PAGE_CONTENT', 
              engine 
          });
      } catch (err) {
          console.warn("Content script not ready, trying execution fallback", err);
          
          // コンテンツスクリプトを動的に注入
          try {
              await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  files: ['src/content/index.ts']
              });
              
              // 注入後に少し待機してから再試行
              await new Promise(resolve => setTimeout(resolve, 100));
              
              response = await chrome.tabs.sendMessage(tab.id, { 
                  type: 'EXTRACT_PAGE_CONTENT', 
                  engine 
              });
          } catch (injectErr) {
              console.error("Injection fallback failed", injectErr);
              throw new Error('ページの解析に失敗しました。ページをリロードして再度お試しください。');
          }
      }

      if (!response) {
          throw new Error('抽出レスポンスが空です。');
      }
      
      const { title, url, text, h1, metaDescription } = response;
      console.log(`Content extracted via content script using ${engine}, text length: ${text.length}`);

      // 既存のデータを取得（メモを保持するため）
      const existingData = await getVector(url);
      const existingNotes = existingData?.notes || "";

      // スクリーンショットの取得（マルチモーダル解析用）
      let screenshotData: string | undefined;
      if (useImageAnalysis) {
          try {
              screenshotData = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 60 });
          } catch (e) {
              console.warn("Screenshot capture failed, proceeding with text only", e);
          }
      }

      // 3. AI処理（並列実行）
      let generatedDescription = "";
      
      // Check if model supports multimodal
      const isMultimodalModel = genModelName.includes('gemini-1.5') || genModelName.includes('gemini-2') || genModelName.includes('vision');
      
      if (screenshotData && isMultimodalModel) {
          // 画像がある場合（マルチモーダル優先）
          const descriptionPrompt = `
以下のWebページの画像（スクリーンショット）と提供されたメタデータから、このページが何について書かれているか、どのようなコンテンツ（記事、ツール、図表、ログイン画面など）であるか、日本語で詳細に説明してください。
また、このページの内容を表す**大まかなカテゴリタグ**を3〜5個生成してください。
タグは細かい固有名詞ではなく、**一般的な分類**（例: "Web開発", "ニュース", "AI", "ビジネス", "ショッピング"）を選んでください。

出力形式:
[説明文]
---TAGS---
[タグ1, タグ2, タグ3]

タイトル: ${title}
URL: ${url}
H1: ${h1 || 'なし'}
Meta Description: ${metaDescription || 'なし'}
本文（冒頭1000文字）: ${text.substring(0, 1000)}...
          `.trim();
          try {
              generatedDescription = await generateText(descriptionPrompt, apiKey, genModelName, screenshotData);
          } catch (e) {
              console.error("Multimodal description generation failed", e);
              generatedDescription = ""; // Fallback to text-only logic below
          }
      }

      // 画像解析が無効、または失敗した場合のフォールバック
      if (!generatedDescription) {
           try {
               generatedDescription = await generateText(
                  `以下のWebページのテキスト内容を、日本語で50文字以内で簡潔に要約・説明してください。また、内容を表す**大まかなカテゴリタグ**を3〜5個生成してください。
タグは細かい固有名詞ではなく、**一般的な分類**（例: "技術", "ニュース", "生活", "ショッピング", "学習"）を選んでください。

出力形式:
[説明文]
---TAGS---
[タグ1, タグ2, タグ3]

タイトル: ${title}
URL: ${url}

${text.substring(0, 5000)}`,
                  apiKey,
                  genModelName
               );
           } catch (e) {
               console.warn('Text-only summary generation failed', e);
               generatedDescription = text.substring(0, 500);
           }
      }

      console.log("Generated Content:", generatedDescription);
      
      // Parse description and tags
      let description = generatedDescription;
      let tags: string[] = [];
      
      if (generatedDescription.includes('---TAGS---')) {
          const parts = generatedDescription.split('---TAGS---');
          description = parts[0].trim();
          const tagPart = parts[1].trim().replace(/^[\[\]]$/g, ''); // Remove brackets if present
          tags = tagPart.split(/,|、/).map(t => t.trim()).filter(t => t.length > 0);
      }

      const embeddingPromise = (async () => {
          let vector: number[] | null = null;
          let lastError: any = null;
          
          const candidateModels = [
              embedModelName, 
              'models/text-embedding-001',
              'models/embedding-001'
          ];
          const uniqueModels = Array.from(new Set(candidateModels));

          // ベクトル化の対象: 生成された説明文があればそれを優先、なければタイトルと説明の組み合わせ
          const textToEmbed = (description.length > 50) 
              ? description 
              : `${title}\n${description}\nContext: ${text.substring(0, 1000)}`;

          for (const m of uniqueModels) {
              try {
                  if (!m) continue;
                  vector = await getEmbedding(textToEmbed, apiKey, m);
                  if (m !== embedModelName) {
                      await chrome.storage.local.set({ embeddingModel: m });
                  }
                  break;
              } catch (e: any) {
                  console.warn(`Failed with ${m}`, e);
                  lastError = e;
                  if (e.message && e.message.includes('API Key')) break;
              }
          }
          if (!vector) throw lastError || new Error('All embedding models failed.');
          return vector;
      })();

      // 要約（表示用）
      const summaryPromise = (async () => {
          if (description.length < 100) return description;
          // 長すぎる場合は表示用に短縮（すでにテキストのみ生成の場合は短いのでスキップ可能だが念のため）
          return generateText(
              `以下の文章を50文字以内で要約してください。

${description}`,
              apiKey,
              genModelName
          ).catch(() => description.substring(0, 100));
      })();

      const [vector, shortSummary] = await Promise.all([embeddingPromise, summaryPromise]);
      
      // Generate semantic vector based on long description + tags + notes
      let semanticVector: number[] | undefined;
      try {
          const textToEmbed = [
              description.substring(0, 1000),
              tags.length > 0 ? `Tags: ${tags.join(', ')}` : '',
              existingNotes ? `Notes: ${existingNotes}` : ''
          ].filter(Boolean).join('\n');

          const candidateModels = [embedModelName, 'models/embedding-001'];
          for (const m of candidateModels) {
              try {
                  semanticVector = await getEmbedding(textToEmbed, apiKey, m);
                  break;
              } catch (e) {
                  console.warn(`Semantic embed failed with ${m}`, e);
              }
          }
      } catch (e) {
          console.error("Failed to generate semantic vector", e);
      }
      
      await storeVector(url, title, vector, text, shortSummary, true, tags, semanticVector, existingNotes);
      chrome.runtime.sendMessage({ type: 'VECTOR_UPDATED' }).catch(() => {});

      await safeSetBadgeText({ tabId: tab.id, text: 'OK' });
      await safeSetBadgeBackgroundColor({ tabId: tab.id, color: '#10B981' }); 
      setTimeout(() => safeSetBadgeText({ tabId: tab.id, text: '' }), 3000);

    } catch (error) {
      console.error('Analysis failed:', error);
      await safeSetBadgeText({ tabId: tab.id, text: 'ERR' });
      await safeSetBadgeBackgroundColor({ tabId: tab.id, color: '#F43F5E' });
    } finally {
       await chrome.storage.local.set({ analyzing: false });
    }
  }
});

// タブの状態監視と未分析通知
const checkTabStatus = async (tabId: number, url?: string) => {
    if (!url || !url.startsWith('http')) {
        await safeSetBadgeText({ tabId, text: '' });
        return;
    }
    const settings = await chrome.storage.local.get(['notifyUnanalyzed', 'analyzing']);
    if (settings.analyzing) return;
    const data = await getVector(url);
    if (data) {
        await safeSetBadgeText({ tabId, text: '' });
    } else {
        if (settings.notifyUnanalyzed !== false) {
            await safeSetBadgeText({ tabId, text: '?' });
            await safeSetBadgeBackgroundColor({ tabId, color: '#EAB308' }); 
        } else {
            await safeSetBadgeText({ tabId, text: '' });
        }
    }
};

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    checkTabStatus(activeInfo.tabId, tab.url);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        checkTabStatus(tabId, tab.url);
    }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'GET_FAVICON_DATA_URL') {
        try {
            const domain = new URL(message.url).hostname;
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
            fetch(faviconUrl)
                .then(r => r.blob())
                .then(blob => {
                    const reader = new FileReader();
                    reader.onloadend = () => sendResponse(reader.result);
                    reader.readAsDataURL(blob);
                })
                .catch(() => sendResponse(null));
            return true;
        } catch(e) {
            sendResponse(null);
        }
    }
});