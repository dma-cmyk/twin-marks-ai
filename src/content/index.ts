import Defuddle from 'defuddle';
import TurndownService from 'turndown';

console.log('Twin Marks Content Script Loaded');

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'EXTRACT_PAGE_CONTENT') {
        const engine = message.engine || 'defuddle';
        const url = window.location.href;
        const title = document.title;

        extractContent(engine).then(text => {
            sendResponse({ title, url, text });
        }).catch(err => {
            console.error("Extraction failed", err);
            sendResponse({ title, url, text: document.body.innerText });
        });
        return true; 
    }
});

async function extractContent(engine: 'defuddle' | 'turndown'): Promise<string> {
    if (engine === 'defuddle') {
        try {
            // Defuddle: クラスとしてインスタンス化して parse() を呼ぶ
            const instance = new Defuddle(document, { markdown: true });
            const result = instance.parse();
            return result.contentMarkdown || result.content || "";
        } catch (e) {
            console.warn("Defuddle failed, falling back to basic text", e);
        }
    } else if (engine === 'turndown') {
        try {
            const turndown = new TurndownService();
            const markdown = turndown.turndown(document.body);
            
            // ユーザー提案ヒューリスティック
            const lines = markdown.split('\n');
            const meaningfulLines = lines.filter((line: string) => {
                const trimmed = line.trim();
                return trimmed.length >= 30 || trimmed.startsWith('#') || trimmed.startsWith('>');
            });
            
            return meaningfulLines.join('\n');
        } catch (e) {
            console.warn("Turndown failed", e);
        }
    }
    
    return document.body.innerText;
}
