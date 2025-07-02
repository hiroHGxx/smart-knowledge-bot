"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [question, setQuestion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [response, setResponse] = useState("");
  const [relevantDocs, setRelevantDocs] = useState(0);
  const [error, setError] = useState("");
  const [processingStep, setProcessingStep] = useState("");
  const [history, setHistory] = useState<Array<{
    question: string;
    response: string;
    relevantDocs: number;
    timestamp: string;
  }>>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load history from localStorage on component mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('smartknowledgebot-history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (error) {
        console.error('Failed to load history:', error);
      }
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    if (history.length > 0) {
      localStorage.setItem('smartknowledgebot-history', JSON.stringify(history));
    }
  }, [history]);

  const addToHistory = (question: string, response: string, relevantDocs: number) => {
    const newEntry = {
      question,
      response,
      relevantDocs,
      timestamp: new Date().toISOString(),
    };
    setHistory(prev => [newEntry, ...prev.slice(0, 19)]); // Keep only last 20 entries
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('smartknowledgebot-history');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!question.trim()) {
      setError("質問を入力してください");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setResponse("");
    setRelevantDocs(0);
    setProcessingStep("質問を処理中...");

    try {
      setProcessingStep("AIエージェントに接続中...");
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: question,
          action: "rag_search"
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`サーバーエラー (${res.status}): ${errorText}`);
      }

      setProcessingStep("回答を生成中...");
      const data = await res.json();

      if (data.success) {
        setResponse(data.aiResponse);
        setRelevantDocs(data.relevantDocuments || 0);
        addToHistory(question, data.aiResponse, data.relevantDocuments || 0);
        setProcessingStep("");
      } else {
        throw new Error(data.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error("Error:", error);
      const errorMessage = error instanceof Error ? error.message : "不明なエラーが発生しました";
      setError(`エラー: ${errorMessage}`);
      setProcessingStep("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <header className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              SmartKnowledgeBot
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              AI-powered knowledge search and question answering system
            </p>
          </header>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                質問入力
              </h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-3 py-1 rounded-md transition-colors"
                >
                  {showHistory ? '履歴を隠す' : `履歴 (${history.length})`}
                </button>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={clearHistory}
                    className="text-sm bg-red-100 hover:bg-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-1 rounded-md transition-colors"
                  >
                    履歴クリア
                  </button>
                )}
              </div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="question" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  質問を入力してください
                </label>
                <textarea
                  id="question"
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="例: 装備強化の方法は？"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-red-800 dark:text-red-200">
                        {error}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {processingStep && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                  <div className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      {processingStep}
                    </p>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !question.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors flex items-center justify-center"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    回答中...
                  </>
                ) : (
                  "質問する"
                )}
              </button>
            </form>
          </div>

          {showHistory && history.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                質問履歴
              </h3>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {history.map((entry, index) => (
                  <div key={index} className="border-b border-gray-200 dark:border-gray-600 pb-4">
                    <div className="flex justify-between items-start mb-2">
                      <button
                        type="button"
                        onClick={() => setQuestion(entry.question)}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline text-left"
                      >
                        {entry.question}
                      </button>
                      <div className="flex gap-2 text-xs text-gray-500 dark:text-gray-400">
                        {entry.relevantDocs > 0 && (
                          <span className="bg-blue-100 dark:bg-blue-900/20 px-2 py-1 rounded">
                            📚 {entry.relevantDocs}
                          </span>
                        )}
                        <span>{new Date(entry.timestamp).toLocaleString('ja-JP')}</span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3">
                      {entry.response.slice(0, 150)}...
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {response && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  回答
                </h3>
                {relevantDocs > 0 && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    📚 {relevantDocs}件の関連ドキュメント
                  </span>
                )}
              </div>
              <div className="prose dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                  {response}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
