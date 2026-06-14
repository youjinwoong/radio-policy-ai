#!/usr/bin/env python3
"""
법제처 Open API 기반 법령·고시·입법예고 변경 모니터링
- 시행령·시행규칙 개정 감지 → 텔레그램 알림
- 행정규칙(고시) 개정 감지 → 텔레그램 알림
- 입법예고 신규 등록 감지 → 텔레그램 알림

GitHub Actions에서 매일 11:00 KST 실행 (law_crawl.yml)
법제처 OC키: https://open.law.go.kr → 마이페이지 → API인증키관리
"""

import os
import time
import requests
from datetime import datetime, timezone, timedelta

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from supabase import create_client, Client

# ── 환경변수 ──────────────────────────────────────────────
SUPABASE_URL       = os.environ['SUPABASE_URL']
SUPABASE_KEY       = os.environ['SUPABASE_SERVICE_KEY']
LAW_OC_KEY         = os.environ.get('LAW_OC_KEY', '')
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHAT_ID   = os.environ.get('TELEGRAM_CHAT_ID', '')

sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
KST = timezone(timedelta(hours=9))

# ── API 설정 ──────────────────────────────────────────────
LAW_API_BASE = 'https://open.law.go.kr/LSO/openApi/apiSearch/retrieveLawInfoListByLawSrchType.do'
ANC_API_BASE = 'https://open.law.go.kr/LSO/openApi/apiSearch/retrieveLsAnncList.do'

# 법령 유형별 설명
TYPE_LABEL = {
    'bylaw':  '시행령',
    'rules':  '시행규칙',
    'admrul': '고시·행정규칙',
    'lsAnc':  '입법예고',
}

# 모니터링 키워드
KEYWORDS = [
    '전파법',
    '전기통신사업법',
    '방송통신발전',
    '정보통신망',
    '주파수',
    '전자파',
    '무선국',
    '방송통신설비',
    '적합성평가',
    '이동통신',
    '위성통신',
    '기간통신',
    '전파관리',
    '전파간섭',
    '혼신',
]

# 조회할 법령 유형
LAW_TARGETS = ['bylaw', 'rules', 'admrul']   # 시행령, 시행규칙, 고시


# ══════════════════════════════════════════════════════════
#  API 조회
# ══════════════════════════════════════════════════════════

def fetch_laws(keyword: str, target: str, display: int = 20) -> list[dict]:
    """법제처 API로 법령 목록 조회"""
    if not LAW_OC_KEY:
        return []
    params = {
        'OC':      LAW_OC_KEY,
        'target':  target,
        'type':    'JSON',
        'query':   keyword,
        'display': display,
        'page':    1,
        'sort':    'lasc',   # 최신 공포일 기준 내림차순
    }
    try:
        resp = requests.get(LAW_API_BASE, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        # 응답 구조: {"LawSearch": {"law": [...]}} 또는 {"LawSearch": {"law": {...}}}
        items = data.get('LawSearch', {}).get('law', [])
        if isinstance(items, dict):
            items = [items]
        return items if isinstance(items, list) else []
    except Exception as e:
        print(f'  [API 오류] {target}/{keyword}: {e}')
        return []


def fetch_announcements(keyword: str, display: int = 20) -> list[dict]:
    """입법예고 목록 조회"""
    if not LAW_OC_KEY:
        return []
    params = {
        'OC':      LAW_OC_KEY,
        'target':  'lsAnc',
        'type':    'JSON',
        'query':   keyword,
        'display': display,
        'page':    1,
    }
    try:
        resp = requests.get(ANC_API_BASE, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        items = data.get('LawSearch', {}).get('law', [])
        if isinstance(items, dict):
            items = [items]
        return items if isinstance(items, list) else []
    except Exception as e:
        print(f'  [입법예고 API 오류] {keyword}: {e}')
        return []


# ══════════════════════════════════════════════════════════
#  DB 처리
# ══════════════════════════════════════════════════════════

def load_existing() -> dict[str, dict]:
    """DB의 기존 법령 목록 로드 (law_id → row)"""
    rows = sb.table('law_amendments').select('*').execute().data
    return {r['law_id']: r for r in rows}


def make_law_id(item: dict, law_type: str) -> str:
    """법령 고유 ID 생성 (법령MST + 유형)"""
    mst = item.get('법령MST') or item.get('예고MST') or item.get('일련번호') or ''
    return f"{law_type}_{mst}"


def upsert_law(item: dict, law_type: str, keywords: list[str],
               existing: dict | None) -> str:
    """법령 저장/갱신. 반환값: 'new' | 'updated' | 'unchanged'"""
    law_id   = make_law_id(item, law_type)
    law_nm   = (item.get('법령명_한글') or item.get('예고법령명') or
                item.get('법령명') or '').strip()
    public_dt = (item.get('공포일자') or item.get('예고공포일자') or
                 item.get('입법예고일') or '').replace('-', '').strip()
    enf_dt    = (item.get('시행일자') or item.get('예고시행일자') or '').replace('-', '').strip()
    public_no = (item.get('공포번호') or item.get('예고번호') or '').strip()
    ann_type  = (item.get('제개정구분명') or item.get('예고구분명') or '').strip()
    link_url  = build_link(item, law_type)

    if not law_id or not law_nm:
        return 'unchanged'

    row = {
        'law_id':          law_id,
        'law_nm':          law_nm,
        'law_type':        law_type,
        'ann_type':        ann_type,
        'public_dt':       public_dt,
        'enf_dt':          enf_dt,
        'public_no':       public_no,
        'matched_keywords': keywords,
        'link_url':        link_url,
        'updated_at':      datetime.now(KST).isoformat(),
    }

    if existing is None:
        row['prev_public_dt'] = public_dt
        sb.table('law_amendments').insert(row).execute()
        return 'new'

    # 공포일 변경 감지 (재개정)
    if existing.get('public_dt') != public_dt and public_dt:
        row['prev_public_dt'] = existing.get('public_dt', '')
        sb.table('law_amendments').update(row).eq('law_id', law_id).execute()
        return 'updated'

    # 키워드 병합만
    existing_kw = set(existing.get('matched_keywords') or [])
    new_kw = set(keywords)
    if not new_kw.issubset(existing_kw):
        sb.table('law_amendments').update({
            'matched_keywords': list(existing_kw | new_kw),
            'updated_at': datetime.now(KST).isoformat(),
        }).eq('law_id', law_id).execute()

    return 'unchanged'


def build_link(item: dict, law_type: str) -> str:
    mst = item.get('법령MST') or item.get('예고MST') or ''
    if not mst:
        return ''
    if law_type == 'lsAnc':
        return f'https://www.law.go.kr/lsInfoP/lsisCrfP/lsisCrfPP01/retrieveLsInfoMainPageListP.do?lsNm={item.get("예고법령명","")}'
    return f'https://www.law.go.kr/lsSc.do?query={item.get("법령명_한글","")}'


# ══════════════════════════════════════════════════════════
#  텔레그램 알림
# ══════════════════════════════════════════════════════════

def fmt_date(dt: str) -> str:
    if dt and len(dt) == 8:
        return f'{dt[:4]}.{dt[4:6]}.{dt[6:]}'
    return dt or '—'


def send_telegram(msg: str):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return
    url = f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage'
    try:
        resp = requests.post(url, json={
            'chat_id': TELEGRAM_CHAT_ID,
            'text': msg,
            'parse_mode': 'HTML',
        }, timeout=10)
        if resp.status_code != 200:
            print(f'[텔레그램 오류] {resp.status_code}')
    except Exception as e:
        print(f'[텔레그램 오류] {e}')


def notify_new(item: dict, law_type: str, keywords: list[str]):
    label = TYPE_LABEL.get(law_type, law_type)
    law_nm = (item.get('법령명_한글') or item.get('예고법령명') or '').strip()
    public_dt = (item.get('공포일자') or item.get('입법예고일') or '').replace('-', '')
    enf_dt = (item.get('시행일자') or item.get('예고시행일자') or '').replace('-', '')
    ann_type = item.get('제개정구분명') or item.get('예고구분명') or ''

    icon = '📢' if law_type == 'lsAnc' else '⚖️'
    msg = (
        f'{icon} <b>[법령 {label} 신규]</b>\n'
        f'{law_nm}\n\n'
        f'• 구분: {ann_type or "—"}\n'
        f'• 공포일: {fmt_date(public_dt)}\n'
        f'• 시행일: {fmt_date(enf_dt)}\n'
        f'• 키워드: {", ".join(keywords)}'
    )
    send_telegram(msg)


def notify_updated(item: dict, law_type: str, prev_dt: str, keywords: list[str]):
    label = TYPE_LABEL.get(law_type, law_type)
    law_nm = (item.get('법령명_한글') or item.get('예고법령명') or '').strip()
    public_dt = (item.get('공포일자') or '').replace('-', '')
    msg = (
        f'🔄 <b>[법령 {label} 재개정]</b>\n'
        f'{law_nm}\n\n'
        f'• {fmt_date(prev_dt)} → <b>{fmt_date(public_dt)}</b>\n'
        f'• 키워드: {", ".join(keywords)}'
    )
    send_telegram(msg)


# ══════════════════════════════════════════════════════════
#  메인
# ══════════════════════════════════════════════════════════

def main():
    print(f'[법령 모니터링] 시작 — {datetime.now(KST).strftime("%Y-%m-%d %H:%M KST")}')

    if not LAW_OC_KEY:
        print('[오류] LAW_OC_KEY 환경변수 없음')
        return

    existing = load_existing()
    print(f'  기존 추적 법령: {len(existing)}건')

    # 키워드×유형 조합으로 수집 (law_id 기준 중복 제거)
    collected: dict[str, tuple[dict, str, list[str]]] = {}  # law_id → (item, type, keywords)

    # ① 시행령·시행규칙·고시
    for target in LAW_TARGETS:
        label = TYPE_LABEL[target]
        print(f'\n  [{label}] 검색 중...')
        for kw in KEYWORDS:
            items = fetch_laws(kw, target, display=20)
            for item in items:
                lid = make_law_id(item, target)
                if not lid or lid.endswith('_'):
                    continue
                if lid in collected:
                    collected[lid][2].append(kw)
                else:
                    collected[lid] = (item, target, [kw])
            time.sleep(0.2)

    # ② 입법예고
    print(f'\n  [입법예고] 검색 중...')
    for kw in KEYWORDS:
        items = fetch_announcements(kw, display=20)
        for item in items:
            lid = make_law_id(item, 'lsAnc')
            if not lid or lid.endswith('_'):
                continue
            if lid in collected:
                collected[lid][2].append(kw)
            else:
                collected[lid] = (item, 'lsAnc', [kw])
        time.sleep(0.2)

    print(f'\n  총 고유 법령: {len(collected)}건')

    # DB 저장 및 알림
    new_count     = 0
    updated_count = 0

    for lid, (item, law_type, keywords) in collected.items():
        ex = existing.get(lid)
        result = upsert_law(item, law_type, keywords, ex)

        if result == 'new':
            new_count += 1
            label = TYPE_LABEL.get(law_type, law_type)
            law_nm = (item.get('법령명_한글') or item.get('예고법령명') or '')[:40]
            print(f'  🆕 신규 {label}: {law_nm}')
            notify_new(item, law_type, keywords)

        elif result == 'updated':
            updated_count += 1
            law_nm = (item.get('법령명_한글') or item.get('예고법령명') or '')[:30]
            prev_dt = ex.get('public_dt', '') if ex else ''
            print(f'  🔄 개정: {law_nm} ({fmt_date(prev_dt)} → {fmt_date((item.get("공포일자") or "").replace("-",""))})')
            notify_updated(item, law_type, prev_dt, keywords)

    print(f'\n[완료] 신규 {new_count}건 | 개정 {updated_count}건 | 총 추적 {len(collected)}건')


if __name__ == '__main__':
    main()
