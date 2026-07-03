#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Confluence 루트 페이지(page_id 1104377342) 이름 변경:
  "전파법 KB"  →  "법령 Knowledge Base"
- 페이지 제목(title)과 본문(storage) 내 "전파법 KB" 문구를 함께 교체.
- 토큰은 코드/명령줄에 넣지 말고 환경변수 CONFLUENCE_TOKEN 으로 전달.
- 토큰 값은 어떤 경우에도 출력하지 않음. 멱등(이미 바뀌었으면 사실상 no-op).

사용:
  python rename_root_page.py            # 미리보기(변경 전/후 제목만 출력, 변경 안 함)
  python rename_root_page.py --go       # 실제 변경
"""
import os, sys, json, ssl, urllib.request, urllib.error, urllib.parse

BASE  = os.environ.get("CONFLUENCE_BASE", "https://confluence.tde.sktelecom.com").rstrip("/")
TOKEN = os.environ.get("CONFLUENCE_TOKEN")
PAGE_ID = "1104377342"
OLD, NEW = "전파법 KB", "법령 Knowledge Base"
GO = "--go" in sys.argv

if not TOKEN:
    sys.exit("ERROR: 환경변수 CONFLUENCE_TOKEN 이 없습니다.")

_ctx = ssl.create_default_context()
if os.environ.get("CONFLUENCE_INSECURE") == "1":
    _ctx.check_hostname = False; _ctx.verify_mode = ssl.CERT_NONE

def api(method, path, body=None):
    req = urllib.request.Request(BASE + path,
        data=(json.dumps(body).encode("utf-8") if body is not None else None), method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
    req.add_header("Accept", "application/json")
    if body is not None:
        req.add_header("Content-Type", "application/json")
        req.add_header("X-Atlassian-Token", "no-check")
    try:
        with urllib.request.urlopen(req, context=_ctx) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        return e.code, {"_error": e.read().decode("utf-8", "replace")[:300]}

st, g = api("GET", f"/rest/api/content/{PAGE_ID}?expand=body.storage,version")
if st != 200:
    sys.exit("ERROR: 페이지 조회 실패 %s :: %s" % (st, g.get("_error", "")))

cur_title = g.get("title", "")
cur_body  = g.get("body", {}).get("storage", {}).get("value", "")
new_title = NEW if cur_title.strip() == OLD or OLD in cur_title else cur_title
new_body  = cur_body.replace(OLD, NEW)

print("현재 제목: %r" % cur_title)
print("변경 제목: %r" % new_title)
print("본문 내 '%s' 치환: %d 곳" % (OLD, cur_body.count(OLD)))

if not GO:
    print("\n(미리보기입니다. 실제 변경하려면:  python rename_root_page.py --go )")
    sys.exit(0)

if new_title == cur_title and new_body == cur_body:
    print("변경할 내용이 없습니다(이미 반영됨).")
    sys.exit(0)

ver = g.get("version", {}).get("number", 1) + 1
body = {"type": "page", "title": new_title, "version": {"number": ver},
        "body": {"storage": {"value": new_body, "representation": "storage"}}}
st2, j2 = api("PUT", f"/rest/api/content/{PAGE_ID}", body)
if st2 >= 300:
    sys.exit("ERROR: 변경 실패 %s :: %s" % (st2, j2.get("_error", "")))
print("완료: 페이지 이름이 '%s' 로 변경되었습니다." % new_title)
