# SmartKnowledgeBot

任意のWebサイトを知識ベースとし、その内容に関するユーザーからの自然言語での質問に対して、的確な回答を生成・提供する、汎用的なQ&A対応AIエージェントシステム。

## 📋 概要

SmartKnowledgeBotは以下の機能を提供します：

- **Webクローリング**: 指定されたWebサイトを自動的にクロール
- **知識ベース構築**: クロールしたコンテンツをベクトル化して検索可能な形で保存
- **自然言語Q&A**: 日本語での質問に対して、知識ベースから関連情報を検索して回答生成

## 🏗️ アーキテクチャ

### システム構成

```
smart-knowledge-bot/
├── skb-intelligence/    # AIエージェント層
│   ├── src/mastra/     # Mastraベースのエージェント実装
│   └── tests/          # テストコード
├── skb-datastore/      # データ永続化層
│   ├── convex/         # Convexデータベース設定
│   └── tests/          # テストコード
└── deployment/         # デプロイ設定
```

### 技術スタック

- **AIエージェント**: Mastra v0.10.5
- **LLM**: Google Gemini 1.5 Pro
- **データベース**: Convex v1.24.8
- **Webクローリング**: Playwright
- **ベクトル検索**: GoogleGenerativeAI embedding-001

## 🚀 クイックスタート

### 前提条件

- Node.js ≥ 20.9.0
- Google AI Studio APIキー
- Convexアカウント

### セットアップ

1. **リポジトリのクローン**
   ```bash
   git clone <repository-url>
   cd SmartKnowledgeBot
   ```

2. **環境変数の設定**
   ```bash
   cp .env.example .env
   # .envファイルを編集して、必要なAPIキーを設定
   ```

3. **データストア層のセットアップ**
   ```bash
   cd skb-datastore
   npm install
   npx convex dev
   ```

4. **AI層のセットアップ**
   ```bash
   cd ../skb-intelligence
   npm install
   npm run dev
   ```

## 📚 使用方法

### 1. 知識ベースの構築

1. **データベース初期化（任意）**
   - `purge_knowledge_base` ツールで既存データを削除

2. **Webクローリング**
   - `web_crawler` ツールでサイトをクロール
   - パラメータ: `startUrl`, `maxDepth`

3. **テキスト処理**
   - `process_pending_documents` ツールでベクトル化

### 2. Q&A対話

- Mastraプレイグラウンドでエージェントと対話
- 日本語で質問すると、知識ベースから関連情報を検索して回答

## 🧪 テスト

```bash
# 単体テスト
npm run test

# 統合テスト
npm run test:integration

# E2Eテスト
npm run test:e2e
```

## 📄 ライセンス

MIT License

## 🤝 貢献

プルリクエストやイシューの報告を歓迎します。

---

*詳細な設計仕様については、`PRD.md` を参照してください。*
