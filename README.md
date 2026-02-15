# Twin Marks AI

**Twin Marks AI** は、従来の2画面ファイラ形式のブックマーク管理に加え、Google Gemini APIを活用した**AI意味検索**、**3Dナレッジグラフ**、**スマートライブラリ**機能を搭載した、次世代のブックマーク管理Chrome拡張機能です。

![Twin Marks AI Galaxy View](https://i.imgur.com/example-galaxy.png)
*(※ここに最新版の3Dマップ表示のスクリーンショットを貼ると効果的です)*

## ✨ 主な機能

### 1. 📂 デュアルペイン管理 (Explorer)
*   **左右2画面分割**: ファイルエクスプローラーのように、フォルダ間でブックマークをドラッグ＆ドロップで直感的に移動できます。
*   **高速検索 & プレビュー**: リアルタイムフィルタリングと、画面下部でのプレビュー表示（iframe）に対応。

### 2. 🧠 インテリジェントAI検索 (AI Search)
*   **ベクトル検索**: 単なるキーワード一致ではなく、ページの内容（意味）に基づいて検索します。
*   **無制限の結果表示**: ライブラリ内のすべての項目を関連度順に網羅。スクロールで過去の知識を無限に探索できます。
*   **ワイドグリッド表示**: ワイドモニターをフル活用したレスポンシブなグリッド検索結果表示。
*   **類似ページ発見**: 選択したブックマークと内容が似ているページを瞬時にリストアップします。
*   **AI自動要約**: ページ保存時、AIが内容を分析し自動で要約文を生成・付与します。

### 3. 🌌 3Dナレッジグラフ (Galaxy View)
*   **3D空間での可視化**: ブックマークを「星」として3D空間に配置し、関連性の高いページ同士を「星座」として連結。
*   **リッチな視覚効果**: ブルーム（発光）エフェクトやスターフレアにより、知識の繋がりを宇宙のように美しく描画。
*   **インタラクティブ探索**: 360度回転、ズーム、ドラッグが可能。クリックでページを開き、右クリックでプレビュー。

### 4. 📚 スマートライブラリ (Saved Pages)
*   **保存済みページの一括管理**: 分析したページを「ライブラリ」として永続化。
*   **高度なソート機能**: 「登録日順」「名前順」に加え、現在の興味（検索クエリ）に近い順に並び替える「AI関連度順」ソートを搭載。
*   **バックアップ・復旧**: インデックスデータのJSON書き出し・インポートに対応。

### 5. 🗂️ AI自動整理 (Auto Organize)
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
4.  推奨モデル: `gemini-1.5-flash` (生成), `text-embedding-004` (ベクトル化)

---

## 🛠️ 技術スタック

*   **Frontend**: React 19, TypeScript, Tailwind CSS
*   **3D/Graph**: `three.js`, `react-force-graph-3d`, `react-force-graph-2d`
*   **AI/LLM**: Google Gemini API (`@google/generative-ai`)
*   **Vector Engine**: `ml-distance` (Cosine Similarity)
*   **Data Processing**: `defuddle`, `turndown` (Content Extraction)
*   **Storage**: IndexedDB (`idb`), `chrome.storage`

## 📝 ライセンス

[MIT License](LICENSE)