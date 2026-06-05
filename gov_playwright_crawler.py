#!/usr/bin/env python3
"""
과기정통부·방통위 Playwright 크롤러 (헤드리스 브라우저 — 봇 차단 우회)
PC 실행 전용
"""

import os
import re
import time
from datetime import datetime, timezone, timedelta

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from supabase import create_client, Client

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_KEY']
KST = timezone(timedelta(hours=9))
sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

RADIO_KEYWORDS = [
    '전파', '주파수', '5G', '6G', '전자파', '무선', '적합성평가', '기자재',
    'WRC', 'ITU', 'IMT', '스펙트럼', '전기통신', '통신사업', '단말',
    '정보통신망', '사이버', '이동통신', '기지국', '무선국',
]


def parse_date(s: str) -> str:
    if not s:
        return ''
    s = s.strip()
    m = re.match(r'(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})', s)
    if m:
        try:
            dt = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), tzinfo=KST)
            return dt.isoformat()
        except Exception:
            pass
    return ''


def detect_category(title: str) -> str:
    if any(k in title for k in ['주파수', '할당', '경매', '분배']): return '주파수'
    if any(k in title for k in ['전자파', 'SAR', 'EMC']):           return '전자파'
    if any(k in title for k in ['적합성평가', '기자재', '인증']):   return '기술기준'
    if any(k in title for k in ['ITU', 'WRC', 'IMT', '6G', '5G']): return 'ITU·WRC'
    if any(k in title for k in ['기술기준', '무선설비', '무선국']): return '기술기준'
    if any(k in title for k in ['전기통신사업', '통신사업']):       return '전기통신사업'
    return '기타'


def crawl_with_playwright() -> list:
    from playwright.sync_api import sync_playwright

    items = []
    targets = [
        # 과기정통부
        ('https://www.msit.go.kr/bbs/list.do?sCode=user&mPid=208&mId=307', '과기정통부 보도자료',  'table tbody tr'),
        ('https://www.msit.go.kr/bbs/list.do?sCode=user&mPid=103&mId=109', '과기정통부 입법행정예고', 'table tbody tr'),
        ('https://www.msit.go.kr/bbs/list.do?sCode=user&mPid=103&mId=108', '과기정통부 훈령예규고시', 'table tbody tr'),
        # 방송미디어통신위원회 (구 방통위, kmcc.go.kr로 변경)
        ('https://www.kmcc.go.kr/user.do?boardId=1113&page=A05030000&dc=K05030000', '방미통위 보도자료', 'table tbody tr, ul.bbs_list li'),
        ('https://www.kmcc.go.kr/user.do?boardId=1112&page=A05020000&dc=K05020000', '방미통위 공지사항', 'table tbody tr, ul.bbs_list li'),
    ]

    # playwright-stealth 있으면 적용 (봇 감지 우회)
    try:
        from playwright_stealth import stealth_sync
        use_stealth = True
    except ImportError:
        use_stealth = False

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,   # 실제 브라우저 창으로 실행 — 봇 감지 우회
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
            ]
        )
        context = browser.new_context(
            user_agent=(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/124.0.0.0 Safari/537.36'
            ),
            locale='ko-KR',
            viewport={'width': 1280, 'height': 800},
        )
        page = context.new_page()
        if use_stealth:
            stealth_sync(page)
            print('[Stealth 모드 활성화]')

        for url, source, row_selector in targets:
            try:
                print(f'[Playwright] {source} 접속 중...')
                page.goto(url, timeout=30000, wait_until='domcontentloaded')
                page.wait_for_timeout(2000)  # JS 렌더링 대기

                rows = page.query_selector_all(row_selector)
                count = 0
                for row in rows[:20]:
                    # 제목 링크 찾기
                    link = row.query_selector('a')
                    if not link:
                        continue
                    title = (link.inner_text() or '').strip()
                    if not title or len(title) < 5:
                        continue
                    # 정부 공식 사이트는 키워드 필터 없이 전체 수집
                    # (타겟 사이트 자체가 전파·통신 관련 기관)

                    href = link.get_attribute('href') or ''
                    if href.startswith('/'):
                        base = 'https://www.msit.go.kr' if 'msit' in url else 'https://www.kmcc.go.kr'
                        href = base + href

                    # 날짜 추출
                    date_str = ''
                    tds = row.query_selector_all('td')
                    if len(tds) >= 3:
                        date_str = (tds[-2].inner_text() or '').strip()

                    items.append({
                        'title':        title,
                        'source':       source,
                        'category':     detect_category(title),
                        'url':          href,
                        'is_read':      False,
                        'published_at': parse_date(date_str),
                        'urgency':      '보통',
                        'importance':   '보통',
                    })
                    count += 1

                print(f'  → {count}건 수집')
            except Exception as e:
                print(f'  [오류] {source}: {e}')
            time.sleep(2)

        browser.close()

    return items


def save_items(items: list) -> int:
    if not items:
        return 0
    res = sb.table('news_feed').select('url,title').execute()
    existing_urls   = {r['url']   for r in (res.data or []) if r.get('url')}
    existing_titles = {r['title'] for r in (res.data or []) if r.get('title')}

    new_items = []
    for item in items:
        if item.get('url') in existing_urls:
            continue
        if item.get('title') in existing_titles:
            continue
        if not item.get('published_at'):
            item['published_at'] = datetime.now(KST).isoformat()
        new_items.append(item)

    if not new_items:
        print('[저장] 신규 없음')
        return 0

    sb.table('news_feed').insert(new_items).execute()
    print(f'[저장] {len(new_items)}건 완료')
    return len(new_items)


def main():
    now_str = datetime.now(KST).strftime('%Y-%m-%d %H:%M KST')
    print(f'{"="*50}')
    print(f'[Playwright 크롤러 시작] {now_str}')
    print(f'{"="*50}')

    items = crawl_with_playwright()
    print(f'[수집] 총 {len(items)}건')

    saved = save_items(items)
    print(f'[완료] 신규 {saved}건 저장')
    print(f'{"="*50}')


if __name__ == '__main__':
    main()
