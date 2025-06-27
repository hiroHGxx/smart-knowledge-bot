# SmartKnowledgeBot セットアップガイド

## 🔧 環境変数の設定

### 1. skb-datastore (.env)

```bash
cd skb-datastore
cp .env.example .env
```

`.env` ファイルを編集して以下を設定：

```bash
# Convex Configuration
CONVEX_URL=https://your-project-name.convex.cloud
CONVEX_AUTH_TOKEN=your-convex-auth-token

# Optional settings
NODE_ENV=development
```

### 2. skb-intelligence (.env)

```bash
cd skb-intelligence
cp .env.example .env
```

`.env` ファイルを編集して以下を設定：

```bash
# Google AI API Key
GOOGLE_GENERATIVE_AI_API_KEY=your-google-ai-api-key-here

# Convex Configuration (同じ値)
CONVEX_URL=https://your-project-name.convex.cloud
CONVEX_AUTH_TOKEN=your-convex-auth-token

# Development settings
NODE_ENV=development
DEBUG=true
LOG_LEVEL=info
```

## 🚀 Convexプロジェクトのセットアップ

### 1. Convexプロジェクトの作成

```bash
cd skb-datastore
npx convex dev
```

初回実行時に以下を選択：
- プロジェクト名を入力
- チーム選択（個人アカウント）
- リージョン選択（推奨: us-east-1）

### 2. 環境変数の取得

Convex開発ダッシュボードから：
- `CONVEX_URL`: プロジェクトURL
- `CONVEX_AUTH_TOKEN`: 設定 > API Keys から取得

## 🧪 動作確認手順

### 1. データベース接続テスト

```bash
cd skb-datastore
npx convex dev
```

### 2. AIエージェント起動テスト

```bash
cd skb-intelligence
npm run dev
```

## 📝 注意事項

- `.env` ファイルは絶対にGitにコミットしないでください
- APIキーは安全に管理してください
- 本番環境では別途環境変数を設定してください

## 🔍 トラブルシューティング

### Convex接続エラー
- CONVEX_URLとCONVEX_AUTH_TOKENが正しく設定されているか確認
- Convexダッシュボードでプロジェクトが正常に作成されているか確認

### Google AI APIエラー
- GOOGLE_GENERATIVE_AI_API_KEYが正しく設定されているか確認
- APIキーが有効で、Gemini APIが有効化されているか確認