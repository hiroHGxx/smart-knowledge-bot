import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// データベース全体の統計情報を取得
export const getStats = query({
  handler: async (ctx) => {
    const [pages, documents] = await Promise.all([
      ctx.db.query("crawled_pages").collect(),
      ctx.db.query("documents").collect(),
    ]);
    
    const pageStats = {
      total: pages.length,
      pending: pages.filter(p => p.status === "pending").length,
      processed: pages.filter(p => p.status === "processed").length,
      error: pages.filter(p => p.status === "error").length,
    };
    
    return {
      pages: pageStats,
      documents: {
        total: documents.length,
      },
      lastUpdated: Date.now(),
    };
  },
});

// 知識ベース全体を削除（purge機能）
export const purgeAll = mutation({
  handler: async (ctx) => {
    // 全てのドキュメントを削除
    const documents = await ctx.db.query("documents").collect();
    for (const doc of documents) {
      await ctx.db.delete(doc._id);
    }
    
    // 全てのページを削除
    const pages = await ctx.db.query("crawled_pages").collect();
    for (const page of pages) {
      await ctx.db.delete(page._id);
    }
    
    return {
      deletedPages: pages.length,
      deletedDocuments: documents.length,
      purgedAt: Date.now(),
    };
  },
});

// 特定のソースURLに関連するデータを削除
export const purgeBySourceUrl = mutation({
  args: { sourceUrl: v.string() },
  handler: async (ctx, args) => {
    // ドキュメントを削除
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_source_url", (q) => q.eq("sourceUrl", args.sourceUrl))
      .collect();
    
    for (const doc of documents) {
      await ctx.db.delete(doc._id);
    }
    
    // ページを削除
    const page = await ctx.db
      .query("crawled_pages")
      .withIndex("by_url", (q) => q.eq("url", args.sourceUrl))
      .first();
    
    if (page) {
      await ctx.db.delete(page._id);
    }
    
    return {
      deletedDocuments: documents.length,
      deletedPage: page ? 1 : 0,
      sourceUrl: args.sourceUrl,
      purgedAt: Date.now(),
    };
  },
});