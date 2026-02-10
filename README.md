# Twin Marks

**Twin Marks** は、Google Chromeのブックマークを2画面ファイラ形式（左右分割画面）で効率的に整理・管理するためのChrome拡張機能です。
大量のブックマークをフォルダ間で移動したり、リンク切れをチェックしたりする作業を直感的に行うことができます。

![Twin Marks Screenshot](https://i.imgur.com/4cfkd5T.png)

## ✨ 主な機能

*   **2画面分割 (Dual Pane)**: 左右のパネルで別々のフォルダを開き、ファイルを移動するようにブックマークを整理できます。
*   **ドラッグ & ドロップ**: ブックマークやフォルダをドラッグ＆ドロップで移動できます（パネル間、フォルダ内への移動に対応）。
*   **高速検索**: リアルタイム検索機能により、膨大なブックマークの中から目的の項目を瞬時に見つけ出せます。
*   **ダークモード UI**: 目に優しい「Slate」ベースのモダンなダークテーマを採用。
*   **リサイズ可能なレイアウト**: パネルの幅やプレビュー画面の高さを自由に調整可能。
*   **リンク切れチェック**: フォルダ内のリンク生存確認を一括で行えます。
*   **プレビュー機能**: ブックマークをクリックすると画面下部でプレビュー表示（※ `X-Frame-Options` 等で制限されているサイトを除く）。
*   **メタデータ表示**: フォルダ内のリンク数を表示。
*   **クイックアクション**: コピー、編集、削除などの操作に素早くアクセス。

## 🚀 インストール方法 (開発者向け)

このリポジトリをクローンして、ローカルでビルド・実行する手順です。

### 1. 必須環境
*   Node.js (v18以上推奨)
*   npm

### 2. セットアップ

```bash
# リポジトリのクローン
git clone https://github.com/your-username/twin-marks.git
cd twin-marks

# 依存関係のインストール
npm install
```

### 3. ビルド

```bash
npm run build
```
ビルドが成功すると、プロジェクトルートに `dist` ディレクトリが生成されます。

### 4. Chromeへの読み込み

1.  Google Chromeを開き、URLバーに `chrome://extensions/` と入力します。
2.  右上の **「デベロッパーモード」** をONにします。
3.  左上の **「パッケージ化されていない拡張機能を読み込む」** をクリックします。
4.  このプロジェクト内の `dist` フォルダを選択します。
5.  拡張機能アイコンをクリックすると、Twin Marksが起動します。

## 🛠️ 技術スタック

*   **Framework**: React 19, TypeScript
*   **Build Tool**: Vite
*   **Styling**: Tailwind CSS v4
*   **Icons**: Lucide React
*   **Components**: React Resizable Panels
*   **Platform**: Chrome Extensions Manifest V3

## 📝 ライセンス

[MIT License](LICENSE)
