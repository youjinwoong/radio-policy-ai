"""
기술 용어 설명 일괄 생성 스크립트
- Supabase에서 description 없는 용어를 가져와 Claude API로 생성 후 저장
- 실행: python generate_terms.py
"""

import os, time, re, json
import anthropic
from supabase import create_client

# ── 설정 ───────────────────────────────────────────
SUPABASE_URL = "https://zwkjedumfuhodckmtxxn.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3a2plZHVtZnVob2Rja210eHhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MjQ1MjMsImV4cCI6MjA5NTEwMDUyM30.jxMwPgngbSGugU-1GuLNV7EiURONz7JT85F4WdqMisU"

# Claude API 키 — 환경변수 우선, 없으면 실행 시 직접 입력
CLAUDE_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
if not CLAUDE_KEY:
    CLAUDE_KEY = input("Claude API 키를 입력하세요 (sk-ant-...): ").strip()

DELAY_BETWEEN = 2  # 용어 사이 대기 시간 (초) — 레이트 리밋 방지
# ────────────────────────────────────────────────────


def build_prompt(t: dict) -> str:
    term_label = t["term"] + (f' ({t["term_en"]})' if t.get("term_en") else "")
    return (
        f'기술 용어 [{term_label}] 에 대해 아래 형식으로 정확히 답변하세요.\n'
        f'분야: {t.get("category","기타")}. 현재 정의: {t.get("definition","없음")}.\n\n'
        '<description>\n'
        '3~5문단 상세 설명. **굵은글씨**로 핵심 개념 강조. 단락 구분은 빈 줄로.\n'
        '내용: 개념 배경/기술 원리/국내외 현황/관련 표준 순서로 서술.\n'
        '</description>\n\n'
        '<diagram>\n'
        '아래 조건을 모두 지킨 SVG를 생성하라:\n'
        '- viewBox="0 0 680 320" xmlns="http://www.w3.org/2000/svg"\n'
        '- 배경: rect fill="#f8fafc" 전체 채움\n'
        '- 한국어 레이블 사용, font-family="sans-serif"\n'
        '- 주요 구성요소를 박스/원/화살표로 시각화 (최소 4개 요소)\n'
        '- 색상: 주요 박스 #6366f1(보라), 보조 #10b981(초록), 강조 #f59e0b(노랑), 배경박스 #e0e7ff\n'
        '- 화살표는 marker-end 사용하여 방향 표시\n'
        '- 개념 흐름이나 계층 구조를 한눈에 파악할 수 있게\n'
        '</diagram>\n\n'
        '<related>관련용어1,관련용어2,관련용어3</related>'
    )


def parse_response(text: str) -> dict:
    def extract(tag):
        m = re.search(rf'<{tag}>([\s\S]*?)</{tag}>', text)
        return m.group(1).strip() if m else ""

    related_raw = extract("related")
    related = [s.strip() for s in related_raw.split(",") if s.strip()] if related_raw else []

    return {
        "description":   extract("description"),
        "diagram_html":  extract("diagram"),
        "related_terms": related,
    }


def main():
    if not CLAUDE_KEY:
        print("❌ Claude API 키가 없습니다.")
        print("   방법 1: 환경변수 설정  →  set ANTHROPIC_API_KEY=sk-ant-...")
        print("   방법 2: 스크립트 상단 CLAUDE_KEY = '...' 에 직접 입력")
        return

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    client = anthropic.Anthropic(api_key=CLAUDE_KEY)

    # 전체 용어 가져오기 (기존 설명 포함 전부 재생성)
    resp = sb.table("tech_terms").select(
        "id,term,term_en,category,definition"
    ).execute()
    todo = resp.data or []

    if not todo:
        print("✅ 생성할 용어가 없습니다. 모두 완료된 상태입니다.")
        return

    print(f"📋 미생성 용어: {len(todo)}개")
    print(f"⏱  예상 시간: 약 {len(todo) * (10 + DELAY_BETWEEN) // 60 + 1}분\n")

    ok, fail = 0, 0
    for i, t in enumerate(todo, 1):
        label = f'{t["term"]}' + (f' ({t["term_en"]})' if t.get("term_en") else "")
        print(f"[{i:2d}/{len(todo)}] {label} ... ", end="", flush=True)

        try:
            msg = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=4000,
                system="당신은 이동통신·전파 정책 전문가입니다. 반드시 지정된 XML 태그 형식으로만 답변하세요.",
                messages=[{"role": "user", "content": build_prompt(t)}],
            )
            text = msg.content[0].text if msg.content else ""
            parsed = parse_response(text)

            if not parsed["description"]:
                raise ValueError("description 파싱 실패")

            sb.table("tech_terms").update(parsed).eq("id", t["id"]).execute()
            print("✅")
            ok += 1

        except Exception as e:
            print(f"❌ 실패: {e}")
            fail += 1

        if i < len(todo):
            time.sleep(DELAY_BETWEEN)

    print(f"\n완료! 성공 {ok}건 · 실패 {fail}건")


if __name__ == "__main__":
    main()
