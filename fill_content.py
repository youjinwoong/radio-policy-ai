#!/usr/bin/env python3
"""기존 news_feed 기사의 content를 Google RSS summary로 채우는 1회용 스크립트"""
import os, re, time, requests
from supabase import create_client

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import feedparser

sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

NEWS_SEARCH_KEYWORDS = [
    '전파정책', '주파수', '5G주파수', '6G주파수', '전자파', '무선국',
    '이동통신', 'WRC-27', '6GHz', '공공와이파이', '기지국', 'LTE',
    '이동통신 품질', '5G 기지국', 'LTE 기지국', '기지국 장애', '이동통신 장비'
]

def clean_html(text):
    return re.sub(r'<[^>]+>', '', text or '').strip()

def fetch_rss_summaries():
    """Google RSS 피드에서 모든 기사 제목+요약 수집"""
    summaries = {}  # title → summary
    seen = set()
    for kw in NEWS_SEARCH_KEYWORDS:
        url = f'https://news.google.com/rss/search?q={requests.utils.quote(kw)}&hl=ko&gl=KR&ceid=KR:ko'
        try:
            feed = feedparser.parse(url)
            for entry in (feed.entries or []):
                raw_title = (entry.get('title') or '').strip()
                title = raw_title.rsplit(' - ', 1)[0].strip() if ' - ' in raw_title else raw_title
                if title in seen:
                    continue
                seen.add(title)
                summary = clean_html(entry.get('summary', ''))
                if summary and title not in summary:
                    # summary에서 제목 부분 제거
                    if summary.startswith(title):
                        summary = summary[len(title):].strip(' -–')
                    summaries[title] = summary[:500]
        except Exception as e:
            print(f'RSS 오류 [{kw}]: {e}')
        time.sleep(0.2)
    print(f'RSS에서 {len(summaries)}개 기사 요약 수집')
    return summaries

# DB에서 content 없는 기사 조회
resp = sb.table('news_feed').select('id,title').is_('content', 'null').execute()
items = resp.data or []
print(f'content 없는 기사: {len(items)}건\n')

if not items:
    print('모두 채워져 있습니다.')
    exit()

# RSS 재수집
print('Google RSS 재수집 중...')
summaries = fetch_rss_summaries()
print()

# 매칭 및 업데이트
updated = 0
for i, item in enumerate(items):
    title = item['title']
    # 정확 매칭
    summary = summaries.get(title)
    # 부분 매칭 (80자 이상 공통)
    if not summary:
        for rss_title, rss_summary in summaries.items():
            if len(title) > 10 and (title[:20] in rss_title or rss_title[:20] in title):
                summary = rss_summary
                break
    if summary:
        sb.table('news_feed').update({'content': summary}).eq('id', item['id']).execute()
        print(f'[{i+1}] ✅ {title[:40]}... → {len(summary)}자')
        updated += 1
    else:
        print(f'[{i+1}] ❌ {title[:40]}... → RSS 매칭 실패')

print(f'\n완료: {updated}/{len(items)}건 업데이트')
