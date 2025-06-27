import { Mastra } from '@mastra/core';
import { knowledgeAgent } from './agents/knowledge-agent';

/**
 * SmartKnowledgeBot Mastra設定
 * AIエージェントとツールの統合管理
 */
export const mastra = new Mastra({
  agents: {
    knowledgeAgent: knowledgeAgent,
  },
  // Phase 2で以下のツールを実装予定:
  // - purge_knowledge_base (データベース初期化)
  // - web_crawler (Webクローリング)
  // - process_pending_documents (テキスト処理・ベクトル化)
  // - answer_question_from_docs (RAG検索・回答生成)
});

// 開発環境での確認用
if (process.env.NODE_ENV === 'development') {
  console.log('[MASTRA] SmartKnowledgeBot initialized');
  console.log('[MASTRA] Available agents: Knowledge Base Assistant');
  console.log('[MASTRA] Tools: Phase 2で実装予定');
}