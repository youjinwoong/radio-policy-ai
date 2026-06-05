#!/usr/bin/env python3
"""
뉴스 데이터 정리 (올바른 버전):
- 삭제 대상: 발행일 불명(NULL/빈값) + 작년(2025년 이전) 뉴스
- 유지 대상: 올해 이후 모든 뉴스 (날짜 무관하게 누적 관리)
- 72시간 규칙은 신규 수집 시에만 적용, 기존 DB는 해당 없음
"""
import os
import time
from datetime import datetime, timezone, timedelta
from supabase import create_client

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_KEY']
sb = create_client(SUPABASE_URL, SUPABASE_KEY)
KST = timezone(timedelta(hours=9))
now_kst = datetime.now(KST)

# 작년 이전 기준: 2025-01-01 (작년=2024 이전)
CUTOFF_YEAR = datetime(2025, 1, 1, tzinfo=KST)

print('='*50)
print(f'[정리 시작] {now_kst.strftime("%Y-%m-%d %H:%M KST")}')
print(f'[삭제 기준] 발행일 불명 OR 2025년 이전(작년) 뉴스')
print('='*50)

res = sb.table('news_feed').select('id,published_at,title').execute()
all_items = res.data or []
print(f'[조회] 전체 {len(all_items)}건')

delete_ids = []
for item in all_items:
    pub_str = (item.get('published_at') or '').strip()
    
    # 1. 발행일 없음 → 삭제
    if not pub_str:
        delete_ids.append(item['id'])
        continue
    
    # 2. 날짜 파싱
    try:
        from dateutil import parser as dtp
        pub_dt = dtp.parse(pub_str)
        if pub_dt.tzinfo is None:
            pub_dt = pub_dt.replace(tzinfo=KST)
        # 3. 2025년 이전(작년) → 삭제
        if pub_dt < CUTOFF_YEAR:
            delete_ids.append(item['id'])
    except Exception:
        delete_ids.append(item['id'])  # 파싱 실패 → 삭제

print(f'[삭제 대상] {len(delete_ids)}건')
print(f'[유지 대상] {len(all_items) - len(delete_ids)}건')

if delete_ids:
    for i in range(0, len(delete_ids), 100):
        chunk = delete_ids[i:i+100]
        sb.table('news_feed').delete().in_('id', chunk).execute()
    print(f'[완료] {len(delete_ids)}건 삭제')
else:
    print('[완료] 삭제 대상 없음')

res2 = sb.table('news_feed').select('id').execute()
print(f'[남은 뉴스] {len(res2.data or [])}건')
print('='*50)
