# -*- coding: utf-8 -*-
"""
오늘 아침 브리핑 수동 발송 스크립트 (2026-05-29)
아래 [설정] 부분에 값을 채우고 실행하세요.
"""

import smtplib
import requests
from datetime import datetime, timezone, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

# ═══════════════════════════════════════════════════
#  [설정] 여기에 값을 입력하세요
# ═══════════════════════════════════════════════════
EMAIL_FROM  = ""          # 발신 Gmail  예: you@gmail.com
EMAIL_PASS  = ""          # Gmail 앱 비밀번호
EMAIL_TO    = "you.jinwoong@gmail.com,lampman@sktelecom.com"
TELEGRAM_BOT_TOKEN = ""  # GitHub Secrets의 TELEGRAM_BOT_TOKEN 값
TELEGRAM_CHAT_ID   = ""  # GitHub Secrets의 TELEGRAM_CHAT_ID 값
# ═══════════════════════════════════════════════════

KST = timezone(timedelta(hours=9))

# ── 오늘 수집된 기사 (Supabase 직접 조회 결과) ────────────────
MORNING_ITEMS = [
    {"title": "버스 공공와이파이에 5G 기반 '와이파이7' 도입", "source": "정보통신신문",
     "category": "ITU·WRC", "url": "https://www.koit.co.kr/news/articleView.html?idxno=207344",
     "urgency": "보통", "importance": "보통"},
    {"title": "Amazon, FCC에 글로벌스타 스펙트럼이 D2D 시장 경쟁에 필수라고 주장", "source": "Broadband Breakfast",
     "category": "위성", "url": "https://broadbandbreakfast.com/amazon-to-fcc-globalstar-spectrum-necessary-to-compete-in-d2d-market/",
     "urgency": "참고", "importance": "참고"},
    {"title": "6G: The next gen of wireless tech nobody's ready to pay for", "source": "The Register",
     "category": "기술", "url": "https://www.theregister.com/networks/2026/05/27/6g-the-next-gen-of-wireless-tech-nobodys-ready-to-pay-for/5246136",
     "urgency": "참고", "importance": "참고"},
    {"title": "Juniper Research Predicts the US and South Korea Will Lead 6G Launches in 2029", "source": "Telecom Reseller",
     "category": "기술", "url": "https://telecomreseller.com/2026/05/26/juniper-research-predicts-the-us-and-south-korea-will-lead-6g-launches-in-2029/",
     "urgency": "참고", "importance": "참고"},
    {"title": "인도네시아, 5년 만에 4G/5G 주파수 경매 추진", "source": "PolicyTracker",
     "category": "정책", "url": "https://www.policytracker.com/indonesia-to-auction-4g-and-5g-spectrum-at-last/",
     "urgency": "참고", "importance": "참고"},
    {"title": "Forecast: US and South Korea will lead 6G launches in 2029", "source": "Advanced Television",
     "category": "기술", "url": "https://www.advanced-television.com/2026/05/26/forecast-us-and-south-korea-will-lead-6g-launches-in-2029/",
     "urgency": "참고", "importance": "참고"},
    {"title": "Juniper Research Sees First 6G Connections in 2029, Led by US and South Korea", "source": "IoT Business News",
     "category": "기술", "url": "https://iotbusinessnews.com/2026/05/26/juniper-research-sees-first-6g-connections-in-2029-led-by-us-and-south-korea/",
     "urgency": "참고", "importance": "참고"},
    {"title": "KTR, EU 사이버보안 규제대응 지원체계 구축", "source": "중앙일보",
     "category": "정보통신망", "url": "https://www.joongang.co.kr/article/25423749",
     "urgency": "보통", "importance": "보통"},
    {"title": "삼성전자, 세계 최초 HBM4E 12단 샘플 출하…최대 16Gbps 구현", "source": "ZDNet Korea",
     "category": "ITU·WRC", "url": "https://zdnet.co.kr/view/?no=20260529083005",
     "urgency": "참고", "importance": "참고"},
]


def send_email(items):
    if not all([EMAIL_FROM, EMAIL_PASS]):
        print("[이메일] ❌ EMAIL_FROM / EMAIL_PASS 값을 스크립트 상단에 입력해주세요.")
        return

    today = datetime.now(KST).strftime('%Y.%m.%d')
    subject = f"[전파정책 AI] {today} 신규 {len(items)}건 — 확인 필요"

    by_cat = {}
    for item in items:
        by_cat.setdefault(item.get("category", "기타"), []).append(item)

    cat_icons = {
        "주파수": "📶", "전자파": "⚡", "기술기준": "📋",
        "ITU·WRC": "🌐", "전기통신사업": "📡", "정보통신망": "🔒", "기타": "📌",
        "기술": "💡", "위성": "🛰️", "정책": "📜"
    }

    rows_html = ""
    for cat, cat_items in by_cat.items():
        icon = cat_icons.get(cat, "📌")
        rows_html += f'<h3 style="color:#1a1a1a;margin:20px 0 8px">{icon} {cat} ({len(cat_items)}건)</h3><ul style="padding-left:20px">'
        for item in cat_items:
            urgency_badge = ""
            if item.get("urgency") == "긴급":
                urgency_badge = ' <span style="background:#fed7d7;color:#c53030;padding:1px 6px;border-radius:3px;font-size:11px">긴급</span>'
            elif item.get("urgency") == "보통":
                urgency_badge = ' <span style="background:#fefcbf;color:#975a16;padding:1px 6px;border-radius:3px;font-size:11px">보통</span>'
            rows_html += f'<li style="margin-bottom:10px"><a href="{item["url"]}" style="color:#534AB7;font-weight:500">{item["title"]}</a>{urgency_badge}<br><small style="color:#999">{item["source"]}</small></li>'
        rows_html += "</ul>"

    body_html = f"""
<html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
<h2 style="color:#534AB7">전파정책 전문가 AI — 일일 모니터링 리포트</h2>
<p style="color:#666">{today} | 신규 항목 <strong>{len(items)}건</strong> (어제~오늘 수집분)</p>
<hr>{rows_html}<hr>
<p style="color:#999;font-size:12px">
이 메일은 자동 발송됩니다. SKT CR센터 기술정책팀<br>
대시보드: <a href="https://youjinwoong.github.io/radio-policy-ai/">https://youjinwoong.github.io/radio-policy-ai/</a>
</p>
</body></html>"""

    all_to = [a.strip() for a in EMAIL_TO.split(",") if a.strip()]
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"전파정책 AI <{EMAIL_FROM}>"
    msg["To"] = ", ".join(all_to)
    msg.attach(MIMEText(body_html, "html", "utf-8"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as smtp:
            smtp.login(EMAIL_FROM, EMAIL_PASS)
            smtp.sendmail(EMAIL_FROM, all_to, msg.as_string())
        print(f"✅ [이메일] {', '.join(all_to)} 발송 완료")
    except Exception as e:
        print(f"❌ [이메일 오류] {e}")


def send_telegram(items):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("[텔레그램] ❌ TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 값을 스크립트 상단에 입력해주세요.")
        return

    today = datetime.now(KST).strftime("%Y.%m.%d")
    urgent = [i for i in items if i.get("urgency") == "긴급"]
    normal = [i for i in items if i.get("urgency") == "보통"]
    ref    = [i for i in items if i.get("urgency") == "참고"]

    lines = [f"☀️ *[전파정책 AI] {today} 아침 브리핑* — 신규 {len(items)}건\n"]
    for label, icon, group in [("긴급", "🔴", urgent), ("보통", "🟡", normal), ("참고", "🟢", ref)]:
        if group:
            lines.append(f"{icon} *{label} {len(group)}건*")
            for item in group[:5]:
                lines.append(f"  · {item['title']} ({item['source']})")
            lines.append("")

    lines.append("📊 대시보드: https://youjinwoong.github.io/radio-policy-ai/")

    api_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        resp = requests.post(api_url, json={
            "chat_id": TELEGRAM_CHAT_ID,
            "text": "\n".join(lines),
            "parse_mode": "Markdown",
            "disable_web_page_preview": True,
        }, timeout=15)
        if resp.status_code == 200:
            print(f"✅ [텔레그램] {len(items)}건 브리핑 발송 완료")
        else:
            print(f"❌ [텔레그램 오류] HTTP {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        print(f"❌ [텔레그램 오류] {e}")


if __name__ == "__main__":
    print(f"[조회] 오늘 기사 {len(MORNING_ITEMS)}건 준비됨")
    print("\n--- 이메일 발송 ---")
    send_email(MORNING_ITEMS)
    print("\n--- 텔레그램 발송 ---")
    send_telegram(MORNING_ITEMS)
    print("\n완료")
