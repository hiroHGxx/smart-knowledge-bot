import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { chromium } from 'playwright';

// クローラー実行状態管理
let isRunning = false;

// ConvexClient utility
const ConvexClient = {
  async query(functionName: string, args?: any) {
    const response = await fetch(`${process.env.CONVEX_URL}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Convex-Client': 'npm-1.0.0',
      },
      body: JSON.stringify({
        path: functionName,
        args: args || {},
        adminKey: process.env.CONVEX_AUTH_TOKEN,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Convex query failed: ${response.statusText} - ${errorText}`);
    }

    return response.json();
  },

  async mutation(functionName: string, args?: any) {
    const response = await fetch(`${process.env.CONVEX_URL}/api/mutation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Convex-Client': 'npm-1.0.0',
      },
      body: JSON.stringify({
        path: functionName,
        args: args || {},
        adminKey: process.env.CONVEX_AUTH_TOKEN,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Convex mutation failed: ${response.statusText} - ${errorText}`);
    }

    return response.json();
  },
};

// 単一ページクロールツール
export const webCrawler = createTool({
  id: 'web_crawler',
  description: 'PlaywrightでWebページをクロールし、テキストを抽出してデータベースに保存する',
  inputSchema: z.object({
    startUrl: z.string().url().describe('クロール開始URL'),
    maxDepth: z.number().min(0).max(5).default(0).describe('クロール階層の深さ（0=単一ページ、1-5=再帰クロール）'),
    selector: z.string().optional().describe('テキスト抽出用のCSSセレクタ（省略時は body 全体）'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    pagesCount: z.number(),
    savedPages: z.array(z.object({
      url: z.string(),
      textLength: z.number(),
      status: z.string(),
    })),
    message: z.string(),
    errors: z.array(z.string()).optional(),
  }),
  execute: async ({ context }) => {
    const { startUrl, maxDepth, selector } = context;

    // 実行中チェック
    if (isRunning) {
      console.log(`[WARN] web_crawler: Crawler is already running, skipping this execution`);
      return {
        success: false,
        pagesCount: 0,
        savedPages: [],
        message: 'Crawler is already running. Please wait for the current execution to complete.',
        errors: ['Concurrent execution prevented'],
      };
    }

    isRunning = true;
    console.log(`[INFO] web_crawler: Starting crawl from ${startUrl} (depth: ${maxDepth})`);

    let browser;
    const savedPages: Array<{ url: string; textLength: number; status: string }> = [];
    const errors: string[] = [];

    try {
      // Playwrightブラウザを起動
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      });
      
      const page = await context.newPage();
      
      // 単一ページクロール
      if (maxDepth === 0) {
        console.log(`[INFO] web_crawler: Single page crawl mode for ${startUrl}`);
        
        try {
          // ページにアクセス
          await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          
          // テキスト抽出
          const extractedText = await page.evaluate((sel) => {
            const targetElement = sel ? document.querySelector(sel) : document.body;
            if (!targetElement) return '';
            
            // スクリプトとスタイルタグを除去
            const scripts = targetElement.querySelectorAll('script, style');
            scripts.forEach(el => el.remove());
            
            // テキストを取得してクリーンアップ
            return targetElement.textContent
              ?.replace(/\s+/g, ' ')
              ?.trim() || '';
          }, selector);

          if (extractedText.length === 0) {
            throw new Error('No text content found on the page');
          }

          // Convexデータベースに保存
          console.log(`[INFO] web_crawler: Saving page ${startUrl} (${extractedText.length} chars)`);
          
          const savedId = await ConvexClient.mutation('pages:addPage', {
            url: startUrl,
            text: extractedText,
            status: 'pending'
          });

          savedPages.push({
            url: startUrl,
            textLength: extractedText.length,
            status: 'pending'
          });

          console.log(`[SUCCESS] web_crawler: Saved page ${startUrl} with ID ${savedId?.value || savedId}`);

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Failed to crawl ${startUrl}: ${errorMsg}`);
          console.error(`[ERROR] web_crawler: ${errorMsg}`);
        }

      } else {
        // 再帰クロール実装
        console.log(`[INFO] web_crawler: Starting recursive crawl (depth: ${maxDepth})`);
        
        const visited = new Set<string>();
        const urlsToProcess = [{ url: startUrl, depth: 0 }];
        
        // バッチ処理設定
        const BATCH_SIZE = 5; // 5ページずつ処理
        const MAX_PAGES = 50; // 最大50ページに制限
        let processedCount = 0;
        let shouldStop = false;
        
        while (urlsToProcess.length > 0 && savedPages.length < MAX_PAGES && !shouldStop) {
          const batch = urlsToProcess.splice(0, BATCH_SIZE);
          
          for (const { url, depth } of batch) {
            // 既に訪問済みまたは最大深度を超えた場合はスキップ
            if (visited.has(url) || depth > maxDepth || savedPages.length >= MAX_PAGES) {
              continue;
            }
            
            // フラグメントURL（#付き）をスキップ
            if (url.includes('#')) {
              console.log(`[INFO] web_crawler: Skipping fragment URL ${url}`);
              continue;
            }
            
            visited.add(url);
            console.log(`[INFO] web_crawler: Processing ${url} (depth: ${depth}, saved: ${savedPages.length}/${MAX_PAGES})`);
            
            try {
              // 新しいページコンテキストを作成（メモリリーク防止）
              const newPage = await context.newPage();
              
              // ページにアクセス
              await newPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
            
              // テキスト抽出
              const extractedText = await newPage.evaluate((sel?: string) => {
                const targetElement = sel ? document.querySelector(sel) : document.body;
                if (!targetElement) return '';
                
                // スクリプトとスタイルタグを除去
                const scripts = targetElement.querySelectorAll('script, style');
                scripts.forEach((el: Element) => el.remove());
                
                // テキストを取得してクリーンアップ
                return targetElement.textContent
                  ?.replace(/\s+/g, ' ')
                  ?.trim() || '';
              }, selector);

              if (extractedText.length > 0) {
                // データベースに既存URLがないかチェック
                try {
                  const existingPageResult = await ConvexClient.query('pages:getPageByUrl', { url: url });
                  const existingPage = existingPageResult?.value;
                  
                  if (existingPage !== null && existingPage !== undefined) {
                    console.log(`[INFO] web_crawler: URL ${url} already exists in database, skipping save`);
                  } else {
                    // Convexデータベースに保存
                    console.log(`[INFO] web_crawler: Saving page ${url} (${extractedText.length} chars)`);
                    
                    const savedId = await ConvexClient.mutation('pages:addPage', {
                      url: url,
                      text: extractedText,
                      status: 'pending'
                    });

                    savedPages.push({
                      url: url,
                      textLength: extractedText.length,
                      status: 'pending'
                    });

                    console.log(`[SUCCESS] web_crawler: Saved page ${url} with ID ${JSON.stringify(savedId)}`);
                    
                    // 保存成功時のみカウント更新、制限チェック
                    if (savedPages.length >= MAX_PAGES) {
                      console.log(`[INFO] web_crawler: Reached MAX_PAGES limit (${MAX_PAGES}), stopping crawl`);
                      shouldStop = true;
                      break;
                    }
                  }
                } catch (checkError) {
                  console.error(`[ERROR] web_crawler: Failed to check existing URL ${url}: ${checkError}`);
                  // チェックに失敗した場合は保存を試行
                  const savedId = await ConvexClient.mutation('pages:addPage', {
                    url: url,
                    text: extractedText,
                    status: 'pending'
                  });

                  savedPages.push({
                    url: url,
                    textLength: extractedText.length,
                    status: 'pending'
                  });

                  console.log(`[SUCCESS] web_crawler: Saved page ${url} with ID ${JSON.stringify(savedId)} (check failed)`);
                  
                  // 保存成功時のみカウント更新、制限チェック
                  if (savedPages.length >= MAX_PAGES) {
                    console.log(`[INFO] web_crawler: Reached MAX_PAGES limit (${MAX_PAGES}), stopping crawl`);
                    shouldStop = true;
                    break;
                  }
                }
              }
              
              // 次の深度のリンクを抽出（最大深度に達していない場合）
              if (depth < maxDepth && savedPages.length < MAX_PAGES && !shouldStop) {
                const links = await newPage.evaluate((baseUrl: string) => {
                  const links = Array.from(document.querySelectorAll('a[href]'));
                  const baseHost = new URL(baseUrl).host;
                  
                  return links
                    .map((link: Element) => {
                      const href = link.getAttribute('href');
                      if (!href || href.includes('#')) return null; // フラグメントURLを除外
                      
                      try {
                        // 相対URLを絶対URLに変換
                        const absoluteUrl = new URL(href, baseUrl).href;
                        const linkHost = new URL(absoluteUrl).host;
                        
                        // 同一ドメインのみ
                        if (linkHost === baseHost) {
                          return absoluteUrl;
                        }
                      } catch (e) {
                        // 無効なURLはスキップ
                      }
                      return null;
                    })
                    .filter((link): link is string => link !== null);
                }, url);
                
                // 新しいリンクを処理キューに追加（重複を避ける）
                for (const link of links) {
                  if (!visited.has(link) && !link.includes('#')) {
                    urlsToProcess.push({ url: link, depth: depth + 1 });
                  }
                }
                
                console.log(`[INFO] web_crawler: Found ${links.length} new links from ${url}`);
              }
              
              // ページを閉じてメモリを解放
              await newPage.close();
              
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : 'Unknown error';
              errors.push(`Failed to crawl ${url}: ${errorMsg}`);
              console.error(`[ERROR] web_crawler: Failed to crawl ${url}: ${errorMsg}`);
            }
            
            // 負荷軽減のため少し待機
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 制限に達した場合はバッチ処理も停止
            if (shouldStop) {
              break;
            }
          }
          
          // バッチ間でより長い待機
          if (urlsToProcess.length > 0 && !shouldStop) {
            console.log(`[INFO] web_crawler: Batch completed, waiting before next batch...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      }

      await browser.close();

      const success = savedPages.length > 0 && errors.length === 0;
      const message = success 
        ? `Successfully crawled ${savedPages.length} page(s) from ${startUrl}`
        : `Crawling failed or completed with errors. ${savedPages.length} pages saved, ${errors.length} errors`;

      console.log(`[${success ? 'SUCCESS' : 'WARN'}] web_crawler: ${message}`);

      // 実行完了フラグリセット
      isRunning = false;

      return {
        success,
        pagesCount: savedPages.length,
        savedPages,
        message,
        errors: errors.length > 0 ? errors : undefined,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ERROR] web_crawler: ${errorMsg}`);
      
      // エラー時もフラグリセット
      isRunning = false;
      
      if (browser) {
        await browser.close();
      }

      return {
        success: false,
        pagesCount: 0,
        savedPages: [],
        message: `Web crawler failed: ${errorMsg}`,
        errors: [errorMsg],
      };
    }
  },
});

