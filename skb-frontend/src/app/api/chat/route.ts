import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from "convex/browser";
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

// Rate limiting - simple in-memory store for development
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const clientData = rateLimitMap.get(clientId) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW };

  if (now > clientData.resetTime) {
    clientData.count = 1;
    clientData.resetTime = now + RATE_LIMIT_WINDOW;
    rateLimitMap.set(clientId, clientData);
    return true;
  }

  if (clientData.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  clientData.count++;
  rateLimitMap.set(clientId, clientData);
  return true;
}

// Input sanitization
function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocols
    .replace(/on\w+=/gi, '') // Remove event handlers
    .slice(0, 500); // Limit length
}

// シンプルなテスト用system_maintenance相当の機能
async function getSystemStats(convexUrl: string) {
  const client = new ConvexHttpClient(convexUrl);
  // Type assertion for the query function
  const stats = await (client as any).query("admin:getStats", {});
  return stats;
}

// RAG質問回答機能
async function answerQuestionFromDocs(question: string, convexUrl: string, googleApiKey: string) {
  console.log(`[INFO] RAG: Starting pipeline for question: "${question}"`);

  try {
    // Step 1: 質問を日本語→英語に翻訳
    const genAI = new GoogleGenerativeAI(googleApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });

    const translationPrompt = `
Please translate the following Japanese question to English.
Provide only the English translation, no additional text or explanation.

Japanese question: ${question}
`;

    const translationResult = await model.generateContent(translationPrompt);
    const translatedQuestion = translationResult.response.text().trim();
    console.log(`[INFO] RAG: Translated question: "${translatedQuestion}"`);

    // Step 2: 翻訳された質問をベクトル化
    const embeddings = new GoogleGenerativeAIEmbeddings({
      modelName: 'embedding-001',
      apiKey: googleApiKey,
    });

    const questionEmbedding = await embeddings.embedQuery(translatedQuestion);

    if (questionEmbedding.length !== 768) {
      throw new Error(`Invalid embedding dimension: ${questionEmbedding.length}, expected 768`);
    }

    // Step 3: ベクトル類似度検索
    const client = new ConvexHttpClient(convexUrl);
    const searchResults = await (client as any).action('search:searchByEmbedding', {
      embedding: questionEmbedding,
      limit: 5,
    });

    const results = searchResults?.value || searchResults || [];
    console.log(`[DEBUG] RAG: Raw search results:`, results.length);
    if (results.length > 0) {
      console.log(`[DEBUG] RAG: First result score:`, results[0]?.score);
      console.log(`[DEBUG] RAG: Score range:`, Math.min(...results.map((r: {score: number}) => r.score)), 'to', Math.max(...results.map((r: {score: number}) => r.score)));
    }

    // スコア閾値を0.5に下げて試す
    const filteredResults = results
      .filter((result: {score: number}) => result.score >= 0.5)
      .map((result: {id: string, text: string, sourceUrl: string, score: number}) => ({
        id: result.id,
        text: result.text,
        sourceUrl: result.sourceUrl,
        score: result.score,
      }));

    console.log(`[INFO] RAG: Found ${filteredResults.length} relevant documents (score >= 0.5)`);

    if (filteredResults.length === 0) {
      return {
        success: true,
        answer: '申し訳ございませんが、この質問に関連する情報が見つかりませんでした。データベースには386件のドキュメントがありますが、「装備強化」に関する情報が見つかりませんでした。',
        relevantDocuments: 0,
      };
    }

    // Step 4: コンテキストを構築して回答生成
    const context = filteredResults
      .map((result: {text: string, score: number}, index: number) =>
        `[Document ${index + 1}] (Score: ${result.score.toFixed(3)})\n${result.text}`
      )
      .join('\n\n');

    const answerPrompt = `
あなたは知識ベースアシスタントです。提供されたドキュメントの内容に基づいて、ユーザーの質問に正確に答えてください。

**重要な指示:**
1. 日本語で回答してください
2. 提供されたドキュメントの内容のみを根拠として回答してください
3. ドキュメントに記載されていない情報を推測や創作しないでください
4. 具体的で実用的な情報を提供してください

**質問:** ${question}

**参考ドキュメント:**
${context}

**回答:**
`;

    const answerResult = await model.generateContent(answerPrompt);
    const answer = answerResult.response.text().trim();

    console.log(`[SUCCESS] RAG: Generated answer (${answer.length} chars)`);

    return {
      success: true,
      answer,
      relevantDocuments: filteredResults.length,
      translatedQuestion,
    };

  } catch (error) {
    console.error(`[ERROR] RAG: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      success: false,
      answer: 'エラーが発生しました。しばらく後にもう一度お試しください。',
      relevantDocuments: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, action = 'system_check' } = body;

    // Get client IP for rate limiting
    const clientId = request.headers.get('x-forwarded-for') ||
                     request.headers.get('x-real-ip') ||
                     'unknown';

    // Check rate limit
    if (!checkRateLimit(clientId)) {
      return NextResponse.json({
        success: false,
        error: 'Rate limit exceeded. Please try again later.'
      }, { status: 429 });
    }

    // Sanitize input
    const sanitizedMessage = message ? sanitizeInput(message) : '';

    // Basic validation
    if (action === 'rag_search' && !sanitizedMessage) {
      return NextResponse.json({
        success: false,
        error: 'Message is required for RAG search'
      }, { status: 400 });
    }

    // 環境変数確認
    const convexUrl = process.env.CONVEX_URL;
    const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!convexUrl || !googleApiKey) {
      return NextResponse.json({
        success: false,
        error: 'Environment variables not configured'
      }, { status: 500 });
    }

    console.log('Chat API called with action:', action);

    if (action === 'system_check') {
      // システム状態確認
      const stats = await getSystemStats(convexUrl);

      // Google AIでレスポンス生成
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = googleApiKey;
      const model = google('gemini-1.5-pro-latest');

      const { text } = await generateText({
        model,
        prompt: `システム状態を報告してください。データベース統計: ${JSON.stringify(stats, null, 2)}`
      });

      return NextResponse.json({
        success: true,
        action: 'system_check',
        stats: stats,
        aiResponse: text,
        message: 'System check completed successfully'
      });

    } else if (action === 'simple_chat') {
      // シンプルなチャット機能
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = googleApiKey;
      const model = google('gemini-1.5-pro-latest');

      const { text } = await generateText({
        model,
        prompt: `ユーザーからの質問: ${sanitizedMessage}\n\n簡潔に答えてください。`
      });

      return NextResponse.json({
        success: true,
        action: 'simple_chat',
        userMessage: sanitizedMessage,
        aiResponse: text
      });

    } else if (action === 'rag_search') {
      // RAG検索・回答生成
      console.log('RAG search requested for:', sanitizedMessage);

      const ragResult = await answerQuestionFromDocs(sanitizedMessage, convexUrl, googleApiKey);

      return NextResponse.json({
        success: ragResult.success,
        action: 'rag_search',
        userMessage: sanitizedMessage,
        aiResponse: ragResult.answer,
        relevantDocuments: ragResult.relevantDocuments,
        translatedQuestion: ragResult.translatedQuestion,
        error: ragResult.error,
      });

    } else {
      return NextResponse.json({
        success: false,
        error: 'Unknown action',
        supportedActions: ['system_check', 'simple_chat', 'rag_search']
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Chat API failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
