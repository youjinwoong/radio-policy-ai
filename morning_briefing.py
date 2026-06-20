#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
전파정책 AI — 모닝 브리핑 생성 스크립트
매일 08:00 KST (23:00 UTC) GitHub Actions에서 실행

동작:
1. news_feed에서 최근 24h 기사 중 본문(content) 확인된 것만 조회
2. Claude Haiku로 브리핑 생성 (본문 기반 요약)
3. daily_briefings 저장
4. 브리핑에 포함된 기사의 한 줄 요약 → news_feed.summary 역저장
5. 텔레그램 + 이메일 발송
"""

import os
import re
import smtplib
import json
from datetime import datetime, timezone, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import requests
import anthropic
from supabase import Client
from sb_client import make_client

# ── 환경변수 ──────────────────────────────────────────────
SUPABASE_URL       = os.environ['SUPABASE_URL']
SUPABASE_KEY       = os.environ['SUPABASE_SERVICE_KEY']
ANTHROPIC_API_KEY  = os.environ.get('ANTHROPIC_API_KEY', '')
EMAIL_FROM         = os.environ.get('EMAIL_FROM', '')
EMAIL_PASS         = os.environ.get('EMAIL_PASSWORD', '')
EMAIL_TO           = os.environ.get('EMAIL_TO', '')
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHAT_ID   = os.environ.get('TELEGRAM_CHAT_ID', '')
RESEND_API_KEY     = os.environ.get('RESEND_API_KEY', '')

KST = timezone(timedelta(hours=9))
sb: Client = make_client(SUPABASE_URL, SUPABASE_KEY)


# ═══════════════════════════════════════════════════════
#  STEP 1 — 본문 확인된 기사 조회
# ═══════════════════════════════════════════════════════

def fetch_items_with_content() -> list:
    """최근 24h 기사 중 content 있는 것만 반환 (id 포함)"""
    cutoff = (datetime.now(KST) - timedelta(hours=24)).isoformat()
    try:
        resp = sb.table('news_feed') \
            .select('id,title,source,url,published_at,content,urgency') \
            .gte('published_at', cutoff) \
            .not_.is_('content', 'null') \
            .order('published_at', desc=True) \
            .limit(60) \
            .execute()
        items = [it for it in (resp.data or []) if it.get('content') and len(it['content'].strip()) > 50]
        print(f'[조회] 본문 확인 기사 {len(items)}건 / 24h 내')
        return items
    except Exception as e:
        print(f'[조회 오류] {e}')
        return []


# ═══════════════════════════════════════════════════════
#  STEP 2 — 브리핑 생성
# ═══════════════════════════════════════════════════════

_BRIEFING_SYSTEM = """당신은 SK텔레콤 Comm센터 기술정책팀의 전파정책 모닝 브리핑 작성 AI입니다.
제공된 뉴스 목록과 각 기사의 본문을 바탕으로 간결하고 실용적인 브리핑을 작성하세요.

작성 규칙:
- [주요 뉴스]는 제공된 기사에서만 선별 (최대 8건, 긴급·보통 기사 우선)
- 같은 사건·주제를 다룬 기사가 여러 건일 경우 가장 중요한 1건만 선별 (중복 주제 제외)
- [주목 포인트]는 SKT Comm센터 정책·기술 관점에서 핵심 이슈 1~3개 도출
- 반드시 제공된 본문 내용에 근거해서만 요약 작성 — 추측·외부 지식 금지
- 각 뉴스에 본문 기반 한 줄 요약 포함
- [ID:기사id] 태그를 제목 뒤에 반드시 포함 (역저장에 사용)
- 🔴 긴급 표시는 입력 뉴스 목록에서 🔴 아이콘이 붙은 기사에만 사용할 것 (크롤러·담당자 검증 분류 기준)
  ※ 입력에서 🔴인 기사를 [주요 뉴스]에 선별하면 🔴를 그대로 유지하고, 🟡·🟢 기사에 새로 🔴를 붙이지 말 것

출력 형식 (아래 형식 그대로):
📡 전파정책 모닝 브리핑 — {날짜}

[주요 뉴스]
• 제목 — 출처 [ID:기사id]
  → 한 줄 요약 (본문 근거, 1~2문장)
  🔗 URL

[주목 포인트]
• 핵심 이슈 1
• 핵심 이슈 2

[새로 추가된 기술 용어]
• 용어: 정의

[저장 결과]
뉴스 N건 / 기술 용어 N건"""


def generate_briefing(items: list, new_terms: list) -> str:
    if not ANTHROPIC_API_KEY:
        print('[브리핑] ANTHROPIC_API_KEY 없음 — 건너뜀')
        return ''

    today_str = datetime.now(KST).strftime('%Y년 %m월 %d일')

    news_lines = []
    for it in items[:50]:
        icon = {'긴급': '🔴', '보통': '🟡', '참고': '🟢'}.get(it.get('urgency', '참고'), '🟢')
        body = (it.get('content') or '').replace('\n', ' ').strip()[:400]
        news_lines.append(
            f"{icon} {it['title']} — {it.get('source','')} [ID:{it['id']}]\n"
            f"   URL: {it.get('url','')}\n"
            f"   발행: {str(it.get('published_at',''))[:10]}\n"
            f"   본문: {body}"
        )

    term_lines = '\n'.join(
        f"- {t.get('term','')}: {t.get('definition','')}" for t in new_terms
    ) if new_terms else '신규 용어 없음'

    user_msg = (
        f"날짜: {today_str}\n\n"
        f"[브리핑 대상 뉴스 {len(items)}건 — 본문 확인된 기사만]\n"
        + '\n'.join(news_lines)
        + f"\n\n[오늘 신규 추출된 기술 용어]\n{term_lines}"
    )

    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        resp = client.messages.create(
            model='claude-haiku-4-5-20251001',
            max_tokens=2500,
            system=_BRIEFING_SYSTEM,
            messages=[{'role': 'user', 'content': user_msg}],
        )
        text = resp.content[0].text.strip()
        print(f'[브리핑] 생성 완료 ({len(text)}자)')
        return text
    except Exception as e:
        print(f'[브리핑 생성 오류] {e}')
        return ''


# ═══════════════════════════════════════════════════════
#  STEP 2.5 — 긴급 기사 SKT 영향 분석 (DB 긴급도 기준, 생성 시 1회 저장)
# ═══════════════════════════════════════════════════════

_IMPACT_SYSTEM = """당신은 SKT Comm센터 기술정책팀의 정책 분석 AI입니다.
긴급 분류된 기사 1건에 대해 SKT 관점의 영향 분석을 작성하세요.
- 3~4문장, 제공된 본문에 근거한 내용만 (추측·과장 금지)
- 영향이 불명확하면 '추가 정보 수집 필요'를 명시
- 마지막 문장에 권고 대응 1가지 포함
- 줄바꿈 없이 한 단락으로만 출력"""


def add_urgent_analyses(items: list, briefing_text: str) -> str:
    """DB 긴급도='긴급' 기사 중 브리핑에 포함된 기사에 SKT 영향 분석을 생성해
    해당 기사 블록 뒤에 삽입. 저장본에 포함되므로 이메일·대시보드가 동일 내용 표시."""
    if not ANTHROPIC_API_KEY or not briefing_text:
        return briefing_text
    urgent = [it for it in items if it.get('urgency') == '긴급' and f"[ID:{it['id']}]" in briefing_text]
    if not urgent:
        return briefing_text
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    lines = briefing_text.split('\n')
    for it in urgent[:3]:
        try:
            body = (it.get('content') or '').replace('\n', ' ').strip()[:1500]
            resp = client.messages.create(
                model='claude-haiku-4-5-20251001', max_tokens=400,
                system=_IMPACT_SYSTEM,
                messages=[{'role': 'user', 'content': f"제목: {it['title']}\n본문: {body}"}],
            )
            analysis = resp.content[0].text.strip().replace('\n', ' ')
        except Exception as e:
            print(f'  [영향 분석 오류] {str(it.get("title",""))[:30]}: {e}')
            continue
        tag = f"[ID:{it['id']}]"
        idx = next((i for i, l in enumerate(lines) if tag in l), None)
        if idx is None:
            continue
        ins = idx
        for j in range(idx + 1, min(idx + 5, len(lines))):
            if '🔗' in lines[j]:
                ins = j
                break
            if lines[j].strip() == '' or lines[j].startswith('['):
                break
            ins = j
        lines.insert(ins + 1, f"  ⚠️ SKT 영향 분석: {analysis}")
        print(f'  [영향 분석] {str(it.get("title",""))[:30]}... 삽입')
    return '\n'.join(lines)


# ═══════════════════════════════════════════════════════
#  STEP 3 — daily_briefings 저장
# ═══════════════════════════════════════════════════════

def save_briefing(briefing_text: str, news_count: int, terms_count: int):
    today_date = datetime.now(KST).strftime('%Y-%m-%d')
    try:
        sb.table('daily_briefings').upsert({
            'briefing_date': today_date,
            'content': briefing_text,
            'news_count': news_count,
            'terms_count': terms_count,
        }, on_conflict='briefing_date').execute()
        print(f'[저장] daily_briefings {today_date} 완료')
    except Exception as e:
        print(f'[저장 오류] {e}')


# ═══════════════════════════════════════════════════════
#  STEP 4 — news_feed.summary 역저장
# ═══════════════════════════════════════════════════════

def backfill_summaries(briefing_text: str):
    """브리핑의 [ID:xxx] → 요약 패턴으로 news_feed.summary 역저장 (병렬)"""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    pattern = r'\[ID:([^\]]+)\].*?\n\s*→\s*(.+)'
    matches = re.findall(pattern, briefing_text)
    pairs = [(aid.strip(), sl.strip()) for aid, sl in matches if aid.strip() and sl.strip()]
    if not pairs:
        print('[역저장] 업데이트할 항목 없음')
        return
    def _update(aid, summary):
        try:
            sb.table('news_feed').update({'summary': summary}).eq('id', aid).execute()
            return True
        except Exception as e:
            print(f'  [역저장 오류] id={aid}: {e}')
            return False
    count = 0
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs = {ex.submit(_update, aid, sl): aid for aid, sl in pairs}
        for fut in as_completed(futs):
            if fut.result():
                count += 1
    print(f'[역저장] news_feed.summary {count}/{len(pairs)}건 업데이트')


# ═══════════════════════════════════════════════════════
#  STEP 5 — 텔레그램 + 이메일 발송
# ═══════════════════════════════════════════════════════

def send_telegram(briefing_text: str):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print('[텔레그램] 환경변수 미설정 — 건너뜀')
        return
    text = briefing_text[:4000]
    if len(briefing_text) > 4000:
        text += '\n\n...(전문은 대시보드 참조)'
    text += '\n\n📊 https://youjinwoong.github.io/radio-policy-ai/'
    try:
        resp = requests.post(
            f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage',
            json={'chat_id': TELEGRAM_CHAT_ID, 'text': text,
                  'disable_web_page_preview': True},
            timeout=15
        )
        if resp.status_code == 200:
            print('[텔레그램] 발송 완료')
        else:
            print(f'[텔레그램 오류] HTTP {resp.status_code}: {resp.text[:200]}')
    except Exception as e:
        print(f'[텔레그램 오류] {e}')


def _briefing_to_html(text: str) -> str:
    import html as hl
    lines = text.split('\n')
    out = []
    in_box = False
    for line in lines:
        e = hl.escape(line)
        is_urgent = '🔴' in line
        if in_box and not is_urgent and (e.startswith('[') or '📡' in line or e == ''):
            out.append('</div>')
            in_box = False
        if is_urgent:
            if not in_box:
                out.append('<div style="border:2px solid #c53030;border-radius:6px;background:#fff5f5;padding:10px 14px;margin:10px 0">')
                in_box = True
            out.append(f'<p style="margin:3px 0">{e}</p>')
        elif '📡' in line:
            out.append(f'<h2 style="color:#534AB7;margin-bottom:4px">{e}</h2>')
        elif e.startswith('[') and e.endswith(']'):
            out.append(f'<h3 style="color:#1a1a1a;margin:18px 0 6px;border-bottom:1px solid #eee;padding-bottom:4px">{e}</h3>')
        elif e.startswith('•') or '🟡' in line or '🟢' in line:
            out.append(f'<p style="margin:4px 0 4px 12px">{e}</p>')
        elif '⚠️ SKT 영향 분석' in line:
            out.append(f'<p style="margin:6px 0 4px 24px;color:#9b2c2c;font-size:13px">{e.strip()}</p>')
        elif e.startswith('  →'):
            out.append(f'<p style="margin:2px 0 2px 24px;color:#555;font-size:13px">{e}</p>')
        elif e.startswith('  🔗'):
            url = line.strip()[2:].strip()
            out.append(f'<p style="margin:2px 0 8px 24px;font-size:12px"><a href="{url}" style="color:#534AB7">{url}</a></p>')
        elif e == '':
            out.append('<br>')
        else:
            out.append(f'<p style="margin:4px 0">{e}</p>')
    if in_box:
        out.append('</div>')
    return '\n'.join(out)


def send_email(briefing_text: str, news_count: int):
    today = datetime.now(KST).strftime('%Y.%m.%d')
    subject = f'☀️ [전파정책 AI] {today} 모닝 브리핑 — {news_count}건'
    body_html = f'''
<html><body style="font-family:sans-serif;max-width:640px;margin:auto;padding:20px">
{_briefing_to_html(briefing_text)}
<hr style="margin-top:24px">
<p style="color:#999;font-size:11px">
이 메일은 자동 발송됩니다. SKT Comm센터 기술정책팀<br>
대시보드: <a href="https://youjinwoong.github.io/radio-policy-ai/">https://youjinwoong.github.io/radio-policy-ai/</a>
</p>
</body></html>'''
    extra_to = 'lampman@sktelecom.com'
    all_to = list({a.strip() for a in (EMAIL_TO + ',' + extra_to).split(',') if a.strip()})

    # Resend API 우선 (GitHub Actions 미국 IP에서도 동작)
    # 도메인 미인증 상태: you.jinwoong@gmail.com으로만 발송 가능
    resend_to = ['you.jinwoong@gmail.com']
    if RESEND_API_KEY:
        _send_via_resend(subject, body_html, resend_to)
    elif all([EMAIL_FROM, EMAIL_PASS, EMAIL_TO]):
        # 폴백: Gmail SMTP (PC 로컬 실행 시)
        _send_via_gmail(subject, body_html, all_to)
    else:
        print('[이메일] RESEND_API_KEY 또는 Gmail 환경변수 미설정 — 건너뜀')


def _send_via_resend(subject: str, body_html: str, all_to: list):
    """Resend API로 이메일 발송 — 미국 IP 차단 없음"""
    payload = {
        'from': '전파정책 AI <onboarding@resend.dev>',
        'to': all_to,
        'subject': subject,
        'html': body_html,
    }
    try:
        resp = requests.post(
            'https://api.resend.com/emails',
            headers={
                'Authorization': f'Bearer {RESEND_API_KEY}',
                'Content-Type': 'application/json',
            },
            data=json.dumps(payload),
            timeout=30,
        )
        if resp.status_code in (200, 201):
            print(f'[이메일/Resend] {", ".join(all_to)} 발송 완료')
        else:
            print(f'[이메일/Resend 오류] HTTP {resp.status_code}: {resp.text[:200]}')
    except Exception as e:
        print(f'[이메일/Resend 오류] {e}')


def _send_via_gmail(subject: str, body_html: str, all_to: list):
    """Gmail SMTP — PC 로컬 실행 전용 폴백"""
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = f'전파정책 AI <{EMAIL_FROM}>'
    msg['To'] = ', '.join(all_to)
    msg.attach(MIMEText(body_html, 'html', 'utf-8'))
    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=30) as smtp:
            smtp.login(EMAIL_FROM, EMAIL_PASS)
            smtp.sendmail(EMAIL_FROM, all_to, msg.as_string())
        print(f'[이메일/Gmail] {", ".join(all_to)} 발송 완료')
    except Exception as e:
        print(f'[이메일/Gmail 오류] {e}')


# ═══════════════════════════════════════════════════════
#  STEP 5.5 — 신규 입법예고 조회 (law_amendments)
# ═══════════════════════════════════════════════════════

def fetch_new_law_announcements() -> list:
    """최근 24h 신규 입법예고(lsAnc) 조회 — law_amendments"""
    cutoff = (datetime.now(KST) - timedelta(hours=24)).isoformat()
    try:
        resp = sb.table('law_amendments') \
            .select('law_nm,ann_type,public_dt,enf_dt,link_url,matched_keywords,summary') \
            .eq('law_type', 'lsAnc') \
            .gte('created_at', cutoff) \
            .execute()
        items = resp.data or []
        print(f'[입법예고] 최근 24h 신규 {len(items)}건')
        return items
    except Exception as e:
        print(f'[입법예고 조회 오류] {e}')
        return []


def _fmt_dt(dt: str) -> str:
    """'20260612' → '2026.06.12'"""
    if dt and len(dt) == 8:
        return f'{dt[:4]}.{dt[4:6]}.{dt[6:]}'
    return dt or '—'


def _format_law_anc_section(items: list) -> str:
    """신규 입법예고 브리핑 섹션 (🔴 → 이메일에서 빨간 박스로 렌더링)"""
    lines = [f'📢 [신규 입법예고] {len(items)}건 — 확인 필요']
    for it in items:
        law_nm = it.get('law_nm', '')
        ann_type = it.get('ann_type', '입법예고')
        public_dt = _fmt_dt(it.get('public_dt', ''))
        enf_dt = _fmt_dt(it.get('enf_dt', ''))
        link = it.get('link_url', '')
        summary = (it.get('summary') or '').strip()
        lines.append(f'🔴 [입법예고] {law_nm}')
        lines.append(f'  → {ann_type} | 예고: {public_dt}~{enf_dt}')
        if summary:
            lines.append(f'  → {summary}')
        if link:
            lines.append(f'  🔗 {link}')
    return '\n'.join(lines)


# ═══════════════════════════════════════════════════════
#  메인
# ═══════════════════════════════════════════════════════

def already_sent_today() -> bool:
    """오늘 브리핑이 이미 발송됐으면 True — 중복 발송 방지"""
    today_date = datetime.now(KST).strftime('%Y-%m-%d')
    try:
        resp = sb.table('daily_briefings').select('briefing_date') \
            .eq('briefing_date', today_date).execute()
        if resp.data:
            print(f'[중복 방지] 오늘({today_date}) 브리핑이 이미 생성·발송됨 — 건너뜀')
            return True
    except Exception as e:
        print(f'[중복 체크 오류] {e}')
    return False


def main():
    now_str = datetime.now(KST).strftime('%Y-%m-%d %H:%M KST')
    print(f'{"="*50}')
    print(f'[모닝 브리핑 시작] {now_str}')
    print(f'{"="*50}')

    # 중복 발송 방지 (daily_crawl과 morning_briefing.yml이 동시에 실행될 경우)
    if already_sent_today():
        return

    # 신규 입법예고 조회 (법제처·opinion.lawmaking.go.kr → law_amendments)
    law_ancs = fetch_new_law_announcements()

    # 본문 확인된 기사 조회
    items = fetch_items_with_content()
    if not items:
        print('[종료] 본문 확인된 기사 없음')
        # 마지막 시도(09시 KST 이후)에도 기사가 없으면 조용히 끝내지 않고 텔레그램으로 알림
        # (이전: 무알림 종료 → 브리핑이 왜 안 왔는지 알 수 없었음)
        if datetime.now(KST).hour >= 9:
            send_telegram('⚠️ 오늘 모닝 브리핑 생략 — 최근 24시간 내 본문 확보된 기사가 없습니다.\n'
                          '(PC가 꺼져 있어 refetch_content.py가 실행되지 않았을 가능성)')
        return

    # 신규 기술 용어 조회 (오늘 추가된 것)
    new_terms = []
    try:
        today_date = datetime.now(KST).strftime('%Y-%m-%d')
        resp = sb.table('tech_terms').select('term,definition') \
            .gte('created_at', today_date) \
            .execute()
        new_terms = resp.data or []
        print(f'[용어] 오늘 신규 {len(new_terms)}건')
    except Exception as e:
        print(f'[용어 조회 오류] {e}')

    # 브리핑 생성
    briefing_text = generate_briefing(items, new_terms)
    if not briefing_text:
        print('[종료] 브리핑 생성 실패')
        return

    # 신규 입법예고 섹션을 브리핑 앞에 삽입 (🔴 → 이메일 빨간 박스)
    if law_ancs:
        briefing_text = _format_law_anc_section(law_ancs) + '\n\n' + briefing_text
        print(f'[입법예고] {len(law_ancs)}건 브리핑 앞에 삽입')

    # 긴급(DB 기준) 기사 SKT 영향 분석 — 저장본에 포함 (이메일·대시보드 공통)
    briefing_text = add_urgent_analyses(items, briefing_text)

    # 저장
    save_briefing(briefing_text, len(items), len(new_terms))

    # news_feed.summary 역저장
    backfill_summaries(briefing_text)

    # 발송용 텍스트 — [ID:...] 태그 제거
    display_text = re.sub(r'\s*\[ID:[^\]]+\]', '', briefing_text)

    # 발송 — 텔레그램은 4000자 제한 때문에 영향 분석 줄 제외
    telegram_text = '\n'.join(l for l in display_text.split('\n') if 'SKT 영향 분석' not in l)
    send_telegram(telegram_text)
    send_email(display_text, len(items))

    print(f'{"="*50}')
    print('[모닝 브리핑 완료]')


if __name__ == '__main__':
    main()
