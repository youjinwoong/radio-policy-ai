#!/usr/bin/env python3
"""
정부 기관 고시·예규·입법예고 전용 크롤러 (PC 실행 — 한국 IP)
대상: 국립전파연구원 / 과기정통부 / 방통위
결과: Supabase news_feed 저장
"""

import os
import re
import json
import hashlib
import time
from datetime import datetime, timezone, timedelta

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from curl_cffi import requests
    USE_CURL_CFFI = True
    print('[curl_cffi] TLS 지문 위장 모드 활성화')
except ImportError:
    import requests
    USE_CURL_CFFI = False
    print('[curl_cffi] 미설치 — 일반 requests 사용')

from bs4 import BeautifulSoup
from supabase import create_client, Client

SUPABASE_URL       = os.environ['SUPABASE_URL']
SUPABASE_KEY       = os.environ['SUPABASE_SERVICE_KEY']
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHAT_ID   = os.environ.get('TELEGRAM_CHAT_ID', '')
RESEND_API_KEY     = os.environ.get('RESEND_API_KEY', '')

KST = timezone(timedelta(hours=9))
sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    ),
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

MAX_RETRY = 3
RETRY_DELAY = 5


def fetch_with_retry(url: str, timeout: int = 20):
    for attempt in range(1, MAX_RETRY + 1):
        try:
            if USE_CURL_CFFI:
                res = requests.get(url, impersonate='chrome110', timeout=timeout)
            else:
                res = requests.get(url, headers=HEADERS, timeout=timeout)
            res.raise_for_status()
            return res
        except Exception as e:
            if attempt < MAX_RETRY:
                print('  [재시도 %d/%d] %s... (%s)' % (attempt, MAX_RETRY, url[:50], e))
                time.sleep(RETRY_DELAY)
            else:
                raise


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
    m = re.match(r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일', s)
    if m:
        try:
            dt = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), tzinfo=KST)
            return dt.isoformat()
        except Exception:
            pass
    return ''


def get_existing_urls() -> tuple:
    res = sb.table('news_feed').select('url,title').execute()
    urls   = {r['url']   for r in (res.data or []) if r.get('url')}
    titles = {r['title'] for r in (res.data or []) if r.get('title')}
    return urls, titles


def detect_category(title: str) -> str:
    if any(k in title for k in ['주파수', '할당', '경매', '분배', '재배치']): return '주파수'
    if any(k in title for k in ['전자파', 'SAR', 'EMC', '인체보호']):         return '전자파'
    if any(k in title for k in ['적합성평가', '기자재', '시험기관', '인증']): return '기술기준'
    if any(k in title for k in ['ITU', 'WRC', 'IMT', '6G', '5G']):           return 'ITU·WRC'
    if any(k in title for k in ['기술기준', '무선설비', '무선국', '단말']):   return '기술기준'
    if any(k in title for k in ['전기통신사업', '통신사업', '망중립']):       return '전기통신사업'
    return '기타'


def crawl_rra() -> list:
    items = []
    targets = [
        ('https://www.rra.go.kr/ko/reference/lawList.do', '고시·공고', '기술기준'),
        ('https://www.rra.go.kr/ko/notice/atnList.do',    '행정예고',  '기술기준'),
        ('https://www.rra.go.kr/ko/notice/noticeList.do', '공지사항',  '기타'),
        ('https://www.rra.go.kr/ko/notice/newsList.do',   '보도자료',  '기타'),
    ]
    for url, label, category in targets:
        # 상대경로 href 해석을 위한 페이지 기준 디렉토리 (예: .../ko/notice/)
        base_dir = url.rsplit('/', 1)[0] + '/'
        try:
            res = fetch_with_retry(url, timeout=20)
            res.encoding = 'euc-kr'
            soup = BeautifulSoup(res.text, 'html.parser')
            rows = soup.select('table.board_list tbody tr, table tbody tr')[:20]
            for row in rows:
                title_tag = row.find('a')
                if not title_tag:
                    continue
                title = title_tag.get_text(strip=True)
                if not title or title.isdigit() or len(title) < 5:
                    continue
                href = title_tag.get('href', '')
                if href.startswith('/'):
                    href = 'https://www.rra.go.kr' + href
                elif href and not href.startswith('http'):
                    href = base_dir + href
                tds = row.find_all('td')
                # td를 역순으로 순회해 날짜 패턴 매칭 (위치 의존 제거)
                date_str = ''
                for td in reversed(tds):
                    t = td.get_text(strip=True)
                    if re.match(r'\d{4}[.\-]\d{1,2}[.\-]\d{1,2}', t):
                        date_str = t
                        break
                items.append({
                    'title':        title,
                    'source':       '국립전파연구원 ' + label,
                    'category':     category,
                    'url':          href,
                    'is_read':      False,
                    'published_at': parse_date(date_str),
                    'urgency':      '보통',
                    'importance':   '보통',
                })
            print('[RRA] %s: %d행' % (label, len(rows)))
        except Exception as e:
            print('[RRA 오류] %s: %s' % (label, e))
        time.sleep(1)
    return items


RADIO_KEYWORDS = [
    '전파', '주파수', '5G', '6G', '전자파', '무선', '적합성평가', '기자재',
    'WRC', 'ITU', 'IMT', '스펙트럼', '전기통신', '통신사업', '단말',
    '정보통신망', '사이버', '이동통신', '기지국', '무선국',
]

def crawl_msit() -> list:
    items = []
    targets = [
        ('https://www.msit.go.kr/bbs/list.do?sCode=user&mPid=208&mId=307', '보도자료'),
        ('https://www.msit.go.kr/bbs/list.do?sCode=user&mPid=103&mId=109', '입법행정예고'),
        ('https://www.msit.go.kr/bbs/list.do?sCode=user&mPid=103&mId=108', '훈령예규고시'),
    ]
    for url, label in targets:
        try:
            res = fetch_with_retry(url, timeout=20)
            res.encoding = getattr(res, 'apparent_encoding', None) or 'utf-8'
            soup = BeautifulSoup(res.text, 'html.parser')
            rows = soup.select('table tbody tr, ul.bbs_list li')[:20]
            for row in rows:
                title_tag = row.find('a')
                if not title_tag:
                    continue
                title = title_tag.get_text(strip=True)
                if not title or not any(k in title for k in RADIO_KEYWORDS):
                    continue
                href = title_tag.get('href', '')
                if href.startswith('/'):
                    href = 'https://www.msit.go.kr' + href
                date_tag = row.find(class_=re.compile(r'date|day|time'))
                date_str = date_tag.get_text(strip=True) if date_tag else ''
                items.append({
                    'title':        title,
                    'source':       '과기정통부 ' + label,
                    'category':     detect_category(title),
                    'url':          href,
                    'is_read':      False,
                    'published_at': parse_date(date_str),
                    'urgency':      '보통',
                    'importance':   '보통',
                })
            msit_cnt = sum(1 for i in items if '과기정통부' in i['source'])
            print('[MSIT] %s: %d건' % (label, msit_cnt))
        except Exception as e:
            print('[MSIT 오류] %s: %s' % (label, e))
        time.sleep(1)
    return items


def crawl_kcc() -> list:
    items = []
    targets = [
        ('https://www.kmcc.go.kr/user.do?boardId=1113&page=A05030000&dc=K05030000', '보도자료'),
        ('https://www.kmcc.go.kr/user.do?boardId=1112&page=A05020000&dc=K05020000', '공지사항'),
    ]
    for url, label in targets:
        try:
            res = fetch_with_retry(url, timeout=20)
            res.encoding = getattr(res, 'apparent_encoding', None) or 'utf-8'
            soup = BeautifulSoup(res.text, 'html.parser')
            rows = soup.select('table tbody tr, ul.bbs_list li')[:15]
            for row in rows:
                title_tag = row.find('a')
                if not title_tag:
                    continue
                title = title_tag.get_text(strip=True)
                if not title or not any(k in title for k in RADIO_KEYWORDS):
                    continue
                href = title_tag.get('href', '')
                if href.startswith('/'):
                    href = 'https://www.kmcc.go.kr' + href
                date_tag = row.find(class_=re.compile(r'date|day|time'))
                date_str = date_tag.get_text(strip=True) if date_tag else ''
                items.append({
                    'title':        title,
                    'source':       '방통위 ' + label,
                    'category':     detect_category(title),
                    'url':          href,
                    'is_read':      False,
                    'published_at': parse_date(date_str),
                    'urgency':      '보통',
                    'importance':   '보통',
                })
        except Exception as e:
            print('[KCC 오류] %s: %s' % (label, e))
        time.sleep(1)
    print('[KCC] %d건' % len(items))
    return items


OPINION_BASE = 'https://opinion.lawmaking.go.kr'
OPINION_LIST = OPINION_BASE + '/gcom/ogLmPp'

OPINION_KEYWORDS = [
    '전파', '주파수', '전기통신', '방송통신', '무선', '전자파',
    '적합성평가', '정보통신망', '이동통신', '기간통신', '위성',
]


def _parse_opinion_date(s: str) -> str:
    s = s.strip().rstrip('.')
    parts = [p.strip() for p in s.split('.') if p.strip()]
    if len(parts) >= 3:
        try:
            return '%04d%02d%02d' % (int(parts[0]), int(parts[1]), int(parts[2]))
        except ValueError:
            pass
    return ''


def _opinion_law_id(title: str) -> str:
    h = hashlib.md5(title.encode('utf-8')).hexdigest()[:10]
    return 'lsAnc_op_' + h


def _save_opinion_to_law_amendments(collected: dict) -> list:
    try:
        existing_rows = sb.table('law_amendments').select('law_id,matched_keywords') \
            .like('law_id', 'lsAnc_op_%').execute().data
        existing = {r['law_id']: r for r in existing_rows}
    except Exception as e:
        print('[입법예고 DB 조회 오류] %s' % e)
        existing = {}

    new_items = []
    now_str = datetime.now(KST).isoformat()

    for href, info in collected.items():
        title = info['title']
        dept = info['dept']
        period = info['period']
        keywords = list(info['keywords'])

        parts = period.split('~')
        public_dt = _parse_opinion_date(parts[0]) if parts else ''
        enf_dt = _parse_opinion_date(parts[1]) if len(parts) > 1 else ''

        law_id = _opinion_law_id(title)
        row = {
            'law_id':           law_id,
            'law_nm':           title,
            'law_type':         'lsAnc',
            'ann_type':         ('입법예고 (%s)' % dept) if dept else '입법예고',
            'public_dt':        public_dt,
            'enf_dt':           enf_dt,
            'matched_keywords': keywords,
            'link_url':         href,
            'updated_at':       now_str,
        }

        if law_id not in existing:
            try:
                sb.table('law_amendments').insert(row).execute()
                new_items.append({
                    'title':    title,
                    'law_nm':   title,
                    'dept':     dept,
                    'period':   period,
                    'link_url': href,
                    'ann_type': row['ann_type'],
                    'public_dt': public_dt,
                    'enf_dt':   enf_dt,
                })
                print('  신규 입법예고: %s' % title[:40])
            except Exception as e:
                print('  [입법예고 저장 오류] %s: %s' % (title[:30], e))
        else:
            existing_kw = set(existing[law_id].get('matched_keywords') or [])
            new_kw = set(keywords)
            if not new_kw.issubset(existing_kw):
                try:
                    sb.table('law_amendments').update({
                        'matched_keywords': list(existing_kw | new_kw),
                        'updated_at': now_str,
                    }).eq('law_id', law_id).execute()
                except Exception as e:
                    print('  [키워드 업데이트 오류] %s: %s' % (title[:30], e))

    print('[입법예고] 신규 %d건 law_amendments 저장' % len(new_items))
    return new_items


def _notify_opinion_items(new_items: list):
    if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
        for it in new_items:
            msg = (
                '\U0001f4e2 <b>[신규 입법예고]</b>\n'
                + it['title'] + '\n\n'
                '• 담당: ' + (it['dept'] or '—') + '\n'
                '• 예고기간: ' + (it['period'] or '—') + '\n'
                '• 링크: ' + it['link_url']
            )
            try:
                resp = requests.post(
                    'https://api.telegram.org/bot%s/sendMessage' % TELEGRAM_BOT_TOKEN,
                    json={'chat_id': TELEGRAM_CHAT_ID, 'text': msg, 'parse_mode': 'HTML'},
                    timeout=10,
                )
                if resp.status_code == 200:
                    print('  [텔레그램] "%s" 발송' % it['title'][:30])
                else:
                    print('  [텔레그램 오류] HTTP %d' % resp.status_code)
            except Exception as e:
                print('  [텔레그램 오류] %s' % e)
            time.sleep(0.5)

    if RESEND_API_KEY and new_items:
        items_html = ''
        for it in new_items:
            items_html += (
                '<div style="border:2px solid #c53030;border-radius:6px;'
                'background:#fff5f5;padding:10px 14px;margin:10px 0">'
                '<b>\U0001f4e2 [신규 입법예고]</b> ' + it['title'] + '<br>'
                '• 담당: ' + (it['dept'] or '—') + '<br>'
                '• 예고기간: ' + (it['period'] or '—') + '<br>'
                '• <a href="' + it['link_url'] + '">상세 보기</a>'
                '</div>'
            )
        body_html = (
            '<html><body style="font-family:sans-serif;max-width:640px;margin:auto;padding:20px">'
            '<h2 style="color:#c53030">\U0001f534 신규 입법예고 %d건 감지</h2>' % len(new_items)
            + items_html
            + '<hr style="margin-top:24px">'
            '<p style="color:#999;font-size:11px">SKT Comm센터 기술정책팀 전파정책 AI<br>'
            '<a href="https://youjinwoong.github.io/radio-policy-ai/">대시보드</a></p>'
            '</body></html>'
        )
        payload = json.dumps({
            'from': '전파정책 AI <onboarding@resend.dev>',
            'to': ['you.jinwoong@gmail.com'],
            'subject': '\U0001f534 [전파정책 AI] 신규 입법예고 %d건' % len(new_items),
            'html': body_html,
        }, ensure_ascii=False)
        try:
            resp = requests.post(
                'https://api.resend.com/emails',
                headers={
                    'Authorization': 'Bearer ' + RESEND_API_KEY,
                    'Content-Type': 'application/json',
                },
                data=payload,
                timeout=30,
            )
            if resp.status_code in (200, 201):
                print('  [이메일] 입법예고 알림 발송 완료')
            else:
                print('  [이메일 오류] HTTP %d: %s' % (resp.status_code, resp.text[:100]))
        except Exception as e:
            print('  [이메일 오류] %s' % e)


def crawl_opinion_lawmaking() -> list:
    collected = {}

    for kw in OPINION_KEYWORDS:
        try:
            res = fetch_with_retry(
                OPINION_LIST + '?lsNm=' + kw + '&isOgYn=Y&opYn=Y',
                timeout=20,
            )
            soup = BeautifulSoup(res.text, 'html.parser')
            rows = soup.select('table tbody tr')
            found_kw = 0

            for row in rows:
                tds = row.find_all('td')
                if len(tds) < 5:
                    continue
                a_tag = tds[1].find('a')
                if not a_tag:
                    continue
                title = a_tag.get_text(strip=True)
                if not title:
                    continue
                href = a_tag.get('href', '')
                if href.startswith('/'):
                    href = OPINION_BASE + href
                elif not href.startswith('http'):
                    href = OPINION_BASE + '/gcom/' + href
                if not href:
                    continue

                dept = tds[2].get_text(strip=True)
                period = tds[4].get_text(strip=True)

                if href in collected:
                    collected[href]['keywords'].add(kw)
                else:
                    collected[href] = {
                        'title': title, 'dept': dept,
                        'period': period, 'keywords': {kw},
                    }
                    found_kw += 1

            print('[입법예고] "%s": %d행 → %d건 신규' % (kw, len(rows), found_kw))
            time.sleep(1)

        except Exception as e:
            print('[입법예고 오류] "%s": %s' % (kw, e))

    print('[입법예고 합계] %d건 수집' % len(collected))
    if collected:
        new_items = _save_opinion_to_law_amendments(collected)
        if new_items:
            _notify_opinion_items(new_items)

    return []


def save_items(items: list, existing_urls: set, existing_titles: set) -> int:
    seen_urls   = set(existing_urls)
    seen_titles = set(existing_titles)
    new_items = []
    for item in items:
        url   = item.get('url', '')
        title = item.get('title', '')
        if url and url in seen_urls:
            continue
        if title and title in seen_titles:
            continue
        if url:
            seen_urls.add(url)
        if title:
            seen_titles.add(title)
        # 발행일 없으면 오늘로
        if not item.get('published_at'):
            item['published_at'] = datetime.now(KST).isoformat()
        # 발행일이 파싱된 경우 15일 초과 기사는 수집 건너뜀
        else:
            try:
                pub_dt = datetime.fromisoformat(item['published_at'])
                if pub_dt.tzinfo is None:
                    pub_dt = pub_dt.replace(tzinfo=KST)
                if (datetime.now(KST) - pub_dt).days > 15:
                    continue
            except Exception:
                pass
        new_items.append(item)

    if not new_items:
        print('[저장] 신규 항목 없음')
        return 0

    sb.table('news_feed').insert(new_items).execute()
    print('[저장] %d건 완료' % len(new_items))
    return len(new_items)


def main():
    now_str = datetime.now(KST).strftime('%Y-%m-%d %H:%M KST')
    print('=' * 50)
    print('[정부 고시·예규 크롤러 시작] ' + now_str)
    print('=' * 50)

    existing_urls, existing_titles = get_existing_urls()
    print('[기존] %d건' % len(existing_urls))

    all_items = []
    all_items += crawl_rra()
    all_items += crawl_msit()
    all_items += crawl_kcc()
    all_items += crawl_opinion_lawmaking()
    print('[수집] 총 %d건' % len(all_items))

    saved = save_items(all_items, existing_urls, existing_titles)
    print('[완료] 신규 %d건 저장' % saved)
    print('=' * 50)


if __name__ == '__main__':
    main()
