"""
뉴스 요약 일괄 생성 스크립트
- news_feed 테이블에서 summary 없는 기사를 가져와 Claude Haiku로 요약 생성 후 저장
- 실행: python generate_summaries.py
- 옵션: python generate_summaries.py --all    (기존 요약 포함 전부 재생성)
"""

import os, time, sys
import anthropic
from supabase import create_client

# ── 설정 ──────────────────────────────────────────────────────
SUPABASE_URL = "https://zwkjedumfuhodckmtxxn.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3a2plZHVtZnVob2Rja210eHhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MjQ1MjMsImV4cCI6MjA5NTEwMDUyM30.jxMwPgngbSGugU-1GuLNV7EiURONz7JT85F4WdqMisU"

CLAUDE_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
if not CLAUDE_KEY:
    CLAUDE_KEY = input("Claude API 키를 입력하세요 (sk-ant-...): ").strip()

DELAY_BETWEEN = 1   # 기사 사이 대기 시간(초) — Haiku는 속도 빠름
BATCH_LIMIT   = 500 # 한 번에 처리할 최대 기사 수
# ─────────────────────────────────────────────────────────────


SYSTEM_PROMPT = (
    "당신은 전파·통신 정책 뉴스를 간결하게 요약하는 전문가입니다. "
    "사실만 기반으로 핵심 포인트를 줄바꿈으로 구분하여 작성하세요. "
    "불릿 기호(•, -, * 등)는 붙이지 마세요. 순수 텍스트만 출력하세요."
)


def build_prompt(article: dict) -> str:
    body = (article.get("content") or "")
    body = " ".join(body.split())[:3000]  # 공백 정리 + 3000자 제한

    return (
        "다음 뉴스를 핵심 포인트 3~5개로 요약하세요.\n"
        "- 각 포인트를 줄바꿈으로 구분하세요.\n"
        "- 각 포인트는 1~2문장, 육하원칙(누가/무엇을/왜/어떻게) 포함.\n"
        "- 불릿 기호(•, -, * 등)는 붙이지 마세요. 순수 텍스트만.\n\n"
        f"제목: {article.get('title', '')}\n"
        f"출처: {article.get('source', '')}\n"
        f"날짜: {str(article.get('published_at', ''))[:10]}"
        + (f"\n\n본문:\n{body}" if body else "")
    )


def main():
    regen_all = "--all" in sys.argv

    if not CLAUDE_KEY:
        print("❌ Claude API 키가 없습니다.")
        print("   방법 1: 환경변수 설정  →  set ANTHROPIC_API_KEY=sk-ant-...")
        print("   방법 2: 실행 시 직접 입력")
        return

    sb     = create_client(SUPABASE_URL, SUPABASE_KEY)
    client = anthropic.Anthropic(api_key=CLAUDE_KEY)

    # 대상 기사 조회
    query = sb.table("news_feed").select("id,title,source,published_at,content,summary")
    if not regen_all:
        # summary가 null인 것만
        query = query.is_("summary", None)
    resp = query.order("published_at", desc=True).limit(BATCH_LIMIT).execute()
    todo = resp.data or []

    if not todo:
        print("✅ 요약할 기사가 없습니다.")
        return

    mode_label = "전체 재생성" if regen_all else "미생성 기사"
    print(f"📋 {mode_label}: {len(todo)}건")
    print(f"⏱  예상 시간: 약 {max(1, len(todo) * (3 + DELAY_BETWEEN) // 60)}분\n")

    # 잘못 저장된 요약(사과·안내 메시지) 먼저 초기화
    BAD_SUMMARY_KEYWORDS = ["죄송하지만", "기사의 본문 내용이 제공되지 않", "뉴스 본문을 함께 공유", "본문을 제공해주시면"]
    reset_count = 0
    for article in todo:
        s = article.get("summary") or ""
        if any(kw in s for kw in BAD_SUMMARY_KEYWORDS):
            sb.table("news_feed").update({"summary": None}).eq("id", article["id"]).execute()
            article["summary"] = None
            reset_count += 1
    if reset_count:
        print(f"🔄 잘못된 요약 {reset_count}건 초기화 완료\n")

    ok, fail, skip = 0, 0, 0
    for i, article in enumerate(todo, 1):
        title = article.get("title", "(제목 없음)")[:50]
        content = (article.get("content") or "").strip()

        # 본문 없는 기사는 건너뜀
        if not content:
            print(f"[{i:3d}/{len(todo)}] {title}... ⏭  본문 없음 — 건너뜀")
            skip += 1
            continue

        print(f"[{i:3d}/{len(todo)}] {title}... ", end="", flush=True)

        try:
            msg = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=500,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": build_prompt(article)}],
            )
            summary = (msg.content[0].text if msg.content else "").strip()

            if not summary:
                raise ValueError("응답 비어있음")

            # 사과 메시지가 돌아온 경우도 저장하지 않음
            if any(kw in summary for kw in BAD_SUMMARY_KEYWORDS):
                raise ValueError("Claude가 본문 없다고 응답 — 저장 안 함")

            sb.table("news_feed").update({"summary": summary}).eq("id", article["id"]).execute()
            print("✅")
            ok += 1

        except Exception as e:
            print(f"❌ 실패: {e}")
            fail += 1

        if i < len(todo):
            time.sleep(DELAY_BETWEEN)

    print(f"\n완료! 성공 {ok}건 · 실패 {fail}건 · 본문없음 건너뜀 {skip}건")


if __name__ == "__main__":
    main()
