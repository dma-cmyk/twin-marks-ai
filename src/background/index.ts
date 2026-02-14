import { getEmbedding, generateText } from '../utils/embedding';
import { storeVector, getVector } from '../utils/vectorStore';

console.log('Twin Marks AI Background Script Loaded');

// アイコンクリック時にメイン画面を開く
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'index.html' });
});

// コンテキストメニューの作成
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'analyze-page',
    title: 'Twin Marksに追加して分析',
    contexts: ['page']
  });
});

// ページからテキストを抽出する関数（DOMの世界で実行される）
function extractPageContent() {
  return {
    title: document.title,
    url: window.location.href,
    text: document.body.innerText
  };
}

// コンテキストメニュークリック時の処理
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'analyze-page' && tab?.id) {
    console.log('Starting analysis for:', tab.title);
    
    try {
      // ステータス更新（フロントエンド通知用）
      await chrome.storage.local.set({ analyzing: true, analyzingTitle: tab.title });

      // 1. 設定の取得
      const settings = await chrome.storage.local.get(['geminiApiKey', 'embeddingModel', 'generationModel']);
      const apiKey = settings.geminiApiKey as string;
      const embedModelName = (settings.embeddingModel || 'models/embedding-001') as string;
      const genModelName = (settings.generationModel || 'models/gemini-1.5-flash') as string;

      if (!apiKey) {
        console.error('API Key not found. Please set it in the extension settings.');
        await chrome.storage.local.set({ analyzing: false });
        return;
      }

      // バッジ: 青 (処理中)
      await chrome.action.setBadgeText({ tabId: tab.id, text: '...' });
      await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#3B82F6' });

      // 2. コンテンツスクリプトを実行してテキスト抽出
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractPageContent,
      });

      if (!results || !results[0] || !results[0].result) {
        throw new Error('Failed to extract page content');
      }

      const { title, url, text } = results[0].result;
      console.log('Content extracted, generating embedding...', { title, textLength: text.length });

      // 3. AI処理（並列実行）
      // - ベクトル化
      // - 要約生成
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

          for (const m of uniqueModels) {
              try {
                  if (!m) continue;
                  console.log(`Trying embedding model: ${m}`);
                  vector = await getEmbedding(text, apiKey, m);
                  if (m !== embedModelName) {
                      console.log(`Fallback successful with ${m}. Updating settings.`);
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

      const summaryPromise = generateText(
          `以下のWebページのテキスト内容を、日本語で50文字以内で簡潔に要約・説明してください。サイトのジャンルや特徴がわかるようにしてください。\n\nタイトル: ${title}\nURL: ${url}\n\n${text.substring(0, 5000)}`,
          apiKey,
          genModelName
      ).catch(e => {
          console.warn('Summary generation failed', e);
          return ''; // 失敗しても空文字で続行
      });

      const [vector, description] = await Promise.all([embeddingPromise, summaryPromise]);
      
      console.log('Analysis complete. Description length:', description.length);
      console.log('Generated Description:', description);

      // 4. DBに保存（上書き更新）
      await storeVector(url, title, vector, text, description);
      console.log('Successfully stored vector for:', url);
      
      // フロントエンドに更新通知
      chrome.runtime.sendMessage({ type: 'VECTOR_UPDATED' }).catch(() => {
          // 受信側がいない場合のエラーは無視
      });

      // 成功通知
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
    if (settings.analyzing) return; // 分析中は上書きしない

    // 保存済みかチェック
    const data = await getVector(url);
    
    if (data) {
        // 済み
        await chrome.action.setBadgeText({ tabId, text: '' });
    } else {
        // 未
        if (settings.notifyUnanalyzed !== false) {
            await chrome.action.setBadgeText({ tabId, text: '?' });
            await chrome.action.setBadgeBackgroundColor({ tabId, color: '#EAB308' }); // Yellow-500
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
