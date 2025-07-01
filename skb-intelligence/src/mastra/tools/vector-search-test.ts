import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// ConvexClient utility import
const ConvexClient = {
  async query(functionName: string, args?: any) {
    const response = await fetch(`${process.env.CONVEX_URL}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Convex-Client': 'npm-1.0.0',
      },
      body: JSON.stringify({
        path: functionName,
        args: args || {},
        adminKey: process.env.CONVEX_AUTH_TOKEN,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Convex query failed: ${response.statusText} - ${errorText}`);
    }

    return response.json();
  },

  async action(functionName: string, args?: any) {
    const response = await fetch(`${process.env.CONVEX_URL}/api/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Convex-Client': 'npm-1.0.0',
      },
      body: JSON.stringify({
        path: functionName,
        args: args || {},
        adminKey: process.env.CONVEX_AUTH_TOKEN,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Convex action failed: ${response.statusText} - ${errorText}`);
    }

    return response.json();
  },

  async mutation(functionName: string, args?: any) {
    const response = await fetch(`${process.env.CONVEX_URL}/api/mutation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Convex-Client': 'npm-1.0.0',
      },
      body: JSON.stringify({
        path: functionName,
        args: args || {},
        adminKey: process.env.CONVEX_AUTH_TOKEN,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Convex mutation failed: ${response.statusText} - ${errorText}`);
    }

    return response.json();
  },
};

// テスト用ドキュメント挿入ツール
export const insertTestDocument = createTool({
  id: 'insert_test_document',
  description: 'テスト用のベクトル化ドキュメントをデータベースに挿入する',
  inputSchema: z.object({
    text: z.string().describe('挿入するテキスト内容'),
    sourceUrl: z.string().describe('ソースURL（テスト用）'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    documentId: z.string().optional(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    const { text, sourceUrl } = context;

    console.log('[INFO] insert_test_document: Creating test document with vector embedding');

    try {
      // Google AI APIでテキストをベクトル化
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
      const model = genAI.getGenerativeModel({ model: 'embedding-001' });

      const embeddingResult = await model.embedContent(text);
      const embedding = embeddingResult.embedding.values;

      console.log(`[DEBUG] insert_test_document: Generated embedding with ${embedding.length} dimensions`);

      // Convexにドキュメントを保存
      const result = await ConvexClient.mutation('knowledge:addDocument', {
        text,
        embedding,
        sourceUrl,
      });

      console.log(`[DEBUG] insert_test_document: Raw result from Convex:`, JSON.stringify(result, null, 2));

      const actualResult = result?.status === 'success' ? result.value : result;
      const documentId = actualResult || 'unknown';

      console.log(`[SUCCESS] insert_test_document: Inserted document with ID ${documentId}`);

      return {
        success: true,
        documentId: documentId.toString(),
        message: `Test document inserted successfully. ID: ${documentId}`,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ERROR] insert_test_document: ${errorMsg}`);

      return {
        success: false,
        message: `Failed to insert test document: ${errorMsg}`,
      };
    }
  },
});

// ベクトル検索テストツール
// ドキュメント数確認ツール
export const checkDocumentCount = createTool({
  id: 'check_document_count',
  description: 'データベース内のドキュメント数を確認する',
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    count: z.number().optional(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    console.log('[INFO] check_document_count: Checking document count in database');

    try {
      // ConvexClient経由でドキュメント数を取得
      const result = await ConvexClient.query('knowledge:getDocumentCount');
      const actualResult = result?.status === 'success' ? result.value : result;
      const count = typeof actualResult === 'number' ? actualResult : 0;

      console.log(`[SUCCESS] check_document_count: Found ${count} documents in database`);

      return {
        success: true,
        count,
        message: `Database contains ${count} documents`,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ERROR] check_document_count: ${errorMsg}`);

      return {
        success: false,
        message: `Failed to check document count: ${errorMsg}`,
      };
    }
  },
});

export const testVectorSearch = createTool({
  id: 'test_vector_search',
  description: 'テストクエリでベクトル検索機能をテストする',
  inputSchema: z.object({
    query: z.string().describe('検索クエリテキスト'),
    limit: z.number().optional().describe('検索結果の最大件数（デフォルト: 3）'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    results: z.array(z.object({
      id: z.string(),
      text: z.string(),
      sourceUrl: z.string(),
      score: z.number(),
    })).optional(),
    message: z.string(),
    queryEmbeddingDimensions: z.number().optional(),
  }),
  execute: async ({ context }) => {
    const { query, limit = 3 } = context;

    console.log(`[INFO] test_vector_search: Testing vector search for query: "${query}"`);

    try {
      // Google AI APIでクエリをベクトル化
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
      const model = genAI.getGenerativeModel({ model: 'embedding-001' });

      const embeddingResult = await model.embedContent(query);
      const embedding = embeddingResult.embedding.values;

      console.log(`[DEBUG] test_vector_search: Generated query embedding with ${embedding.length} dimensions`);

      // Convexベクトル検索を実行
      const searchResult = await ConvexClient.action('search:searchByEmbedding', {
        embedding,
        limit,
      });

      const actualResult = searchResult?.status === 'success' ? searchResult.value : searchResult;
      const results = Array.isArray(actualResult) ? actualResult : [];

      console.log(`[SUCCESS] test_vector_search: Found ${results.length} results`);

      return {
        success: true,
        results: results.map((item: any) => ({
          id: item.id,
          text: item.text.substring(0, 100) + '...', // 最初の100文字のみ表示
          sourceUrl: item.sourceUrl,
          score: item.score,
        })),
        message: `Vector search completed successfully. Found ${results.length} results.`,
        queryEmbeddingDimensions: embedding.length,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ERROR] test_vector_search: ${errorMsg}`);

      return {
        success: false,
        message: `Vector search test failed: ${errorMsg}`,
      };
    }
  },
});
