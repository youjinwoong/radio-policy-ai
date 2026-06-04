"""
본문 미수집 기사 재수집 스크립트 (PC 전용 — 한국 IP)
- news_feed에서 content=NULL인 기사를 재수집
- v.daum.net URL → og:url로 원본 기사 URL 추출 후 수집
- 상대경로 URL(http 없음) → 건너뜀
- 실행: python refetch_content.py
- 옵션: python refetch_content.py --all   (content 있어도 전부 재수집)
"""

import os, sys, time, requests
from datetime import datetime, timezone, timedelta
from bs4 import BeautifulSoup
from supabase import create_client

# .env 파일 자동 로딩 (로컬 실행 시)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# crawler.py의 fetch_article_body, HEADERS 재사용
import importlib.util, pathlib
spec = importlib.util.spec_from_file_location(
    "crawler",
    pathlib.Path(__file__).parent / "crawler.py"
)
crawler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(crawler)

# ── 설정 ──────────────────────────────────────────────────────
SUPABASE_URL  = os.environ['SUPABASE_URL']
SUPABASE_KEY  = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ['SUPABASE_KEY']
DELAY_BETWEEN = 1.5
KST           = timezone(timedelta(hours=9))
# ─────────────────────────────────────────────────────────────


def resolve_url(url: str) -> str:
    """
    v.daum.net URL → og:url 메타 태그에서 원본 기사 URL 추출.
    상대경로(http 없음) → None 반환 (처리 불가).
    """
    if not url:
        return None
    # 상대경로 URL 처리 불가
    if not url.startswith('http'):
        return None
    # v.daum.net → 원본 URL 추출
    if 'daum.net' in url:
        try:
            resp = requests.get(url, headers=crawler.HEADERS, timeout=8, allow_redirects=True)
            soup = BeautifulSoup(resp.text, 'html.parser')
            og = soup.find('meta', property='og:url')
            if og and og.get('content') and 'daum.net' not in og['content']:
                print(f'  [Daum→원본] {og["content"][:60]}')
                return og['content']
        except Exception:
            pass
    return url


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

    ok, fail, skip, invalid = 0, 0, 0, 0
    for i, article in enumerate(todo, 1):
        title  = (article.get("title") or "")[:50]
        source = article.get("source") or ""
        url    = article.get("url") or ""
        print(f"[{i:3d}/{len(todo)}] [{source}] {title}... ", end="", flush=True)

        # URL 유효성 확인 및 변환
        resolved = resolve_url(url)
        if not resolved:
            print("⏭  상대경로 URL — 건너뜀")
            invalid += 1
            continue

        try:
            body, _ = crawler.fetch_article_body(resolved, source)
            if not body:
                print("⏭  본문 없음 (셀렉터 미매칭 또는 접근 차단)")
                skip += 1
                continue

            sb.table("news_feed").update({
                "content": body,
                "url": resolved,  # v.daum.net이면 원본 URL로 갱신
                "content_fetched_at": datetime.now(KST).isoformat()
            }).eq("id", article["id"]).execute()
            print(f"✅ ({len(body)}자)")
            ok += 1

        except Exception as e:
            print(f"❌ 실패: {e}")
            fail += 1

        time.sleep(DELAY_BETWEEN)

    print(f"\n완료! 성공 {ok}건 · 실패 {fail}건 · 미매칭 {skip}건 · 상대경로 {invalid}건")


if __name__ == "__main__":
    main()
