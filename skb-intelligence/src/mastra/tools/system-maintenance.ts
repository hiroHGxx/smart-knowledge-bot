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

// 知識ベース削除ツール（2段階実行対応）
export const purgeKnowledgeBase = createTool({
  id: 'purge_knowledge_base',
  description: 'データベース内の全ての知識ベース（crawled_pages と documents テーブル）を完全に削除する',
  inputSchema: z.object({
    confirm: z.boolean().describe('削除を実行するかの確認フラグ（true: 実行, false: キャンセル）'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    deletedPages: z.number(),
    deletedDocuments: z.number(),
    message: z.string(),
    purgedAt: z.number().optional(),
  }),
  execute: async ({ context }) => {
    const { confirm } = context;

    console.log('[INFO] purge_knowledge_base: Starting database purge operation');

    try {
      if (!confirm) {
        console.log('[WARN] purge_knowledge_base: Operation cancelled by user');
        return {
          success: false,
          deletedPages: 0,
          deletedDocuments: 0,
          message: 'Operation cancelled. Set confirm=true to execute purge.',
        };
      }

      // 1. ドキュメント削除（バッチ処理）
      console.log('[INFO] purge_knowledge_base: Purging documents...');
      let deletedDocuments = 0;
      let documentsCursor = null;
      
      do {
        const documentsResult = await ConvexClient.mutation('admin:purgeDocumentsBatch', { 
          cursor: documentsCursor 
        });
        const actualDocsResult = documentsResult?.status === 'success' ? documentsResult.value : documentsResult;
        
        deletedDocuments += actualDocsResult?.deletedDocuments || 0;
        documentsCursor = actualDocsResult?.continueCursor;
        
        console.log(`[INFO] purge_knowledge_base: Deleted ${actualDocsResult?.deletedDocuments || 0} documents in this batch`);
        
        if (actualDocsResult?.isDone) break;
      } while (documentsCursor);
      
      // 2. ページ削除（バッチ処理）
      console.log('[INFO] purge_knowledge_base: Purging pages...');
      let deletedPages = 0;
      let pagesCursor = null;
      
      do {
        const pagesResult = await ConvexClient.mutation('admin:purgePagesBatch', { 
          cursor: pagesCursor 
        });
        const actualPagesResult = pagesResult?.status === 'success' ? pagesResult.value : pagesResult;
        
        deletedPages += actualPagesResult?.deletedPages || 0;
        pagesCursor = actualPagesResult?.continueCursor;
        
        console.log(`[INFO] purge_knowledge_base: Deleted ${actualPagesResult?.deletedPages || 0} pages in this batch`);
        
        if (actualPagesResult?.isDone) break;
      } while (pagesCursor);
      
      console.log(`[SUCCESS] purge_knowledge_base: Deleted ${deletedPages} pages and ${deletedDocuments} documents`);

      return {
        success: true,
        deletedPages,
        deletedDocuments,
        message: `Successfully purged knowledge base: ${deletedPages} pages and ${deletedDocuments} documents deleted`,
        purgedAt: Date.now(),
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ERROR] purge_knowledge_base: ${errorMsg}`);
      
      return {
        success: false,
        deletedPages: 0,
        deletedDocuments: 0,
        message: `Database purge failed: ${errorMsg}`,
      };
    }
  },
});

// システム統計情報取得ツール
export const getSystemStats = createTool({
  id: 'get_system_stats',
  description: 'データベースの統計情報（ページ数、ドキュメント数、処理状況）を取得する',
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    stats: z.object({
      pages: z.object({
        total: z.number(),
        pending: z.number(),
        processed: z.number(),
        error: z.number(),
      }),
      documents: z.object({
        total: z.number(),
      }),
      lastUpdated: z.number(),
    }).optional(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    console.log('[INFO] get_system_stats: Fetching database statistics');

    try {
      // Convexのadmin:getStats queryを呼び出し
      const stats = await ConvexClient.query('admin:getStats');
      
      // 安全にstatsにアクセス
      const pagesTotal = stats?.pages?.total || 0;
      const documentsTotal = stats?.documents?.total || 0;
      
      console.log(`[SUCCESS] get_system_stats: Retrieved stats - Pages: ${pagesTotal}, Documents: ${documentsTotal}`);

      return {
        success: true,
        stats,
        message: 'System statistics retrieved successfully',
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ERROR] get_system_stats: ${errorMsg}`);
      
      return {
        success: false,
        message: `Failed to retrieve system statistics: ${errorMsg}`,
      };
    }
  },
});

// ヘルスチェックツール
export const healthCheck = createTool({
  id: 'health_check',
  description: 'システム全体のヘルスチェック（データベース接続、環境変数確認）を実行する',
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    checks: z.object({
      convexConnection: z.boolean(),
      googleAI: z.boolean(),
      environmentVars: z.boolean(),
    }),
    message: z.string(),
    details: z.array(z.string()),
  }),
  execute: async ({ context }) => {
    console.log('[INFO] health_check: Starting system health check');

    const checks = {
      convexConnection: false,
      googleAI: false,
      environmentVars: false,
    };
    const details: string[] = [];

    try {
      // 環境変数チェック
      const requiredEnvVars = ['CONVEX_URL', 'GOOGLE_GENERATIVE_AI_API_KEY'];
      const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length === 0) {
        checks.environmentVars = true;
        details.push('✅ All required environment variables are set');
      } else {
        details.push(`❌ Missing environment variables: ${missingVars.join(', ')}`);
      }

      // Convex接続チェック
      try {
        const stats = await ConvexClient.query('admin:getStats');
        checks.convexConnection = true;
        
        // 安全にstatsにアクセス
        const pagesTotal = stats?.pages?.total || 0;
        const documentsTotal = stats?.documents?.total || 0;
        
        details.push(`✅ Convex database connected (${pagesTotal} pages, ${documentsTotal} documents)`);
      } catch (error) {
        details.push(`❌ Convex connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Google AI API チェック（環境変数存在のみ確認）
      if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        checks.googleAI = true;
        details.push('✅ Google AI API key is configured');
      } else {
        details.push('❌ Google AI API key is not configured');
      }

      const allHealthy = Object.values(checks).every(check => check);
      const message = allHealthy 
        ? 'All system components are healthy' 
        : 'Some system components have issues';

      console.log(`[${allHealthy ? 'SUCCESS' : 'WARN'}] health_check: ${message}`);

      return {
        success: allHealthy,
        checks,
        message,
        details,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ERROR] health_check: ${errorMsg}`);
      
      return {
        success: false,
        checks,
        message: `Health check failed: ${errorMsg}`,
        details: [...details, `❌ Health check error: ${errorMsg}`],
      };
    }
  },
});