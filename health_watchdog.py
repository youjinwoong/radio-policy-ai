#!/usr/bin/env python3
"""전파정책 외부 헬스 워치독 (GitHub Actions에서 실행 — Supabase와 독립).

목적: 파이프라인이 '조용히' 멈추는 것을 잡는다.
  ① Supabase 데이터 신선도: 뉴스(news_feed) 최신 입력, 오늘자 브리핑 존재
  ② 각 워크플로우의 '마지막 성공 실행'(GitHub Actions run 이력 = heartbeat)
     → 데이터가 안 바뀌어도 '돌았다 vs 안 돌았다'를 정확히 구분(법령·국회처럼 변동이 드문 것도 커버)
이상이 하나라도 있으면 텔레그램으로 경고. 모두 정상이면 조용히 종료(무음).
Supabase가 통째로 다운이면 그 접속 실패 자체도 경고로 발송 → 단일 장애점 커버.

이 스크립트는 GitHub Actions에서 도므로 Supabase와 독립적이다. Supabase 내부의
pg_cron 워치독(check_news_health)과 서로의 사각지대를 덮는다(이중 안전망).

필요 env(모두 GitHub Secrets에 이미 존재): SUPABASE_URL, SUPABASE_SERVICE_KEY,
  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, GITHUB_TOKEN(Actions 자동 제공), GITHUB_REPOSITORY(자동).
표준 라이브러리만 사용(pip 설치 불필요).
"""
import os
import sys
import json
import datetime
import urllib.request
import urllib.error

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
TG_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
TG_CHAT = os.environ["TELEGRAM_CHAT_ID"]
GH_TOKEN = os.environ.get("GITHUB_TOKEN", "")
REPO = os.environ.get("GITHUB_REPOSITORY", "youjinwoong/radio-policy-ai")

NOW = datetime.datetime.now(datetime.timezone.utc)
KST = datetime.timezone(datetime.timedelta(hours=9))


def http_get_json(url, headers):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def hours_since(iso):
    """ISO8601 문자열로부터 현재까지 경과 시간(시간)."""
    s = (iso or "").replace("Z", "+00:00")
    dt = datetime.datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return (NOW - dt).total_seconds() / 3600.0


problems = []

# ── ① Supabase 데이터 신선도 (접속 실패 시 그 자체가 경고) ──
sb_headers = {"apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY}
try:
    rows = http_get_json(
        SUPABASE_URL + "/rest/v1/news_feed?select=created_at&order=created_at.desc&limit=1",
        sb_headers,
    )
    if not rows:
        problems.append("news_feed가 비어 있음")
    else:
        h = hours_since(rows[0]["created_at"])
        if h >= 14:
            problems.append("뉴스 수집이 %.1f시간째 멈춤" % h)

    today_kst = datetime.datetime.now(KST).date().isoformat()
    br = http_get_json(
        SUPABASE_URL + "/rest/v1/daily_briefings?select=briefing_date&briefing_date=eq." + today_kst,
        sb_headers,
    )
    if not br:
        problems.append("오늘(%s) 모닝 브리핑 미생성" % today_kst)
except Exception as e:  # 접속 불가 = Supabase 다운 의심
    problems.append("⛔ Supabase 접속 불가: %s" % e)

# ── ② GitHub Actions 워크플로우별 마지막 성공 실행(heartbeat) ──
gh_headers = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "radiopolicy-watchdog",
    "X-GitHub-Api-Version": "2022-11-28",
}
if GH_TOKEN:
    gh_headers["Authorization"] = "Bearer " + GH_TOKEN

# 워크플로우 파일 : 마지막 성공 이후 허용 시간(시간)
checks = {
    "daily_crawl.yml": 14,        # 매시간 도므로 14h 이상 무성공이면 이상
    "morning_briefing.yml": 26,   # 하루 1회 → 26h
    "law_crawl.yml": 26,          # 하루 1회
    "assembly_crawl.yml": 26,     # 하루 1회
}
for wf, thresh in checks.items():
    try:
        data = http_get_json(
            "https://api.github.com/repos/%s/actions/workflows/%s/runs?status=success&per_page=1" % (REPO, wf),
            gh_headers,
        )
        runs = data.get("workflow_runs", [])
        if not runs:
            problems.append("%s 성공 실행 기록 없음" % wf)
        else:
            h = hours_since(runs[0]["created_at"])
            if h >= thresh:
                problems.append("%s 마지막 성공 %.1f시간 전 (임계 %dh)" % (wf, h, thresh))
    except Exception as e:
        problems.append("%s 실행 이력 확인 실패: %s" % (wf, e))

# ── ③ 결과 → 텔레그램(이상 있을 때만, 정상이면 무음) ──
if problems:
    msg = "⚠️ [전파정책 헬스 워치독] 이상 감지 (%s KST):\n- %s" % (
        datetime.datetime.now(KST).strftime("%m-%d %H:%M"),
        "\n- ".join(problems),
    )
    body = json.dumps({"chat_id": TG_CHAT, "text": msg}).encode("utf-8")
    req = urllib.request.Request(
        "https://api.telegram.org/bot%s/sendMessage" % TG_TOKEN,
        data=body,
        headers={"Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(req, timeout=20)
        print("[워치독] 경고 발송:", problems)
    except Exception as e:
        print("[워치독] 텔레그램 발송 실패:", e)
        sys.exit(1)
else:
    print("[워치독] 모든 파이프라인 정상")
