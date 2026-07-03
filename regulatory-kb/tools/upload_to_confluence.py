#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
regulatory-kb → Confluence 업로더 (토큰 기반, 브라우저 불필요)

토큰은 코드/명령줄에 넣지 말고 환경변수로 전달하세요:
  - CONFLUENCE_TOKEN : Confluence Data Center Personal Access Token (필수)
  - CONFLUENCE_BASE  : 기본 https://confluence.tde.sktelecom.com (선택)
  - CONFLUENCE_INSECURE=1 : 사내 인증서 검증 실패 시에만 사용(선택)

사용법:
  # 1) 무엇을 올릴지 미리보기(아무 것도 바꾸지 않음)
  python upload_to_confluence.py
  # 2) 실제 업로드(생성/갱신)
  python upload_to_confluence.py --go

동작:
  - manifest.json을 읽어 각 concept .md를 해당 도메인/법령 버킷 하위 페이지로 생성.
  - 제목으로 기존 페이지를 먼저 검색 → 있으면 update, 없으면 create (중복 방지).
  - frontmatter를 페이지 규약(owner_team/status/review_cycle/source_page_id/source_url)으로 변환.
  - 마크다운 → Confluence storage format 변환(표/코드블록/목록/링크 포함).
  - 토큰 값은 어떤 경우에도 출력하지 않음.
"""
import os, sys, json, re, ssl, urllib.request, urllib.error, urllib.parse

BASE   = os.environ.get("CONFLUENCE_BASE", "https://confluence.tde.sktelecom.com").rstrip("/")
TOKEN  = os.environ.get("CONFLUENCE_TOKEN")
SPACE  = "~1108400"
GO     = "--go" in sys.argv
HERE   = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(HERE)              # regulatory-kb/
MANIFEST = os.path.join(ROOT_DIR, "manifest.json")

# --- 확인된 기존 Confluence 구조(ID) ---
DOMAIN_PARENT = "1107015133"   # 01.도메인
BUCKET = {
    "radio_law":   "1104378045",  # 전파 > 법령
    "radio_proc":  "1107015435",  # 전파 > 절차
    "tel_law":     "1107015572",  # 전기통신사업 > 전기통신사업 - 법령
    "tel_proc":    "1107015636",  # 전기통신사업 > 전기통신사업 - 절차
    "common_term": "1107015479",  # 02.공통 > 공통 용어
}
NEW_DOMAINS = {   # 신규 도메인 컨테이너(없으면 생성) → 그 아래 '법령' 버킷 생성
    "laws/network-act/":                        "정보통신망",
    "laws/broadcasting-telecom-development-act/":"방송통신발전",
    "laws/telecom-facility-standards/":         "방송통신설비 기술기준",
    "laws/device-technical-standards/":         "단말장치 기술기준",
    "laws/information-infrastructure/":         "정보통신기반보호",
    "laws/ict-industry-promotion-act/":         "정보통신산업",
    "laws/charge-management-act/":              "부담금관리",
    "laws/national-finance-act/":               "국가재정",
    "laws/national-accounting-act/":            "국가회계",
    "laws/government-organization-act/":        "정부조직",
}

if not TOKEN:
    sys.exit("ERROR: 환경변수 CONFLUENCE_TOKEN 이 없습니다. (토큰을 코드에 넣지 말고 환경변수로 설정하세요)")

_ctx = ssl.create_default_context()
if os.environ.get("CONFLUENCE_INSECURE") == "1":
    _ctx.check_hostname = False
    _ctx.verify_mode = ssl.CERT_NONE

def api(method, path, body=None):
    url = BASE + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)   # 토큰은 여기서만 사용, 출력 안 함
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
        req.add_header("X-Atlassian-Token", "no-check")
    try:
        with urllib.request.urlopen(req, context=_ctx) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", "replace")[:300]
        return e.code, {"_error": msg}

def list_children(pid):
    out, start = [], 0
    while True:
        st, j = api("GET", f"/rest/api/content/{pid}/child/page?limit=100&start={start}")
        if st != 200: break
        out += [(p["id"], p["title"]) for p in j.get("results", [])]
        if j.get("size", 0) < 100: break
        start += 100
    return out

def find_child(pid, title):
    for cid, ct in list_children(pid):
        if ct.strip() == title.strip():
            return cid
    return None

def find_in_space(title):
    """공간 전체에서 제목으로 페이지 검색(Server/DC는 제목이 공간 내 유일).
    반환 id로 update_page 하면 ancestors가 바뀌어 잘못 놓인 페이지도 올바른 부모로 이동됨."""
    q = urllib.parse.quote(title)
    st, j = api("GET", f"/rest/api/content?spaceKey={urllib.parse.quote(SPACE)}&title={q}&type=page&limit=10")
    if st == 200:
        for r in j.get("results", []):
            if r.get("title", "").strip() == title.strip():
                return r.get("id")
    return None

def create_page(title, parent, storage):
    body = {"type": "page", "title": title, "space": {"key": SPACE},
            "ancestors": [{"id": str(parent)}],
            "body": {"storage": {"value": storage, "representation": "storage"}}}
    st, j = api("POST", "/rest/api/content", body)
    return st, j

def update_page(pid, title, parent, storage):
    st, g = api("GET", f"/rest/api/content/{pid}?expand=version")
    ver = (g.get("version", {}).get("number", 1) + 1) if st == 200 else 2
    body = {"type": "page", "title": title, "space": {"key": SPACE},
            "ancestors": [{"id": str(parent)}], "version": {"number": ver},
            "body": {"storage": {"value": storage, "representation": "storage"}}}
    return api("PUT", f"/rest/api/content/{pid}", body)

_domain_cache = {}
def find_or_create(title, parent):
    key = (parent, title)
    if key in _domain_cache:
        return _domain_cache[key]
    cid = find_child(parent, title)
    if not cid:
        if not GO:
            _domain_cache[key] = "(new)"
            return "(new)"
        st, j = create_page(title, parent, "<p></p>")
        cid = j.get("id")
    _domain_cache[key] = cid
    return cid

RADIO_SUB = {
    "laws/radio-act/spectrum-notices/":     "주파수 행정규칙",
    "laws/radio-act/wireless-notices/":     "무선 행정규칙",
    "laws/radio-act/conformity-assessment/":"적합성평가 행정규칙",
    "laws/radio-act/emf-notices/":          "전자파 행정규칙",
    "laws/radio-act/radio-admin-notices/":  "전파관리 행정규칙",
}

def resolve_parent(path):
    if path.startswith("laws/radio-act/"):
        for pfx, title in RADIO_SUB.items():   # 클러스터별 하위 컨테이너(전파>법령 아래)
            if path.startswith(pfx):
                sub = find_or_create(title, BUCKET["radio_law"])
                return sub if sub != "(new)" else "(신규 하위: 전파>법령>%s)" % title
        return BUCKET["radio_law"]             # 전파법 본법/시행령/시행규칙/notices
    if path.startswith("laws/telecom-business-act/"):return BUCKET["tel_law"]
    if path == "glossary/terms.md":                  return BUCKET["common_term"]
    if path.startswith("procedures/"):               return BUCKET["tel_proc"]
    for prefix, dom in NEW_DOMAINS.items():
        if path.startswith(prefix):
            dom_id = find_or_create(dom, DOMAIN_PARENT)
            bucket_title = dom + " - 법령"   # Server/DC는 공간 내 제목 유일 → '법령' 단독명 충돌 회피
            if dom_id == "(new)":  # dry-run: 도메인 미존재
                return "(신규: %s / %s)" % (dom, bucket_title)
            return find_or_create(bucket_title, dom_id)
    return None

# ---------- markdown -> Confluence storage ----------
def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def inline(s):
    s = esc(s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    def link(m):
        t, u = m.group(1), m.group(2)
        return '<a href="%s">%s</a>' % (u, t) if re.match(r"https?:", u) else t
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link, s)
    return s

def cdata(t):
    return "<![CDATA[" + t.replace("]]>", "]]&gt;") + "]]>"

def md2storage(md):
    md = md.replace("\r", "")
    fm, body = None, md
    if md.startswith("---"):
        e = md.find("\n---", 3)
        if e >= 0:
            fm = md[3:e].lstrip("\n")
            body = md[e + 4:].lstrip("\n")
    L = body.split("\n")
    out, i = [], 0
    if fm is not None:
        out.append('<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">yaml</ac:parameter>'
                   '<ac:plain-text-body>' + cdata(fm) + '</ac:plain-text-body></ac:structured-macro>')
    def stop(s):
        return (s.strip() == "" or re.match(r"#{1,6}\s", s) or s.startswith("```")
                or re.match(r"\s*[-*]\s+", s) or re.match(r"\s*\d+\.\s+", s)
                or re.match(r"\s*\|.*\|\s*$", s) or re.match(r"\s*>\s?", s))
    while i < len(L):
        ln = L[i]
        if ln.startswith("```"):
            lang = ln[3:].strip(); buf = []; i += 1
            while i < len(L) and not L[i].startswith("```"): buf.append(L[i]); i += 1
            i += 1
            p = ('<ac:parameter ac:name="language">%s</ac:parameter>' % lang) if lang else ""
            out.append('<ac:structured-macro ac:name="code">%s<ac:plain-text-body>%s</ac:plain-text-body></ac:structured-macro>'
                       % (p, cdata("\n".join(buf))))
            continue
        h = re.match(r"(#{1,6})\s+(.*)$", ln)
        if h:
            lv = len(h.group(1)); out.append("<h%d>%s</h%d>" % (lv, inline(h.group(2)), lv)); i += 1; continue
        if re.match(r"\s*\|.*\|\s*$", ln) and i + 1 < len(L) and re.match(r"\s*\|[\s:|-]+\|\s*$", L[i+1]):
            hd = [c.strip() for c in ln.strip().strip("|").split("|")]
            i += 2; rows = []
            while i < len(L) and re.match(r"\s*\|.*\|\s*$", L[i]):
                rows.append([c.strip() for c in L[i].strip().strip("|").split("|")]); i += 1
            t = "<table><tbody><tr>" + "".join("<th>%s</th>" % inline(c) for c in hd) + "</tr>"
            for r in rows:
                t += "<tr>" + "".join("<td>%s</td>" % inline(c) for c in r) + "</tr>"
            t += "</tbody></table>"; out.append(t); continue
        if re.match(r"\s*[-*]\s+", ln):
            buf = []
            while i < len(L) and re.match(r"\s*[-*]\s+", L[i]):
                buf.append(re.sub(r"^\s*[-*]\s+", "", L[i])); i += 1
            out.append("<ul>" + "".join("<li>%s</li>" % inline(x) for x in buf) + "</ul>"); continue
        if re.match(r"\s*\d+\.\s+", ln):
            buf = []
            while i < len(L) and re.match(r"\s*\d+\.\s+", L[i]):
                buf.append(re.sub(r"^\s*\d+\.\s+", "", L[i])); i += 1
            out.append("<ol>" + "".join("<li>%s</li>" % inline(x) for x in buf) + "</ol>"); continue
        if re.match(r"\s*>\s?", ln):
            buf = []
            while i < len(L) and re.match(r"\s*>\s?", L[i]):
                buf.append(re.sub(r"^\s*>\s?", "", L[i])); i += 1
            out.append("<blockquote><p>" + "<br/>".join(inline(x) for x in buf) + "</p></blockquote>"); continue
        if re.match(r"\s*(-{3,}|\*{3,})\s*$", ln):
            out.append("<hr/>"); i += 1; continue
        if ln.strip() == "":
            i += 1; continue
        buf = [ln]; i += 1
        while i < len(L) and not stop(L[i]): buf.append(L[i]); i += 1
        out.append("<p>" + "<br/>".join(inline(x) for x in buf) + "</p>")
    return "\n".join(out)

# ---------- frontmatter 변환(페이지 규약) ----------
def parse_fm(md):
    if not md.startswith("---"): return {}, md
    e = md.find("\n---", 3)
    if e < 0: return {}, md
    raw = md[3:e].lstrip("\n"); body = md[e+4:].lstrip("\n")
    d = {}
    for line in raw.split("\n"):
        m = re.match(r"([A-Za-z_]+):\s?(.*)$", line)
        if m: d[m.group(1)] = m.group(2)
    return d, body

def review_cycle(law_type):
    return "annual" if law_type in ("법률", "대통령령", "과학기술정보통신부령") else "quarterly"

def build_md(entry, src_md, page_id, page_url):
    d, body = parse_fm(src_md)
    status = "deprecated" if entry.get("status") == "superseded" else "active"
    fm = []
    fm.append("type: %s" % (d.get("type") or entry.get("concept_type", "")))
    fm.append("title: %s" % (d.get("title") or entry.get("title", "")))
    if d.get("description"): fm.append("description: %s" % d["description"])
    fm.append("tags: %s" % (d.get("tags") or "[regulation]"))
    fm.append("timestamp: %s" % (d.get("timestamp") or "2026-07-02T00:00:00Z"))
    fm.append("owner_team: 기술정책팀")
    fm.append("status: %s" % status)
    fm.append("review_cycle: %s" % review_cycle(entry.get("law_type", "")))
    fm.append("source_page_id: %s" % (page_id or ""))
    fm.append("source_url: %s" % (page_url or ""))
    # 법령 메타(확장 유지)
    for k in ("law_type", "law_number", "enforcement_date", "competent_authority"):
        v = d.get(k) or entry.get(k)
        if v: fm.append("%s: %s" % (k, v))
    if d.get("resource"): fm.append("original_pdf: %s" % d["resource"])
    if entry.get("superseded_by"): fm.append("superseded_by: %s" % entry["superseded_by"])
    return "---\n" + "\n".join(fm) + "\n---\n\n" + body

# ---------- main ----------
def main():
    man = json.load(open(MANIFEST, encoding="utf-8"))
    entries = man["entries"]
    print("=== regulatory-kb → Confluence %s ===" % ("(GO)" if GO else "(DRY-RUN: --go 를 붙이면 실제 업로드)"))
    print("BASE=%s  SPACE=%s  대상=%d건\n" % (BASE, SPACE, len(entries)))
    done = 0; created = 0; updated = 0; skipped = 0
    for e in entries:
        path = e["path"]; title = e["title"]
        parent = resolve_parent(path)
        if not parent:
            print("  [SKIP] 매핑없음: %s" % path); skipped += 1; continue
        fpath = os.path.join(ROOT_DIR, path.replace("/", os.sep))
        if not os.path.exists(fpath):
            print("  [SKIP] 파일없음: %s" % path); skipped += 1; continue
        src = open(fpath, encoding="utf-8").read()
        if not GO:
            print("  [PLAN] '%s'  →  parent=%s" % (title, parent)); done += 1; continue
        # 중복 검사: 공간 전체에서 제목으로 조회(있으면 update=이동, 없으면 create)
        existing = find_in_space(title)
        # 1차: 본문 생성(placeholder id) → 2차: id/url 주입 update
        tmp_storage = md2storage(build_md(e, src, existing or "", ""))
        if existing:
            st, j = update_page(existing, title, parent, tmp_storage); pid = existing
        else:
            st, j = create_page(title, parent, tmp_storage); pid = j.get("id")
        if st >= 300 or not pid:
            print("  [FAIL %s] %s :: %s" % (st, title, j.get("_error", "")[:160])); skipped += 1; continue
        purl = BASE + (j.get("_links", {}).get("webui", "") or ("/pages/viewpage.action?pageId=%s" % pid))
        # 2차: source_page_id/url 주입
        final_storage = md2storage(build_md(e, src, pid, purl))
        st2, j2 = update_page(pid, title, parent, final_storage)
        tag = "UPDATED" if existing else "CREATED"
        if existing: updated += 1
        else: created += 1
        print("  [%s] %s  (id=%s)" % (tag, title, pid))
        done += 1
    print("\n완료: 처리 %d, 생성 %d, 갱신 %d, 스킵 %d" % (done, created, updated, skipped))
    if not GO:
        print("\n(미리보기였습니다. 실제 업로드하려면:  python upload_to_confluence.py --go )")

if __name__ == "__main__":
    main()
