#!/usr/bin/env python3
"""
전파정책 전문가 AI — 자동 크롤러
매시간 GitHub Actions에서 실행
크롤링 대상: 국립전파연구원 · 과기정통부 · 전자신문 외 다수
결과: Supabase news_feed 저장 + 이메일 발송 + 긴급 시 텔레그램 알림
"""

import os
import re
import time
import smtplib
from datetime import datetime, timezone, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import requests
from bs4 import BeautifulSoup
from supabase import create_client, Client
import anthropic

# ── 환경변수 ────────────────────────────────────────────
SUPABASE_URL       = os.environ['SUPABASE_URL']
SUPABASE_KEY       = os.environ['SUPABASE_SERVICE_KEY']
EMAIL_FROM         = os.environ.get('EMAIL_FROM', '')
EMAIL_PASS         = os.environ.get('EMAIL_PASSWORD', '')
EMAIL_TO           = os.environ.get('EMAIL_TO', '')
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHAT_ID   = os.environ.get('TELEGRAM_CHAT_ID', '')
ANTHROPIC_API_KEY  = os.environ.get('ANTHROPIC_API_KEY', '')

# ── 초기화 ─────────────────────────────────────────────
sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
KST = timezone(timedelta(hours=9))
HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    ),
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}


# ═══════════════════════════════════════════════════════
#  긴급 분류 — Claude Haiku AI 판단
# ═══════════════════════════════════════════════════════

_URGENCY_SYSTEM = """당신은 SK텔레콤 CR센터 기술정책팀의 전파정책 모니터링 AI입니다.
기사 제목과 본문을 읽고 SKT 관점에서 대응 우선순위를 판단합니다.

아래 기준으로 셋 중 하나만 출력하세요 (다른 말 없이 단어만):

즉시대응:
- 이동통신 품질·장비·기지국·공공 와이파이 관련 불만/민원/장애/사고 기사
- 전파·전자파·무선국·주파수 관련 불만·규제강화·위반·처분 기사
- 과징금·허가취소·영업정지·행정처분 등 통신사에 직접 영향을 주는 기사

금주검토:
- 이동통신·전파·무선 관련 정보성·정책 동향·기술 소개 기사
- 입법예고·개정안·정책 발표 등 간접적으로 영향을 줄 수 있는 기사

동향파악:
- 위 두 기준에 해당하지 않는 해외 동향·업계 일반 트렌드·참고용 기사"""

_AI_PRIORITY_MAP = {'즉시대응': '긴급', '금주검토': '보통', '동향파악': '참고'}
_FALLBACK_MOBILE = ['이동통신', '기지국', '공공와이파이', '와이파이', '전파', '전자파', '무선국', '주파수']


def classify_urgency(title: str, content: str = '') -> str:
    """
    Claude Haiku로 기사 긴급도 AI 판단.
    API 키 없거나 오류 시 키워드 기반 폴백.
    반환값: '긴급' | '보통' | '참고'
    """
    if not ANTHROPIC_API_KEY:
        # API 키 없을 때 간단 폴백
        text = title + ' ' + (content or '')[:300]
        return '보통' if any(k in text for k in _FALLBACK_MOBILE) else '참고'

    snippet = (content or '').replace('\s+', ' ').strip()[:600]
    user_msg = f"제목: {title}\n본문: {snippet}" if snippet else f"제목: {title}"

    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        resp = client.messages.create(
            model='claude-haiku-4-5',
            max_tokens=10,
            system=_URGENCY_SYSTEM,
            messages=[{'role': 'user', 'content': user_msg}],
        )
        answer = resp.content[0].text.strip()
        # 응답에서 키워드 추출 (앞뒤 공백·줄바꿈 제거)
        for key in _AI_PRIORITY_MAP:
            if key in answer:
                return _AI_PRIORITY_MAP[key]
        return '참고'
    except Exception as e:
        print(f'  [AI 분류 오류] {title[:30]}... → 폴백 사용: {e}')
        text = title + ' ' + (content or '')[:300]
        return '보통' if any(k in text for k in _FALLBACK_MOBILE) else '참고'


# ═══════════════════════════════════════════════════════
#  유틸 함수
# ═══════════════════════════════════════════════════════

def get_existing_urls() -> set:
    """Supabase에 이미 저장된 URL 목록 조회"""
    res = sb.table('news_feed').select('url').execute()
    return {row['url'] for row in (res.data or []) if row.get('url')}


def detect_category(title: str) -> str:
    if any(k in title for k in ['주파수', '할당', '경매', '분배', '재배치']): return '주파수'
    if any(k in title for k in ['전자파', 'SAR', 'EMC', '인체보호']): return '전자파'
    if any(k in title for k in ['적합성평가', '기자재', '시험기관', '인증']): return '기술기준'
    if any(k in title for k in ['ITU', 'WRC', 'IMT', '6G', '5G', 'AI']): return 'ITU·WRC'
    if any(k in title for k in ['기술기준', '무선설비', '무선국', '단말']): return '기술기준'
    if any(k in title for k in ['전기통신사업', '통신사업', '망중립', '번호이동']): return '전기통신사업'
    if any(k in title for k in ['정보통신망', '정보보호', '사이버', '개인정보']): return '정보통신망'
    return '기타'


def parse_date(date_str: str) -> str:
    """다양한 날짜 형식 → ISO 8601 변환. 파싱 실패 시 빈 문자열 반환."""
    if not date_str:
        return ''
    s = date_str.strip()
    now = datetime.now(KST)

    # 1) ISO 8601 / RFC 3339 (meta 태그에서 추출한 날짜)
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?', s)
    if m:
        y, mo, d, h, mi, sec = m.group(1,2,3,4,5,6)
        sec = sec or '00'
        try:
            dt = datetime(int(y), int(mo), int(d), int(h), int(mi), int(sec), tzinfo=KST)
            return dt.isoformat()
        except Exception:
            pass

    # 2) YYYY.MM.DD HH:MM:SS  /  YYYY.MM.DD HH:MM  /  YYYY.MM.DD
    m = re.match(r'(\d{4})[./\-](\d{1,2})[./\-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?', s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        h  = int(m.group(4)) if m.group(4) else 0
        mi = int(m.group(5)) if m.group(5) else 0
        sec = int(m.group(6)) if m.group(6) else 0
        try:
            dt = datetime(y, mo, d, h, mi, sec, tzinfo=KST)
            return dt.isoformat()
        except Exception:
            pass

    # 3) 한국어 형식: 2024년 05월 28일 14:30
    m = re.match(r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일(?:\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?', s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        h  = int(m.group(4)) if m.group(4) else 0
        mi = int(m.group(5)) if m.group(5) else 0
        sec = int(m.group(6)) if m.group(6) else 0
        try:
            dt = datetime(y, mo, d, h, mi, sec, tzinfo=KST)
            return dt.isoformat()
        except Exception:
            pass

    # 4) 상대 날짜: N분 전, N시간 전, N일 전
    m = re.search(r'(\d+)\s*(분|시간|일)\s*전', s)
    if m:
        n = int(m.group(1))
        unit = m.group(2)
        if unit == '분':
            dt = now - timedelta(minutes=n)
        elif unit == '시간':
            dt = now - timedelta(hours=n)
        else:
            dt = now - timedelta(days=n)
        return dt.isoformat()

    # 5) 어제
    if '어제' in s:
        dt = now - timedelta(days=1)
        return dt.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

    # 6) MM.DD 형식 (연도 없음) → 현재 연도로 보정
    m = re.match(r'^(\d{1,2})[./](\d{1,2})$', s)
    if m:
        mo, d = int(m.group(1)), int(m.group(2))
        try:
            dt = datetime(now.year, mo, d, tzinfo=KST)
            # 미래 날짜라면 전년도로
            if dt > now:
                dt = dt.replace(year=now.year - 1)
            return dt.isoformat()
        except Exception:
            pass

    return ''  # 파싱 실패 — 호출자가 fallback 처리


# ═══════════════════════════════════════════════════════
#  크롤러 — 국립전파연구원 (rra.go.kr)
# ═══════════════════════════════════════════════════════

def crawl_rra() -> list:
    items = []
    targets = [
        ('https://www.rra.go.kr/ko/notice/noticeList.do',  '공지사항', '국립전파연구원'),
        ('https://www.rra.go.kr/ko/rule/ruleList.do',      '고시·예규', '국립전파연구원'),
        ('https://www.rra.go.kr/ko/rule/prioRuleList.do',  '예고',     '국립전파연구원'),
    ]
    for url, label, source in targets:
        try:
            res = requests.get(url, headers=HEADERS, timeout=20)
            res.raise_for_status()
            res.encoding = 'utf-8'
            soup = BeautifulSoup(res.text, 'html.parser')

            rows = soup.select('table.board_list tbody tr, table tbody tr')
            for row in rows:
                tds = row.find_all('td')
                if len(tds) < 2:
                    continue
                title_tag = row.find('a')
                if not title_tag:
                    continue
                title = title_tag.get_text(strip=True)
                if not title or title.isdigit():
                    continue
                href = title_tag.get('href', '')
                if not href:
                    continue
                if href.startswith('/'):
                    href = 'https://www.rra.go.kr' + href
                date_str = tds[-2].get_text(strip=True) if len(tds) >= 3 else ''
                items.append({
                    'title': title,
                    'source': source,
                    'category': '기술기준' if '고시' in label else '기타',
                    'url': href,
                    'is_read': False,
                    'published_at': parse_date(date_str),
                })
            print(f'[RRA] {label}: {len(rows)}행 수집')
        except Exception as e:
            print(f'[RRA 오류] {label}: {e}')
    return items


# ═══════════════════════════════════════════════════════
#  크롤러 — 과기정통부 (msit.go.kr)
# ═══════════════════════════════════════════════════════

RADIO_KEYWORDS = [
    # 전파법 계열
    '전파', '주파수', 'ITU', 'IMT', '5G', '6G', '전자파',
    '무선', '적합성평가', '기자재', 'WRC', '스펙트럼',
    # 전기통신사업법 계열
    '전기통신사업', '통신사업', '망중립', '번호이동', '이용자보호',
    '단말장치', '통신서비스', '과징금',
    # 정보통신망법 계열
    '정보통신망', '정보보호', '사이버', '불법정보', '개인정보',
    # NEWS_SEARCH_KEYWORDS 통합 (와이파이·이동통신·기지국 등)
    '전파정책', '이동통신', '6GHz', '와이파이', '공공와이파이',
    '공공 와이파이', '지하철 와이파이', '기지국', 'LTE', '3G',
    '이동통신 품질', '5G 기지국', 'LTE 기지국', '기지국 장애', '이동통신 장비',
    '무선국', '5G주파수', '6G주파수',
]

def crawl_msit() -> list:
    items = []
    targets = [
        ('https://www.msit.go.kr/bbs/list.do?sCode=user&mId=129&mPid=128', '보도자료'),
        ('https://www.msit.go.kr/bbs/list.do?sCode=user&mId=99&mPid=74',   '공지사항'),
    ]
    for url, label in targets:
        try:
            res = requests.get(url, headers=HEADERS, timeout=20)
            res.raise_for_status()
            res.encoding = 'utf-8'
            soup = BeautifulSoup(res.text, 'html.parser')

            rows = soup.select('table tbody tr, ul.bbs_list li')
            for row in rows:
                title_tag = row.find('a')
                if not title_tag:
                    continue
                title = title_tag.get_text(strip=True)
                if not title:
                    continue
                if not any(kw in title for kw in RADIO_KEYWORDS):
                    continue
                href = title_tag.get('href', '')
                if href.startswith('/'):
                    href = 'https://www.msit.go.kr' + href
                date_tag = row.find(class_=re.compile(r'date|day|time'))
                date_str = date_tag.get_text(strip=True) if date_tag else ''
                items.append({
                    'title': title,
                    'source': '과기정통부',
                    'category': detect_category(title),
                    'url': href,
                    'is_read': False,
                    'published_at': parse_date(date_str),
                })
            print(f'[MSIT] {label}: 관련 {len([i for i in items if i["source"]=="과기정통부"])}건')
        except Exception as e:
            print(f'[MSIT 오류] {label}: {e}')
    return items


# ═══════════════════════════════════════════════════════
#  크롤러 — 전자신문 (etnews.com)
# ═══════════════════════════════════════════════════════

def crawl_etnews() -> list:
    items = []
    search_keywords = ['전파정책', '주파수할당', 'WRC-27', '6GHz IMT', '5G주파수']
    for kw in search_keywords:
        url = f'https://www.etnews.com/news/search.html?kwd={requests.utils.quote(kw)}'
        try:
            res = requests.get(url, headers=HEADERS, timeout=20)
            res.raise_for_status()
            res.encoding = 'utf-8'
            soup = BeautifulSoup(res.text, 'html.parser')

            articles = soup.select('ul.c_list_article li, div.news_list article')
            for article in articles:
                title_tag = article.find('a')
                if not title_tag:
                    title_tag = article.select_one('h4 a, h3 a, .title a')
                if not title_tag:
                    continue
                title = title_tag.get_text(strip=True)
                href = title_tag.get('href', '')
                if not title or not href:
                    continue
                if href.startswith('/'):
                    href = 'https://www.etnews.com' + href
                date_tag = article.find(class_=re.compile(r'date|time|day'))
                date_str = date_tag.get_text(strip=True) if date_tag else ''
                items.append({
                    'title': title,
                    'source': '전자신문',
                    'category': detect_category(title),
                    'url': href,
                    'is_read': False,
                    'published_at': parse_date(date_str),
                })
        except Exception as e:
            print(f'[전자신문 오류] {kw}: {e}')
    print(f'[전자신문] {len(items)}건 수집')
    return items


# ═══════════════════════════════════════════════════════
#  크롤러 — 방송통신위원회 (kcc.go.kr)
# ═══════════════════════════════════════════════════════

def crawl_kcc() -> list:
    items = []
    targets = [
        ('https://kcc.go.kr/user.do?mode=view&page=A05030000&dc=K05030000', '보도자료', '방송통신위원회'),
        ('https://kcc.go.kr/user.do?mode=view&page=A05010000&dc=K05010000', '공지사항', '방송통신위원회'),
    ]
    for url, label, source in targets:
        try:
            res = requests.get(url, headers=HEADERS, timeout=20)
            res.raise_for_status()
            res.encoding = 'utf-8'
            soup = BeautifulSoup(res.text, 'html.parser')
            rows = soup.select('table tbody tr, ul.bbs_list li')
            for row in rows:
                title_tag = row.find('a')
                if not title_tag:
                    continue
                title = title_tag.get_text(strip=True)
                if not title or not any(k in title for k in RADIO_KEYWORDS):
                    continue
                href = title_tag.get('href', '')
                if href.startswith('/'):
                    href = 'https://kcc.go.kr' + href
                date_tag = row.find(class_=re.compile(r'date|day|time'))
                date_str = date_tag.get_text(strip=True) if date_tag else ''
                items.append({
                    'title': title,
                    'source': source,
                    'category': detect_category(title),
                    'url': href,
                    'is_read': False,
                    'published_at': parse_date(date_str),
                })
        except Exception as e:
            print(f'[방통위 오류] {label}: {e}')
    print(f'[방통위] {len(items)}건 수집')
    return items


# ═══════════════════════════════════════════════════════
#  크롤러 — ETRI (etri.re.kr)
# ═══════════════════════════════════════════════════════

def crawl_etri() -> list:
    items = []
    targets = [
        ('https://www.etri.re.kr/kor/bbs/list.do?bbsId=1001', '보도자료', 'ETRI'),
        ('https://www.etri.re.kr/kor/bbs/list.do?bbsId=1003', '공지사항', 'ETRI'),
    ]
    for url, label, source in targets:
        try:
            res = requests.get(url, headers=HEADERS, timeout=20)
            res.raise_for_status()
            res.encoding = 'utf-8'
            soup = BeautifulSoup(res.text, 'html.parser')
            rows = soup.select('table tbody tr')
            for row in rows:
                title_tag = row.find('a')
                if not title_tag:
                    continue
                title = title_tag.get_text(strip=True)
                if not title or not any(k in title for k in RADIO_KEYWORDS + ['6G', '5G', 'IMT', 'AI', '표준', '연구']):
                    continue
                href = title_tag.get('href', '')
                if href.startswith('/'):
                    href = 'https://www.etri.re.kr' + href
                date_tag = row.find(class_=re.compile(r'date|day|time'))
                date_str = date_tag.get_text(strip=True) if date_tag else ''
                items.append({
                    'title': title,
                    'source': source,
                    'category': detect_category(title),
                    'url': href,
                    'is_read': False,
                    'published_at': parse_date(date_str),
                })
        except Exception as e:
            print(f'[ETRI 오류] {label}: {e}')
    print(f'[ETRI] {len(items)}건 수집')
    return items


# ═══════════════════════════════════════════════════════
#  크롤러 — KISDI (kisdi.re.kr)
# ═══════════════════════════════════════════════════════

def crawl_kisdi() -> list:
    items = []
    targets = [
        ('https://www.kisdi.re.kr/bbs/list.do?bbsId=BBSMSTR_000000000017', '연구보고서', 'KISDI'),
        ('https://www.kisdi.re.kr/bbs/list.do?bbsId=BBSMSTR_000000000018', '정책자료', 'KISDI'),
    ]
    for url, label, source in targets:
        try:
            res = requests.get(url, headers=HEADERS, timeout=20)
            res.raise_for_status()
            res.encoding = 'utf-8'
            soup = BeautifulSoup(res.text, 'html.parser')
            rows = soup.select('table tbody tr, ul.bbs_list li')
            for row in rows:
                title_tag = row.find('a')
                if not title_tag:
                    continue
                title = title_tag.get_text(strip=True)
                if not title or not any(k in title for k in RADIO_KEYWORDS + ['6G', '5G', 'IMT', '방송', '통신', '인터넷']):
                    continue
                href = title_tag.get('href', '')
                if href.startswith('/'):
                    href = 'https://www.kisdi.re.kr' + href
                date_tag = row.find(class_=re.compile(r'date|day|time'))
                date_str = date_tag.get_text(strip=True) if date_tag else ''
                items.append({
                    'title': title,
                    'source': source,
                    'category': detect_category(title),
                    'url': href,
                    'is_read': False,
                    'published_at': parse_date(date_str),
                })
        except Exception as e:
            print(f'[KISDI 오류] {label}: {e}')
    print(f'[KISDI] {len(items)}건 수집')
    return items


# ═══════════════════════════════════════════════════════
#  크롤러 — 범용 키워드 검색 (IT전문지·경제지·종합일간지)
# ═══════════════════════════════════════════════════════

NEWS_SEARCH_KEYWORDS = ['전파정책', '주파수', '5G주파수', '5G 주파수', '6G주파수', '6G 주파수', '전자파', '무선국', '이동통신', 'WRC', '6GHz', '공공와이파이', '공공 와이파이', '지하철 와이파이', '기지국', 'LTE', '3G', '이동통신 품질', '5G 기지국', 'LTE 기지국', '기지국 장애', '이동통신 장비']

# 언론사별 검색 설정 ─ (source, search_url, article_sel, date_sel, base_url)
NEWS_SITE_CONFIGS = [
    # ── IT·통신 전문지 ─────────────────────────────────
    {
        'source': '디지털타임스',
        'search_url': 'https://www.dt.co.kr/search.php?q={kw}',
        'article_sel': ['div.article_title a', 'h4.tit a', 'ul.article_list li a'],
        'date_sel':    ['span.date', 'em.date', 'span.regdate'],
        'base_url':    'https://www.dt.co.kr',
    },
    {
        'source': '디지털데일리',
        'search_url': 'https://www.ddaily.co.kr/search?keyword={kw}',
        'article_sel': ['ul.article_list li a', 'div.article_title a', 'h4.tit a'],
        'date_sel':    ['span.date', 'em.date', 'span.regdate'],
        'base_url':    'https://www.ddaily.co.kr',
    },
    {
        'source': 'ZDNet Korea',
        'search_url': 'https://zdnet.co.kr/news/?t=&q={kw}&l=&c=',
        'article_sel': ['article h4 a', 'div.article_title a', 'ul.news_list li a'],
        'date_sel':    ['span.date', 'em.date', 'time'],
        'base_url':    'https://zdnet.co.kr',
    },
    {
        'source': '아이뉴스24',
        'search_url': 'https://search.inews24.com/search/news?q={kw}',
        'article_sel': ['div.result_news ul li a.tit', 'ul.article_list li a', 'div.news_list a'],
        'date_sel':    ['span.date', 'span.regdate', 'em.date'],
        'base_url':    'https://www.inews24.com',
    },
    {
        'source': '블로터',
        'search_url': 'https://www.bloter.net/?s={kw}',
        'article_sel': ['h2.entry-title a', 'h3.entry-title a', 'article a.entry-title'],
        'date_sel':    ['time.entry-date', 'span.date', 'span.post-date'],
        'base_url':    'https://www.bloter.net',
    },
    {
        'source': '정보통신신문',
        'search_url': 'https://www.koit.co.kr/news/articleList.html?sc_word={kw}',
        'article_sel': ['ul.type2 li a', 'div.list-titles a', 'h4.titles a'],
        'date_sel':    ['em.info', 'span.date', 'em.date'],
        'base_url':    'https://www.koit.co.kr',
    },
    # ── 경제지 ────────────────────────────────────────
    {
        'source': '매일경제',
        'search_url': 'https://search.mk.co.kr/search.php?q={kw}',
        'article_sel': ['ul.search_news_list li a', 'div.con_tit a', 'h3.news_tit a'],
        'date_sel':    ['span.date', 'em.date', 'span.lasttime'],
        'base_url':    'https://www.mk.co.kr',
    },
    {
        'source': '머니투데이',
        'search_url': 'https://search.mt.co.kr/mtSearchMain.php?q={kw}',
        'article_sel': ['ul.newslist01 li dt a', 'div.news_list li a', 'a.news_tit'],
        'date_sel':    ['span.date', 'em.date', 'li.date'],
        'base_url':    'https://news.mt.co.kr',
    },
    {
        'source': '한국경제',
        'search_url': 'https://search.hankyung.com/search/news?query={kw}',
        'article_sel': ['ul.article__list li a', 'div.article_title a', 'h3.tit a',
                        'div.news-list a', 'li.news-item a', 'a.news-tit'],
        'date_sel':    ['span.date', 'em.date', 'span.txt-date', 'span.txt_date',
                        'span.article-date', 'p.date', 'div.date', 'span.info',
                        'span.byline', 'p.byline', 'span.writer'],
        'base_url':    'https://www.hankyung.com',
    },
    {
        'source': '서울경제',
        'search_url': 'https://www.sedaily.com/Search/News?Keyword={kw}',
        'article_sel': ['ul.article_list li a', 'div.article_title a', 'h3.tit a'],
        'date_sel':    ['span.date', 'em.date', 'span.txt_date'],
        'base_url':    'https://www.sedaily.com',
    },
    # ── 종합일간지·통신 ──────────────────────────────
    {
        'source': '연합뉴스',
        'search_url': 'https://www.yna.co.kr/search/index?query={kw}&lang=KOR',
        'article_sel': ['div.cts-title a', 'ul.list01 li a.tit', 'div.result-basic a.tit'],
        'date_sel':    ['p.cts-date', 'span.date', 'span.cts-date'],
        'base_url':    'https://www.yna.co.kr',
    },
    {
        'source': '뉴시스',
        'search_url': 'https://www.newsis.com/search/?q={kw}',
        'article_sel': ['ul.list_news li a', 'div.tit_news a', 'a.txt_tit'],
        'date_sel':    ['span.date', 'em.date', 'li.date'],
        'base_url':    'https://www.newsis.com',
    },
    {
        'source': '조선일보',
        'search_url': 'https://www.chosun.com/search/?query={kw}',
        'article_sel': ['a.story-card__headline', 'div.news_tit a', 'h3.tit a'],
        'date_sel':    ['time', 'span.date', 'em.date'],
        'base_url':    'https://www.chosun.com',
    },
    {
        'source': '중앙일보',
        'search_url': 'https://www.joongang.co.kr/search/news?keyword={kw}',
        'article_sel': ['a.card-title', 'h2.headline a', 'div.article_title a'],
        'date_sel':    ['time', 'span.date', 'em.date'],
        'base_url':    'https://www.joongang.co.kr',
    },
    {
        'source': '동아일보',
        'search_url': 'https://www.donga.com/news/search?query={kw}',
        'article_sel': ['div.tit a', 'h3.tit a', 'ul.news_list li a'],
        'date_sel':    ['span.date', 'em.date', 'span.txt_date'],
        'base_url':    'https://www.donga.com',
    },
    {
        'source': '한겨레',
        'search_url': 'https://www.hani.co.kr/arti/SEARCH/search.html?query={kw}',
        'article_sel': ['div.article-title a', 'ul.search_list li a', 'h4.title a'],
        'date_sel':    ['span.date', 'em.date', 'time'],
        'base_url':    'https://www.hani.co.kr',
    },
    {
        'source': '경향신문',
        'search_url': 'https://www.khan.co.kr/search?query={kw}',
        'article_sel': ['a.news_title', 'div.tit a', 'h3.tit a'],
        'date_sel':    ['span.date', 'em.date', 'span.txt_date'],
        'base_url':    'https://www.khan.co.kr',
    },
]


def crawl_news_site(cfg: dict) -> list:
    """키워드 검색 기반 범용 뉴스 크롤러"""
    items = []
    source = cfg['source']
    seen_urls: set = set()
    for kw in NEWS_SEARCH_KEYWORDS:  # 키워드 전체
        url = cfg['search_url'].format(kw=requests.utils.quote(kw))
        try:
            res = requests.get(url, headers=HEADERS, timeout=15)
            res.raise_for_status()
            soup = BeautifulSoup(res.text, 'html.parser')

            # 기사 링크 탐색 (복수 셀렉터 시도)
            links = []
            for sel in cfg['article_sel']:
                links = soup.select(sel)
                if links:
                    break
            if not links:
                # fallback: 모든 <a>에서 전파 키워드 포함 제목 탐색
                links = [a for a in soup.find_all('a', href=True)
                         if any(k in a.get_text() for k in ['전파', '주파수', '5G', '6G', '이동통신', '무선'])]

            for link in links:  # 백필: 제한 없음
                title = link.get_text(strip=True)
                if not title or len(title) < 8:
                    continue
                if not any(k in title for k in RADIO_KEYWORDS):
                    continue
                href = link.get('href', '')
                if not href:
                    continue
                if href.startswith('/'):
                    href = cfg['base_url'] + href
                if not href.startswith('http'):
                    continue
                if href in seen_urls:
                    continue
                seen_urls.add(href)

                # 날짜 추출 (부모 컨테이너에서 탐색)
                date_str = ''
                parent = link.parent
                for _ in range(4):  # 최대 4단계 부모까지
                    if parent is None:
                        break
                    for dsel in cfg['date_sel']:
                        dtag = parent.select_one(dsel)
                        if dtag:
                            date_str = dtag.get_text(strip=True)
                            break
                    if date_str:
                        break
                    parent = parent.parent

                items.append({
                    'title': title,
                    'source': source,
                    'category': detect_category(title),
                    'url': href,
                    'is_read': False,
                    'published_at': parse_date(date_str),
                })
        except Exception as e:
            print(f'[{source} 오류] {kw}: {e}')
        time.sleep(0.5)
    print(f'[{source}] {len(items)}건 수집')
    return items


# ═══════════════════════════════════════════════════════
#  기사 본문 수집
# ═══════════════════════════════════════════════════════

def fetch_article_body(url: str, source: str) -> tuple:
    """기사 URL에서 본문 텍스트와 발행일 추출. 반환: (body: str, published_at: str)"""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')

        # ── 발행일 추출 (meta 태그 우선) ───────────────────
        pub_date = ''

        # 1순위: Open Graph / schema.org meta 태그
        for attr_name, attr_val in [
            ('property', 'article:published_time'),
            ('property', 'og:article:published_time'),
            ('itemprop', 'datePublished'),
            ('name', 'article:published_time'),
            ('name', 'publishdate'),
            ('name', 'date'),
        ]:
            tag = soup.find('meta', attrs={attr_name: attr_val})
            if tag and tag.get('content'):
                parsed = parse_date(tag['content'])
                if parsed:
                    pub_date = parsed
                    break

        # 2순위: <time datetime="..."> 태그
        if not pub_date:
            for time_tag in soup.find_all('time', datetime=True):
                parsed = parse_date(time_tag['datetime'])
                if parsed:
                    pub_date = parsed
                    break

        # ── 본문 추출 ───────────────────────────────────────
        selectors_map = {
            '전자신문':    ['div.article_body', 'div#articleBody', 'div.news_view', 'div#articleView'],
            '연합뉴스':    ['div.article-txt', 'article.story-news', 'div#articleWrap'],
            '디지털타임스': ['div#article_txt', 'div.article_content', 'div#articleBody'],
            'ZDNet Korea': ['div#article_body', 'div.article_view', 'div#articleContent',
                            'div.article_content', 'div.view_txt', 'div#article-view-content-div'],
            '아이뉴스24':  ['div#news_body_area', 'div.article_txt', 'div#articleBody'],
            '매일경제':    ['div#article_body', 'div.art_txt', 'div#newsDetailBody',
                            'div.article_wrap', 'div#article-body'],
            '머니투데이':  ['div#textBody', 'div.news_text', 'div#content_text'],
            '디지털데일리': ['div#articleBody', 'div.article_txt'],
            '지디넷코리아': ['div#article_content', 'div.article_view'],
            '블로터':      ['div.article_content'],
            '한국경제':    ['div#articalbody', 'div.article-body', 'div#articleBody',
                            'div.article_body', 'div#newsView', 'div.news-contents'],
            '파이낸셜뉴스': ['div#article_content', 'div.article_view', 'div#articleBody'],
            '뉴스1':       ['div.article-body', 'div#articleBody', 'div.news_body_area'],
            '정보통신신문': ['div#article_body', 'div.article-content', 'div.view_cont'],
            'Telecom Reseller': ['div.entry-content', 'article', 'div.post-content'],
        }
        candidates = selectors_map.get(source, []) + [
            'article', 'div.article', 'div.news-content',
            'div.view_cont', 'div.view-content', 'div#content',
            'div.article-body', 'div.news_body', 'div.article_txt'
        ]
        body = ''
        for sel in candidates:
            tag = soup.select_one(sel)
            if tag:
                text = tag.get_text(separator=' ', strip=True)
                if len(text) > 100:
                    body = text[:1500]
                    break
        return body, pub_date
    except Exception as e:
        print(f'  [본문 수집 실패] {url}: {e}')
        return '', ''


# ═══════════════════════════════════════════════════════
#  Supabase 저장
# ═══════════════════════════════════════════════════════

def save_new_items(items: list, existing_urls: set) -> list:
    """백필용: 10일(240시간) 이내 & 날짜 확인된 신규 기사만 저장"""
    now_kst = datetime.now(KST)
    cutoff_72h = now_kst - timedelta(hours=240)  # 백필: 10일 기준
    seen_urls = set(existing_urls)
    unique_new = []
    for item in items:
        url = item.get('url', '')
        if url and url not in seen_urls:
            seen_urls.add(url)
            # # 으로 시작하는 제목(태그/토픽 페이지) 제외
            if item.get('title', '').startswith('#'):
                continue
            unique_new.append(item)

    if not unique_new:
        print('[저장] 신규 항목 없음')
        return []

    # ① 본문 수집 및 발행일 확정
    print(f'[본문 수집] {len(unique_new)}건 시작...')
    for item in unique_new:
        if item.get('url'):
            body, article_date = fetch_article_body(item['url'], item.get('source', ''))
            item['content'] = body if body else None
            item['content_fetched_at'] = now_kst.isoformat()
            current_pub = item.get('published_at', '')
            if not current_pub and article_date:
                item['published_at'] = article_date
                print(f'  [날짜보정] {item.get("title","")[:30]}... → {article_date}')
            elif not current_pub:
                item['published_at'] = ''  # 날짜 불명
            time.sleep(1)

    # ② 72시간 초과 또는 발행일 불명 제외 (규칙1)
    valid, skipped_unknown, skipped_old = [], 0, 0
    for item in unique_new:
        pub = item.get('published_at', '')
        if not pub:
            skipped_unknown += 1
            continue
        try:
            from dateutil import parser as _dtp
            pub_dt = _dtp.parse(pub)
            if pub_dt.tzinfo is None:
                pub_dt = pub_dt.replace(tzinfo=KST)
            if pub_dt < cutoff_72h:
                skipped_old += 1
                continue
        except Exception:
            skipped_unknown += 1
            continue
        valid.append(item)

    if skipped_unknown:
        print(f'[필터] {skipped_unknown}건 발행일 불명 — 제외')
    if skipped_old:
        print(f'[필터] {skipped_old}건 10일(240시간) 초과 — 제외')
    if not valid:
        print('[저장] 유효한 신규 항목 없음')
        return []

    # ③ 긴급도 분류
    for item in valid:
        val = classify_urgency(item.get('title', ''), item.get('content', '') or '')
        item['urgency'] = val
        item['importance'] = val

    sb.table('news_feed').insert(valid).execute()
    urgent_count = sum(1 for i in valid if i.get('urgency') == '긴급')
    print(f'[저장] {len(valid)}건 저장 완료 (긴급 {urgent_count}건)')
    return valid


# ═══════════════════════════════════════════════════════
#  기술 용어 추출 — Claude API (매일 08:00)
# ═══════════════════════════════════════════════════════

_TERM_SYSTEM = """당신은 이동통신·전파 분야 기술 용어 추출 전문가입니다.
아래 뉴스 목록에서 신규 전문 기술 용어를 추출하여 JSON 배열로만 반환하세요.

추출 기준 (반드시 준수):
✅ 포함: 국제 표준 번호(IEEE 802.11be), 프로토콜명(NR-U), 기술 약어(NTN, HAPS, RIS), 주파수 대역명(FR3, sub-THz)
❌ 제외: 기술 약어 뒤에 시장/동향/경쟁/산업/전략/분야/서비스/플랫폼이 붙은 복합어
❌ 제외: 요금제·상품명(5G-LTE 통합요금제, AI 토큰요금제 등)
❌ 제외: 정책·제도·전략명(최적요금제 고지 제도, 하이퍼 AI네트워크 전략 등)
❌ 제외: 흔한 용어(5G, LTE, Wi-Fi, AI, IoT 등)
❌ 제외: 이미 알려진 기술의 동의어·변형(Wi-Fi 7 있으면 와이파이7 제외)

출력 형식 (JSON 배열, 다른 말 없이):
[{"term":"용어","term_en":"English Name","category":"주파수|네트워크|위성|단말|규제|기타","definition":"50자 이내 정의","source":"출처 언론사"}]
신규 용어가 없으면 빈 배열 [] 반환."""


def extract_tech_terms(items: list) -> list:
    """뉴스 기사 목록에서 신규 기술 용어 추출 후 tech_terms 테이블에 저장."""
    if not ANTHROPIC_API_KEY or not items:
        return []

    # 기존 용어 목록 조회 (중복 방지)
    try:
        existing = sb.table('tech_terms').select('term').execute()
        existing_terms = {r['term'].lower() for r in (existing.data or [])}
    except Exception as e:
        print(f'[용어] 기존 목록 조회 실패: {e}')
        existing_terms = set()

    # 기사 목록 텍스트 구성 (제목 + 출처)
    news_text = '\n'.join(
        f"- {it.get('title','')} ({it.get('source','')})"
        for it in items[:60]
    )
    existing_text = ', '.join(sorted(existing_terms)[:80]) if existing_terms else '없음'
    user_msg = f"이미 등록된 용어(제외 대상):\n{existing_text}\n\n뉴스 목록:\n{news_text}"

    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        resp = client.messages.create(
            model='claude-haiku-4-5',
            max_tokens=1000,
            system=_TERM_SYSTEM,
            messages=[{'role': 'user', 'content': user_msg}],
        )
        raw = resp.content[0].text.strip()
        import json
        # JSON 배열 추출
        start = raw.find('[')
        end = raw.rfind(']') + 1
        if start == -1 or end == 0:
            return []
        terms = json.loads(raw[start:end])
        if not terms:
            print('[용어] 신규 용어 없음')
            return []

        # 중복 제거 후 저장
        new_terms = [
            t for t in terms
            if isinstance(t, dict) and t.get('term')
            and t['term'].lower() not in existing_terms
        ]
        if new_terms:
            rows = [{
                'term': t.get('term', ''),
                'term_en': t.get('term_en', ''),
                'category': t.get('category', '기타'),
                'definition': t.get('definition', '')[:100],
                'source': t.get('source', '자동 추출'),
                'is_reviewed': False,
            } for t in new_terms]
            sb.table('tech_terms').insert(rows).execute()
            print(f'[용어] 신규 {len(new_terms)}건 저장: {[t["term"] for t in new_terms]}')
        return new_terms
    except Exception as e:
        print(f'[용어 추출 오류] {e}')
        return []


# ═══════════════════════════════════════════════════════
#  브리핑 생성 — Claude API + Supabase 저장 (매일 08:00)
# ═══════════════════════════════════════════════════════

_BRIEFING_SYSTEM = """당신은 SK텔레콤 CR센터 기술정책팀의 전파정책 모닝 브리핑 작성 AI입니다.
제공된 뉴스 목록과 신규 기술 용어를 바탕으로 간결하고 실용적인 브리핑을 작성하세요.

작성 규칙:
- [주요 뉴스]는 제공된 기사에서만 선별 (최대 8건, 긴급·중요 기사 우선)
- [주목 포인트]는 SKT CR센터 정책·기술 관점에서 핵심 이슈 1~3개 도출
- 뉴스 외부 배경 지식이나 추측 포함 금지
- 각 뉴스에 한 줄 요약 포함

출력 형식 (아래 형식 그대로):
📡 전파정책 모닝 브리핑 — {날짜}

[주요 뉴스]
• 제목 — 출처
  → 한 줄 요약
  🔗 URL

[주목 포인트]
• 핵심 이슈 1
• 핵심 이슈 2

[새로 추가된 기술 용어]
• 용어: 정의

[저장 결과]
뉴스 N건 / 기술 용어 N건"""


def generate_daily_briefing(items: list, new_terms: list) -> str:
    """Claude API로 브리핑 텍스트 생성 후 daily_briefings 테이블에 저장."""
    if not items:
        return ''

    today_str = datetime.now(KST).strftime('%Y년 %m월 %d일')

    # 기사 목록 구성
    news_lines = []
    for it in items[:50]:
        urgency_icon = {'긴급': '🔴', '보통': '🟡', '참고': '🟢'}.get(it.get('urgency', '참고'), '🟢')
        news_lines.append(
            f"{urgency_icon} {it.get('title','')} — {it.get('source','')}\n"
            f"   URL: {it.get('url','')}\n"
            f"   발행: {str(it.get('published_at',''))[:10]}"
        )

    # 신규 용어 목록
    term_lines = '\n'.join(
        f"- {t.get('term','')}: {t.get('definition','')}"
        for t in new_terms
    ) if new_terms else '신규 용어 없음'

    user_msg = (
        f"날짜: {today_str}\n\n"
        f"[브리핑 대상 뉴스 {len(items)}건]\n"
        + '\n'.join(news_lines)
        + f"\n\n[오늘 신규 추출된 기술 용어]\n{term_lines}"
    )

    briefing_text = ''
    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        resp = client.messages.create(
            model='claude-haiku-4-5',
            max_tokens=2000,
            system=_BRIEFING_SYSTEM,
            messages=[{'role': 'user', 'content': user_msg}],
        )
        briefing_text = resp.content[0].text.strip()
        print(f'[브리핑] 텍스트 생성 완료 ({len(briefing_text)}자)')
    except Exception as e:
        print(f'[브리핑 생성 오류] {e}')
        return ''

    # daily_briefings 저장 (날짜 충돌 시 덮어쓰기)
    try:
        today_date = datetime.now(KST).strftime('%Y-%m-%d')
        sb.table('daily_briefings').upsert({
            'briefing_date': today_date,
            'content': briefing_text,
            'news_count': len(items),
            'terms_count': len(new_terms),
        }, on_conflict='briefing_date').execute()
        print(f'[브리핑] daily_briefings 저장 완료 (뉴스 {len(items)}건, 용어 {len(new_terms)}건)')
    except Exception as e:
        print(f'[브리핑 DB 저장 오류] {e}')

    return briefing_text


# ═══════════════════════════════════════════════════════
#  텔레그램 알림 (긴급 기사 전용)
# ═══════════════════════════════════════════════════════

def send_morning_telegram(items: list, briefing_text: str = ''):
    """아침 8시 일일 브리핑 Telegram 발송 — briefing_text 있으면 AI 브리핑 전송"""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print('[텔레그램 모닝] 환경변수 미설정 — 건너뜀')
        return
    if not items and not briefing_text:
        print('[텔레그램 모닝] 신규 기사 없음 — 건너뜀')
        return

    # AI 브리핑 텍스트가 있으면 그대로 발송 (4096자 텔레그램 제한 고려)
    if briefing_text:
        text = briefing_text[:4000]
        if len(briefing_text) > 4000:
            text += '\n\n...(전문은 대시보드 참조)'
        text += '\n\n📊 https://youjinwoong.github.io/radio-policy-ai/'
    else:
        # 폴백: 원시 목록 발송
        now_str = datetime.now(KST).strftime('%Y.%m.%d')
        urgent = [i for i in items if i.get('urgency') == '긴급']
        normal = [i for i in items if i.get('urgency') == '보통']
        ref    = [i for i in items if i.get('urgency') == '참고']
        lines = [f'☀️ *[전파정책 AI] {now_str} 아침 브리핑* — {len(items)}건\n']
        for label, icon, group in [('긴급', '🔴', urgent), ('보통', '🟡', normal), ('참고', '🟢', ref)]:
            if group:
                lines.append(f'{icon} *{label} {len(group)}건*')
                for item in group[:5]:
                    lines.append(f'  · {item.get("title", "")} ({item.get("source", "")})')
                lines.append('')
        lines.append('📊 https://youjinwoong.github.io/radio-policy-ai/')
        text = '\n'.join(lines)

    api_url = f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage'
    try:
        resp = requests.post(api_url, json={
            'chat_id': TELEGRAM_CHAT_ID,
            'text': text,
            'parse_mode': 'Markdown',
            'disable_web_page_preview': True,
        }, timeout=15)
        if resp.status_code == 200:
            print(f'[텔레그램 모닝] {len(items)}건 발송 완료')
        else:
            print(f'[텔레그램 모닝 오류] HTTP {resp.status_code}: {resp.text[:200]}')
    except Exception as e:
        print(f'[텔레그램 모닝 오류] {e}')


def send_telegram(urgent_items: list):
    """긴급 기사를 Telegram Bot으로 즉시 알림"""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print('[텔레그램] 환경변수 미설정 (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID) — 건너뜀')
        return
    if not urgent_items:
        return

    now_str = datetime.now(KST).strftime('%Y.%m.%d %H:%M KST')
    lines = [f'🚨 *[전파정책 AI] 긴급 기사 {len(urgent_items)}건* — {now_str}\n']
    for i, item in enumerate(urgent_items, 1):
        title = item.get('title', '')
        source = item.get('source', '')
        url = item.get('url', '')
        lines.append(f'*{i}. {title}*')
        lines.append(f'   출처: {source}')
        lines.append(f'   🔗 {url}\n')

    lines.append('📊 대시보드: https://youjinwoong.github.io/radio-policy-ai/')
    text = '\n'.join(lines)

    api_url = f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage'
    try:
        resp = requests.post(api_url, json={
            'chat_id': TELEGRAM_CHAT_ID,
            'text': text,
            'parse_mode': 'Markdown',
            'disable_web_page_preview': True,
        }, timeout=15)
        if resp.status_code == 200:
            print(f'[텔레그램] 긴급 {len(urgent_items)}건 발송 완료')
        else:
            print(f'[텔레그램 오류] HTTP {resp.status_code}: {resp.text[:200]}')
    except Exception as e:
        print(f'[텔레그램 오류] {e}')


# ═══════════════════════════════════════════════════════
#  긴급 전용 이메일 알림
# ═══════════════════════════════════════════════════════

def send_urgent_email(urgent_items: list):
    """긴급 기사 발생 시 즉시 이메일 발송 (정기 메일과 별개)"""
    if not all([EMAIL_FROM, EMAIL_PASS, EMAIL_TO]):
        print('[긴급 이메일] 환경변수 미설정 — 건너뜀')
        return
    if not urgent_items:
        return

    now_str = datetime.now(KST).strftime('%Y.%m.%d %H:%M KST')
    subject = f'🚨 [전파정책 AI 긴급] {now_str} — 즉시 대응 기사 {len(urgent_items)}건'

    rows_html = ''
    for item in urgent_items:
        rows_html += f'''
  <li style="margin-bottom:14px;padding:10px;background:#fff5f5;border-left:4px solid #e53e3e;border-radius:4px">
    <a href="{item['url']}" style="color:#c53030;font-weight:700;font-size:14px">{item['title']}</a><br>
    <small style="color:#666">{item['source']}</small>
  </li>'''

    body_html = f'''
<html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
<h2 style="color:#c53030">🚨 전파정책 AI — 긴급 대응 알림</h2>
<p style="color:#666">{now_str} | 즉시 대응이 필요한 기사 <strong>{len(urgent_items)}건</strong>이 감지되었습니다.</p>
<hr style="border-color:#fed7d7">
<ul style="padding-left:20px;list-style:none">
{rows_html}
</ul>
<hr>
<p style="color:#999;font-size:12px">
이 메일은 긴급 기사 감지 시 자동 발송됩니다. SKT CR센터 기술정책팀<br>
대시보드: <a href="https://youjinwoong.github.io/radio-policy-ai/">https://youjinwoong.github.io/radio-policy-ai/</a>
</p>
</body></html>'''

    # 기본 수신자 + 추가 고정 수신자 합산
    extra_to = 'lampman@sktelecom.com'
    all_to = list({addr.strip() for addr in (EMAIL_TO + ',' + extra_to).split(',') if addr.strip()})

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From']    = f'전파정책 AI <{EMAIL_FROM}>'
    msg['To']      = ', '.join(all_to)
    msg.attach(MIMEText(body_html, 'html', 'utf-8'))

    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=30) as smtp:
            smtp.login(EMAIL_FROM, EMAIL_PASS)
            smtp.sendmail(EMAIL_FROM, all_to, msg.as_string())
        print(f'[긴급 이메일] {", ".join(all_to)}로 발송 완료')
    except Exception as e:
        print(f'[긴급 이메일 오류] {e}')


# ═══════════════════════════════════════════════════════
#  이메일 발송
# ═══════════════════════════════════════════════════════

def send_email(new_items: list, briefing_text: str = ''):
    if not all([EMAIL_FROM, EMAIL_PASS, EMAIL_TO]):
        print('[이메일] 환경변수 미설정 — 건너뜀')
        return

    today = datetime.now(KST).strftime('%Y.%m.%d')

    if not new_items:
        subject = f'[전파정책 AI] {today} — 신규 고시·뉴스 없음'
        body_html = f'''
<html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
<h2 style="color:#534AB7">전파정책 전문가 AI — 모닝 브리핑</h2>
<p style="color:#666">{today} | 오늘은 새로운 항목이 없습니다.</p>
<hr>
<p style="color:#999;font-size:12px">
대시보드: <a href="https://youjinwoong.github.io/radio-policy-ai/">바로가기</a>
</p>
</body></html>'''
    elif briefing_text:
        # AI 브리핑 텍스트를 HTML로 변환하여 발송
        subject = f'☀️ [전파정책 AI] {today} 모닝 브리핑 — {len(new_items)}건'
        import html as html_lib

        def text_to_html(text: str) -> str:
            """규칙3: 브리핑 HTML 변환. 🔴 긴급 항목은 빨간 네모 박스."""
            lines = text.split('\n')
            html_lines = []
            in_box = False
            for line in lines:
                escaped = html_lib.escape(line)
                is_urgent = '🔴' in line
                # 긴급 박스 닫기 조건
                if in_box and not is_urgent and (escaped.startswith('[') or escaped.startswith('📡') or escaped == ''):
                    html_lines.append('</div>')
                    in_box = False
                # 긴급 항목 → 박스 열기
                if is_urgent:
                    if not in_box:
                        html_lines.append('<div style="border:2px solid #c53030;border-radius:6px;background:#fff5f5;padding:10px 14px;margin:10px 0;">')
                        in_box = True
                    html_lines.append(f'<p style="margin:3px 0">{escaped}</p>')
                elif escaped.startswith('📡'):
                    html_lines.append(f'<h2 style="color:#534AB7;margin-bottom:4px">{escaped}</h2>')
                elif escaped.startswith('[') and escaped.endswith(']'):
                    html_lines.append(f'<h3 style="color:#1a1a1a;margin:20px 0 6px;border-bottom:1px solid #eee;padding-bottom:4px">{escaped}</h3>')
                elif escaped.startswith('•') or escaped.startswith('·') or '🟡' in line or '🟢' in line:
                    html_lines.append(f'<p style="margin:4px 0 4px 12px">{escaped}</p>')
                elif escaped.startswith('  →'):
                    html_lines.append(f'<p style="margin:2px 0 2px 24px;color:#555;font-size:13px">{escaped}</p>')
                elif escaped.startswith('  🔗'):
                    url_part = line.strip()[2:].strip()
                    html_lines.append(f'<p style="margin:2px 0 8px 24px;font-size:12px"><a href="{url_part}" style="color:#534AB7">{url_part}</a></p>')
                elif escaped == '':
                    html_lines.append('<br>')
                else:
                    html_lines.append(f'<p style="margin:4px 0">{escaped}</p>')
            if in_box:
                html_lines.append('</div>')
            return '\n'.join(html_lines)

        briefing_html = text_to_html(briefing_text)
        body_html = f'''
<html><body style="font-family:sans-serif;max-width:640px;margin:auto;padding:20px">
{briefing_html}
<hr style="margin-top:24px">
<p style="color:#999;font-size:11px">
이 메일은 자동 발송됩니다. SKT CR센터 기술정책팀<br>
대시보드: <a href="https://youjinwoong.github.io/radio-policy-ai/">https://youjinwoong.github.io/radio-policy-ai/</a>
</p>
</body></html>'''
    else:
        subject = f'[전파정책 AI] {today} 신규 {len(new_items)}건 — 확인 필요'

        by_cat: dict = {}
        for item in new_items:
            cat = item.get('category', '기타')
            by_cat.setdefault(cat, []).append(item)

        cat_icons = {
            '주파수': '📶', '전자파': '⚡', '기술기준': '📋',
            'ITU·WRC': '🌐', '전기통신사업': '📡', '정보통신망': '🔒', '기타': '📌'
        }

        rows_html = ''
        for cat, cat_items in by_cat.items():
            icon = cat_icons.get(cat, '📌')
            rows_html += f'''
<h3 style="color:#1a1a1a;margin:20px 0 8px">{icon} {cat} ({len(cat_items)}건)</h3>
<ul style="padding-left:20px">'''
            for item in cat_items:
                rows_html += f'''
  <li style="margin-bottom:10px">
    <a href="{item['url']}" style="color:#534AB7;font-weight:500">{item['title']}</a><br>
    <small style="color:#999">{item['source']}</small>
  </li>'''
            rows_html += '</ul>'

        body_html = f'''
<html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
<h2 style="color:#534AB7">전파정책 전문가 AI — 일일 모니터링 리포트</h2>
<p style="color:#666">{today} | 신규 항목 <strong>{len(new_items)}건</strong></p>
<hr>
{rows_html}
<hr>
<p style="color:#999;font-size:12px">
이 메일은 자동 발송됩니다. 문의: SKT CR센터 기술정책팀<br>
대시보드: <a href="https://youjinwoong.github.io/radio-policy-ai/">https://youjinwoong.github.io/radio-policy-ai/</a>
</p>
</body></html>'''

    # 기본 수신자 + 추가 고정 수신자 합산
    extra_to = 'lampman@sktelecom.com'
    all_to = list({addr.strip() for addr in (EMAIL_TO + ',' + extra_to).split(',') if addr.strip()})

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From']    = f'전파정책 AI <{EMAIL_FROM}>'
    msg['To']      = ', '.join(all_to)
    msg.attach(MIMEText(body_html, 'html', 'utf-8'))

    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=30) as smtp:
            smtp.login(EMAIL_FROM, EMAIL_PASS)
            smtp.sendmail(EMAIL_FROM, all_to, msg.as_string())
        print(f'[이메일] {", ".join(all_to)}로 발송 완료')
    except Exception as e:
        print(f'[이메일 오류] {e}')


# ═══════════════════════════════════════════════════════
#  메인
# ═══════════════════════════════════════════════════════

def main():
    now_str = datetime.now(KST).strftime('%Y-%m-%d %H:%M KST')
    print(f'{"="*50}')
    print(f'[시작] {now_str}')
    print(f'{"="*50}')

    existing_urls = get_existing_urls()
    print(f'[기존] Supabase 저장 항목 {len(existing_urls)}건')

    all_items: list = []
    all_items += crawl_rra()
    all_items += crawl_msit()
    all_items += crawl_kcc()
    all_items += crawl_etri()
    all_items += crawl_kisdi()
    all_items += crawl_etnews()
    for cfg in NEWS_SITE_CONFIGS:
        all_items += crawl_news_site(cfg)
    print(f'[수집] 총 {len(all_items)}건')

    new_items = save_new_items(all_items, existing_urls)
    print(f'[신규] {len(new_items)}건')

    # 긴급 기사 알림 (텔레그램 + 이메일 즉시 발송)
    # 발행일이 24시간 이내인 기사만 알림 대상으로 제한
    now_kst = datetime.now(KST)
    cutoff_24h = now_kst - timedelta(hours=24)

    def is_within_24h(item):
        """규칙2: 발행일이 24시간 이내인 기사만 긴급 알림"""
        pub = item.get('published_at', '')
        if not pub:
            return False  # 날짜 불명 → 알림 제외
        try:
            from dateutil import parser as _dtp2
            pub_dt = _dtp2.parse(pub)
            if pub_dt.tzinfo is None:
                pub_dt = pub_dt.replace(tzinfo=KST)
            return pub_dt >= cutoff_24h
        except Exception:
            return False

    urgent_items = [i for i in new_items if i.get('urgency') == '긴급' and is_within_24h(i)]
    skipped = [i for i in new_items if i.get('urgency') == '긴급' and not is_within_24h(i)]
    if skipped:
        print(f'[긴급] {len(skipped)}건 발행 24시간 초과 — 알림 제외')
    if urgent_items:
        print(f'[긴급] {len(urgent_items)}건 — 알림 발송')
        send_telegram(urgent_items)
        send_urgent_email(urgent_items)
    else:
        print('[긴급] 해당 없음')

    # 아침 8시 일일 브리핑 (기술용어 추출 → 브리핑 생성 → 이메일 + 텔레그램)
    current_hour = datetime.now(KST).hour
    if current_hour == 8:
        print('[모닝 브리핑] 아침 8시 — 브리핑 생성 시작')
        cutoff = (datetime.now(KST) - timedelta(hours=24)).isoformat()
        today_date = datetime.now(KST).strftime('%Y-%m-%d')
        try:
            # 미브리핑 기사 조회 (briefed_date IS NULL, 최근 24시간)
            resp = sb.table('news_feed').select('*') \
                .is_('briefed_date', 'null') \
                .gte('created_at', cutoff) \
                .order('published_at', desc=True) \
                .limit(100) \
                .execute()
            morning_items = resp.data or []
            print(f'[모닝 브리핑] 대상 {len(morning_items)}건')

            # ① 기술 용어 추출 → tech_terms 저장
            new_terms = extract_tech_terms(morning_items)

            # ② 브리핑 텍스트 생성 → daily_briefings 저장
            briefing_text = generate_daily_briefing(morning_items, new_terms)

            # ③ 이메일 · 텔레그램 발송 (브리핑 텍스트 기반)
            if briefing_text:
                send_email(morning_items, briefing_text=briefing_text)
                send_morning_telegram(morning_items, briefing_text=briefing_text)
            else:
                send_email(morning_items)
                send_morning_telegram(morning_items)

            # ④ 브리핑 완료 표시 (briefed_date 갱신 → 다음 브리핑 중복 방지)
            if morning_items:
                ids = [it['id'] for it in morning_items if it.get('id')]
                if ids:
                    sb.table('news_feed').update({'briefed_date': today_date}) \
                        .in_('id', ids).execute()
                    print(f'[모닝 브리핑] briefed_date 갱신 완료 ({len(ids)}건)')

        except Exception as e:
            print(f'[모닝 브리핑 오류] {e}')
    else:
        print(f'[모닝 브리핑] 현재 {current_hour}시 — 8시 아님, 건너뜀')

    print(f'{"="*50}')
    print('[완료]')


if __name__ == '__main__':
    main()
