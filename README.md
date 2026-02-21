# Twin Marks AI

**Twin Marks AI** は、従来の2画面ファイラ形式のブックマーク管理に加え、Google Gemini APIを活用した**AI意味検索**、**RAG (検索拡張生成)**、**3Dナレッジグラフ**を搭載した、次世代のブックマーク管理Chrome拡張機能です。

![Twin Marks AI Dashboard](https://i.imgur.com/zAH3hSF.png)

## ✨ 主な機能

### 1. 📂 デュアルペイン管理 (Explorer)
*   **左右2画面分割**: ファイルエクスプローラーのように、フォルダ間でブックマークをドラッグ＆ドロップで直感的に移動できます。
*   **高速検索 & プレビュー**: リアルタイムフィルタリングと、画面下部でのプレビュー表示（iframe）に対応。
*   **リサイズ可能なパネル**: `react-resizable-panels` を採用し、作業スタイルに合わせてレイアウトを自由に調整可能。

### 2. 🧠 インテリジェントAI検索 & RAG (AI Search & Chat)
*   **ベクトル検索**: 単なるキーワード一致ではなく、ページの内容（意味）に基づいて検索します。
*   **RAG (Retrieval-Augmented Generation)**: 保存されたブックマークの内容を知識源として、AIがあなたの質問に回答します。「あの記事どこだっけ？」だけでなく、「Reactのパフォーマンス最適化について要約して」といった質問にも、あなたのライブラリから答えを導き出します。
*   **類似ページ発見**: 選択したブックマークと内容が似ているページを瞬時にリストアップします。
*   **意味的ソート (Semantic Sort)**: 検索結果を「AI関連度順」で並び替え、現在の興味関心に最も近いページを上位に表示します。

### 3. 📝 AIノートブック (Smart Notebook)
*   **統合テキストエディタ**: 各保存済みページに紐づく専用のメモ帳を搭載。
*   **集中モード**: フルスクリーン表示、行番号、文字数カウント、折り返し切り替えなど、コーディングや執筆に適した環境を提供します。
*   **Markdownライク**: コードブロックの記述にも適しており、学習メモやアイディアの記録に最適です。

### 4. 🌌 ナレッジグラフ (Knowledge Graph)
*   **2D / 3D 可視化**: ブックマーク間の関連性を、美しいネットワークグラフとして可視化。用途に合わせて2Dビューと3Dビュー (Galaxy View) を使い分けられます。
*   **多彩なテーマ**: 3Dビューでは「Universe (宇宙)」「Cyberpunk (サイバーパンク)」「Deep Sea (深海)」の3つの没入型テーマから選択可能です。
*   **AIクラスタリング**: `ml-kmeans` を使用し、意味的に近いページを自動でグループ化。AIが各クラスタの内容を分析し、適切なラベル（カテゴリ名）を自動付与します。
*   **SF風UIデザイン**: 
    *   検索結果のノードは発光し、視覚的に強調されます。
    *   インタラクティブ探索: ズーム、パン、ドラッグが可能。クリックでページを開き、関連性を直感的に把握できます。

### 5. 🏷️ タグ最適化 & 一括操作 (Tag Optimization & Bulk Actions)
*   **AIタグ整理**: 表記揺れ（例: "Javascript" と "JS"）や、重複した意味を持つタグをAIが検出し、統合を提案します。
*   **一括編集**: 複数のアイテムを選択し、タグの追加・削除や、アイテム自体の削除を一括で行えます。
*   **AI自動カテゴリ**: 全ブックマークを約20の主要カテゴリに自動分類・同期し、RAGの検索精度を向上させます。

### 6. 📚 スマートライブラリ (Saved Pages)
*   **保存済みページの一括管理**: 分析したページを「ライブラリ」として永続化。
*   **高度なフィルタリング**: AIカテゴリやタグによる絞り込み（OR検索）に対応。
*   **バックアップ・復旧**: インデックスデータのJSON書き出し・インポートに対応。

### 7. 📸 高効率・高精度分析 (Optimized Analysis)
*   **スクリーンショット優先フロー**: Gemini 2.5 の視覚能力を活用。ページの本文テキストを大量に送る代わりに、スクリーンショット画像とメタデータ（Title, H1, Meta Description）を組み合わせて分析することで、コストを抑えつつ精度の高い要約・タグ生成を実現します。

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
4.  推奨モデル: `gemini-2.5-flash-lite` (生成), `text-embedding-001` (ベクトル化)

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
