#!/usr/bin/env python3
"""
Vercel認証問題を解決するための手動操作ガイド
"""

import sys
import os
sys.path.append('/Users/gotohiro/Library/Python/3.9/lib/python/site-packages')

from playwright.sync_api import sync_playwright
import time

def open_vercel_dashboard_for_manual_fix():
    """Vercelダッシュボードを開いて手動設定変更をガイドする"""

    print("🔧 Vercel認証問題 - 手動修正ガイド")
    print("=" * 50)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=False)  # ユーザーが操作できるよう表示
            context = browser.new_context()
            page = context.new_page()

            # Vercelダッシュボードを開く
            vercel_dashboard_url = "https://vercel.com/hirohgxxs-projects/smartknowledgebot-frontend/settings"

            print(f"🌐 Vercelダッシュボードを開いています...")
            print(f"URL: {vercel_dashboard_url}")

            page.goto(vercel_dashboard_url)

            print("\n📋 手動修正手順:")
            print("1. Vercelにログインしてください")
            print("2. 左サイドバーで 'Settings' をクリック")
            print("3. 'General' タブを選択")
            print("4. 'Protection' セクションを探してください")
            print("5. 認証・パスワード保護設定があれば無効化してください")
            print("6. 'Security' タブも確認し、不要な制限を解除してください")
            print("7. 変更を保存してください")

            print(f"\n⏳ ブラウザを開いたまま、手動で設定を変更してください...")
            print("設定完了後、このスクリプトは任意のキーを押して終了してください")

            # ユーザーの入力を待つ
            input("\n✅ 設定変更完了後、Enterキーを押してください...")

            browser.close()

            # 修正後のテスト
            print("\n🧪 修正後のアクセステスト...")
            test_access_after_fix()

    except Exception as e:
        print(f"❌ エラー: {str(e)}")

def test_access_after_fix():
    """修正後のアクセステスト"""
    import requests

    test_url = "https://smartknowledgebot-frontend-cyqgu1xrd-hirohgxxs-projects.vercel.app"

    try:
        print(f"アクセステスト: {test_url}")
        response = requests.get(test_url, timeout=10)

        if response.status_code == 200:
            print("✅ 成功: サイトに正常アクセス可能")
            print(f"ステータスコード: {response.status_code}")
            return True
        else:
            print(f"⚠️ ステータスコード: {response.status_code}")
            if response.status_code == 401:
                print("❌ まだ認証エラーが発生しています")
            return False

    except Exception as e:
        print(f"❌ アクセステスト失敗: {str(e)}")
        return False

def comprehensive_verification_after_fix():
    """修正後の包括的検証"""
    print("\n🔍 修正後の包括的検証を実行...")

    # 既存の検証スクリプトを実行
    import subprocess

    try:
        result = subprocess.run(
            ["python3", "/Users/gotohiro/Documents/user/Products/SmartKnowledgeBot/quality_verification.py"],
            capture_output=True,
            text=True,
            timeout=300  # 5分でタイムアウト
        )

        print("検証結果:")
        print(result.stdout)

        if result.stderr:
            print("エラー出力:")
            print(result.stderr)

    except subprocess.TimeoutExpired:
        print("⏰ 検証がタイムアウトしました")
    except Exception as e:
        print(f"❌ 検証実行エラー: {str(e)}")

if __name__ == "__main__":
    print("SmartKnowledgeBot Vercel認証問題 修正ガイド")
    print("=" * 60)

    # まず現在の状態を確認
    print("現在の問題状況を確認中...")
    if not test_access_after_fix():
        print("\n❌ 問題が継続しています。手動修正を開始します...")
        open_vercel_dashboard_for_manual_fix()
    else:
        print("✅ 問題が解決済みです。包括的検証を実行します...")
        comprehensive_verification_after_fix()
