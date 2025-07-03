# 製品要求仕様書 (PRD): SmartKnowledgeBot

## 1. 概要

### 1.1. プロダクト名
**SmartKnowledgeBot** (スマートナレッジボット)

### 1.2. リポジトリ名
- メインリポジトリ: `smart-knowledge-bot`
- AIエージェント: `skb-intelligence` (サブディレクトリ)
- データベース: `skb-datastore` (サブディレクトリ)

### 1.3. 目的
任意のWebサイトを知識ベースとし、その内容に関するユーザーからの自然言語での質問に対して、的確な回答を生成・提供する、汎用的なQ&A対応AIエージェントシステム。

### 1.4. ターゲットユーザー
- 企業の技術ドキュメント管理者
- ゲーム攻略サイト運営者
- 製品サポート担当者
- 研究機関の知識管理担当者

### 1.5. 最終形態・デプロイ戦略
1. **開発フェーズ**: Mastraプレイグラウンドでの機能検証 ✅ **完了 (2025-06-28)**
2. **本番フェーズ**:
   - Vercel/Netlifyでのフロントエンドデプロイ
   - Next.js + Mastra統合によるWebアプリ化
   - REST API提供によるサードパーティ統合対応

### 1.6. 実装完了状況 (2025-07-01更新)
✅ **MVP完成**: 全コア機能実装・動作確認完了
✅ **Phase 2**: RAGパイプライン完全実装
✅ **Phase 3**: エージェント統合・実サイト検証完了
✅ **Phase 3.5**: 重複実行問題解決・本格運用検証完了
✅ **Phase 3.9**: 品質チェック・デプロイ準備完了
✅ **Phase 4**: Next.js統合によるWebアプリ化（100%完了）
  - ✅ Phase 4.1-4.3: Next.js基盤構築・API統合
  - ✅ Phase 4.4: 質問フォーム・UI実装
  - ✅ Phase 4.5: RAGシステム統合・エンドツーエンドテスト成功
  - ✅ Phase 4.6: UX改善（ローディング・エラーハンドリング・履歴機能）
  - ✅ Phase 4.7: Vercelデプロイ・本番動作確認完了

**実証済みサイト**: guide.rolg.maxion.gg（50ページ→386ドキュメント）
**RAG動作実証**: 「装備強化方法」→5件関連文書→653文字専門回答（9.7秒）
**本番サービス稼働中**: https://smartknowledgebot-frontend-emjn0hmib-hirohgxxs-projects.vercel.app
**完全パイプライン**: フロントエンド→API→ベクトル検索→AI回答→本番動作確認済み

## 2. システムアーキテクチャ

本システムは単一リポジトリ内の2つのサブプロジェクトで構成される：

### 2.1. skb-intelligence（AIエージェント層）
- **役割**: ユーザー対話、RAGパイプライン、Web情報収集
- **技術スタック**:
  - Mastra v0.10.5（エージェントフレームワーク）
  - Google Generative AI（Gemini 1.5 Pro、embedding-001）
  - LangChain（テキスト分割・処理）
  - Playwright（堅牢なWebクローラー）
  - TypeScript/Node.js

### 2.2. skb-datastore（データ永続化層）
- **役割**: 知識ベース管理、ベクトル検索、データ整合性保証
- **技術スタック**:
  - Convex v1.24.8（サーバーレスデータベース）
  - ベクトルインデックス（768次元）
  - HTTPベースAPI

## 3. データモデル

### 3.1. crawled_pages テーブル
```typescript
{
  url: string,        // クロール対象URL
  text: string,       // 抽出されたテキスト
  status: string      // "pending" | "processed" | "error"
}
```

### 3.2. documents テーブル
```typescript
{
  text: string,              // チャンク化されたテキスト
  embedding: number[]        // 768次元ベクトル（GoogleGenerativeAI embedding-001）
}
```
- ベクトルインデックス: `by_embedding`（768次元、類似度検索用）

## 4. 主要機能とワークフロー

### 4.1. データ準備ワークフロー（知識ベース構築）

#### Step 1: データベース初期化（任意）
- **ツール**: `purge_knowledge_base`
- **処理**: 既存の知識ベース（`crawled_pages`および`documents`テーブル）を完全消去
- **実装**: `maintenance:purgeAll` Convex mutation

#### Step 2: Webクロール
- **ツール**: `web_crawler`
- **入力パラメータ**:
  - `startUrl`: クロール開始URL
  - `maxDepth`: 巡回階層（0-5）
- **処理フロー**:
  1. 軽量fetch + Cheerio による静的HTML解析
  2. 同一ドメイン内のリンク抽出・追跡
  3. バッチ処理（10並列）でタイムアウト対策
  4. 各ページを`crawled_pages`テーブルに`status: "pending"`で保存
- **技術的特徴**:
  - Puppeteerから軽量fetchに変更済み（安定性向上）
  - 10秒タイムアウト設定
  - User-Agentヘッダー設定

#### Step 3: テキスト処理とベクトル化
- **ツール**: `process_pending_documents`
- **処理フロー**:
  1. `status: "pending"`のページを取得
  2. `RecursiveCharacterTextSplitter`でチャンク化
     - `chunkSize: 1000`
     - `chunkOverlap: 200`
  3. `GoogleGenerativeAIEmbeddings`（models/embedding-001）でベクトル化
  4. `documents`テーブルに保存
  5. 元ページの`status`を`"processed"`に更新

### 4.2. Q&Aワークフロー（リアルタイム対話）

#### エージェント仕様
- **名前**: Knowledge Base Assistant
- **モデル**: Google Gemini 1.5 Pro Latest
- **言語**: 日本語での対話
- **指示**: 必ず`answer_question_from_docs`ツールを使用

#### RAGパイプライン
- **ツール**: `answer_question_from_docs`
- **処理フロー**:
  1. **質問翻訳**: 日本語→英語（Gemini 1.5 Pro）
  2. **ベクトル化**: 翻訳された質問をembedding-001でベクトル化
  3. **類似度検索**: `search:byEmbedding`で上位5件取得
  4. **回答生成**: 英語コンテキスト + 日本語質問で日本語回答生成

## 5. 技術的決定事項と設計パターン

### 5.1. 自己完結型ツールアーキテクチャ
- **課題**: Mastraのcontextオブジェクトの型定義不安定
- **解決策**: 各ツールが必要なクライアント（ConvexClient、AI Client）を内部で初期化
- **利点**: システム安定性と信頼性の向上

### 5.2. パイプライン分離戦略
- **課題**: 単一ワークフローでの長大タスク管理困難
- **解決策**: 「クロール」と「後処理」の明確分離
- **運用**: 人間によるステップバイステップトリガー

### 5.3. 多言語対応（日英ハイブリッド）
- **課題**: 英語知識ベース vs 日本語質問のベクトル検索ミスマッチ
- **解決策**: 質問時の動的翻訳（日→英）
- **実装**: Gemini 1.5 Proによる高精度翻訳

### 5.4. ConvexClient実装
- **設計**: 各ツールが独自のHTTPクライアントを持つ
- **API**: `/api/query`、`/api/mutation`エンドポイント
- **環境変数**: `CONVEX_URL`、`GOOGLE_GENERATIVE_AI_API_KEY`

### 5.5. Next.js統合アーキテクチャ（Phase 4実装）
- **フロントエンド**: React + TypeScript + Tailwind CSS
- **API層**: Next.js App Router（`/api/chat`エンドポイント）
- **統合パターン**: ConvexHttpClient + Google AI SDK統合
- **パイプライン**: フロントエンド→API→RAG→ベクトル検索→AI回答
- **最適化**: ベクトル検索スコア閾値0.5、日英翻訳による検索精度向上

### 5.6. RAGシステム性能最適化（Phase 4.5実証）
- **翻訳精度**: Google Gemini 1.5 Pro（日→英）
- **ベクトル化**: Google Embeddings 768次元
- **検索効率**: Convex vectorSearch 5件limit
- **応答時間**: 9.7秒（翻訳→検索→回答生成）
- **品質向上**: 11文字→653文字（専門知識詳細回答）

## 6. プロジェクト構成

### 6.1. ディレクトリ構造
```
smart-knowledge-bot/
├── README.md
├── .gitignore
├── .env.example
├── docker-compose.yml             # 開発環境統合
├── skb-intelligence/              # AIエージェント層
│   ├── package.json
│   ├── .env
│   ├── src/mastra/
│   │   ├── index.ts
│   │   ├── agents/
│   │   │   └── knowledge-agent.ts
│   │   ├── tools/
│   │   │   ├── web-crawler.ts
│   │   │   ├── document-processor.ts
│   │   │   ├── knowledge-searcher.ts
│   │   │   └── system-maintenance.ts
│   │   └── workflows/
│   │       ├── knowledge-ingestion.workflow.ts
│   │       └── data-processing.workflow.ts
│   └── tests/
│       ├── unit/
│       └── integration/
├── skb-datastore/                 # データ永続化層
│   ├── package.json
│   ├── .env
│   ├── convex/
│   │   ├── schema.ts
│   │   ├── pages.ts
│   │   ├── knowledge.ts
│   │   ├── search.ts
│   │   └── admin.ts
│   └── tests/
│       └── e2e/
└── deployment/                    # デプロイ設定
    ├── vercel.json
    ├── netlify.toml
    └── docker/
```

### 6.2. 命名規則
- **ツール名**: 動詞+名詞形式（例: `web-crawler`, `document-processor`）
- **エージェント名**: 役割+agent形式（例: `knowledge-agent`）
- **ワークフロー名**: 目的+workflow形式（例: `knowledge-ingestion.workflow`）

## 7. 環境設定要件

### 7.1. 必須環境変数
```bash
# agent/.env
CONVEX_URL=https://your-convex-deployment.convex.cloud
GOOGLE_GENERATIVE_AI_API_KEY=your-google-ai-api-key

# backend/.env
CONVEX_AUTH_TOKEN=your-convex-auth-token
```

### 7.2. 実行要件
- Node.js ≥ 20.9.0
- Convex CLI
- Google AI Studio APIキー

## 8. 開発・実装タスク分割

### 8.1. Phase 1: 基盤構築（推定3-4日）

#### Task 1.1: プロジェクト初期化（30分）
- [ ] GitHubリポジトリ作成（`smart-knowledge-bot`）
- [ ] ディレクトリ構造作成
- [ ] `.gitignore`, `README.md`, `.env.example`作成
- **検証**: ディレクトリ構造が正しく作成されている

#### Task 1.2: skb-datastore基盤構築（1-2時間）
- [ ] Convexプロジェクト初期化
- [ ] `schema.ts`実装（pages, knowledgeテーブル）
- [ ] 基本CRUD操作実装（pages.ts, knowledge.ts）
- **検証**: Convexダッシュボードでテーブル作成確認

#### Task 1.3: skb-intelligence基盤構築（1-2時間）
- [ ] Mastraプロジェクト初期化
- [ ] 基本エージェント実装（`knowledge-agent.ts`）
- [ ] ConvexClient共通モジュール作成
- **検証**: Mastraプレイグラウンド起動確認

#### Task 1.4: 環境変数・認証設定（30分）
- [ ] 環境変数テンプレート作成
- [ ] Google AI API設定
- [ ] Convex認証設定
- **検証**: 環境変数読み込み・API接続テスト

### 8.2. Phase 2: コアツール実装（推定4-5日）

#### Task 2.1: system-maintenance.ts（1時間）
- [x] データベース初期化機能
- [x] ヘルスチェック機能
- **検証**: 空のDBからデータ削除まで正常動作

#### Task 2.2: ベクトル検索基盤構築（2時間）
- [x] Convex v1.24.8 ベクトル検索API実装
- [x] Action/Query連携パターン確立
- [x] Google AI Embedding統合
- **検証**: ベクトル検索動作確認（スコア1.0達成）

#### Task 2.3: web-crawler.ts（2-3時間）
- [ ] Playwright基盤実装
- [ ] 基本クロール機能（単一ページ）
- [ ] 再帰クロール機能
- [ ] エラーハンドリング・リトライ機構
- **検証**: 指定サイトのページ取得・DB保存確認

#### Task 2.4: document-processor.ts（2-3時間）
- [ ] テキスト分割機能（LangChain）
- [ ] ベクトル化機能（Google Embeddings）
- [ ] バッチ処理機能
- **検証**: クロールデータのベクトル化・検索インデックス作成

#### Task 2.5: knowledge-searcher.ts（2-3時間）
- [ ] 質問翻訳機能（日→英）
- [ ] ベクトル検索機能
- [ ] 回答生成機能（Gemini）
- [ ] 完全なRAGパイプライン統合
- **検証**: 質問入力→回答出力の全フロー動作確認

### 8.3. Phase 3: 統合・最適化（推定2-3日）

#### Task 3.1: エージェント統合（1-2時間）
- [ ] 全ツールのエージェント登録
- [ ] ツール呼び出しフロー確認
- [ ] エラーハンドリング強化
- **検証**: エージェント経由での全機能動作確認

#### Task 3.2: ワークフロー実装（1-2時間）
- [ ] `knowledge-ingestion.workflow.ts`
- [ ] `data-processing.workflow.ts`
- **検証**: ワークフロー経由でのバッチ処理実行

#### Task 3.3: テスト実装（2-3時間）
- [ ] 単体テスト（各ツール）
- [ ] 統合テスト（RAGパイプライン）
- [ ] E2Eテスト（ユーザーシナリオ）
- **検証**: 全テストがパス

### 8.4. Phase 4: 本番化準備（推定2-3日）

#### Task 4.1: パフォーマンス最適化（1日）
- [ ] バッチサイズ調整
- [ ] 並列処理最適化
- [ ] メモリ使用量最適化
- **検証**: 大量データでの安定動作確認

#### Task 4.2: デプロイ準備（1-2日）
- [ ] Next.js統合準備
- [ ] Vercel/Netlify設定
- [ ] 本番環境変数設定
- **検証**: デプロイ環境での動作確認

### 8.5. 各タスクの動作確認基準

#### 必須チェック項目
1. **機能動作**: 期待される入出力が正しく動作
2. **エラーハンドリング**: 異常系でも適切にエラーメッセージ出力
3. **ログ出力**: デバッグ可能なレベルでログが出力される
4. **パフォーマンス**: 想定データ量で実用的な速度で動作

#### Phase完了基準
- **Phase 1**: 基本的な接続・認証が全て動作
- **Phase 2**: 各ツールが独立して期待動作を実行
- **Phase 3**: エージェント経由で全機能が統合動作
- **Phase 4**: 本番デプロイ可能な品質・性能

## 9. 拡張ポイント

### 9.1. スケーラビリティ
- バッチサイズ調整による並列処理最適化
- チャンクサイズ・オーバーラップのドメイン別チューニング
- 複数言語対応の拡張

### 9.2. 機能追加候補
- PDF/Word文書対応
- リアルタイム更新監視
- ユーザー別知識ベース分離
- 検索結果の関連度スコア表示

## 10. 技術仕様・制約事項

### 10.1. 前回実装の教訓を活かした設計改善

#### 🎯 **確実な成功要因**
1. **統一されたツールパターン**: 全て`@mastra/core/tools`インポート使用
2. **一貫した引数処理**: `execute: async ({ context }) => { const { param } = context; }`
3. **段階的検証**: 各Phaseで動作確認を必須とする
4. **Playwright採用**: より堅牢なクローラー（従来のfetch+cheerioから変更）

#### 🚫 **回避すべき問題パターン**
1. **混在したインポート**: `@mastra/core` vs `@mastra/core/tools`
2. **直接パラメータ受け取り**: `({ param })` パターン禁止
3. **一括実装**: 段階的テストなしでの大量実装
4. **不安定なクローラー**: fetchベースのタイムアウト問題

### 10.2. 技術的制約・仕様
- **ベクトル次元**: 768次元固定（Google embedding-001）
- **クロール対象**: Playwright対応サイト（JavaScript動的コンテンツ対応）
- **言語対応**: 日本語質問→英語検索→日本語回答
- **データベース**: Convex（サーバーレス、自動スケール）
- **同時処理**: バッチサイズ10での並列処理

### 10.3. 運用制約
- **開発環境**: Mastraプレイグラウンド
- **本番環境**: Vercel/Netlify + REST API
- **API制限**: Google AI APIレート制限対応
- **データ容量**: Convex Free tierの制限内

## 11. 品質保証・テスト戦略

### 11.1. 必須テストパターン

#### 単体テスト（各ツール）
```typescript
// 例: web-crawler.ts
describe('WebCrawler', () => {
  test('single page crawl', async () => {
    const result = await webCrawler.execute({
      context: { startUrl: 'https://example.com', maxDepth: 0 }
    });
    expect(result.pagesCount).toBe(1);
  });
});
```

#### 統合テスト（RAGパイプライン）
```typescript
describe('RAG Pipeline', () => {
  test('end-to-end Q&A', async () => {
    // 1. データ投入
    await dataMaintenance.purgeAll();
    await webCrawler.execute({ context: { startUrl, maxDepth: 1 } });
    await documentProcessor.execute();

    // 2. 質問・回答
    const answer = await knowledgeSearcher.execute({
      context: { question: '○○について教えて' }
    });
    expect(answer).toContain('expected_content');
  });
});
```

### 11.2. 段階的検証チェックリスト

#### Phase 1 完了チェック
- [ ] Convexダッシュボードでテーブル確認
- [ ] Mastraプレイグラウンド起動
- [ ] 環境変数接続テスト
- [ ] 基本エージェント応答確認

#### Phase 2 完了チェック
- [ ] 各ツール単独実行成功
- [ ] データベースへの正常な読み書き
- [ ] エラー時の適切なメッセージ出力
- [ ] ログレベルの適切な出力

#### Phase 3 完了チェック
- [ ] エージェント経由でのツール呼び出し成功
- [ ] 完全なRAGフロー動作確認
- [ ] パフォーマンステスト（小規模データ）
- [ ] 異常系処理の動作確認

#### Phase 4 完了チェック（75%完了 - 2025-07-01）
- [x] **Phase 4.1-4.3**: Next.js基盤構築・API統合・動作確認
- [x] **Phase 4.4**: 質問フォーム・バリデーション・状態管理実装
- [x] **Phase 4.5**: RAGシステム統合・エンドツーエンドテスト成功
- [ ] **Phase 4.6**: ローディング状態改善・エラーハンドリング強化
- [ ] **Phase 4.7**: Vercelデプロイ・本番環境動作確認
- [x] **技術実証**: 「装備強化方法」質問で5件関連文書→653文字専門回答（9.7秒）
- [x] **統合確認**: フロントエンド→API→ベクトル検索→AI回答パイプライン動作

## 12. 実装時の重要な指針

### 12.1. コーディングガイドライン

#### Mastraツール実装テンプレート
```typescript
import { createTool } from '@mastra/core/tools';  // 必須
import { z } from 'zod';

const inputSchema = z.object({
  param: z.string().describe("パラメータ説明"),
});

export const toolName = createTool({
  id: 'unique-tool-id',
  description: '具体的な機能説明',
  inputSchema,
  outputSchema: z.object({ result: z.string() }),
  execute: async ({ context }) => {  // contextパターン必須
    const { param } = context;       // パラメータ取得

    // 自己完結型クライアント初期化
    const client = new SomeClient(process.env.API_KEY);

    try {
      // メイン処理
      const result = await client.process(param);
      return { result };
    } catch (error) {
      console.error(`[TOOL_ERROR] ${error.message}`);
      throw error;
    }
  },
});
```

#### エラーハンドリング標準パターン
```typescript
try {
  const result = await externalAPI.call();
  console.log(`[SUCCESS] ${operationName}: ${result.summary}`);
  return result;
} catch (error) {
  const errorMsg = error instanceof Error ? error.message : 'Unknown error';
  console.error(`[ERROR] ${operationName}: ${errorMsg}`);
  throw new Error(`${operationName} failed: ${errorMsg}`);
}
```

### 12.2. デバッグ・トラブルシューティング

#### ログレベル標準
- `[INFO]`: 正常な処理開始・完了
- `[DEBUG]`: 内部処理の詳細情報
- `[WARN]`: 継続可能な問題
- `[ERROR]`: 処理失敗・例外

#### 典型的な問題と解決策
1. **ツール引数が渡らない** → インポート・execute署名確認
2. **Convex接続失敗** → 環境変数・認証設定確認
3. **ベクトル検索が動かない** → インデックス定義・次元数確認
4. **クロール失敗** → Playwrightヘッドレス設定・タイムアウト確認

---

## 13. Phase 3.5 完了報告 (2025-06-30)

### ※ 最新状況: Phase 3.9完了 (2025-07-01)
**デプロイ準備完了**: 品質チェック実施済み、Phase 4本番デプロイ待機状態
**詳細**: [PHASE3_9_COMPLETION_FINAL.md](./PHASE3_9_COMPLETION_FINAL.md) 参照

---

### 13.1. 重複実行問題の解決

#### 技術的課題
- **問題**: webCrawlerの重複実行により50件制限を超過（最大200件）
- **原因1**: 既存URL重複チェックロジックの不備
- **原因2**: シングルトン実行制御の未実装

#### 解決策実装
```typescript
// 1. 重複排除ロジック修正
const existingPage = existingPageResult?.value;
if (existingPage !== null && existingPage !== undefined) {
  // 正確なnull判定による重複防止
}

// 2. シングルトンパターン実装
let isRunning = false;
if (isRunning) return { success: false, message: 'Already running' };
isRunning = true;
```

#### 結果
- ✅ **正確な50件制限**: 重複なし、制限超過なし
- ✅ **並行実行防止**: 複数プロセス完全制御
- ✅ **安定動作**: メモリリーク・タイムアウト解決

### 13.2. RAGシステム性能検証結果

#### データ構築成果
- **クロール**: 50ページ（guide.rolg.maxion.gg）
- **ベクトル化**: 386ドキュメント（平均7.7チャンク/ページ）
- **処理時間**: バッチサイズ10で安定動作

#### 回答品質検証

| カテゴリ | 成功率 | スコア範囲 | 例 |
|---------|--------|-----------|-----|
| **装備・アイテム系** | 100% | 0.80-0.76 | エンチャント詳細手順 |
| **基本ゲームシステム** | 50% | 0.75-0.70 | パーティー（成功）、ギルド（部分） |
| **Web3・NFT系** | 33% | 0.74-0.72 | 存在認識のみ |
| **PvP・戦闘系** | 0% | - | 範囲外 |
| **技術・操作系** | 0% | - | 範囲外 |

#### 翻訳精度
- ✅ **一般用語**: 高精度翻訳
- ⚠️ **専門用語**: 一部誤訳（例：アサシンクラス→暗殺教室）
- ✅ **誤訳耐性**: コンテキスト検索で補完

### 13.3. 運用制限と最適化

#### メモリ管理方針
- **クロール制限**: 50ページ/回（メモリ安定性）
- **処理制限**: 10件/バッチ（API制限対応）
- **拡張方針**: ワークフロー繰り返し実行

#### 推奨運用パターン
```bash
# Phase 1: データ収集
webCrawler → 50ページ保存
purgeKnowledgeBase → 必要時リセット

# Phase 2: データ処理（5回繰り返し）
processPendingDocuments(batchSize=10) × 5回
→ 50ページ完全処理

# Phase 3: 質問回答
answerQuestionFromDocs → 実用サービス
```

### 13.4. 次期開発推奨事項

#### Phase 4優先タスク
1. **Next.js統合**: Webアプリ化
2. **ワークフロー実装**: 自動化パイプライン
3. **知識ベース拡張**: ユーザーフィードバック基づく

#### 技術的負債
- **制限緩和**: 大規模クロール時のメモリ最適化
- **翻訳精度**: ゲーム専門用語辞書
- **UI改善**: 質問入力・回答表示最適化

### 13.5. 段階的統合・運用改善計画

#### 重要な方針転換：実運用品質重視アプローチ
**上級者アドバイス適用**:
- Playwright MCP活用による徹底的バグ検証優先
- リーガル・セキュリティチェック最優先実施
- 技術改善より実運用リスク回避重視
- 本番稼働中サービスの安全性確保

#### Phase 5: インフラ最適化（推定1-2週間）

**短期改善: Docker化**
```yaml
# docker-compose.yml 構成
services:
  convex:
    image: convex-dev
    command: npx convex dev
    environment:
      - CONVEX_URL=${CONVEX_URL}
      - CONVEX_AUTH_TOKEN=${CONVEX_AUTH_TOKEN}

  mastra:
    image: node:20
    working_dir: /app/skb-intelligence
    command: npx mastra dev --dir src/mastra --env .env
    environment:
      - GOOGLE_GENERATIVE_AI_API_KEY=${GOOGLE_GENERATIVE_AI_API_KEY}

  frontend:
    image: node:20
    working_dir: /app/skb-frontend
    command: npm run dev
    ports:
      - "3000:3000"
    depends_on:
      - convex
      - mastra
```

**利点**:
- ワンコマンド起動: `docker-compose up`
- 環境統一: 開発・本番環境の一致
- 依存関係解決: サービス間の起動順序制御

#### Phase 6: フルマネージド化（推定2-4週間）

**長期改善: クラウドネイティブ構成**

1. **データベース層**: Convex本番環境移行
   - 開発用: `npx convex dev`
   - 本番用: Convex Production Dashboard
   - 利点: 自動スケーリング・24時間稼働

2. **AIエージェント層**: Vercel Functions統合
   ```typescript
   // /api/mastra-tools/[...tool].ts
   export default async function handler(req, res) {
     const toolResult = await mastraTools.execute(req.body);
     return res.json(toolResult);
   }
   ```

3. **フロントエンド層**: Vercel（現在完了済み）
   - URL短縮: カスタムドメイン設定
   - CDN: 自動最適化・高速配信

**最終構成**:
```bash
# 理想的なワンクリック運用
Frontend: smartknowledgebot.vercel.app (Vercel)
API: /api/chat, /api/tools (Vercel Functions)
Database: Convex Production (自動管理)
AI: Google AI API (外部サービス)

# 開発者操作
git push origin main → 自動デプロイ → 本番反映
```

#### Phase 7: 運用最適化（推定1-2週間）

**URL管理・ブランディング**
```bash
# カスタムドメイン設定
vercel domains add smartknowledgebot.vercel.app
vercel alias set [current-long-url] smartknowledgebot.vercel.app

# 独自ドメイン（オプション）
smartknowledgebot.com → Vercel連携
```

**モニタリング・解析**
- Vercel Analytics: ユーザー行動解析
- Convex Dashboard: データベース使用量
- エラートラッキング: 24時間監視

**スケーラビリティ対応**
- Vercel: 自動スケーリング（無制限）
- Convex: 使用量ベース課金
- Google AI: API制限管理

### 13.6. Post-Production Development Strategy

#### Phase 5A: Production Quality Assurance & Refactoring (1-2週間)
**Branch**: `refactor/phase4-cleanup`
**優先度**: 最高（本番稼働中のリスク回避）

**Phase 5A-1: 実運用品質検証（完了・2025年7月2日）** ✅

1. **Playwright MCP徹底バグ検証 完了**
   **検証結果**:
   - **総合リスクスコア**: 88/100（極めて高リスク）
   - **基本機能**: 80% 正常動作（RAG応答30秒超タイムアウト）
   - **セキュリティ**: XSS脆弱性6/6件検出（クリティカル）
   - **UI/UX**: 66.7%（モバイル表示崩れ・iPhone 8サイズ問題）
   - **パフォーマンス**: 25%（Core Web Vitals失敗）

2. **リーガル・セキュリティ徹底チェック 完了**
   **発見問題**:
   - **🔴 GDPR違反**: プライバシーポリシー未設置（制裁金最大20億円）
   - **🔴 セキュリティ**: HTTPヘッダー不足・CSP未設定
   - **🟡 著作権**: クロール対象サイト利用許可未確認（中リスク）
   - **🟡 API規約**: Google AI商用利用条件要確認

## 📋 個人利用・学習目的での段階別改善計画（Phase 5A-1結果反映）

### 🎯 **前提条件**: 個人利用・学習目的のリスク評価調整

**リスク重要度の再評価**:
- **法的リスク**: 高→中（個人利用・非商用・学習目的）
- **セキュリティリスク**: 高→中（単一ユーザー・内部利用）
- **技術学習価値**: 最優先（RAG技術・AI統合の実証）

### Phase A: 学習継続のための最小限対応（48時間以内）

#### A-1: 基本セキュリティ対応（2時間）
**優先度**: 高（学習環境の安全確保）
```typescript
// next.config.ts - セキュリティヘッダー追加
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline';" }
    ]
  }];
}
```

#### A-2: 学習用免責表示（1時間）
**優先度**: 中（個人利用明示）
```typescript
// 学習・実験目的の明示
<div className="bg-blue-50 p-4 mb-4">
  <h3>学習・実験目的のプロトタイプ</h3>
  <ul>
    <li>個人の技術学習・研究目的のみ</li>
    <li>商用利用・第三者提供なし</li>
    <li>RAG技術・AI統合の実証実験</li>
  </ul>
</div>
```

#### A-3: 基本入力検証（3時間）
**優先度**: 中（安全な実験環境）
```typescript
// 個人利用レベルの入力検証
const inputSchema = z.object({
  message: z.string().min(1).max(500),  // 個人利用で十分
  action: z.enum(['rag_search']).default('rag_search')
});
```

### Phase B: 学習価値最大化（1週間以内）

#### B-1: RAG性能改善（技術学習重点）
**優先度**: 最高（学習目的の核心）
- RAG応答時間短縮（30秒→15秒目標）
- ベクトル検索精度向上
- 翻訳パイプライン最適化

#### B-2: 技術実験機能追加（学習拡張）
**優先度**: 高（学習範囲拡大）
- 検索結果詳細表示（関連文書・スコア表示）
- パラメータ調整UI（閾値・件数調整）
- 処理時間測定・パフォーマンス可視化

#### B-3: ベクトル化・クロールワークフロー自動化
**優先度**: 最高（学習効率・実験効率向上）
- **現在の手動プロセス**: 3ステップの手動実行
  ```bash
  # 手動操作（学習には非効率）
  1. webCrawler → 50ページ収集
  2. processPendingDocuments × 5回 → ベクトル化
  3. answerQuestionFromDocs → 質問回答
  ```

- **自動化ワークフロー実装**:
  ```typescript
  // 学習用简化ワークフロー
  export const createLearningWorkflow = () => ({
    name: "learning-rag-pipeline",
    steps: [
      { tool: "systemMaintenance", params: { action: "status" } },
      { tool: "webCrawler", params: { maxDepth: 2, maxPages: 50 } },
      { tool: "processPendingDocuments", params: { batchSize: 10, maxBatches: 5 } },
      { tool: "systemMaintenance", params: { action: "verify" } }
    ]
  });
  ```

- **学習価値**:
  - ワンクリック実験: 新サイト→完全RAG化
  - パラメータ実験: 異なる設定での比較学習
  - 効率向上: 手動操作から自動化への技術習得

#### B-4: ローカル開発環境最適化
**優先度**: 高（学習効率向上）
- Docker Compose設定
- 開発用スクリプト整備
- ホットリロード・デバッグ環境

### Phase C: 技術探求・拡張実験（1ヶ月以内）

#### C-1: 高度なワークフロー・RAG技術実験
**優先度**: 最高（技術スキル向上）

**C-1a: 動的ワークフロー生成**
```typescript
// 学習実験用の柔軟なワークフロー生成
export function createExperimentWorkflow(config: {
  sitesToCrawl: string[],
  maxPagesPerSite: number,
  processingBatchSize: number,
  embeddingModel: string
}) {
  const steps = [
    { tool: "purgeKnowledgeBase" },
    ...config.sitesToCrawl.map(site => ({
      tool: "webCrawler",
      params: { startUrl: site, maxPages: config.maxPagesPerSite }
    })),
    ...generateProcessingSteps(config.processingBatchSize),
    { tool: "systemMaintenance", params: { action: "finalReport" } }
  ];

  return createWorkflow({ name: `experiment-${Date.now()}`, steps });
}
```

**C-1b: 高度なRAG技術実験**
- 複数知識ベース対応（異なるサイトの比較実験）
- ハイブリッド検索（キーワード+ベクトル）
- カスタムEmbeddingモデル実験
- A/Bテスト自動化（設定パラメータの効果測定）

**C-1c: 学習実験パターン**
```typescript
// 実験例：異なるサイトでのRAG性能比較
const experiments = [
  { site: "ゲーム攻略サイト", maxPages: 100, batchSize: 20 },
  { site: "技術ドキュメント", maxPages: 50, batchSize: 10 },
  { site: "ニュースサイト", maxPages: 200, batchSize: 25 }
];

// 自動実験実行
experiments.forEach(async (exp) => {
  const workflow = createExperimentWorkflow(exp);
  const results = await executeWorkflow(workflow);
  compareResults(results);
});
```

#### C-2: AI技術統合実験
**優先度**: 高（AI技術学習）
- 複数LLMモデル比較（Claude・GPT・Gemini）
- Few-shot learning実験
- Chain-of-Thought prompting

#### C-3: フルスタック技術習得
**優先度**: 中（総合技術力向上）
- 認証システム実装（学習用）
- データベース設計最適化
- API設計パターン学習

### 🚀 **個人利用・学習重視の実装戦略**

#### 学習価値重視の優先順位（ワークフロー化反映）
```bash
# 最優先: 自動化による学習効率向上
1. ベクトル化・クロールワークフロー自動化（Phase B-3）
2. RAG技術の深掘り（応答時間・精度改善）
3. 動的ワークフロー生成・実験自動化（Phase C-1a）

# 高優先: 技術学習・実証価値
4. AI統合パターンの習得
5. フルスタック技術の実践
6. 高度なRAG技術実験（Phase C-1b）

# 中優先: 安全な学習環境・効率向上
7. 基本セキュリティ（個人利用レベル）
8. 開発環境最適化・Docker化
9. 実験機能追加（パラメータ調整UI）

# 低優先: 商用レベル対応
10. 包括的コンプライアンス（学習後に適用）
11. エンタープライズセキュリティ
12. 大規模運用対応
```

#### ワークフロー化による学習効果
- **手動→自動**: 3ステップ手動実行から1クリック自動化
- **実験効率**: 異なるサイト・パラメータでの比較実験が容易
- **技術習得**: Mastraワークフロー・自動化パターンの習得
- **時間短縮**: 手動操作時間を技術探求に転換

#### 個人利用のメリット活用
- **リスク低減**: 法的・セキュリティリスクの大幅軽減
- **学習重視**: 技術習得・実験に集中可能
- **高速イテレーション**: 完璧性より実験・学習速度重視
- **技術探求**: 商用制約なしでの自由な技術実験

#### 投資対効果（学習目的）
| フェーズ | 工数 | 技術学習価値 | 実用価値 |
|----------|------|-------------|----------|
| **Phase A** | 6時間 | 中（基本セキュリティ） | 高（安全な実験環境） |
| **Phase B** | 1週間 | 最高（RAG技術深掘り） | 最高（技術実証） |
| **Phase C** | 1ヶ月 | 最高（AI・フルスタック） | 高（転用可能技術） |

### 🎓 **学習成果の体系化**

#### 習得予定技術スタック
- **AI・ML**: RAG・Embedding・LLM統合・プロンプトエンジニアリング
- **フロントエンド**: React・Next.js・TypeScript・Tailwind CSS
- **バックエンド**: Node.js・API設計・サーバーレス
- **データベース**: ベクトル検索・NoSQL・リアルタイム処理
- **インフラ**: Vercel・Docker・CI/CD
- **セキュリティ**: Web セキュリティ基本・API保護

#### 成果物・ポートフォリオ価値
- 実動するRAGシステム
- AI統合Webアプリケーション
- フルスタック開発経験
- 現代的技術スタック習得実績
- 実用的な技術プロトタイプ

**Phase 5A-2: 技術的リファクタリング（中優先・1週間）**

3. **TypeScript強化**
   - any型の排除・適切な型定義
   - 厳密なnull安全性確保
   - インターフェース統一
   ```typescript
   // 改善例
   interface SearchResult {
     id: string;
     text: string;
     sourceUrl: string;
     score: number;
   }
   const results: SearchResult[] = searchResults?.value || [];
   ```

4. **エラーハンドリング統一**
   - 統一エラー処理クラス
   - ユーザーフレンドリーメッセージ
   - ログ管理システム
   ```typescript
   class ErrorHandler {
     static handleAPIError(error: unknown, context: string) {
       const message = error instanceof Error ? error.message : 'Unknown error';
       logger.error(`${context}: ${message}`);
       return this.generateUserFriendlyMessage(error);
     }
   }
   ```

5. **設定管理改善**
   - 環境別設定ファイル
   - 動的パラメータ調整
   - バリデーション強化
   ```typescript
   interface AppConfig {
     crawling: {
       maxPages: number;
       maxDepth: number;
       batchSize: number;
     };
     ai: {
       scoreThreshold: number;
       maxDocuments: number;
     };
   }
   ```

**実装方針の転換**:
- **従来**: 技術的完璧性重視 → コード品質向上
- **改善**: 実運用リスク回避重視 → ビジネス継続性確保
- **効果**: 法的・セキュリティリスクの事前回避 → 安全な事業運営

#### Phase 5B: Docker化・開発環境最適化 (3-5日)
**Branch**: `feature/docker-optimization`
**優先度**: 高（開発効率向上）

1. **Docker Compose設定**
   ```yaml
   # docker-compose.yml
   version: '3.8'
   services:
     convex:
       image: node:20
       working_dir: /app/skb-datastore
       command: npx convex dev
       environment:
         - CONVEX_URL=${CONVEX_URL}
         - CONVEX_AUTH_TOKEN=${CONVEX_AUTH_TOKEN}
       volumes:
         - ./skb-datastore:/app/skb-datastore
         - /app/skb-datastore/node_modules

     mastra:
       image: node:20
       working_dir: /app/skb-intelligence
       command: npx mastra dev --dir src/mastra --env .env
       environment:
         - GOOGLE_GENERATIVE_AI_API_KEY=${GOOGLE_GENERATIVE_AI_API_KEY}
         - CONVEX_URL=${CONVEX_URL}
         - CONVEX_AUTH_TOKEN=${CONVEX_AUTH_TOKEN}
       volumes:
         - ./skb-intelligence:/app/skb-intelligence
         - /app/skb-intelligence/node_modules
       ports:
         - "4111:4111"
       depends_on:
         - convex

     frontend:
       image: node:20
       working_dir: /app/skb-frontend
       command: npm run dev
       environment:
         - GOOGLE_GENERATIVE_AI_API_KEY=${GOOGLE_GENERATIVE_AI_API_KEY}
         - CONVEX_URL=${CONVEX_URL}
         - CONVEX_AUTH_TOKEN=${CONVEX_AUTH_TOKEN}
       volumes:
         - ./skb-frontend:/app/skb-frontend
         - /app/skb-frontend/node_modules
       ports:
         - "3000:3000"
       depends_on:
         - convex
         - mastra
   ```

2. **開発用スクリプト追加**
   ```json
   // package.json (root)
   {
     "scripts": {
       "dev": "docker-compose up",
       "dev:build": "docker-compose up --build",
       "dev:clean": "docker-compose down -v",
       "dev:logs": "docker-compose logs -f"
     }
   }
   ```

3. **環境変数管理**
   ```bash
   # .env.example (root)
   GOOGLE_GENERATIVE_AI_API_KEY=your-google-ai-api-key
   CONVEX_URL=https://your-project.convex.cloud
   CONVEX_AUTH_TOKEN=your-convex-auth-token
   ```

4. **利点**
   - ワンコマンド起動: `npm run dev`
   - 環境統一: 開発・本番環境の一致
   - 依存関係解決: サービス間の起動順序制御
   - 新メンバー対応: 環境構築5分で完了

#### Phase 5C: Large-Scale Workflow Implementation (1-2週間)
**Branch**: `feature/large-scale-workflow`
**優先度**: 高（スケーラビリティ向上）

1. **動的ワークフロー生成**
   ```typescript
   export function createBatchWorkflow(totalPages: number, batchSize: number) {
     const batches = Math.ceil(totalPages / batchSize);
     const steps = [
       {
         id: "purge-old-data",
         tool: "purgeKnowledgeBase"
       },
       {
         id: "crawl-full-site",
         tool: "webCrawler",
         params: { maxDepth: 3, MAX_PAGES: totalPages }
       },
       ...Array.from({ length: batches }, (_, i) => ({
         id: `process-batch-${i + 1}`,
         tool: "processPendingDocuments",
         params: { batchSize, startIndex: i * batchSize }
       })),
       {
         id: "final-verification",
         tool: "systemMaintenance"
       }
     ];

     return createWorkflow({
       name: `batch-process-${totalPages}-pages`,
       steps
     });
   }
   ```

2. **段階的スケーリング**
   - 小規模テスト: 100ページ、20件ずつ
   - 中規模運用: 500ページ、50件ずつ
   - 大規模運用: 2000ページ、100件ずつ

3. **進捗監視・管理**
   - Mastraプレイグラウンドでリアルタイム監視
   - エラー復旧機能（部分再実行）
   - 実行履歴・ログ管理

4. **パフォーマンス最適化**
   - メモリ使用量監視
   - API制限対応（レート制限・待機時間）
   - バッチサイズ動的調整

#### Git Strategy & Development Flow

**ブランチ戦略**:
```bash
main                    # 本番稼働中（保護・直接push禁止）
├── refactor/phase4-cleanup      # Phase 5A: リファクタリング
├── feature/docker-optimization  # Phase 5B: Docker化
├── feature/large-scale-workflow # Phase 5C: ワークフロー機能
├── feature/multi-site-support   # Phase 6: 複数サイト対応
└── hotfix/*            # 緊急修正
```

**開発フロー**:
1. **機能ブランチ作成**: `git checkout -b feature/xxx`
2. **実装・テスト**: ローカル環境での開発
3. **PR作成**: コードレビュー・品質チェック
4. **マージ**: main への統合
5. **デプロイ**: Vercel自動デプロイ
6. **動作確認**: 本番環境でのテスト

**品質管理**:
- **必須**: TypeScript型チェック
- **必須**: ESLint・Prettier
- **必須**: Pre-commit hooks（セキュリティチェック）
- **推奨**: 単体テスト（重要機能）
- **推奨**: E2Eテスト（RAGパイプライン）

#### 実装優先度

**Phase 5A (最優先)**: 実運用品質保証・リファクタリング
- **ROI**: 法的・セキュリティリスク回避・事業継続性確保
- **工数**: 1-2週間（Phase 5A-1: 1週間、Phase 5A-2: 1週間）
- **リスク**: 極低（本番稼働中の致命的リスク回避）

**Phase 5B (高優先)**: Docker化・開発環境最適化
- **ROI**: 開発効率3倍向上・環境統一
- **工数**: 3-5日
- **リスク**: 低（開発環境のみ影響）

**Phase 5C (高優先)**: ワークフロー機能
- **ROI**: スケーラビリティ・運用効率向上
- **工数**: 1-2週間
- **リスク**: 中（新機能追加）

**Phase 6 (中期)**: フルマネージド化
- **ROI**: 運用コスト削減・可用性向上
- **工数**: 2-4週間
- **リスク**: 中（移行時のダウンタイム）

**Phase 7 (長期)**: 運用最適化
- **ROI**: ブランド価値・ユーザビリティ向上
- **工数**: 1-2週間
- **リスク**: 低

---

*このPRDは2025-07-02時点でのPhase 4完全完了とVercel本番稼働を反映しています。段階的統合によりエンタープライズレベルの運用体制への移行準備が整いました。*
