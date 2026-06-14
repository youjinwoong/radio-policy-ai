# -*- coding: utf-8 -*-
"""
law_amendments.summary 채우기 — 법제처 DRF 상세(본문 JSON)에서 개정이유/주요내용을 받아 Haiku로 1~2문장 요약.

- DRF 본문 API는 계정에 'XML'이 아닌 'JSON'으로 신청돼 있으므로 type=JSON 사용.
  (type=XML로 요청하면 "미신청된 목록/본문에 대한 접근입니다" 오류)
- 대상: summary가 NULL인 행 중 DRF 지원 유형(law/bylaw/rules→target=law&MST, admrul→target=admrul&ID)
- lsAnc(입법예고)는 DRF 미지원 → 건너뜀(추후 gov_notice_crawler에서 처리)
- 멱등: summary NULL만 처리. 개정이유가 없으면 ''로 표시해 재처리 방지.
- 필요 환경변수: SUPABASE_URL, SUPABASE_SERVICE_KEY, LAW_OC_KEY, ANTHROPIC_API_KEY
"""
import os
import re
import time

import requests
import anthropic
from supabase import create_client, Client

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SUPABASE_URL      = os.environ['SUPABASE_URL']
SUPABASE_KEY      = os.environ['SUPABASE_SERVICE_KEY']
LAW_OC_KEY        = os.environ.get('LAW_OC_KEY', '')
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')

sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
DRF_SERVICE = 'http://www.law.go.kr/DRF/lawService.do'


def detail_params(law_id: str):
    """law_id('{type}_{일련번호}')로 DRF 상세 조회 파라미터 생성. 미지원이면 None."""
    if not law_id or '_' not in law_id:
        return None
    typ = law_id.split('_', 1)[0]
    seq = law_id.split('_', 1)[1]
    if typ == 'admrul':
        return {'target': 'admrul', 'ID': seq}
    if typ in ('law', 'bylaw', 'rules'):
        return {'target': 'law', 'MST': seq}
    return None  # lsAnc 등


def _find_key(obj, key):
    """중첩 dict/list에서 key를 재귀 탐색."""
    if isinstance(obj, dict):
        if key in obj:
            return obj[key]
        for v in obj.values():
            r = _find_key(v, key)
            if r is not None:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = _find_key(v, key)
            if r is not None:
                return r
    return None


def _flatten(x):
    if x is None:
        return []
    if isinstance(x, str):
        return [x]
    if isinstance(x, list):
        out = []
        for i in x:
            out += _flatten(i)
        return out
    return [str(x)]


def fetch_reason(params: dict) -> str:
    """DRF 상세(JSON)에서 제개정이유내용 추출."""
    q = {'OC': LAW_OC_KEY, 'type': 'JSON'}
    q.update(params)
    try:
        resp = requests.get(DRF_SERVICE, params=q, timeout=10)
        data = resp.json()
    except Exception as e:
        print(f'  [DRF 오류] {params}: {e}')
        return ''
    content = _find_key(data, '제개정이유내용')
    parts = _flatten(content)
    text = ' '.join(p.strip() for p in parts if p and p.strip())
    # 머리기호·구분표기·출처 제거
    text = re.sub(r'\[\s*(제정|일부개정|전부개정|타법개정|폐지|타법폐지)\s*\]', ' ', text)
    text = text.replace('◇', ' ').replace('<법제처 제공>', ' ')
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def summarize(law_nm: str, reason: str) -> str:
    """Haiku로 1~2문장(100자 내) 요약."""
    if not ANTHROPIC_API_KEY:
        print('  [경고] ANTHROPIC_API_KEY 없음 — 요약 생략')
        return ''
    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        resp = client.messages.create(
            model='claude-haiku-4-5-20251001',
            max_tokens=200,
            messages=[{
                'role': 'user',
                'content': (
                    f'다음은 「{law_nm}」의 개정이유·주요내용입니다. '
                    '무엇을 바꾸려는지 핵심만 1~2문장(100자 이내) 한국어 평서문으로 요약하세요. '
                    '머리기호·출처표기·상투어는 빼고 간결하게.\n\n'
                    + reason[:2000]
                ),
            }],
        )
        return resp.content[0].text.strip()
    except Exception as e:
        print(f'  [요약 오류] {e}')
        return ''


def main():
    rows = (sb.table('law_amendments')
            .select('id,law_id,law_nm,summary')
            .is_('summary', 'null')
            .limit(500)
            .execute().data) or []
    print(f'[요약] summary NULL 대상: {len(rows)}건')

    summarized = 0
    empty = 0
    skipped = 0
    for r in rows:
        params = detail_params(r.get('law_id') or '')
        if not params:
            skipped += 1  # lsAnc 등 — NULL 유지(추후 gov_notice 처리)
            continue
        reason = fetch_reason(params)
        if not reason:
            sb.table('law_amendments').update({'summary': ''}).eq('id', r['id']).execute()
            empty += 1
            time.sleep(0.1)
            continue
        s = summarize(r.get('law_nm', ''), reason)
        sb.table('law_amendments').update({'summary': s or ''}).eq('id', r['id']).execute()
        if s:
            summarized += 1
            print(f'  ok {(r.get("law_nm") or "")[:30]} -> {s[:50]}')
        time.sleep(0.15)

    print(f'[요약] 완료 - 요약 {summarized}건 / 이유없음 {empty}건 / 건너뜀(lsAnc 등) {skipped}건')


if __name__ == '__main__':
    main()
