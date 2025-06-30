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

// ドキュメントのバッチ削除（単一ページネーション）
export const purgeDocumentsBatch = mutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const documents = await ctx.db.query("documents").paginate({ 
      numItems: 100,
      cursor: args.cursor
    });
    
    let deletedDocuments = 0;
    for (const doc of documents.page) {
      await ctx.db.delete(doc._id);
      deletedDocuments++;
    }
    
    return {
      deletedDocuments,
      continueCursor: documents.continueCursor,
      isDone: documents.isDone,
      purgedAt: Date.now(),
    };
  },
});

// ページのバッチ削除（単一ページネーション）
export const purgePagesBatch = mutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const pages = await ctx.db.query("crawled_pages").paginate({ 
      numItems: 100,
      cursor: args.cursor
    });
    
    let deletedPages = 0;
    for (const page of pages.page) {
      await ctx.db.delete(page._id);
      deletedPages++;
    }
    
    return {
      deletedPages,
      continueCursor: pages.continueCursor,
      isDone: pages.isDone,
      purgedAt: Date.now(),
    };
  },
});

// 知識ベース全体を削除（2段階実行）
export const purgeAll = mutation({
  handler: async (ctx) => {
    // この関数は呼び出し専用（ページネーションなし）
    return {
      message: "Use purgeDocuments and purgePages separately due to Convex limitations",
      instructions: "1. Run purgeDocuments first, 2. Then run purgePages",
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