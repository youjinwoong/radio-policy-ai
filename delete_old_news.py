#!/usr/bin/env python3
"""
Supabase news_feed 테이블에서 발행일 10일 초과 기사 삭제 스크립트
실행 전: pip install supabase
"""

import os
from datetime import datetime, timezone, timedelta
from supabase import create_client

# ── 설정 (직접 입력하거나 환경변수로 지정) ──────────────────────
SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')  # service_role 키

# 위 환경변수가 없으면 아래에 직접 입력:
# SUPABASE_URL = "https://xxxx.supabase.co"
# SUPABASE_KEY = "eyJ..."

DAYS = 10  # 며칠 초과된 기사를 삭제할지
# ──────────────────────────────────────────────────────────────

KST = timezone(timedelta(hours=9))


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ SUPABASE_URL / SUPABASE_SERVICE_KEY 환경변수를 설정해주세요.")
        print("   예) set SUPABASE_URL=https://xxx.supabase.co  (Windows)")
        return

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    cutoff = (datetime.now(KST) - timedelta(days=DAYS)).isoformat()

    print(f"기준일: {cutoff[:10]} 이전 기사 삭제 대상 조회 중...")

    # 삭제 대상 조회 (published_at 기준)
    res = sb.table('news_feed') \
        .select('id, title, source, published_at') \
        .lt('published_at', cutoff) \
        .order('published_at', desc=False) \
        .execute()

    targets = res.data or []
    if not targets:
        print("✅ 삭제 대상 기사 없음.")
        return

    print(f"\n삭제 대상: {len(targets)}건")
    print("-" * 70)
    for item in targets:
        pub = (item.get('published_at') or '')[:10]
        title = (item.get('title') or '')[:45]
        source = item.get('source') or ''
        print(f"  [{pub}] {title} ({source})")
    print("-" * 70)

    confirm = input(f"\n위 {len(targets)}건을 삭제하시겠습니까? (yes 입력 시 삭제): ").strip().lower()
    if confirm != 'yes':
        print("취소됨.")
        return

    # 삭제 실행
    ids = [item['id'] for item in targets]
    # 한 번에 너무 많으면 100개씩 나눠서 삭제
    chunk_size = 100
    deleted = 0
    for i in range(0, len(ids), chunk_size):
        chunk = ids[i:i + chunk_size]
        sb.table('news_feed').delete().in_('id', chunk).execute()
        deleted += len(chunk)
        print(f"  삭제 진행: {deleted}/{len(ids)}건")

    print(f"\n✅ {deleted}건 삭제 완료.")


if __name__ == '__main__':
    main()
