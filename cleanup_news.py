#!/usr/bin/env python3
"""
뉴스 데이터 정리:
1. 발행일 불명(NULL/빈값) 삭제
2. 작년 이전 뉴스 삭제 (72시간 초과)
3. 발행일이 잘못 설정된 항목은 원문에서 재추출 후 업데이트
"""
import os
import re
import time
import requests
from datetime import datetime, timezone, timedelta
from supabase import create_client
from bs4 import BeautifulSoup

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_KEY']
sb = create_client(SUPABASE_URL, SUPABASE_KEY)
KST = timezone(timedelta(hours=9))
now_kst = datetime.now(KST)
cutoff_72h = now_kst - timedelta(hours=72)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept-Language': 'ko-KR,ko;q=0.9',
}

def parse_date_iso(s: str):
    """ISO 날짜 문자열을 datetime으로 변환"""
    if not s:
        return None
    try:
        from dateutil import parser as dtp
        dt = dtp.parse(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=KST)
        return dt
    except Exception:
        return None

def fetch_pub_date(url: str) -> str:
    """기사 URL에서 실제 발행일 추출"""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=8)
        soup = BeautifulSoup(resp.text, 'html.parser')
        # meta 태그에서 발행일 추출
        for attr, val in [
            ('property', 'article:published_time'),
            ('property', 'og:article:published_time'),
            ('itemprop', 'datePublished'),
            ('name', 'article:published_time'),
            ('name', 'publishdate'),
        ]:
            tag = soup.find('meta', attrs={attr: val})
            if tag and tag.get('content'):
                dt = parse_date_iso(tag['content'])
                if dt:
                    return dt.isoformat()
        # <time datetime="...">
        for t in soup.find_all('time', datetime=True):
            dt = parse_date_iso(t['datetime'])
            if dt:
                return dt.isoformat()
    except Exception:
        pass
    return ''

print('='*50)
print(f'[정리 시작] {now_kst.strftime("%Y-%m-%d %H:%M KST")}')
print(f'[기준] 72시간 이전 = {cutoff_72h.strftime("%Y-%m-%d %H:%M")}')
print('='*50)

# ── 전체 뉴스 조회
res = sb.table('news_feed').select('id,url,published_at,created_at,title').execute()
all_items = res.data or []
print(f'[조회] 전체 {len(all_items)}건')

delete_ids = []       # 삭제 대상
update_items = []     # 날짜 재검증 대상

for item in all_items:
    pub_str = item.get('published_at') or ''
    item_id = item['id']
    
    # 1. 발행일 없음 → 삭제
    if not pub_str.strip():
        delete_ids.append(item_id)
        continue
    
    pub_dt = parse_date_iso(pub_str)
    
    # 2. 날짜 파싱 실패 → 삭제
    if pub_dt is None:
        delete_ids.append(item_id)
        continue
    
    # 3. 72시간 초과 → 삭제
    if pub_dt < cutoff_72h:
        delete_ids.append(item_id)
        continue
    
    # 4. 날짜가 created_at과 1분 이내로 동일 → 발행일이 수집시각으로 잘못 설정된 의심 항목
    created_str = item.get('created_at') or ''
    created_dt = parse_date_iso(created_str)
    if created_dt and abs((pub_dt - created_dt).total_seconds()) < 60:
        update_items.append(item)

print(f'[삭제 대상] {len(delete_ids)}건 (발행일 불명 또는 72h 초과)')
print(f'[날짜 재검증 대상] {len(update_items)}건 (수집시각=발행일 의심)')

# ── 삭제 실행 (100개씩 배치)
if delete_ids:
    batch = 100
    for i in range(0, len(delete_ids), batch):
        chunk = delete_ids[i:i+batch]
        sb.table('news_feed').delete().in_('id', chunk).execute()
    print(f'[삭제] {len(delete_ids)}건 삭제 완료')
else:
    print('[삭제] 삭제 대상 없음')

# ── 날짜 재추출 및 업데이트
updated, still_wrong = 0, 0
for item in update_items:
    real_date = fetch_pub_date(item.get('url',''))
    if real_date:
        real_dt = parse_date_iso(real_date)
        if real_dt and real_dt < cutoff_72h:
            # 실제 발행일이 72h 초과 → 삭제
            sb.table('news_feed').delete().eq('id', item['id']).execute()
            still_wrong += 1
        else:
            # 실제 발행일로 업데이트
            sb.table('news_feed').update({'published_at': real_date}).eq('id', item['id']).execute()
            updated += 1
    else:
        still_wrong += 1
    time.sleep(0.5)

print(f'[업데이트] {updated}건 발행일 수정, {still_wrong}건 삭제/미수정')

# ── 최종 현황
res2 = sb.table('news_feed').select('id').execute()
print(f'[완료] 남은 뉴스: {len(res2.data or [])}건')
print('='*50)
