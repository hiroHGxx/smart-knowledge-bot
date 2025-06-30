import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

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

// pending状態のドキュメントを処理するツール
export const processPendingDocuments = createTool({
  id: 'process_pending_documents',
  description: 'status="pending"のページをLangChainでチャンク分割し、Google Embeddingsでベクトル化してdocumentsテーブルに保存する',
  inputSchema: z.object({
    chunkSize: z.number().min(100).max(2000).default(1000).describe('テキストチャンクのサイズ（文字数）'),
    chunkOverlap: z.number().min(0).max(500).default(200).describe('チャンク間のオーバーラップ（文字数）'),
    batchSize: z.number().min(1).max(10).default(5).describe('一度に処理するページ数'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    processedPages: z.number(),
    totalChunks: z.number(),
    savedDocuments: z.number(),
    skippedPages: z.number(),
    errors: z.array(z.string()),
    message: z.string(),
    processingDetails: z.array(z.object({
      pageId: z.string(),
      url: z.string(),
      chunksCreated: z.number(),
      status: z.string(),
    })),
  }),
  execute: async ({ context }) => {
    const { chunkSize, chunkOverlap, batchSize } = context;

    console.log(`[INFO] process_pending_documents: Starting document processing (chunkSize: ${chunkSize}, overlap: ${chunkOverlap}, batch: ${batchSize})`);

    const errors: string[] = [];
    const processingDetails: Array<{pageId: string; url: string; chunksCreated: number; status: string}> = [];
    let totalChunks = 0;
    let savedDocuments = 0;

    try {
      // 1. pending状態のページを取得
      console.log('[INFO] process_pending_documents: Fetching pending pages');
      const pendingPagesResult = await ConvexClient.query('pages:getPendingPages');
      const pendingPages = pendingPagesResult?.value || pendingPagesResult || [];

      if (pendingPages.length === 0) {
        console.log('[INFO] process_pending_documents: No pending pages found');
        return {
          success: true,
          processedPages: 0,
          totalChunks: 0,
          savedDocuments: 0,
          skippedPages: 0,
          errors: [],
          message: 'No pending pages to process',
          processingDetails: [],
        };
      }

      console.log(`[INFO] process_pending_documents: Found ${pendingPages.length} pending pages`);

      // 2. LangChain Text Splitter初期化
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
        separators: ['\n\n', '\n', ' ', ''],
      });

      // 3. Google Embeddings初期化
      const embeddings = new GoogleGenerativeAIEmbeddings({
        modelName: 'embedding-001',
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });

      // 4. バッチ処理
      const pagesToProcess = pendingPages.slice(0, batchSize);
      console.log(`[INFO] process_pending_documents: Processing ${pagesToProcess.length} pages in this batch`);

      for (const page of pagesToProcess) {
        try {
          console.log(`[INFO] process_pending_documents: Processing page ${page.url} (ID: ${page._id})`);

          // テキストをチャンクに分割
          const chunks = await textSplitter.splitText(page.text);
          console.log(`[INFO] process_pending_documents: Created ${chunks.length} chunks for ${page.url}`);

          if (chunks.length === 0) {
            console.log(`[WARN] process_pending_documents: No chunks created for ${page.url}, skipping`);
            processingDetails.push({
              pageId: page._id,
              url: page.url,
              chunksCreated: 0,
              status: 'skipped_no_chunks',
            });
            continue;
          }

          // 各チャンクをベクトル化
          const documents: Array<{text: string; embedding: number[]; sourceUrl: string}> = [];
          
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            console.log(`[INFO] process_pending_documents: Embedding chunk ${i + 1}/${chunks.length} for ${page.url}`);
            
            try {
              const embeddingVector = await embeddings.embedQuery(chunk);
              
              // 768次元チェック
              if (embeddingVector.length !== 768) {
                throw new Error(`Invalid embedding dimension: ${embeddingVector.length}, expected 768`);
              }

              documents.push({
                text: chunk,
                embedding: embeddingVector,
                sourceUrl: page.url,
              });

            } catch (embeddingError) {
              const errorMsg = embeddingError instanceof Error ? embeddingError.message : 'Unknown embedding error';
              console.error(`[ERROR] process_pending_documents: Embedding failed for chunk ${i + 1} of ${page.url}: ${errorMsg}`);
              errors.push(`Embedding failed for chunk ${i + 1} of ${page.url}: ${errorMsg}`);
            }
          }

          if (documents.length === 0) {
            console.log(`[WARN] process_pending_documents: No valid embeddings created for ${page.url}`);
            processingDetails.push({
              pageId: page._id,
              url: page.url,
              chunksCreated: chunks.length,
              status: 'failed_embeddings',
            });
            continue;
          }

          // 5. Convexにドキュメントを一括保存
          console.log(`[INFO] process_pending_documents: Saving ${documents.length} documents for ${page.url}`);
          const saveResult = await ConvexClient.mutation('knowledge:addDocuments', { documents });
          
          savedDocuments += documents.length;
          totalChunks += chunks.length;

          // 6. 元ページのステータスを"processed"に更新
          await ConvexClient.mutation('pages:updatePageStatus', {
            id: page._id,
            status: 'processed',
          });

          console.log(`[SUCCESS] process_pending_documents: Processed ${page.url} - ${documents.length} documents saved`);
          
          processingDetails.push({
            pageId: page._id,
            url: page.url,
            chunksCreated: documents.length,
            status: 'success',
          });

        } catch (pageError) {
          const errorMsg = pageError instanceof Error ? pageError.message : 'Unknown page processing error';
          console.error(`[ERROR] process_pending_documents: Failed to process page ${page.url}: ${errorMsg}`);
          errors.push(`Failed to process page ${page.url}: ${errorMsg}`);
          
          processingDetails.push({
            pageId: page._id,
            url: page.url,
            chunksCreated: 0,
            status: 'error',
          });
        }
      }

      const processedPages = processingDetails.filter(detail => detail.status === 'success').length;
      const skippedPages = processingDetails.filter(detail => detail.status.startsWith('skipped') || detail.status === 'failed_embeddings').length;
      const success = processedPages > 0 && errors.length === 0;

      const message = success
        ? `Successfully processed ${processedPages} pages, created ${savedDocuments} documents from ${totalChunks} chunks`
        : `Processing completed with issues: ${processedPages} pages processed, ${errors.length} errors`;

      console.log(`[${success ? 'SUCCESS' : 'WARN'}] process_pending_documents: ${message}`);

      return {
        success,
        processedPages,
        totalChunks,
        savedDocuments,
        skippedPages,
        errors,
        message,
        processingDetails,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ERROR] process_pending_documents: ${errorMsg}`);

      return {
        success: false,
        processedPages: 0,
        totalChunks: 0,
        savedDocuments: 0,
        skippedPages: 0,
        errors: [errorMsg],
        message: `Document processing failed: ${errorMsg}`,
        processingDetails: [],
      };
    }
  },
});