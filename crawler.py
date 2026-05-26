#!/usr/bin/env python3
"""
전파정책 전문가 AI — 자동 크롤러
매일 오전 8시 KST GitHub Actions에서 실행
크롤링 대상: 국립전파연구원 · 과기정통부 · 전자신문
결과: Supabase news_feed 저장 + 이메일 발송
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

# ── 환경변수 ────────────────────────────────────────────
SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_KEY']
EMAIL_FROM   = os.environ.get('EMAIL_FROM', '')
EMAIL_PASS   = os.environ.get('EMAIL_PASSWORD', '')
EMAIL_TO     = os.environ.get('EMAIL_TO', '')

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
    """다양한 날짜 형식 → ISO 8601 변환"""
    if not date_str:
        return datetime.now(KST).isoformat()
    date_str = date_str.strip()
    for sep in ['.', '/', '-']:
        date_str = date_str.replace(sep, '-')
    date_str = re.sub(r'\s+', ' ', date_str)
    for fmt in ['%Y-%m-%d %H-%M-%S', '%Y-%m-%d %H-%M', '%Y-%m-%d']:
        try:
            dt = datetime.strptime(date_str[:len(fmt.replace('%-', '-'))], fmt)
            return dt.replace(tzinfo=KST).isoformat()
        except Exception:
            pass
    return datetime.now(KST).isoformat()


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

            rows = soup.select('table.board_list tbody tr, table tbody tr')[:15]
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

            rows = soup.select('table tbody tr, ul.bbs_list li')[:20]
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

            articles = soup.select('ul.c_list_article li, div.news_list article')[:5]
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
#  기사 본문 수집
# ═══════════════════════════════════════════════════════

def fetch_article_body(url: str, source: str) -> str:
    """기사 URL에서 본문 텍스트 추출 (최대 1500자)"""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=8)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')
        # 소스별 본문 셀렉터
        selectors_map = {
            '전자신문':   ['div.article_body', 'div#articleBody', 'div.news_view'],
            '연합뉴스':   ['div.article-txt', 'article.story-news'],
            '디지털데일리': ['div#articleBody', 'div.article_txt'],
            '지디넷코리아': ['div#article_content', 'div.article_view'],
            '블로터':     ['div.article_content'],
            '전자신문':   ['div.article_body', 'div#articleView'],
        }
        candidates = selectors_map.get(source, []) + [
            'article', 'div.article', 'div.news-content',
            'div.view_cont', 'div.view-content', 'div#content',
            'div.article-body', 'div.news_body'
        ]
        for sel in candidates:
            tag = soup.select_one(sel)
            if tag:
                text = tag.get_text(separator=' ', strip=True)
                if len(text) > 100:
                    return text[:1500]
        return ''
    except Exception as e:
        print(f'  [본문 수집 실패] {url}: {e}')
        return ''


# ═══════════════════════════════════════════════════════
#  Supabase 저장
# ═══════════════════════════════════════════════════════

def save_new_items(items: list, existing_urls: set) -> list:
    """기존에 없는 항목만 필터링 → 본문 수집 → 저장"""
    seen_urls = set(existing_urls)
    unique_new = []
    for item in items:
        url = item.get('url', '')
        if url and url not in seen_urls:
            seen_urls.add(url)
            unique_new.append(item)

    if unique_new:
        # 기사 본문 수집 (항목당 1초 간격)
        print(f'[본문 수집] {len(unique_new)}건 시작...')
        for item in unique_new:
            if item.get('url'):
                body = fetch_article_body(item['url'], item.get('source', ''))
                item['content'] = body if body else None
                item['content_fetched_at'] = datetime.now(KST).isoformat()
                time.sleep(1)  # 서버 부하 방지

        sb.table('news_feed').insert(unique_new).execute()
        print(f'[저장] {len(unique_new)}건 본문 포함 저장 완료')
    else:
        print('[저장] 신규 항목 없음')
    return unique_new


# ═══════════════════════════════════════════════════════
#  이메일 발송
# ═══════════════════════════════════════════════════════

def send_email(new_items: list):
    if not all([EMAIL_FROM, EMAIL_PASS, EMAIL_TO]):
        print('[이메일] 환경변수 미설정 — 건너뜀')
        return

    today = datetime.now(KST).strftime('%Y.%m.%d')

    if not new_items:
        subject = f'[전파정책 AI] {today} — 신규 고시·뉴스 없음'
        body_html = f'''
<html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
<h2 style="color:#534AB7">전파정책 전문가 AI — 일일 모니터링 리포트</h2>
<p style="color:#666">{today} | 오늘은 새로운 항목이 없습니다.</p>
<hr>
<p style="color:#999;font-size:12px">
대시보드: <a href="https://youjinwoong.github.io/radio-policy-ai/">바로가기</a>
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

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From']    = f'전파정책 AI <{EMAIL_FROM}>'
    msg['To']      = EMAIL_TO
    msg.attach(MIMEText(body_html, 'html', 'utf-8'))

    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=30) as smtp:
            smtp.login(EMAIL_FROM, EMAIL_PASS)
            smtp.sendmail(EMAIL_FROM, EMAIL_TO.split(','), msg.as_string())
        print(f'[이메일] {EMAIL_TO}로 발송 완료')
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
    all_items += crawl_etnews()
    print(f'[수집] 총 {len(all_items)}건')

    new_items = save_new_items(all_items, existing_urls)
    print(f'[신규] {len(new_items)}건')

    send_email(new_items)

    print(f'{"="*50}')
    print('[완료]')


if __name__ == '__main__':
    main()
