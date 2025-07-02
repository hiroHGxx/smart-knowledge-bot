import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from "convex/browser";

export async function GET(request: NextRequest) {
  try {
    // Convex接続テスト
    const convexUrl = process.env.CONVEX_URL;

    if (!convexUrl) {
      return NextResponse.json({
        success: false,
        error: 'CONVEX_URL not configured'
      }, { status: 500 });
    }

    console.log('Testing Convex URL:', convexUrl);

    // Convexクライアントを作成
    const client = new ConvexHttpClient(convexUrl);

    // admin:getStats関数を呼び出し
    const stats = await client.query("admin:getStats", {});

    return NextResponse.json({
      success: true,
      message: 'Convex connection successful',
      data: stats,
      convexUrl: convexUrl
    });

  } catch (error) {
    console.error('Convex connection test failed:', error);
    return NextResponse.json({
      success: false,
      error: 'Connection test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
