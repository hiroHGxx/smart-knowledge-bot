import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ベクトル化されたドキュメントを追加
export const addDocument = mutation({
  args: {
    text: v.string(),
    embedding: v.array(v.float64()),
    sourceUrl: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("documents", {
      text: args.text,
      embedding: args.embedding,
      sourceUrl: args.sourceUrl,
      createdAt: Date.now(),
    });
  },
});

// 複数のドキュメントを一括追加
export const addDocuments = mutation({
  args: {
    documents: v.array(v.object({
      text: v.string(),
      embedding: v.array(v.float64()),
      sourceUrl: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const results = [];

    for (const doc of args.documents) {
      const id = await ctx.db.insert("documents", {
        text: doc.text,
        embedding: doc.embedding,
        sourceUrl: doc.sourceUrl,
        createdAt: Date.now(),
      });
      results.push(id);
    }

    return results;
  },
});

// 全てのドキュメントを取得（デバッグ用）
export const getAllDocuments = query({
  handler: async (ctx) => {
    return await ctx.db.query("documents").collect();
  },
});

// 特定のソースURLのドキュメントを取得
export const getDocumentsBySourceUrl = query({
  args: { sourceUrl: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documents")
      .withIndex("by_source_url", (q) => q.eq("sourceUrl", args.sourceUrl))
      .collect();
  },
});

// ドキュメント数を取得
export const getDocumentCount = query({
  handler: async (ctx) => {
    const docs = await ctx.db.query("documents").collect();
    return docs.length;
  },
});
