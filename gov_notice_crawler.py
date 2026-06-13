#!/usr/bin/env python3
"""
정부 기관 고시·예규·입법예고 전용 크롤러 (PC 실행 — 한국 IP)
대상: 국립전파연구원 / 과기정통부 / 방통위
매일 07:50 Cowork 스케줄 태스크로 실행
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

# curl_cffi 우선 사용 (TLS 지문 위장 — 과기정통부·방통위 봇 차단 우회)
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

# ── 환경변수 ──────────────────────────────────────────────
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
    """curl_cffi TLS 지문 위장 + 재시도"""
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
                print(f'  [재시도 {attempt}/{MAX_RETRY}] {url[:50]}... ({e})')
                time.sleep(RETRY_DELAY)
            else:
                raise


# ═══════════════════════════════════════════════════════
#  유틸
# ═══════════════════════════════════════════════════════

def parse_date(s: str) -> str:
    if not s:
        return ''
    s = s.strip()
    now = datetime.now(KST)
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


# ═══════════════════════════════════════════════════════
#  크롤러 — 국립전파연구원
# ═══════════════════════════════════════════════════════

def crawl_rra() -> list:
    items = []
    targets = [
        ('https://www.rra.go.kr/ko/reference/lawList.do', '고시·공고', '기술기준'),
        ('https://www.rra.go.kr/ko/notice/atnList.do',    '행정예고',  '기술기준'),
        ('https://www.rra.go.kr/ko/notice/noticeList.do', '공지사항',  '기타'),
        ('https://www.rra.go.kr/ko/notice/newsList.do',   '보도자료',  '기타'),
    ]
    for url, label, category in targets:
        try:
            res = fetch_with_retry(url, timeout=20)
            res.encoding = 'euc-kr'   # RRA 고정 인코딩 (curl_cffi 호환)
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
                tds = row.find_all('td')
                date_str = tds[-2].get_text(strip=True) if len(tds) >= 3 else ''
                items.append({
                    'title':        title,
                    'source':       f'국립전파연구원 {label}',
                    'category':     category,
                    'url':          href,
                    'is_read':      False,
                    'published_at': parse_date(date_str),
                    'urgency':      '보통',
                    'importance':   '보통',
                })
            print(f'[RRA] {label}: {len(rows)}행')
        except Exception as e:
            print(f'[RRA 오류] {label}: {e}')
        time.sleep(1)
    return items


# ═══════════════════════════════════════════════════════
#  크롤러 — 과기정통부
# ═══════════════════════════════════════════════════════

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
                    'source':       f'과기정통부 {label}',
                    'category':     detect_category(title),
                    'url':          href,
                    'is_read':      False,
                    'published_at': parse_date(date_str),
                    'urgency':      '보통',
                    'importance':   '보통',
                })
            print(f'[MSIT] {label}: {sum(1 for i in items if "과기정통부" in i["source"])}건')
        except Exception as e:
            print(f'[MSIT 오류] {label}: {e}')
        time.sleep(1)
    return items


# ═══════════════════════════════════════════════════════
#  크롤러 — 방통위
# ═══════════════════════════════════════════════════════

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
                    'source':       f'방통위 {label}',
                    'category':     detect_category(title),
                    'url':          href,
                    'is_read':      False,
                    'published_at': parse_date(date_str),
                    'urgency':      '보통',
                    'importance':   '보통',
                })
        except Exception as e:
            print(f'[KCC 오류] {label}: {e}')
        time.sleep(1)
    print(f'[KCC] {len(items)}건')
    return items


# ═══════════════════════════════════════════════════════
#  크롤러 — 법령입법예고 시스템 (opinion.lawmaking.go.kr)
# ═══════════════════════════════════════════════════════

OPINION_BASE = 'https://opinion.lawmaking.go.kr'
OPINION_LIST = f'{OPINION_BASE}/gcom/ogLmPp'

# 입법예고 검색 키워드 (법령명 기준 검색)
OPINION_KEYWORDS = [
    '전파', '주파수', '전기통신', '방송통신', '무선', '전자파',
    '적합성평가', '정보통신망', '이동통신', '기간통신', '위성',
]


def _parse_opinion_date(s: str) -> str:
    """'2026. 6. 12.' → '20260612'"""
    s = s.strip().rstrip('.')
    parts = [p.strip() for p in s.split('.') if p.strip()]
    if len(parts) >= 3:
        try:
            return f"{int(parts[0]):04d}{int(parts[1]):02d}{int(parts[2]):02d}"
        except ValueError:
            pass
    return ''


def _opinion_law_id(title: str) -> str:
    """법령명 MD5 기반 고유 ID — opinion.lawmaking.go.kr 항목용"""
    h = hashlib.md5(title.encode('utf-8')).hexdigest()[:10]
    return f'lsAnc_op_{h}'


def _save_opinion_to_law_amendments(collected: dict) -> list:
    """수집된 입법예고를 law_amendments에 upsert. 신규 행 목록 반환."""
    try:
        existing_rows = sb.table('law_amendments').select('law_id,matched_keywords') \
            .like('law_id', 'lsAnc_op_%').execute().data
        existing = {r['law_id']: r for r in existing_rows}
    except Exception as e:
        print(f'[입법예고 DB 조회 오류] {e}')
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
            'ann_type':         f'입법예고 ({dept})' if dept else '입법예고',
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
                print(f'  🆕 신규 입법예고: {title[:40]}')
            except Exception as e:
                print(f'  [입법예고 저장 오류] {title[:30]}: {e}')
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
                    print(f'  [키워드 업데이트 오류] {title[:30]}: {e}')

    print(f'[입법예고] 신규 {len(new_items)}건 law_amendments 저장')
    return new_items


def _notify_opinion_items(new_items: list):
    """신규 입법예고 텔레그램 + 이메일(Resend) 즉시 알림"""
    # 텔레그램
    if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
        for it in new_items:
            msg = (
                f'📢 <b>[신규 입법예고]</b>\n'
                f'{it["title"]}\n\n'
                f'• 담당: {it["dept"] or "—"}\n'
                f'• 예고기간: {it["period"] or "—"}\n'
                f'• 링크: {it["link_url"]}'
            )
            try:
                resp = requests.post(
                    f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage',
                    json={'chat_id': TELEGRAM_CHAT_ID, 'text': msg, 'parse_mode': 'HTML'},
                    timeout=10,
                )
                if resp.status_code == 200:
                    print(f'  [텔레그램] "{it["title"][:30]}" 발송')
                else:
                    print(f'  [텔레그램 오류] HTTP {resp.status_code}')
            except Exception as e:
                print(f'  [텔레그램 오류] {e}')
            time.sleep(0.5)

    # 이메일 (Resend) — 미국 IP에서도 동작
    if RESEND_API_KEY and new_items:
        items_html = ''
        for it in new_items:
            items_html += (
                f'<div style="border:2px solid #c53030;border-radius:6px;'
                f'background:#fff5f5;padding:10px 14px;margin:10px 0">'
                f'<b>📢 [신규 입법예고]</b> {it["title"]}<br>'
                f'• 담당: {it["dept"] or "—"}<br>'
                f'• 예고기간: {it["period"] or "—"}<br>'
                f'• <a href="{it["link_url"]}">상세 보기</a>'
                f'</div>'
            )
        body_html = (
            f'<html><body style="font-family:sans-serif;max-width:640px;margin:auto;padding:20px">'
            f'<h2 style="color:#c53030">🔴 신규 입법예고 {len(new_items)}건 감지</h2>'
            f'{items_html}'
            f'<hr style="margin-top:24px">'
            f'<p style="color:#999;font-size:11px">SKT Comm센터 기술정책팀 전파정책 AI<br>'
            f'<a href="https://youjinwoong.github.io/radio-policy-ai/">대시보드</a></p>'
            f'</body></html>'
        )
        payload = json.dumps({
            'from': '전파정책 AI <onboarding@resend.dev>',
            'to': ['you.jinwoong@gmail.com'],
            'subject': f'🔴 [전파정책 AI] 신규 입법예고 {len(new_items)}건',
            'html': body_html,
        }, ensure_ascii=False)
        try:
            resp = requests.post(
                'https://api.resend.com/emails',
                headers={
                    'Authorization': f'Bearer {RESEND_API_KEY}',
                    'Content-Type': 'application/json',
                },
                data=payload,
                timeout=30,
            )
            if resp.status_code in (200, 201):
                print(f'  [이메일] 입법예고 알림 발송 완료')
            else:
                print(f'  [이메일 오류] HTTP {resp.status_code}: {resp.text[:100]}')
        except Exception as e:
            print(f'  [이메일 오류] {e}')


def crawl_opinion_lawmaking() -> list:
    """법령입법예고 시스템 (opinion.lawmaking.go.kr) 크롤링.
    신규 입법예고 → law_amendments 저장 + 텔레그램·이메일 즉시 알림.
    news_feed에는 저장하지 않음 (빈 리스트 반환)."""
    # {href: {title, dept, period, keywords: set}}
    collected: dict[str, dict] = {}

    for kw in OPINION_KEYWORDS:
        try:
            res = fetch_with_retry(
                f'{OPINION_LIST}?lsNm={kw}&isOgYn=Y&opYn=Y',
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
                    href = f'{OPINION_BASE}/gcom/{href}'
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

            print(f'[입법예고] "{kw}": {len(rows)}행 → {found_kw}건 신규')
            time.sleep(1)

        except Exception as e:
            print(f'[입법예고 오류] "{kw}": {e}')

    print(f'[입법예고 합계] {len(collected)}건 수집')
    if collected:
        new_items = _save_opinion_to_law_amendments(collected)
        if new_items:
            _notify_opinion_items(new_items)

    return []  # news_feed에는 저장하지 않음


# ═══════════════════════════════════════════════════════
#  저장
# ═══════════════════════════════════════════════════════

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
        new_items.append(item)

    if not new_items:
        print('[저장] 신규 항목 없음')
        return 0

    sb.table('news_feed').insert(new_items).execute()
    print(f'[저장] {len(new_items)}건 완료')
    return len(new_items)


# ═══════════════════════════════════════════════════════
#  메인
# ═══════════════════════════════════════════════════════

def main():
    now_str = datetime.now(KST).strftime('%Y-%m-%d %H:%M KST')
    print(f'{"="*50}')
    print(f'[정부 고시·예규 크롤러 시작] {now_str}')
    print(f'{"="*50}')

    existing_urls, existing_titles = get_existing_urls()
    print(f'[기존] {len(existing_urls)}건')

    all_items = []
    all_items += crawl_rra()
    all_items += crawl_msit()
    all_items += crawl_kcc()
    all_items += crawl_opinion_lawmaking()   # 법령입법예고 (최우선 — 긴급 분류)
    print(f'[수집] 총 {len(all_items)}건')

    saved = save_items(all_items, existing_urls, existing_titles)
    print(f'[완료] 신규 {saved}건 저장')
    print(f'{"="*50}')


if __name__ == '__main__':
    main()
