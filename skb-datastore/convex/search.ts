import { action, query } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

// ベクトル類似度検索（Convex v1.24.8 対応）
export const searchByEmbedding = action({
  args: {
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any[]> => {
    const limit = Math.min(args.limit || 5, 256); // Convex制限: 最大256件

    try {
      // Convex v1.24.8の正しいベクトル検索API
      const vectorResults = await ctx.vectorSearch("documents", "by_embedding", {
        vector: args.embedding,
        limit: limit,
      });

      // 各結果のドキュメント詳細を取得（Query経由）
      const documents: any[] = [];
      for (const result of vectorResults) {
        const doc = await ctx.runQuery(api.search.getDocumentById, { id: result._id });
        if (doc) {
          documents.push({
            id: result._id,
            text: doc.text,
            sourceUrl: doc.sourceUrl,
            createdAt: doc.createdAt,
            score: result._score, // Convexが返すコサイン類似度スコア (-1 to 1)
          });
        }
      }

      return documents;

    } catch (error) {
      console.error(`[ERROR] searchByEmbedding: ${error}`);

      // フォールバック: 通常のクエリで最新文書を返す
      const fallbackResults = await ctx.runQuery(api.search.getFallbackDocuments, { limit });
      return fallbackResults;
    }
  },
});

// テキスト部分検索（フォールバック用）
export const searchByText = query({
  args: {
    searchText: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;
    const searchText = args.searchText.toLowerCase();

    const allDocs = await ctx.db.query("documents").collect();

    const matchingDocs = allDocs
      .filter(doc => doc.text.toLowerCase().includes(searchText))
      .slice(0, limit);

    return matchingDocs.map(doc => ({
      id: doc._id,
      text: doc.text,
      sourceUrl: doc.sourceUrl,
      createdAt: doc.createdAt,
    }));
  },
});

// ヘルパー: ID指定でドキュメント取得
export const getDocumentById = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ヘルパー: フォールバック用ドキュメント取得
export const getFallbackDocuments = query({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("documents")
      .order("desc")
      .take(args.limit);

    return results.map((doc) => ({
      id: doc._id,
      text: doc.text,
      sourceUrl: doc.sourceUrl,
      createdAt: doc.createdAt,
      score: 0.5, // フォールバック時のデフォルトスコア
    }));
  },
});
