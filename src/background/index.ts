import { getEmbedding, generateText } from '../utils/embedding';
import { storeVector, getVector } from '../utils/vectorStore';

console.log('Twin Marks AI Background Script Loaded');

// アイコンクリック時にメイン画面を開く
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'index.html' });
});

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
      const genModelName = (settings.generationModel || 'models/gemini-1.5-flash') as string;
      const engine = (settings.extractionEngine || 'defuddle') as 'defuddle' | 'turndown';
      const useImageAnalysis = settings.useImageAnalysis === true; // Default false

      if (!apiKey) {
        console.error('API Key not found');
        await chrome.storage.local.set({ analyzing: false });
        return;
      }

      await chrome.action.setBadgeText({ tabId: tab.id, text: '...' });
      await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#3B82F6' });

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

      const { title, url, text } = response;
      console.log(`Content extracted via content script using ${engine}, text length: ${text.length}`);

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
      
      if (screenshotData) {
          // 画像がある場合（マルチモーダル）
          const descriptionPrompt = `
以下のWebページの画像（スクリーンショット）とテキスト内容から、このページが何について書かれているか、どのようなコンテンツ（記事、ツール、図表、ログイン画面など）であるか、日本語で詳細に説明してください。
特に、画像内の図やグラフ、UI要素などの視覚情報も考慮してください。
もしログイン画面や「読み込み中」に見える場合でも、背景やタイトルから本来の目的（例: 「〇〇というサービスのダッシュボード」）を推測してください。

タイトル: ${title}
URL: ${url}
抽出テキスト: ${text.substring(0, 1000)}...
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
                  `以下のWebページのテキスト内容を、日本語で50文字以内で簡潔に要約・説明してください。\n\nタイトル: ${title}\nURL: ${url}\n\n${text.substring(0, 5000)}`,
                  apiKey,
                  genModelName
               );
           } catch (e) {
               console.warn('Text-only summary generation failed', e);
               generatedDescription = text.substring(0, 500);
           }
      }

      console.log("Generated Description:", generatedDescription);

      const embeddingPromise = (async () => {
          let vector: number[] | null = null;
          let lastError: any = null;
          
          const candidateModels = [
              embedModelName, 
              'models/text-embedding-004', 
              'models/embedding-001', 
              'models/gemini-embedding-001'
          ];
          const uniqueModels = Array.from(new Set(candidateModels));

          // ベクトル化の対象: 生成された説明文があればそれを優先、なければタイトルと説明の組み合わせ
          const textToEmbed = (generatedDescription.length > 50) 
              ? generatedDescription 
              : `${title}\n${generatedDescription}\nContext: ${text.substring(0, 1000)}`;

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
          if (generatedDescription.length < 100) return generatedDescription;
          // 長すぎる場合は表示用に短縮（すでにテキストのみ生成の場合は短いのでスキップ可能だが念のため）
          return generateText(
              `以下の文章を50文字以内で要約してください。\n\n${generatedDescription}`, 
              apiKey, 
              genModelName
          ).catch(() => generatedDescription.substring(0, 100));
      })();

      const [vector, shortSummary] = await Promise.all([embeddingPromise, summaryPromise]);
      
      await storeVector(url, title, vector, text, shortSummary, true);
      chrome.runtime.sendMessage({ type: 'VECTOR_UPDATED' }).catch(() => {});

      await chrome.action.setBadgeText({ tabId: tab.id, text: 'OK' });
      await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#10B981' }); 
      setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: '' }), 3000);

    } catch (error) {
      console.error('Analysis failed:', error);
      await chrome.action.setBadgeText({ tabId: tab.id, text: 'ERR' });
      await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#F43F5E' });
    } finally {
       await chrome.storage.local.set({ analyzing: false });
    }
  }
});

// タブの状態監視と未分析通知
const checkTabStatus = async (tabId: number, url?: string) => {
    if (!url || !url.startsWith('http')) {
        await chrome.action.setBadgeText({ tabId, text: '' });
        return;
    }
    const settings = await chrome.storage.local.get(['notifyUnanalyzed', 'analyzing']);
    if (settings.analyzing) return;
    const data = await getVector(url);
    if (data) {
        await chrome.action.setBadgeText({ tabId, text: '' });
    } else {
        if (settings.notifyUnanalyzed !== false) {
            await chrome.action.setBadgeText({ tabId, text: '?' });
            await chrome.action.setBadgeBackgroundColor({ tabId, color: '#EAB308' }); 
        } else {
            await chrome.action.setBadgeText({ tabId, text: '' });
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
