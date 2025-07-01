import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// ConvexClient utility
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
};

// getPageByUrlクエリの戻り値をデバッグするツール
export const debugGetPageByUrl = createTool({
  id: 'debug_get_page_by_url',
  description: 'getPageByUrlクエリの戻り値を詳細に調査し、空DBでの動作を確認する',
  inputSchema: z.object({
    testUrl: z.string().default('https://guide.rolg.maxion.gg/').describe('テスト用URL'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    queryResult: z.any(),
    resultType: z.string(),
    isNullish: z.boolean(),
    isTruthy: z.boolean(),
    jsonString: z.string(),
    detailedAnalysis: z.object({
      raw: z.any(),
      hasValue: z.boolean(),
      valueProperty: z.any(),
      isEmptyObject: z.boolean(),
      keys: z.array(z.string()),
    }),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    const { testUrl } = context;

    console.log(`[INFO] debug_get_page_by_url: Testing getPageByUrl with URL: ${testUrl}`);

    try {
      // 1. getPageByUrlクエリを実行
      const queryResult = await ConvexClient.query('pages:getPageByUrl', { url: testUrl });

      console.log(`[INFO] debug_get_page_by_url: Raw query result:`, JSON.stringify(queryResult, null, 2));

      // 2. 詳細分析
      const resultType = typeof queryResult;
      const isNullish = queryResult == null;
      const isTruthy = !!queryResult;
      const jsonString = JSON.stringify(queryResult);

      // 3. さらに詳細な分析
      const detailedAnalysis = {
        raw: queryResult,
        hasValue: queryResult && queryResult.value !== undefined,
        valueProperty: queryResult?.value,
        isEmptyObject: queryResult && typeof queryResult === 'object' && Object.keys(queryResult).length === 0,
        keys: queryResult && typeof queryResult === 'object' ? Object.keys(queryResult) : [],
      };

      // 4. 現在のクローラーロジックでの判定をシミュレート
      const existingPage = queryResult?.value || queryResult;
      const wouldSkip = existingPage && existingPage !== null;

      console.log(`[INFO] debug_get_page_by_url: Current crawler logic would skip: ${wouldSkip}`);
      console.log(`[INFO] debug_get_page_by_url: existingPage value:`, JSON.stringify(existingPage, null, 2));

      return {
        success: true,
        queryResult,
        resultType,
        isNullish,
        isTruthy,
        jsonString,
        detailedAnalysis,
        message: `Query result analysis complete. Would current logic skip? ${wouldSkip}`,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ERROR] debug_get_page_by_url: ${errorMsg}`);

      return {
        success: false,
        queryResult: null,
        resultType: 'error',
        isNullish: true,
        isTruthy: false,
        jsonString: 'null',
        detailedAnalysis: {
          raw: null,
          hasValue: false,
          valueProperty: null,
          isEmptyObject: false,
          keys: [],
        },
        message: `Debug query failed: ${errorMsg}`,
      };
    }
  },
});
