import { query } from "./_generated/server";
import { v } from "convex/values";

// ベクトル類似度検索
export const searchByEmbedding = query({
  args: {
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 5;
    
    // TODO: Phase 2でベクトル検索の正しいAPIを実装
    // 現在は仮実装（全ドキュメントから最新のものを返す）
    const results = await ctx.db
      .query("documents")
      .order("desc")
      .take(limit);
    
    return results.map((doc: any) => ({
      id: doc._id,
      text: doc.text,
      sourceUrl: doc.sourceUrl,
      createdAt: doc.createdAt,
      score: 1.0, // Phase 2で実際のベクトル類似度スコアに変更
    }));
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