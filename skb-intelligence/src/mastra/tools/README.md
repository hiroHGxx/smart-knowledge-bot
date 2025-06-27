# SmartKnowledgeBot Tools

このディレクトリには、SmartKnowledgeBotの各種ツールが格納されます。

## 予定されているツール

### 1. system-maintenance.ts
- データベース初期化機能
- ヘルスチェック機能

### 2. web-crawler.ts  
- Webページクロール機能
- 再帰クロール機能
- エラーハンドリング・リトライ機構

### 3. document-processor.ts
- テキスト分割機能（LangChain）
- ベクトル化機能（Google Embeddings）
- バッチ処理機能

### 4. knowledge-searcher.ts
- 質問翻訳機能（日→英）
- ベクトル検索機能
- 回答生成機能（Gemini）
- 完全なRAGパイプライン統合

## 実装パターン

全てのツールは以下のパターンに従います：

```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const inputSchema = z.object({
  param: z.string().describe("パラメータ説明"),
});

export const toolName = createTool({
  id: 'unique-tool-id',
  description: '具体的な機能説明',
  inputSchema,
  outputSchema: z.object({ result: z.string() }),
  execute: async ({ context }) => {
    const { param } = context;
    
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