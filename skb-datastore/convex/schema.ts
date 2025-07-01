import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // クロールされたページを保存するテーブル
  crawled_pages: defineTable({
    url: v.string(),        // クロール対象URL
    text: v.string(),       // 抽出されたテキスト
    status: v.string(),     // "pending" | "processed" | "error"
    createdAt: v.number(),  // 作成日時（Unix timestamp）
    updatedAt: v.number(),  // 更新日時（Unix timestamp）
  })
    .index("by_status", ["status"])
    .index("by_url", ["url"]),

  // ベクトル化されたドキュメントを保存するテーブル
  documents: defineTable({
    text: v.string(),              // チャンク化されたテキスト
    embedding: v.array(v.float64()), // 768次元ベクトル（GoogleGenerativeAI embedding-001）
    sourceUrl: v.string(),         // 元のページURL
    createdAt: v.number(),         // 作成日時（Unix timestamp）
  })
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 768,
    })
    .index("by_source_url", ["sourceUrl"]),
});
