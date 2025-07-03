#!/usr/bin/env python3
"""
SmartKnowledgeBot本番サービス品質検証スクリプト
URL: https://smartknowledgebot-frontend-emjn0hmib-hirohgxxs-projects.vercel.app
"""

import sys
import os
sys.path.append('/Users/gotohiro/Library/Python/3.9/lib/python/site-packages')

from playwright.sync_api import sync_playwright
import time
import json
import traceback
from datetime import datetime

# 検証結果を格納する辞書
verification_results = {
    "basic_functionality": [],
    "error_cases": [],
    "ui_ux": [],
    "data_integrity": [],
    "security": [],
    "performance": [],
    "summary": {}
}

def log_result(category, test_name, status, details, priority="medium"):
    """検証結果をログに記録"""
    result = {
        "test_name": test_name,
        "status": status,  # "pass", "fail", "warning"
        "details": details,
        "priority": priority,  # "critical", "high", "medium", "low"
        "timestamp": datetime.now().isoformat()
    }
    verification_results[category].append(result)
    print(f"[{status.upper()}] {test_name}: {details}")

def run_comprehensive_verification():
    """包括的品質検証の実行"""
    print("🚀 SmartKnowledgeBot本番サービス品質検証開始")
    print("=" * 60)

    try:
        with sync_playwright() as p:
            # ブラウザ起動（Chromiumで実行）
            base_url = "https://smartknowledgebot-frontend-cyqgu1xrd-hirohgxxs-projects.vercel.app"

            print(f"\n🔍 Chromiumブラウザでの検証開始")
            print("-" * 40)

            try:
                browser = p.chromium.launch(headless=False)  # 視覚的確認のためheadless=False
                context = browser.new_context(
                    viewport={'width': 1920, 'height': 1080},
                    user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                )
                page = context.new_page()

                # パフォーマンス測定開始
                start_time = time.time()

                # 1. 基本機能動作テスト
                print("\n📋 1. 基本機能動作テスト")

                # ページロードテスト
                try:
                    print(f"アクセス中: {base_url}")
                    response = page.goto(base_url, wait_until="networkidle", timeout=30000)
                    load_time = time.time() - start_time

                    if response and response.status == 200:
                        log_result("basic_functionality", "ページロード", "pass",
                                 f"正常ロード完了 ({load_time:.2f}秒)")
                    else:
                        status_code = response.status if response else "No Response"
                        log_result("basic_functionality", "ページロード", "fail",
                                 f"HTTPエラー: {status_code}", "critical")
                        return
                except Exception as e:
                    log_result("basic_functionality", "ページロード", "fail",
                             f"ページロード失敗: {str(e)}", "critical")
                    return

                # ページスクリーンショット撮影
                try:
                    page.screenshot(path="verification_screenshot.png")
                    print("📸 スクリーンショット保存: verification_screenshot.png")
                except:
                    pass

                # タイトル確認
                try:
                    title = page.title()
                    if title and len(title) > 0:
                        log_result("basic_functionality", "ページタイトル", "pass",
                                 f"タイトル確認: '{title}'")
                    else:
                        log_result("basic_functionality", "ページタイトル", "warning",
                                 f"タイトル未設定または空: '{title}'", "medium")
                except Exception as e:
                    log_result("basic_functionality", "ページタイトル", "fail",
                             f"タイトル取得失敗: {str(e)}", "low")

                # DOM要素の基本構造確認
                try:
                    # フォーム要素の検出
                    text_inputs = page.locator('input[type="text"], textarea')
                    buttons = page.locator('button')

                    print(f"🔍 検出された要素: テキスト入力={text_inputs.count()}, ボタン={buttons.count()}")

                    if text_inputs.count() > 0 and buttons.count() > 0:
                        log_result("basic_functionality", "基本UI要素", "pass",
                                 f"必要なフォーム要素が存在 (入力:{text_inputs.count()}, ボタン:{buttons.count()})")
                    else:
                        log_result("basic_functionality", "基本UI要素", "fail",
                                 f"必要な要素が不足 (入力:{text_inputs.count()}, ボタン:{buttons.count()})", "critical")
                        return
                except Exception as e:
                    log_result("basic_functionality", "基本UI要素", "fail",
                             f"UI要素検出失敗: {str(e)}", "critical")
                    return

                # 2. レスポンシブデザインテスト
                print("\n📱 2. レスポンシブデザインテスト")

                viewports = [
                    ("デスクトップ", 1920, 1080),
                    ("タブレット", 768, 1024),
                    ("スマートフォン", 375, 667)
                ]

                for viewport_name, width, height in viewports:
                    try:
                        page.set_viewport_size({"width": width, "height": height})
                        time.sleep(2)  # レンダリング待機

                        # フォーム要素が見える状態か確認
                        text_input = page.locator('input[type="text"], textarea').first
                        button = page.locator('button').first

                        input_visible = text_input.is_visible() if text_input.count() > 0 else False
                        button_visible = button.is_visible() if button.count() > 0 else False

                        if input_visible and button_visible:
                            log_result("ui_ux", f"レスポンシブ_{viewport_name}", "pass",
                                     f"{viewport_name}({width}x{height})で正常表示")
                        else:
                            log_result("ui_ux", f"レスポンシブ_{viewport_name}", "fail",
                                     f"{viewport_name}で要素が見えない (入力:{input_visible}, ボタン:{button_visible})", "high")
                    except Exception as e:
                        log_result("ui_ux", f"レスポンシブ_{viewport_name}", "fail",
                                 f"{viewport_name}テスト失敗: {str(e)}", "medium")

                # デスクトップサイズに戻す
                page.set_viewport_size({"width": 1920, "height": 1080})
                time.sleep(1)

                # 3. 質問送信機能テスト
                print("\n💬 3. 質問送信機能テスト")

                test_questions = [
                    ("基本質問", "装備の強化方法を教えてください"),
                    ("短い質問", "こんにちは")
                ]

                for test_name, question in test_questions:
                    try:
                        print(f"テスト実行: {test_name} - '{question}'")

                        # フォーム要素を再取得
                        text_input = page.locator('input[type="text"], textarea').first
                        submit_button = page.locator('button[type="submit"], button').first

                        if text_input.count() == 0 or submit_button.count() == 0:
                            log_result("basic_functionality", f"フォーム要素_{test_name}", "fail",
                                     f"フォーム要素が見つからない", "critical")
                            continue

                        # 既存の入力をクリア
                        text_input.clear()
                        text_input.fill(question)

                        # 送信前の状態確認
                        submit_start_time = time.time()
                        submit_button.click()

                        print(f"送信ボタンクリック完了 - 応答待機中...")

                        # ローディング状態の確認（5秒待機）
                        time.sleep(5)

                        # ローディング表示があるかチェック
                        loading_selectors = [
                            '[data-testid="loading"]',
                            '.loading',
                            '.spinner',
                            '[aria-label*="loading"]',
                            '[aria-label*="Loading"]',
                            '.animate-spin'
                        ]

                        loading_found = False
                        for selector in loading_selectors:
                            if page.locator(selector).count() > 0:
                                loading_found = True
                                break

                        if loading_found:
                            log_result("ui_ux", f"ローディング表示_{test_name}", "pass",
                                     f"ローディング状態が表示される")
                        else:
                            log_result("ui_ux", f"ローディング表示_{test_name}", "warning",
                                     f"ローディング表示が確認できない", "low")

                        # 回答待機（最大45秒）
                        response_found = False
                        print("回答待機中...")

                        for wait_second in range(45):
                            time.sleep(1)
                            if wait_second % 5 == 0:
                                print(f"  待機中... {wait_second}/45秒")

                            # 回答エリアを探す（複数のセレクターを試行）
                            response_selectors = [
                                '[data-testid="response"]',
                                '.response',
                                '.answer',
                                '.result',
                                'div[role="region"]',
                                'main div div',  # 汎用的なdiv構造
                                'article',
                                'section'
                            ]

                            for selector in response_selectors:
                                elements = page.locator(selector)
                                for i in range(elements.count()):
                                    try:
                                        element_text = elements.nth(i).inner_text()
                                        if element_text and len(element_text.strip()) > 20:  # 20文字以上の応答
                                            response_time = time.time() - submit_start_time
                                            log_result("basic_functionality", f"RAG回答_{test_name}", "pass",
                                                     f"回答取得成功 ({response_time:.1f}秒, {len(element_text)}文字)")
                                            print(f"✅ 回答取得成功: {len(element_text)}文字")
                                            response_found = True
                                            break
                                    except:
                                        continue
                                if response_found:
                                    break
                            if response_found:
                                break

                            # エラーメッセージの確認
                            error_selectors = [
                                '[data-testid="error"]',
                                '.error',
                                '.alert-error',
                                '.text-red-500',
                                '.text-red-600'
                            ]

                            for selector in error_selectors:
                                error_elements = page.locator(selector)
                                if error_elements.count() > 0:
                                    try:
                                        error_text = error_elements.first.inner_text()
                                        if error_text and len(error_text.strip()) > 0:
                                            log_result("error_cases", f"API エラー_{test_name}", "warning",
                                                     f"エラー表示: {error_text}", "medium")
                                            print(f"⚠️ エラー検出: {error_text}")
                                            break
                                    except:
                                        continue

                        if not response_found:
                            log_result("basic_functionality", f"RAG回答_{test_name}", "fail",
                                     f"45秒以内に回答が得られない", "high")
                            print(f"❌ タイムアウト: 45秒以内に回答なし")

                        # 少し待機してから次のテストへ
                        time.sleep(3)

                    except Exception as e:
                        log_result("basic_functionality", f"質問送信_{test_name}", "fail",
                                 f"送信処理失敗: {str(e)}", "high")
                        print(f"❌ 送信エラー: {str(e)}")

                # 4. エラーケーステスト
                print("\n⚠️ 4. エラーケーステスト")

                # 空入力テスト
                try:
                    text_input = page.locator('input[type="text"], textarea').first
                    submit_button = page.locator('button[type="submit"], button').first

                    if text_input.count() > 0 and submit_button.count() > 0:
                        text_input.clear()
                        submit_button.click()

                        time.sleep(3)

                        # エラーメッセージまたはバリデーションの確認
                        error_found = False
                        validation_selectors = [
                            '[data-testid="error"]',
                            '.error',
                            '.alert-error',
                            '.text-red-500',
                            '.text-red-600',
                            '[data-testid="validation"]',
                            '.validation-error'
                        ]

                        for selector in validation_selectors:
                            if page.locator(selector).count() > 0:
                                error_found = True
                                break

                        if error_found:
                            log_result("error_cases", "空入力バリデーション", "pass",
                                     f"空入力時の適切なエラーハンドリング")
                        else:
                            log_result("error_cases", "空入力バリデーション", "warning",
                                     f"空入力時のバリデーションが不明確", "medium")
                    else:
                        log_result("error_cases", "空入力テスト", "fail",
                                 f"フォーム要素が見つからない", "high")

                except Exception as e:
                    log_result("error_cases", "空入力テスト", "fail",
                             f"空入力テスト失敗: {str(e)}", "medium")

                # 5. セキュリティ基本チェック
                print("\n🔒 5. セキュリティ基本チェック")

                # XSS基本テスト
                try:
                    text_input = page.locator('input[type="text"], textarea').first
                    if text_input.count() > 0:
                        xss_payload = "<script>alert('XSS')</script>"
                        text_input.clear()
                        text_input.fill(xss_payload)

                        # 実際に送信は行わず、入力値の処理を確認
                        input_value = text_input.input_value()
                        if xss_payload in input_value:
                            log_result("security", "XSS入力処理", "warning",
                                     f"スクリプトタグがそのまま入力される", "medium")
                        else:
                            log_result("security", "XSS入力処理", "pass",
                                     f"入力値が適切に処理される")
                    else:
                        log_result("security", "XSS入力テスト", "fail",
                                 f"入力フィールドが見つからない", "medium")

                except Exception as e:
                    log_result("security", "XSS基本テスト", "fail",
                             f"XSSテスト失敗: {str(e)}", "low")

                # 6. パフォーマンス測定
                print("\n⚡ 6. パフォーマンス測定")

                try:
                    # ページ再読み込みでパフォーマンス測定
                    perf_start = time.time()
                    page.reload(wait_until="networkidle")
                    perf_end = time.time()

                    reload_time = perf_end - perf_start
                    if reload_time < 5:
                        log_result("performance", "ページ再読み込み速度", "pass",
                                 f"再読み込み時間: {reload_time:.2f}秒")
                    elif reload_time < 10:
                        log_result("performance", "ページ再読み込み速度", "warning",
                                 f"やや遅い再読み込み: {reload_time:.2f}秒", "low")
                    else:
                        log_result("performance", "ページ再読み込み速度", "fail",
                                 f"再読み込みが遅い: {reload_time:.2f}秒", "medium")

                except Exception as e:
                    log_result("performance", "パフォーマンス測定", "fail",
                             f"パフォーマンス測定失敗: {str(e)}", "low")

                # 最終スクリーンショット
                try:
                    page.screenshot(path="verification_final.png")
                    print("📸 最終スクリーンショット保存: verification_final.png")
                except:
                    pass

                browser.close()
                print(f"✅ ブラウザでの検証完了")

            except Exception as e:
                log_result("basic_functionality", "ブラウザ全体", "fail",
                         f"ブラウザ検証全体失敗: {str(e)}", "high")
                print(f"❌ ブラウザでエラー: {str(e)}")

    except Exception as e:
        print(f"❌ Playwright初期化エラー: {str(e)}")
        verification_results["summary"]["critical_error"] = str(e)

def generate_summary():
    """検証結果サマリーの生成"""
    print("\n" + "=" * 60)
    print("🔍 検証結果サマリー")
    print("=" * 60)

    # 結果サマリー生成
    total_tests = 0
    passed_tests = 0
    failed_tests = 0
    warnings = 0

    for category, results in verification_results.items():
        if category == "summary":
            continue

        category_pass = 0
        category_fail = 0
        category_warn = 0

        for result in results:
            total_tests += 1
            if result["status"] == "pass":
                passed_tests += 1
                category_pass += 1
            elif result["status"] == "fail":
                failed_tests += 1
                category_fail += 1
            elif result["status"] == "warning":
                warnings += 1
                category_warn += 1

        if results:  # カテゴリに結果がある場合のみ表示
            print(f"\n📊 {category.replace('_', ' ').title()}: {category_pass}成功 / {category_fail}失敗 / {category_warn}警告")

    print(f"\n🎯 全体結果: {passed_tests}成功 / {failed_tests}失敗 / {warnings}警告 (総テスト数: {total_tests})")

    # 成功率計算
    if total_tests > 0:
        success_rate = (passed_tests / total_tests) * 100
        print(f"📈 成功率: {success_rate:.1f}%")

        if success_rate >= 80:
            print("✅ 全体的に良好な品質")
        elif success_rate >= 60:
            print("⚠️ 改善が必要な箇所あり")
        else:
            print("❌ 重要な問題が多数存在")

    verification_results["summary"] = {
        "total_tests": total_tests,
        "passed": passed_tests,
        "failed": failed_tests,
        "warnings": warnings,
        "success_rate": f"{success_rate:.1f}%" if total_tests > 0 else "0%",
        "timestamp": datetime.now().isoformat()
    }

    print(f"\n検証完了時刻: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

def print_detailed_results():
    """詳細結果の出力"""
    print("\n" + "=" * 60)
    print("📋 詳細検証結果")
    print("=" * 60)

    # 優先度別に結果を分類
    critical_issues = []
    high_issues = []
    medium_issues = []
    low_issues = []

    for category, results in verification_results.items():
        if category == "summary":
            continue

        for result in results:
            if result["status"] == "fail":
                if result["priority"] == "critical":
                    critical_issues.append(result)
                elif result["priority"] == "high":
                    high_issues.append(result)
                elif result["priority"] == "medium":
                    medium_issues.append(result)
                else:
                    low_issues.append(result)

    # 重要度順に表示
    if critical_issues:
        print("\n🚨 クリティカル（即座修正必要）:")
        for issue in critical_issues:
            print(f"  - {issue['test_name']}: {issue['details']}")

    if high_issues:
        print("\n🔥 高優先度（本番運用前修正推奨）:")
        for issue in high_issues:
            print(f"  - {issue['test_name']}: {issue['details']}")

    if medium_issues:
        print("\n⚠️ 中優先度（改善推奨）:")
        for issue in medium_issues:
            print(f"  - {issue['test_name']}: {issue['details']}")

    # 警告事項も表示
    warning_issues = []
    for category, results in verification_results.items():
        if category == "summary":
            continue
        for result in results:
            if result["status"] == "warning":
                warning_issues.append(result)

    if warning_issues:
        print("\n💡 改善提案（警告事項）:")
        for warning in warning_issues:
            print(f"  - {warning['test_name']}: {warning['details']}")

if __name__ == "__main__":
    run_comprehensive_verification()
    generate_summary()
    print_detailed_results()

    # 結果をJSONファイルに保存
    try:
        with open("verification_results.json", "w", encoding="utf-8") as f:
            json.dump(verification_results, f, ensure_ascii=False, indent=2)
        print(f"\n💾 詳細結果をverification_results.jsonに保存しました")
    except Exception as e:
        print(f"⚠️ 結果保存エラー: {str(e)}")
