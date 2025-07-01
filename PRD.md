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

### 1.6. 実装完了状況 (2025-06-30更新)
✅ **MVP完成**: 全コア機能実装・動作確認完了
✅ **Phase 2**: RAGパイプライン完全実装
✅ **Phase 3**: エージェント統合・実サイト検証完了
✅ **Phase 3.5**: 重複実行問題解決・本格運用検証完了
⏳ **Phase 4**: 本番化準備（Next.js統合）

**実証済みサイト**: guide.rolg.maxion.gg（50ページ→386ドキュメント）

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

#### Phase 4 完了チェック
- [ ] 本番環境でのデプロイ成功
- [ ] REST API動作確認
- [ ] 大量データでの性能検証
- [ ] 監視・ログ基盤の動作確認

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

---

*このPRDは2025-06-30時点での完全動作MVPの実装実績を反映しています。Phase 4本番化への準備が整った状態です。*
