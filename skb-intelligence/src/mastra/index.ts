import { Mastra } from '@mastra/core';
import { knowledgeAgent } from './agents/knowledge-agent';
import { purgeKnowledgeBase, getSystemStats, healthCheck } from './tools/system-maintenance';
import { insertTestDocument, testVectorSearch, checkDocumentCount } from './tools/vector-search-test';
import { webCrawler } from './tools/web-crawler';
import { processPendingDocuments } from './tools/document-processor';
import { answerQuestionFromDocs, simpleSearch } from './tools/knowledge-searcher';

/**
 * SmartKnowledgeBot Mastra設定
 * AIエージェントとツールの統合管理
 */
export const mastra = new Mastra({
  agents: {
    knowledgeAgent: knowledgeAgent,
  },
  tools: {
    // Phase 2 - Task 1: System Maintenance Tools
    purgeKnowledgeBase,
    getSystemStats,
    healthCheck,
    // Phase 2 - Task 2: Vector Search Test Tools
    insertTestDocument,
    testVectorSearch,
    checkDocumentCount,
    // Phase 2 - Task 3: Web Crawler
    webCrawler,
    // Phase 2 - Task 4: Document Processor
    processPendingDocuments,
    // Phase 2 - Task 5: Knowledge Searcher (RAG Pipeline)
    answerQuestionFromDocs,
    simpleSearch,
  },
});

// 開発環境での確認用
if (process.env.NODE_ENV === 'development') {
  console.log('[MASTRA] SmartKnowledgeBot initialized');
  console.log('[MASTRA] Available agents: Knowledge Base Assistant');
  console.log('[MASTRA] Tools: purgeKnowledgeBase, getSystemStats, healthCheck, insertTestDocument, testVectorSearch, webCrawler, processPendingDocuments, answerQuestionFromDocs, simpleSearch');
}