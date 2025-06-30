import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

// ConvexClient utility
const ConvexClient = {
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
};

// RAG検索・回答生成ツール
export const answerQuestionFromDocs = createTool({
  id: 'answer_question_from_docs',
  description: '知識ベースから質問に関連するドキュメントを検索し、回答を生成する（日本語質問→英語検索→日本語回答）',
  inputSchema: z.object({
    question: z.string().min(1).describe('ユーザーからの質問（日本語）'),
    maxResults: z.number().min(1).max(10).default(5).describe('検索結果の最大件数'),
    minScore: z.number().min(0).max(1).default(0.7).describe('類似度スコアの最小閾値'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    answer: z.string().optional(),
    question: z.string(),
    translatedQuestion: z.string().optional(),
    searchResults: z.array(z.object({
      id: z.string(),
      text: z.string(),
      sourceUrl: z.string(),
      score: z.number(),
    })),
    relevantDocuments: z.number(),
    message: z.string(),
    processingSteps: z.array(z.string()),
  }),
  execute: async ({ context }) => {
    const { question, maxResults, minScore } = context;

    console.log(`[INFO] answer_question_from_docs: Starting RAG pipeline for question: "${question}"`);

    const processingSteps: string[] = [];
    let searchResults: Array<{id: string; text: string; sourceUrl: string; score: number}> = [];

    try {
      // Step 1: 質問を日本語→英語に翻訳
      console.log('[INFO] answer_question_from_docs: Step 1 - Translating question to English');
      processingSteps.push('Step 1: Question translation (Japanese → English)');

      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });

      const translationPrompt = `
Please translate the following Japanese question to English. 
Provide only the English translation, no additional text or explanation.

Japanese question: ${question}
`;

      const translationResult = await model.generateContent(translationPrompt);
      const translatedQuestion = translationResult.response.text().trim();
      
      console.log(`[INFO] answer_question_from_docs: Translated question: "${translatedQuestion}"`);
      processingSteps.push(`Translated question: "${translatedQuestion}"`);

      // Step 2: 翻訳された質問をベクトル化
      console.log('[INFO] answer_question_from_docs: Step 2 - Creating question embedding');
      processingSteps.push('Step 2: Question embedding generation');

      const embeddings = new GoogleGenerativeAIEmbeddings({
        modelName: 'embedding-001',
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });

      const questionEmbedding = await embeddings.embedQuery(translatedQuestion);
      
      if (questionEmbedding.length !== 768) {
        throw new Error(`Invalid embedding dimension: ${questionEmbedding.length}, expected 768`);
      }

      console.log(`[INFO] answer_question_from_docs: Generated embedding (${questionEmbedding.length} dimensions)`);

      // Step 3: ベクトル類似度検索
      console.log('[INFO] answer_question_from_docs: Step 3 - Vector similarity search');
      processingSteps.push('Step 3: Vector similarity search');

      const searchResult = await ConvexClient.action('search:searchByEmbedding', {
        embedding: questionEmbedding,
        limit: maxResults,
      });

      const rawResults = searchResult?.value || searchResult || [];
      console.log(`[INFO] answer_question_from_docs: Found ${rawResults.length} documents from vector search`);

      // スコア閾値でフィルタリング
      searchResults = rawResults
        .filter((result: any) => result.score >= minScore)
        .map((result: any) => ({
          id: result.id,
          text: result.text,
          sourceUrl: result.sourceUrl,
          score: result.score,
        }));

      console.log(`[INFO] answer_question_from_docs: ${searchResults.length} documents passed score threshold (>= ${minScore})`);
      processingSteps.push(`Found ${searchResults.length} relevant documents (score >= ${minScore})`);

      if (searchResults.length === 0) {
        processingSteps.push('No relevant documents found');
        return {
          success: false,
          question,
          translatedQuestion,
          searchResults: [],
          relevantDocuments: 0,
          message: 'No relevant documents found for the question',
          processingSteps,
        };
      }

      // Step 4: コンテキストを構築して回答生成
      console.log('[INFO] answer_question_from_docs: Step 4 - Answer generation');
      processingSteps.push('Step 4: Answer generation using retrieved context');

      const context = searchResults
        .map((result, index) => 
          `[Document ${index + 1}] (Source: ${result.sourceUrl}, Score: ${result.score.toFixed(3)})\n${result.text}`
        )
        .join('\n\n');

      const answerPrompt = `
あなたは知識ベースアシスタントです。提供されたドキュメントの内容に基づいて、ユーザーの質問に正確に答えてください。

**重要な指示:**
1. 日本語で回答してください
2. 提供されたドキュメントの内容のみを根拠として回答してください
3. ドキュメントに記載されていない情報を推測や創作しないでください
4. 回答に自信がない場合は「提供された情報では十分に回答できません」と述べてください
5. 可能な場合は、どのドキュメント（ソース）から情報を得たかを明記してください

**質問:** ${question}

**参考ドキュメント:**
${context}

**回答:**
`;

      const answerResult = await model.generateContent(answerPrompt);
      const answer = answerResult.response.text().trim();

      console.log(`[SUCCESS] answer_question_from_docs: Generated answer (${answer.length} chars)`);
      processingSteps.push('Answer generated successfully');

      return {
        success: true,
        answer,
        question,
        translatedQuestion,
        searchResults,
        relevantDocuments: searchResults.length,
        message: `Successfully answered question using ${searchResults.length} relevant documents`,
        processingSteps,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ERROR] answer_question_from_docs: ${errorMsg}`);
      
      processingSteps.push(`Error: ${errorMsg}`);

      return {
        success: false,
        question,
        searchResults,
        relevantDocuments: searchResults.length,
        message: `RAG pipeline failed: ${errorMsg}`,
        processingSteps,
      };
    }
  },
});

// シンプルな質問応答ツール（デバッグ用）
export const simpleSearch = createTool({
  id: 'simple_search',
  description: '英語質問で直接ベクトル検索を実行する（デバッグ・テスト用）',
  inputSchema: z.object({
    englishQuestion: z.string().min(1).describe('英語での質問'),
    maxResults: z.number().min(1).max(10).default(3).describe('検索結果の最大件数'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    question: z.string(),
    searchResults: z.array(z.object({
      id: z.string(),
      text: z.string(),
      sourceUrl: z.string(),
      score: z.number(),
    })),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    const { englishQuestion, maxResults } = context;

    console.log(`[INFO] simple_search: Searching for: "${englishQuestion}"`);

    try {
      // 質問をベクトル化
      const embeddings = new GoogleGenerativeAIEmbeddings({
        modelName: 'embedding-001',
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });

      const questionEmbedding = await embeddings.embedQuery(englishQuestion);

      // ベクトル検索
      const searchResult = await ConvexClient.action('search:searchByEmbedding', {
        embedding: questionEmbedding,
        limit: maxResults,
      });

      const results = searchResult?.value || searchResult || [];
      const searchResults = results.map((result: any) => ({
        id: result.id,
        text: result.text,
        sourceUrl: result.sourceUrl,
        score: result.score,
      }));

      console.log(`[SUCCESS] simple_search: Found ${searchResults.length} results`);

      return {
        success: true,
        question: englishQuestion,
        searchResults,
        message: `Found ${searchResults.length} matching documents`,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ERROR] simple_search: ${errorMsg}`);

      return {
        success: false,
        question: englishQuestion,
        searchResults: [],
        message: `Search failed: ${errorMsg}`,
      };
    }
  },
});