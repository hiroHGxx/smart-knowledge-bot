import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// 新しいページをcrawled_pagesテーブルに追加
export const addPage = mutation({
  args: {
    url: v.string(),
    text: v.string(),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    return await ctx.db.insert("crawled_pages", {
      url: args.url,
      text: args.text,
      status: args.status || "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

// status="pending"のページを取得
export const getPendingPages = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("crawled_pages")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
  },
});

// ページのstatusを更新
export const updatePageStatus = mutation({
  args: {
    id: v.id("crawled_pages"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

// 全てのページを取得（デバッグ用）
export const getAllPages = query({
  handler: async (ctx) => {
    return await ctx.db.query("crawled_pages").collect();
  },
});

// 特定のURLのページを取得
export const getPageByUrl = query({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("crawled_pages")
      .withIndex("by_url", (q) => q.eq("url", args.url))
      .first();
  },
});