/**
 * Convex HTTPクライアント
 * 各ツールで独立してConvexと通信するためのユーティリティ
 */

export class ConvexClient {
  private baseUrl: string;
  private authToken?: string;

  constructor(convexUrl?: string, authToken?: string) {
    this.baseUrl = convexUrl || process.env.CONVEX_URL || '';
    this.authToken = authToken || process.env.CONVEX_AUTH_TOKEN;

    if (!this.baseUrl) {
      throw new Error('CONVEX_URL is required');
    }
  }

  /**
   * Convex queryを実行
   */
  async query(functionName: string, args: any = {}) {
    const url = `${this.baseUrl}/api/query`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` }),
      },
      body: JSON.stringify({
        function: functionName,
        args,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Convex query failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    return result;
  }

  /**
   * Convex mutationを実行
   */
  async mutation(functionName: string, args: any = {}) {
    const url = `${this.baseUrl}/api/mutation`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` }),
      },
      body: JSON.stringify({
        function: functionName,
        args,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Convex mutation failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    return result;
  }

  /**
   * 接続テスト
   */
  async healthCheck() {
    try {
      await this.query('admin:getStats');
      return { status: 'ok', timestamp: Date.now() };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }
}
