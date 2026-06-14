# -*- coding: utf-8 -*-
"""
assembly_bills.summary 채우기 — 열린국회정보 BPMBILLSUMMARY(법률안 제안이유 및 주요내용)에서
SUMMARY를 받아 Haiku로 1~2문장 요약. GitHub Actions 자동 + 로컬 백필 겸용.

- 요청주소: https://open.assembly.go.kr/portal/openapi/BPMBILLSUMMARY (요청인자 BILL_NO, 응답 SUMMARY)
- 멱등: summary NULL만 처리. 내용 없으면 ''로 표시해 재처리 방지.
- 필요 환경변수: SUPABASE_URL, SUPABASE_SERVICE_KEY, ASSEMBLY_API_KEY, ANTHROPIC_API_KEY
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
ASSEMBLY_API_KEY  = os.environ.get('ASSEMBLY_API_KEY', '')
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')

sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
API = 'https://open.assembly.go.kr/portal/openapi/BPMBILLSUMMARY'


def fetch_summary(bill_no: str) -> str:
    """BPMBILLSUMMARY에서 SUMMARY(제안이유·주요내용) 추출."""
    if not (ASSEMBLY_API_KEY and bill_no):
        return ''
    params = {'KEY': ASSEMBLY_API_KEY, 'Type': 'json', 'pIndex': 1, 'pSize': 5, 'BILL_NO': bill_no}
    try:
        resp = requests.get(API, params=params, timeout=15)
        data = resp.json()
    except Exception as e:
        print(f'  [API 오류] {bill_no}: {e}')
        return ''
    rows = []
    wrap = data.get('BPMBILLSUMMARY')
    if isinstance(wrap, list):
        for it in wrap:
            if isinstance(it, dict) and 'row' in it:
                rows = it['row']
                break
    if not rows:
        return ''
    s = (rows[0].get('SUMMARY') or '').strip()
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def summarize(bill_name: str, text: str) -> str:
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
                    f'다음은 「{bill_name}」의 제안이유·주요내용입니다. '
                    '무엇을 바꾸려는지 핵심만 1~2문장(100자 이내) 한국어 평서문으로 요약하세요. '
                    '머리기호·상투어는 빼고 간결하게.\n\n'
                    + text[:2500]
                ),
            }],
        )
        return resp.content[0].text.strip()
    except Exception as e:
        print(f'  [요약 오류] {e}')
        return ''


def main():
    rows = (sb.table('assembly_bills')
            .select('id,bill_no,bill_name,summary')
            .is_('summary', 'null')
            .limit(500)
            .execute().data) or []
    print(f'[국회요약] summary NULL 대상: {len(rows)}건')

    done = 0
    empty = 0
    for r in rows:
        txt = fetch_summary(r.get('bill_no') or '')
        if not txt:
            sb.table('assembly_bills').update({'summary': ''}).eq('id', r['id']).execute()
            empty += 1
            time.sleep(0.1)
            continue
        s = summarize(r.get('bill_name', ''), txt)
        sb.table('assembly_bills').update({'summary': s or ''}).eq('id', r['id']).execute()
        if s:
            done += 1
            print(f'  ok {(r.get("bill_name") or "")[:30]} -> {s[:50]}')
        time.sleep(0.15)

    print(f'[국회요약] 완료 - 요약 {done}건 / 내용없음 {empty}건')


if __name__ == '__main__':
    main()
