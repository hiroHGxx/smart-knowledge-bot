import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

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

// データベース内容をCSV形式でエクスポートするツール
export const exportDatabaseToCSV = createTool({
  id: 'export_database_to_csv',
  description: 'crawled_pagesとdocumentsテーブルの内容をCSVファイルにエクスポートし、重複やデータ分析を行う',
  inputSchema: z.object({
    outputDir: z.string().default('./exports').describe('出力ディレクトリ'),
    includeFullText: z.boolean().default(false).describe('全文テキストを含むか（true: 含む、false: 長さのみ）'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    files: z.array(z.object({
      filename: z.string(),
      recordCount: z.number(),
      filePath: z.string(),
    })),
    analysis: z.object({
      crawledPages: z.object({
        total: z.number(),
        uniqueUrls: z.number(),
        duplicates: z.number(),
        statusBreakdown: z.record(z.number()),
      }),
      documents: z.object({
        total: z.number(),
        uniqueSourceUrls: z.number(),
      }),
    }),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    const { outputDir, includeFullText } = context;

    console.log(`[INFO] export_database_to_csv: Starting database export to ${outputDir}`);

    try {
      // 出力ディレクトリを作成
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const files: Array<{filename: string; recordCount: number; filePath: string}> = [];

      // 1. crawled_pagesデータを取得
      console.log('[INFO] export_database_to_csv: Fetching crawled_pages data');
      const pagesResult = await ConvexClient.query('pages:getAllPages');
      const pages = pagesResult?.value || pagesResult || [];

      console.log(`[INFO] export_database_to_csv: Found ${pages.length} crawled pages`);

      // 2. documentsデータを取得
      console.log('[INFO] export_database_to_csv: Fetching documents data');
      const documentsResult = await ConvexClient.query('knowledge:getAllDocuments');
      const documents = documentsResult?.value || documentsResult || [];

      console.log(`[INFO] export_database_to_csv: Found ${documents.length} documents`);

      // 3. crawled_pagesをCSVエクスポート
      if (pages.length > 0) {
        const pagesFilename = `crawled_pages_${timestamp}.csv`;
        const pagesFilePath = path.join(outputDir, pagesFilename);

        let csvContent = 'ID,URL,TextLength,Status,CreatedAt,UpdatedAt';
        if (includeFullText) {
          csvContent += ',FullText';
        }
        csvContent += '\n';

        for (const page of pages) {
          const textLength = page.text ? page.text.length : 0;
          const createdAt = page.createdAt ? new Date(page.createdAt).toISOString() : '';
          const updatedAt = page.updatedAt ? new Date(page.updatedAt).toISOString() : '';

          let row = `"${page._id}","${page.url}",${textLength},"${page.status}","${createdAt}","${updatedAt}"`;

          if (includeFullText) {
            const cleanText = page.text ? page.text.replace(/"/g, '""').replace(/\n/g, '\\n') : '';
            row += `,"${cleanText}"`;
          }

          csvContent += row + '\n';
        }

        fs.writeFileSync(pagesFilePath, csvContent, 'utf8');
        files.push({
          filename: pagesFilename,
          recordCount: pages.length,
          filePath: pagesFilePath,
        });

        console.log(`[SUCCESS] export_database_to_csv: Exported ${pages.length} pages to ${pagesFilename}`);
      }

      // 4. documentsをCSVエクスポート
      if (documents.length > 0) {
        const docsFilename = `documents_${timestamp}.csv`;
        const docsFilePath = path.join(outputDir, docsFilename);

        let csvContent = 'ID,SourceURL,TextLength,EmbeddingDimensions,CreatedAt';
        if (includeFullText) {
          csvContent += ',FullText';
        }
        csvContent += '\n';

        for (const doc of documents) {
          const textLength = doc.text ? doc.text.length : 0;
          const embeddingDims = doc.embedding ? doc.embedding.length : 0;
          const createdAt = doc.createdAt ? new Date(doc.createdAt).toISOString() : '';

          let row = `"${doc._id}","${doc.sourceUrl}",${textLength},${embeddingDims},"${createdAt}"`;

          if (includeFullText) {
            const cleanText = doc.text ? doc.text.replace(/"/g, '""').replace(/\n/g, '\\n') : '';
            row += `,"${cleanText}"`;
          }

          csvContent += row + '\n';
        }

        fs.writeFileSync(docsFilePath, csvContent, 'utf8');
        files.push({
          filename: docsFilename,
          recordCount: documents.length,
          filePath: docsFilePath,
        });

        console.log(`[SUCCESS] export_database_to_csv: Exported ${documents.length} documents to ${docsFilename}`);
      }

      // 5. データ分析
      const analysis = {
        crawledPages: {
          total: pages.length,
          uniqueUrls: new Set(pages.map((p: any) => p.url)).size,
          duplicates: pages.length - new Set(pages.map((p: any) => p.url)).size,
          statusBreakdown: pages.reduce((acc: Record<string, number>, page: any) => {
            acc[page.status] = (acc[page.status] || 0) + 1;
            return acc;
          }, {}),
        },
        documents: {
          total: documents.length,
          uniqueSourceUrls: new Set(documents.map((d: any) => d.sourceUrl)).size,
        },
      };

      // 6. 分析結果をテキストファイルに出力
      const analysisFilename = `analysis_${timestamp}.txt`;
      const analysisFilePath = path.join(outputDir, analysisFilename);

      let analysisContent = `SmartKnowledgeBot Database Analysis Report\n`;
      analysisContent += `Generated: ${new Date().toISOString()}\n\n`;

      analysisContent += `CRAWLED PAGES ANALYSIS:\n`;
      analysisContent += `- Total records: ${analysis.crawledPages.total}\n`;
      analysisContent += `- Unique URLs: ${analysis.crawledPages.uniqueUrls}\n`;
      analysisContent += `- Duplicate URLs: ${analysis.crawledPages.duplicates}\n`;
      analysisContent += `- Status breakdown:\n`;

      for (const [status, count] of Object.entries(analysis.crawledPages.statusBreakdown)) {
        analysisContent += `  - ${status}: ${count}\n`;
      }

      analysisContent += `\nDOCUMENTS ANALYSIS:\n`;
      analysisContent += `- Total records: ${analysis.documents.total}\n`;
      analysisContent += `- Unique source URLs: ${analysis.documents.uniqueSourceUrls}\n`;

      if (analysis.crawledPages.duplicates > 0) {
        analysisContent += `\n⚠️  WARNING: Found ${analysis.crawledPages.duplicates} duplicate URLs in crawled_pages\n`;
      }

      if (analysis.crawledPages.total > 50) {
        analysisContent += `\n⚠️  WARNING: Found ${analysis.crawledPages.total} pages, but crawler is limited to 50 pages\n`;
      }

      fs.writeFileSync(analysisFilePath, analysisContent, 'utf8');

      console.log(`[SUCCESS] export_database_to_csv: Analysis report saved to ${analysisFilename}`);

      return {
        success: true,
        files,
        analysis,
        message: `Successfully exported ${pages.length} pages and ${documents.length} documents. Analysis shows ${analysis.crawledPages.duplicates} duplicate URLs.`,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ERROR] export_database_to_csv: ${errorMsg}`);

      return {
        success: false,
        files: [],
        analysis: {
          crawledPages: { total: 0, uniqueUrls: 0, duplicates: 0, statusBreakdown: {} },
          documents: { total: 0, uniqueSourceUrls: 0 },
        },
        message: `Database export failed: ${errorMsg}`,
      };
    }
  },
});
