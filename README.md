# Twin Marks AI

**Twin Marks AI** は、従来の2画面ファイラ形式のブックマーク管理に加え、Google Gemini APIを活用した**AI意味検索**、**RAG (検索拡張生成)**、**3Dナレッジグラフ**を搭載した、次世代のブックマーク管理Chrome拡張機能です。

![Twin Marks AI Dashboard](https://i.imgur.com/srG0fcs.png)

## ✨ 主な機能

### 1. 📂 デュアルペイン管理 (Explorer)
*   **左右2画面分割**: ファイルエクスプローラーのように、フォルダ間でブックマークをドラッグ＆ドロップで直感的に移動できます。
*   **高速検索 & プレビュー**: リアルタイムフィルタリングと、画面下部でのプレビュー表示（iframe）に対応。
*   **リサイズ可能なパネル**: `react-resizable-panels` を採用し、作業スタイルに合わせてレイアウトを自由に調整可能。

### 2. 🧠 インテリジェントAI検索 & RAG (AI Search & Chat)
*   **ベクトル検索**: 単なるキーワード一致ではなく、ページの内容（意味）に基づいて検索します。
*   **RAG (Retrieval-Augmented Generation)**: 保存されたブックマークの内容を知識源として、AIがあなたの質問に回答します。「あの記事どこだっけ？」だけでなく、「Reactのパフォーマンス最適化について要約して」といった質問にも、あなたのライブラリから答えを導き出します。
*   **類似ページ発見**: 選択したブックマークと内容が似ているページを瞬時にリストアップします。

### 3. 🌌 ナレッジグラフ (Knowledge Graph)
*   **2D / 3D 可視化**: ブックマーク間の関連性を、美しいネットワークグラフとして可視化。用途に合わせて2Dビューと3Dビュー (Galaxy View) を使い分けられます。
*   **AIクラスタリング**: `ml-kmeans` を使用し、意味的に近いページを自動でグループ化。AIが各クラスタの内容を分析し、適切なラベル（カテゴリ名）を自動付与します。
*   **SF風UIデザイン**: 
    *   検索結果のノードは発光し、視覚的に強調されます。
    *   インタラクティブ探索: ズーム、パン、ドラッグが可能。クリックでページを開き、関連性を直感的に把握できます。

### 4. 🏷️ タグ最適化 (Tag Optimization)
*   **AIタグ整理**: 表記揺れ（例: "Javascript" と "JS"）や、重複した意味を持つタグをAIが検出。
*   **一括統廃合**: 提案された変更を確認し、ワンクリックでタグを整理・統合できます。ライブラリ全体の一貫性を保ちます。

### 5. 📚 スマートライブラリ (Saved Pages)
*   **保存済みページの一括管理**: 分析したページを「ライブラリ」として永続化。
*   **高度なソート機能**: 「登録日順」「名前順」に加え、現在の興味（検索クエリ）に近い順に並び替える「AI関連度順」ソートを搭載。
*   **バックアップ・復旧**: インデックスデータのJSON書き出し・インポートに対応。

### 6. 🗂️ AI自動整理 (Auto Organize)
*   **ワンクリック整理**: 散らかったフォルダをAIが分析し、内容に基づいた最適なカテゴリへ自動分類・フォルダ作成を行います。

---

## 🚀 セットアップ

### 1. 必須環境
*   Node.js (v18以上推奨)
*   Google Gemini API Key

### 2. 開発環境の構築

```bash
# リポジトリのクローン
git clone https://github.com/dma-cmyk/twin-marks-ai.git
cd twin-marks-ai

# 依存関係のインストール
npm install

# ビルド
npm run build
```

### 3. Chromeへの導入
1.  `chrome://extensions/` を開く。
2.  「デベロッパーモード」をONにする。
3.  「パッケージ化されていない拡張機能を読み込む」から、生成された `dist` フォルダを選択。

---

## ⚙️ 初期設定 (APIキー)

AI機能を利用するには、Gemini APIキーが必要です。

1.  拡張機能のアイコンをクリック（またはポップアップを開く）。
2.  右上の **設定（歯車アイコン）** をクリック。
3.  **Gemini API Key** を入力し、「Fetch Models」でモデル一覧を取得して保存してください。
4.  推奨モデル: `gemini-2.5-flash-lite` (生成), `gemini-embedding-001` (ベクトル化)

---

## 🛠️ 技術スタック

*   **Frontend**: React 19, TypeScript, Tailwind CSS
*   **UI Components**: `lucide-react`, `react-resizable-panels`
*   **3D/Graph**: `three.js`, `react-force-graph-3d`, `react-force-graph-2d`
*   **AI/LLM**: Google Gemini API (`@google/generative-ai`)
*   **Vector Engine & Clustering**: `ml-distance` (Cosine Similarity), `ml-kmeans`
*   **Data Processing**: `defuddle`, `turndown` (Content Extraction)
*   **Storage**: IndexedDB (`idb`), `chrome.storage`

## 📝 ライセンス

[MIT License](LICENSE)
