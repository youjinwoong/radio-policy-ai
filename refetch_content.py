"""
본문 미수집 기사 재수집 스크립트
- news_feed에서 content=NULL인 기사를 크롤러 fetch_article_body로 재수집
- 실행: python refetch_content.py
- 옵션: python refetch_content.py --all   (content 있어도 전부 재수집)
"""

import sys, time
from datetime import datetime, timezone, timedelta
from supabase import create_client

# crawler.py의 fetch_article_body, HEADERS 재사용
import importlib.util, pathlib
spec = importlib.util.spec_from_file_location(
    "crawler",
    pathlib.Path(__file__).parent / "crawler.py"
)
crawler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(crawler)

# ── 설정 ──────────────────────────────────────────────────────
SUPABASE_URL = "https://zwkjedumfuhodckmtxxn.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3a2plZHVtZnVob2Rja210eHhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MjQ1MjMsImV4cCI6MjA5NTEwMDUyM30.jxMwPgngbSGugU-1GuLNV7EiURONz7JT85F4WdqMisU"
DELAY_BETWEEN = 1.5
KST = timezone(timedelta(hours=9))
# ─────────────────────────────────────────────────────────────


def main():
    regen_all = "--all" in sys.argv
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    query = sb.table("news_feed").select("id,title,source,url,content")
    if not regen_all:
        query = query.is_("content", None)
    resp = query.order("published_at", desc=True).limit(200).execute()
    todo = [a for a in (resp.data or []) if a.get("url")]

    if not todo:
        print("✅ 재수집할 기사가 없습니다.")
        return

    mode = "전체 재수집" if regen_all else "본문 없는 기사"
    print(f"📋 {mode}: {len(todo)}건\n")

    ok, fail, skip = 0, 0, 0
    for i, article in enumerate(todo, 1):
        title  = (article.get("title") or "")[:50]
        source = article.get("source") or ""
        url    = article.get("url") or ""
        print(f"[{i:3d}/{len(todo)}] [{source}] {title}... ", end="", flush=True)

        try:
            body, _ = crawler.fetch_article_body(url, source)
            if not body:
                print("⏭  본문 없음 (셀렉터 미매칭 또는 접근 차단)")
                skip += 1
                continue

            sb.table("news_feed").update({
                "content": body,
                "content_fetched_at": datetime.now(KST).isoformat()
            }).eq("id", article["id"]).execute()
            print(f"✅ ({len(body)}자)")
            ok += 1

        except Exception as e:
            print(f"❌ 실패: {e}")
            fail += 1

        time.sleep(DELAY_BETWEEN)

    print(f"\n완료! 성공 {ok}건 · 실패 {fail}건 · 셀렉터 미매칭 {skip}건")
    if skip:
        print("⚠  셀렉터 미매칭 기사는 해당 언론사 HTML 구조 확인이 필요합니다.")


if __name__ == "__main__":
    main