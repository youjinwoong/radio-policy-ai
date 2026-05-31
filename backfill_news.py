#!/usr/bin/env python3
"""
뉴스 1달치 백필 (1회용)
- 72시간 제한 해제 → 최근 30일 기사 수집
- 날짜 불명은 제외 (작년 기사도 제외)
- 긴급/보통/참고 분류 후 저장
- 기존 DB와 중복 제거
"""
import os, re, time
import requests
from datetime import datetime, timezone, timedelta
from bs4 import BeautifulSoup
from supabase import create_client, Client
import anthropic

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_KEY']
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')
sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
KST = timezone(timedelta(hours=9))
NOW = datetime.now(KST)
CUTOFF_30D = NOW - timedelta(days=30)
CUTOFF_YEAR = datetime(2025, 1, 1, tzinfo=KST)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language': 'ko-KR,ko;q=0.9',
}

# ── 날짜 파싱
def parse_date(s: str) -> str:
    if not s: return ''
    s = s.strip()
    now = datetime.now(KST)
    patterns = [
        (r'(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?', 6),
        (r'(\d{4})[./\-](\d{1,2})[./\-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?', 6),
        (r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일', 3),
    ]
    for pat, n in patterns:
        m = re.match(pat, s)
        if m:
            g = [m.group(i) for i in range(1, n+1)]
            try:
                y,mo,d = int(g[0]),int(g[1]),int(g[2])
                h  = int(g[3]) if len(g)>3 and g[3] else 0
                mi = int(g[4]) if len(g)>4 and g[4] else 0
                sec= int(g[5]) if len(g)>5 and g[5] else 0
                dt = datetime(y,mo,d,h,mi,sec,tzinfo=KST)
                return dt.isoformat()
            except: pass
    m = re.search(r'(\d+)\s*(분|시간|일)\s*전', s)
    if m:
        n,u = int(m.group(1)), m.group(2)
        td = timedelta(minutes=n) if u=='분' else timedelta(hours=n) if u=='시간' else timedelta(days=n)
        return (now-td).isoformat()
    return ''

def parse_dt(s):
    if not s: return None
    try:
        from dateutil import parser as dtp
        dt = dtp.parse(s)
        return dt.replace(tzinfo=KST) if dt.tzinfo is None else dt
    except: return None

# ── 긴급도 분류
_SYS = """당신은 SK텔레콤 CR센터 기술정책팀의 전파정책 모니터링 AI입니다.
아래 기준으로 셋 중 하나만 출력하세요 (단어만):
즉시대응: 이동통신 품질·장비·기지국·공공 와이파이 관련 불만/민원/장애/사고, 전파·무선국·주파수 관련 불만·규제강화·위반·처분, 과징금·허가취소·영업정지·행정처분
금주검토: 이동통신·전파·무선 관련 정보성·정책 동향·기술 소개, 입법예고·개정안·정책 발표
동향파악: 위에 해당하지 않는 해외 동향·업계 일반 트렌드·참고용"""
_MAP = {'즉시대응':'긴급','금주검토':'보통','동향파악':'참고'}
_FALLBACK = ['이동통신','기지국','공공와이파이','전파','전자파','무선국','주파수']

def classify(title, content=''):
    if ANTHROPIC_API_KEY:
        try:
            c = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
            r = c.messages.create(model='claude-haiku-4-5', max_tokens=10, system=_SYS,
                messages=[{'role':'user','content':f'제목: {title}'}])
            ans = r.content[0].text.strip()
            for k,v in _MAP.items():
                if k in ans: return v
        except: pass
    text = title + ' ' + content[:200]
    return '보통' if any(k in text for k in _FALLBACK) else '참고'

def detect_cat(title):
    if any(k in title for k in ['주파수','할당','경매','분배']): return '주파수'
    if any(k in title for k in ['전자파','SAR','EMC']): return '전자파'
    if any(k in title for k in ['적합성평가','기자재','인증']): return '기술기준'
    if any(k in title for k in ['ITU','WRC','IMT','6G','5G']): return 'ITU·WRC'
    if any(k in title for k in ['전기통신사업','통신사업','망중립']): return '전기통신사업'
    if any(k in title for k in ['정보통신망','정보보호','사이버']): return '정보통신망'
    return '기타'

# ── 기존 URL 조회
existing = set()
res = sb.table('news_feed').select('url').execute()
for r in (res.data or []):
    if r.get('url'): existing.add(r['url'])
print(f'[기존] {len(existing)}건')

all_items = []

# ── 뉴스 사이트 키워드 검색 (최근 1달)
NEWS_KW = ['전파정책','주파수','5G주파수','전자파','무선국','이동통신','WRC','6GHz','공공와이파이']
SITES = [
    {'source':'전자신문',   'url':'https://www.etnews.com/news/search.html?kwd={kw}',       'sel':['ul.c_list_article li','div.news_list article'], 'base':'https://www.etnews.com'},
    {'source':'디지털타임스','url':'https://www.dt.co.kr/search.php?q={kw}',                'sel':['div.article_title a','h4.tit a'],              'base':'https://www.dt.co.kr'},
    {'source':'ZDNet Korea','url':'https://zdnet.co.kr/news/?t=&q={kw}&l=&c=',             'sel':['article h4 a','div.article_title a'],           'base':'https://zdnet.co.kr'},
    {'source':'아이뉴스24', 'url':'https://search.inews24.com/search/news?q={kw}',         'sel':['div.result_news ul li a.tit','div.news_list a'], 'base':'https://www.inews24.com'},
    {'source':'연합뉴스',   'url':'https://www.yna.co.kr/search/index?query={kw}&lang=KOR','sel':['div.cts-title a','ul.list01 li a.tit'],          'base':'https://www.yna.co.kr'},
]

seen_urls = set(existing)
for site in SITES:
    for kw in NEWS_KW[:4]:
        url = site['url'].replace('{kw}', requests.utils.quote(kw))
        try:
            res = requests.get(url, headers=HEADERS, timeout=15)
            soup = BeautifulSoup(res.text, 'html.parser')
            links = []
            for sel in site['sel']:
                links = soup.select(sel)
                if links: break
            for link in links[:10]:
                title = link.get_text(strip=True) if link.name=='a' else (link.find('a') or link).get_text(strip=True)
                a = link if link.name=='a' else link.find('a')
                if not a or not title or len(title)<8: continue
                href = a.get('href','')
                if not href: continue
                if href.startswith('/'): href = site['base'] + href
                if not href.startswith('http'): continue
                if href in seen_urls: continue
                # 날짜 추출 시도
                parent = a.parent
                date_str = ''
                for _ in range(4):
                    if not parent: break
                    dtag = parent.select_one('span.date,em.date,time,span.regdate,p.cts-date')
                    if dtag: date_str = dtag.get_text(strip=True); break
                    parent = parent.parent
                pub = parse_date(date_str)
                seen_urls.add(href)
                all_items.append({'title':title,'source':site['source'],'url':href,'published_at':pub,'category':detect_cat(title),'is_read':False})
        except Exception as e:
            print(f'  [{site["source"]}] {kw}: {e}')
        time.sleep(0.5)
    print(f'[수집] {site["source"]}: 현재 {len(all_items)}건')

# 정부사이트 추가
GOV = [
    ('https://www.rra.go.kr/ko/notice/noticeList.do','table tbody tr','국립전파연구원','https://www.rra.go.kr'),
    ('https://www.msit.go.kr/bbs/list.do?sCode=user&mId=129&mPid=128','table tbody tr','과기정통부','https://www.msit.go.kr'),
    ('https://kcc.go.kr/user.do?mode=view&page=A05030000&dc=K05030000','table tbody tr','방송통신위원회','https://kcc.go.kr'),
]
for gurl,sel,src,base in GOV:
    try:
        res = requests.get(gurl, headers=HEADERS, timeout=20)
        soup = BeautifulSoup(res.text,'html.parser')
        for row in soup.select(sel)[:20]:
            a = row.find('a')
            if not a: continue
            title = a.get_text(strip=True)
            if not title or title.isdigit(): continue
            href = a.get('href','')
            if href.startswith('/'): href = base+href
            if not href or href in seen_urls: continue
            tds = row.find_all('td')
            date_str = tds[-2].get_text(strip=True) if len(tds)>=3 else ''
            pub = parse_date(date_str)
            seen_urls.add(href)
            all_items.append({'title':title,'source':src,'url':href,'published_at':pub,'category':detect_cat(title),'is_read':False})
        print(f'[수집] {src}: 현재 {len(all_items)}건')
    except Exception as e:
        print(f'[{src}] 오류: {e}')
    time.sleep(1)

# ── 날짜 필터링 (30일 이내 & 올해 이후)
valid = []
skipped = 0
for item in all_items:
    pub = item.get('published_at','')
    if not pub:
        skipped += 1; continue
    dt = parse_dt(pub)
    if not dt:
        skipped += 1; continue
    if dt < CUTOFF_YEAR or dt < CUTOFF_30D:
        skipped += 1; continue
    valid.append(item)

print(f'\n[필터] 수집 {len(all_items)}건 → 유효 {len(valid)}건 (제외 {skipped}건)')

# ── 긴급도 분류 및 저장
print(f'[분류] {len(valid)}건 긴급도 분류 시작...')
for i, item in enumerate(valid):
    val = classify(item['title'])
    item['urgency'] = val
    item['importance'] = val
    if (i+1) % 10 == 0:
        print(f'  분류 중... {i+1}/{len(valid)}')

if valid:
    batch = 50
    for i in range(0, len(valid), batch):
        sb.table('news_feed').insert(valid[i:i+batch]).execute()
    cnt = {'긴급': sum(1 for i in valid if i['urgency']=='긴급'),
           '보통': sum(1 for i in valid if i['urgency']=='보통'),
           '참고': sum(1 for i in valid if i['urgency']=='참고')}
    print(f'\n[저장 완료] {len(valid)}건')
    print(f'  긴급: {cnt["긴급"]}건 / 보통: {cnt["보통"]}건 / 참고: {cnt["참고"]}건')
else:
    print('[저장] 유효한 신규 기사 없음')

res2 = sb.table('news_feed').select('id').execute()
print(f'[DB 현황] 총 {len(res2.data or [])}건')
