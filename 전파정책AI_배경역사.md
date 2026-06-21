# 전파정책 AI — 배경·역사 지식 문서

> 운영 핵심 지침(`전파정책AI_지침_운영핵심.md`)의 각 규칙·설계가 **왜·언제·어떤 사고로** 그렇게 됐는지의 상세 기록.
> 지침의 가드레일(한 줄 이유)과 어긋나지 않게 유지할 것. 지침을 갱신할 때 이 문서도 함께 갱신한다.

---

## 1. GitHub cron 드롭과 Supabase pg_cron 전환 (2026-06-15 ~ 06-17)

**문제**: GitHub Actions 예약(cron)은 best-effort라 부하 시 지연되거나 통째로 누락됨. 특히 UTC 자정 부근(22~00 UTC = 07~09시 KST)이 최악이고, UTC 00~11시 낮 블록이 통째 드롭된 사례도 있음(2026-06-15). 이로 인해 크롤·법령·국회·브리핑이 며칠씩 누락/지연됨.

**대응**: Supabase pg_cron을 **안정적 주 트리거**로 전환하고 GitHub cron은 백업으로만 둠.
- 뉴스 크롤: pg_cron `crawl-trigger-hourly`(jobid 9)가 매시 :47에 24시간 `daily_crawl.yml` dispatch. GitHub cron은 `17 * * * *`(매시 :17) 백업. 둘 다 떠도 크롤러가 deleted_news·중복 스킵으로 중복 저장 안 함.
- 국회·법령: GitHub 정시(UTC 01:00/02:00) 30분 뒤 pg_cron(jobid 10·11)이 KST 10:30/11:30 백업 dispatch. upsert+변경시 알림이라 겹쳐도 중복 없음.
- 공용 함수 `dispatch_github_workflow(p_workflow)`가 Vault `github_pat`으로 pg_net dispatch. PAT은 fine-grained(repo: radio-policy-ai, Actions: Read+Write). 의존 확장: pg_cron, pg_net, supabase_vault.
- ⚠️ PAT 만료/회수 시 모든 트리거가 조용히 멈춤 → Vault `github_pat` 갱신. 잡 조회 `select * from cron.job`, 삭제 `select cron.unschedule('잡이름')`.

**백업 슬롯을 :17에 둔 이유**: 정시(:00)·15분 단위(:15/:30/:45)는 전 세계 cron 혼잡대라 드롭 확률↑. 한산한 :17 유지(2026-06-15).

**분 튜닝 한계**: 분(minute) 튜닝은 단발 누락 확률만 낮출 뿐 블록 단위 드롭은 못 막음 → 미축적 시 "Run workflow" 수동 실행 또는 PC 로컬 보완이 정답.

---

## 2. 모닝 브리핑 트리거 설계 (06:05/06:20 오프셋 이유) (2026-06-15 ~ 06-17)

**cron 이동**: 23~00 UTC(=08~09시 KST)는 GitHub cron 최혼잡 구간이라 드롭 잦음 → 한산한 21 UTC대(=06:00/06:30 KST)로 이동(2026-06-15). 유튜브 요약(04~05시)이 정시에 잘 뜨는 것과 같은 이유.

**왜 06:00이 아니라 06:05에 조건부 트리거하나** (briefing-trigger-0605, jobid 8): 함수 `trigger_briefing_if_missing()`가 오늘자(KST) `daily_briefings` 행이 없으면 `morning_briefing.yml`을 dispatch.
- 06:00 정각에 Supabase와 GitHub cron이 동시에 쏘면 둘 다 행 생성 전이라 GitHub 성공/드롭 구분이 안 되고 중복 run이 돔.
- 06:05 오프셋이면 GitHub 06:00 run이 살아있을 때 그 사이 행이 생겨 Supabase는 건너뜀(중복 run 없음 + "GitHub 정상" 신호). 드롭됐을 때만 Supabase가 발송(~06:07)하고 그게 곧 "GitHub 드롭" 신호가 됨.
- 발송은 사실상 정시(≤06:07). GitHub cron도 그대로 두며 `already_sent_today`가 이중 발송 차단.
- briefing-trigger-0620(jobid 7)은 여전히 없으면 06:20 재시도. 09:40 로컬 백업(RadioPolicy-BriefingBackup)도 유지.
- 08:05 Actions 백업('5 23' 슬롯)은 2026-06-17 제거 — Supabase 06:05가 대체.

---

## 3. 무음 실패 감시 (watchdog) 설계 (2026-06-17)

파이프라인이 **에러 없이 조용히 멈추는 것**(GitHub 드롭·Supabase 다운·PAT 회수·크롤러 크래시)을 잡는 이중 안전망. 정상이면 무음, 이상 시에만 텔레그램(chat 344506450).

- **내부 워치독 `check_news_health()`** (pg_cron jobid 12, KST 21:00): Supabase 안에서 news_feed 최신 입력 확인 → 14시간+ 멈추면 텔레그램. 직접 DB 쿼리라 가볍고 확실.
- **외부 워치독 `health_watchdog.py` + health_watchdog.yml** (KST 21:30 GitHub cron + jobid 13이 21:35 백업 dispatch): GitHub Actions에서 도므로 Supabase와 독립.
  - Supabase REST로 뉴스 신선도·오늘자 브리핑 확인(접속 실패 시 "Supabase 접속 불가").
  - GitHub Actions API로 각 워크플로우의 마지막 성공 실행 확인(heartbeat 대용). 임계: daily_crawl 14h, 나머지 26h.
  - 인증: GitHub Secrets + Actions 자동 GITHUB_TOKEN(actions:read). stdlib만(pip 불필요).
- **상호 보완**: 내부(Supabase)·외부(GitHub) 독립이라 한쪽 인프라가 죽어도 다른 쪽이 감지. 둘 다 죽으면 사각.
- ⚠️ 텔레그램 토큰은 Vault `telegram_bot_token` 한 곳에서 관리(회수·교체 시 Vault만 갱신). 기존 `check_briefing_health`만 아직 토큰 하드코딩 — 추후 Vault 이관 권장.

---

## 4. 뉴스 수집 — 네이버 OpenAPI 전환 (2026-06-16)

**사고**: `crawl_naver_news`의 구 HTML 스크래핑(search.naver.com, ul.list_news li.bx / a.news_tit)이 검색 구조 변경/해외 IP 차단으로 **0건 회귀(에러 없이)** → 며칠간 뉴스 미축적.

**해결**: 공식 검색 OpenAPI(openapi.naver.com/v1/search/news.json, sort=date)로 교체. NAVER_CLIENT_ID/SECRET 필요(.env·GitHub Secrets). 키 미설정·오류 시 빈 결과 → Google RSS 폴백.

**점검 포인트**: 로그 "[네이버 뉴스] N건 수집". N=0이면 키 누락·만료 또는 폴백만 도는 상태(이 사고 패턴). Google RSS만으론 신규가 거의 안 쌓일 수 있음.

---

## 5. 입법예고 수집 방식 전환 (2026-06-16)

**배경**: 기존 lsNm(제명) 키워드 검색은 "법령 제명에 키워드가 그대로 든 경우"만 잡혀, "방송법 시행령 일부개정"(방송미디어통신위) 같은 관련 예고를 통째로 놓쳤고, 마침 제명 일치 건이 없으면 0건이 돼 lsAnc가 장기간 비어 있었음.

**전환**: 진행 중 입법예고 전체 목록을 pageIndex 단위로 끝까지 스캔(빈 페이지 종료, 상한 OPINION_MAX_PAGES=20) 후 `_opinion_match()`로 선별.
- 직제·소속기관·정원·청사는 제명에 있으면 우선 제외(조직 개편).
- 제명 앞 "○○부/처/청/위원회 소관" 접두사 제거 후 키워드 판정 — **소관 부처명 '과학기술정보통신부'의 '정보통신' 글자가 비상대비법 등 무관 법령을 오탐하던 문제 차단**.
- 제명 키워드: 전파·주파수·전기통신·방송통신·무선·전자파·적합성평가·정보통신·이동통신·기간통신·위성·단말장치·기지국·스펙트럼.
- 소관부처 보강: 방송미디어통신위·방송통신위 소관은 키워드 없어도 포함 / 과기정통부는 통신계열 힌트가 제명에 있을 때만.

**요약 자동 생성**: backfill_opinion_summaries()가 상세 페이지(개정이유+주요내용) → Haiku 1~2문장 요약 → law_amendments.summary. law.go.kr DRF는 입법예고 미지원이라 summarize_law_amendments.py가 lsAnc를 건너뜀 → gov_notice_crawler가 요약까지 단독 담당. 대시보드 카드·브리핑 📢 섹션이 이 summary 표시.

**로컬 유지 이유**: 정부 사이트 해외 IP 차단 위험 + 한국 IP 안정성 → 17:00 Windows 스케줄러. PC 꺼지면 그날 미수집(GitHub Actions로 대체 불가).

---

## 6. 본문 수집 (fetch_article_body) 우회 장치 (2026-06-14)

- **rra.go.kr 등 정부 게시판 trafilatura 우선**: 본문이 table 구조라 일반 'article' 셀렉터가 페이지 전체 네비게이션을 오탐하던 문제 회피(include_tables=True).
- **SSL 약점 우회 _http_get**: DH_KEY_TOO_SMALL 발생 시 SECLEVEL=1 어댑터(_WeakDHAdapter)로 **도메인 무관** 자동 재시도. rra.go.kr는 _KNOWN_WEAK_DH 등록 → 처음부터 어댑터+EUC-KR. (rra.go.kr 전용으로 되돌리지 말 것.)
- 별개 원인(우회 대상 아님): 403 Forbidden(investing.com 등 봇 차단), SSLV3_ALERT_HANDSHAKE_FAILURE(kbench.com), CERTIFICATE_VERIFY_FAILED(andongmbc.co.kr) — 미수집은 정상 baseline.
- trafilatura는 로컬 필수 의존성. PC 교체·파이썬 재설치 시 `pip install trafilatura`. crawler.py는 미설치 시 셀렉터 폴백(에러 없이 품질만 저하). GitHub Actions는 본문 수집 스킵하므로 영향 없음.

---

## 7. RAG 인용 정확성 장치 (2026-06-12)

- document_chunks 중복 1,565청크 정리 완료(2026-06-12).
- article_no에 조문 제목 포함("45조의2(준공검사의 면제 등)" 형식) → 조문 성격 즉시 인지.
- system_prompt.js "위임 관계·제도 구분 검증" 규칙 + 핵심 조문 직접 참조(전파법 제24조② 무선국 자기적합확인 — 2026.10.22 시행, 시행령 위임 미반영 주의).
- 2026-06-12 이전 업로드분은 청크 경계가 조문 단위와 어긋날 수 있음(article_no는 정확). 재업로드 시 해소.

---

## 8. AI 자문 스트리밍 전환 (2026-06-15)

**문제**: 웹검색+긴 답변(max_tokens 16384)은 응답이 2분 이상 걸려, 비스트리밍 시 ~120초 idle 구간에 브라우저·사내망 프록시가 연결을 끊어 "Failed to fetch" 발생.

**해결**: callClaude를 stream:true(SSE)로. content_block_delta의 text_delta 누적 + citations_delta 인용 수집. 실측: 동일 질문이 비스트리밍 127초에 끊기던 것이 스트리밍에서 135.7초·7,202자까지 완주.

**"Failed to fetch" 진단**: 대시보드 메시지가 아니라 브라우저 네이티브 fetch 실패. 키 누락이면 "Claude API 키가...", 서버 오류면 "API 오류(HTTP xxx)". 둘 다 아니면 연결 단계 실패 → 사내망 프록시(api.anthropic.com 차단), 확장프로그램, F12 네트워크 확인. 임의 키로 401이면 서버 도달은 정상.

---

## 9. 지식 베이스 파일 업로드·다운로드 (2026-06-15)

- 브라우저 파싱(pdf.js·mammoth·JSZip)으로 PDF(텍스트 기반)·MD·docx·PPTX → document_chunks. 카테고리: 법령·고시=선택값 / ITU-R / 보도자료 / 추가지식.
- **추가 지식 "파일 업로드"는 document_chunks(doc_category='추가지식')로** 감 — 텍스트 폼 저장(custom_knowledge)과 별개 경로. (파일을 custom_knowledge로 보내면 조문 청킹·시맨틱 검색 안 됨.)
- **저장된 목록 병합 표시(loadCustomFileList)**: 업로드 파일이 custom_knowledge에 안 떠 "어떤 파일 올렸는지" 확인 안 되던 문제 해결 → 📎 배지·청크 수·임베딩 배지·삭제 버튼으로 병합.
- **원본 Storage 보관(uploads 버킷)+file_path 기록**: 저장된 목록 클릭 다운로드 근거. createSignedUrl(60초). private 유지(public화 시 경로 아는 누구나 접근). 2026-06-15 이전 업로드분은 원본 없어 다운로드 불가.

---

## 10. Daily Briefing 렌더링 (2026-06-16)

- "오늘" 배지: KST(+9h) 기준. UTC(`new Date().toISOString()`)로 하면 KST 자정~09시에 어제로 오판하던 버그.
- Haiku가 가끔 #/##/** 마크다운을 덧붙임 → parseBriefingContent가 #/## 헤더 기호 제거, **굵게**→<strong>(mdBold).
- 📢 입법예고 블록 스타일링: 📢=헤더, 🔴=굵은 제목, →=보조텍스트, 🔗=클릭 가능한 "원문 보기" 링크(이전엔 생 URL이 클릭 안 됨).
- 긴급 박스는 원문 🔴 기준으로만(이메일과 항상 일치). 🔴는 news_feed 긴급도 단일 기준 — Haiku 자체 판정 금지. 영향도 분석이 긴급도를 덮어쓰던 코드는 2026-06-12 제거(담당자 수정 되돌리던 버그).

---

## 11. 키워드·오탐 관리

- 법령/국회 키워드에서 '혼신' 제거(2026-06-14) — '이혼신고' 부분문자열 오탐. '전파간섭'은 유지.
- 뉴스 그룹핑: 같은 날짜 + 제목 공유 키워드 2개 이상일 때만 묶음('기지국' 단일 흔한 단어로 이질 주제 병합되던 버그 수정, 지명 정규화에 광장 포함).
- 스포츠 기사 오탐: EXCLUDE_KEYWORDS(crawler.py 477줄 부근) + 중요도 피드백으로 관리.

---

## 12. 보안·운영 사고 기록

- **2026-06-12 Voyage 키 유출·재발급**: 공개 repo에 키 하드코딩 → 유출. 이후 모든 키는 .env·GitHub Secrets·Supabase Secrets에만.
- **2026-06-12 f37fd0b 사고**: 여러 세션이 같은 repo에 동시 커밋 → 샌드박스 마운트가 stale하면 다른 세션 작업을 통째로 되돌려 푸시. repo 커밋은 한 번에 한 세션만.
- **Cowork 샌드박스 마운트 절단**: bash 마운트가 stale/절단된 채 보일 수 있음(파일별 제각각 — 예: 2026-06-17 보고서 초안 제안 작업 시 app.js는 stale, index.html은 일부만, 새 파일은 보이는 식). 이때 샌드박스 커밋 금지. 파일은 Edit/Write로 실제 디스크 반영됨(Read로 확인). 변경 함수는 outputs에 떼어 node --check로 문법 검증 후 PC 터미널에서 커밋·푸시.
- law_crawler 엔드포인트: 정식 www.law.go.kr/DRF/lawSearch.do (구 open.law.go.kr/LSO/...는 404).

---

## 13. 대시보드 변경 이력

- 대시보드(홈) 메뉴 제거(2026-06-12) — 기본 화면은 보도자료·뉴스, 사이드바 맨 아래 설정만.
- 아이콘은 Tabler Icons webfont(ti ti-*) — 존재하지 않는 이름은 빈칸 렌더(ti-git-diff 없음 → ti-arrows-diff, 2026-06-14).
- 캐시 버스터(app.js?v=) 갱신 필수. 푸시 직후 `git show HEAD:index.html | findstr "app.js?v="`로 후퇴 여부 검증(다른 세션 stale 커밋이 덮었는지).

---

## 14. 보고서 초안 제안 — 설계 결정 (2026-06-17)

**기능 목적**: 내 기존 보고서의 형식·톤 + 법령·자료(RAG) 내용 근거로 보고서 초안 생성. 내용은 RAG에서, 형식·톤은 내 보고서에서.

**설계 결정**:
- **보고서 전문 통째 보관(청킹 안 함)**: 형식 학습엔 전체 흐름이 필요. 법령 RAG는 청킹, 보고서 양식은 반대. match_report_samples는 전문 임베딩(title+summary 또는 content 앞부분).
- **형식 학습 이중 구조**: ① 유사 샘플 few-shot(match_report_samples 1~2편) + ② 증류 스타일 가이드(report_style_rules). 적은 샘플로 시작, 쌓일수록 정교.
- **생성 모델 sonnet stream:true**: callClaude와 동일 이유(2분+ 응답 idle 끊김 "Failed to fetch" 방지). 비스트리밍 복귀 금지.
- **증류 모델 Haiku**: feedback_rules 증류와 동일 패턴.

**개인화 학습 채널 3종 — 강한 순서**:
1. **말로 지시(가장 강한 신호 — 의도 명시)**: 편집-diff는 사용자가 한 것을 보고 의도를 추측하지만, 말로 하는 지시는 의도를 직접 말해줌. `이번만`(다회 대화식 재생성, priorDraft를 assistant 턴으로 + 지시를 user 턴으로 3턴 대화) / `항상 적용`(report_directives 영구 저장 → callReportDraft가 매 생성 시 시스템 프롬프트에 최우선 주입). 일회성 지시("이번만 영어로")가 영구 규칙이 되는 걸 막으려고 범위(이번만/항상)로 분리.
2. **빨간펜(편집-diff)**: 말로 표현 안 되는 무의식적 습관(어미·문단 길이)을 잡음. saveReportFinal이 draft+final을 report_feedback에 저장 → 증류 시 Haiku가 초안↔최종본 차이를 "반드시 반영"으로 일반화. 채택본은 report_samples로 승격(선택).
3. **👍/👎(약한 신호)**: rating 저장. 👎는 "피하라" 패턴으로 증류.

**자동 재증류 임계(+2)**: report_style_rules의 sample_count·feedback_count로 마지막 증류 시점 추적. 샘플 +2편 또는 피드백 +2건이면 채택·평가 직후 자동 재증류. 매 1건마다 하면 Haiku 비용·시간↑ + 우연한 피드백에 스타일이 휙휙 흔들림 → "바구니 차면 돌리기". 낮추면 빠르지만 흔들림↑, 높이면 안정적이나 수렴 느림. 구조 학습엔 샘플 2편 이상 필요.

**임베딩 PC 의존**: 신규 보고서 등록·채택본 승격 후 PC에서 backfill_report_embeddings.py(NULL만). 그 전엔 유형/최신순 폴백("임베딩 대기"). 스타일 증류·말로 지시·빨간펜은 브라우저에서 즉시 동작(PC 불필요).

**파일 등록 drag&drop**: report-drop-zone(점선 박스). 클릭/드롭 공용 _processReportFile. PDF·docx·pptx·md·txt.

**DB/RLS**: report_samples·report_style_rules·report_feedback·report_directives 모두 RLS 활성 + anon 4종 정책. match_report_samples RPC(anon execute). report_style_rules에 feedback_count 컬럼(자동 재증류 임계 추적).

**보안**: 원문은 Supabase(private)에만. 생성 시 예시·스타일·지시가 Anthropic API로 전송됨(학습엔 미사용이나 전송은 됨). 민감 수치는 마스킹·형식 위주 등록 권장.

**캐시 버스터 이력**: 20260617e(최초 v1) → f(v3 빨간펜 학습) → g(drag&drop) → h(말로 지시 고치기).

---

## 15. Supabase 파이썬 클라이언트 HTTP/2 끊김 사고 — sb_client 도입 (2026-06-20)

**증상**: 2026-06-19 저녁(KST)부터 `daily_crawl.yml`이 ~20초 만에 전 잡 실패. 같은 시기 `morning_briefing.yml`은 초록(성공)이지만 빈 채로 끝나 06-19·20일 모닝 브리핑 미생성. news_feed는 06-19 18:47 KST 이후 미축적. (실패 메일에 찍힌 커밋 de7f14c는 문서만 수정 — 무관한 red herring.)

**원인**: 워크플로가 `pip install supabase`를 **버전 고정 없이** 실행하는데, 최신 `supabase 2.31.0` / `postgrest 2.31.0`이 `httpx[http2]`(h2 패키지)를 끌어와 Supabase REST 통신이 HTTP/2로 협상됨. Supabase 엔드포인트가 HTTP/2 연결을 끊어, 첫 쿼리(`get_existing_urls()`의 `sb.table('news_feed').select('url,title').execute()`)에서 `httpx.RemoteProtocolError: Server disconnected`로 크래시. supabase-py #1064로 보고된 HTTP/2 keepalive 버그(간헐적이라 국회 크롤러는 한 번 통과하기도 함).
- 라이브러리 자동 업그레이드가 방아쇠 → 코드 변경이 없는데 어느 날 갑자기 깨짐.
- `create_client`를 쓰는 모든 스크립트(crawler·morning_briefing·law_crawler·assembly_crawler·gov_notice_crawler·refetch_content·resend_briefing·send_briefing·summarize_assembly_bills·summarize_law_amendments·upload_law_pdf — 11개) 동시 영향.
- 특히 `refetch_content.py`(PC 본문 수집)도 같이 깨져 본문(content)이 안 채워짐 → 브리핑이 "본문 확인 기사 0건"으로 빈 채 종료(브리핑은 24h 내 **본문 있는** 기사만 요약). 즉 19·20일 브리핑 미생성의 직접 원인.

**해결(2026-06-20, 커밋 ca70add)**: 공용 헬퍼 `sb_client.py`의 `make_client(url, key)` 신설. `httpx.HTTPTransport(retries=3, limits=max_keepalive_connections=1)`로 **HTTP/1.1 강제**(http2 미사용)한 `httpx.Client`를 `ClientOptions(httpx_client=...)`로 주입(supabase-py 2.16.0+ 지원). 11개 스크립트의 `create_client(...)`를 `make_client(...)`로 일괄 교체.
- HTTP/2를 **코드에서** 끄므로 라이브러리가 또 올라가도 재발 안 함(버전 핀과 달리 시간이 지나도 안 풀림 = 영구 해법).
- 검증: 새 코드로 crawl #201 성공(41초 풀 실행, `[기존] Supabase 저장 항목 549건` 읽기 정상, `[네이버 뉴스] 107건 수집`), briefing #43 성공(Supabase 호출 정상). 둘 다 RemoteProtocolError 사라짐.

**복구 절차**: 코드 배포 후에도 브리핑 내용이 차려면 본문 있는 기사가 필요 → PC에서 `python refetch_content.py`(한국 IP·trafilatura)로 본문 채운 뒤 morning_briefing 재실행.

**교훈**: pip 무고정의 양날(자동 최신은 편하지만 깜깜이 회귀 위험). 근본은 HTTP/2 비활성(sb_client).

**후속 보강(2026-06-20) — 의존성 버전 고정**: `requirements.txt`에 크롤 #201에서 검증된 버전 세트(61개)를 `==`로 박고, 6개 워크플로(daily_crawl·morning_briefing·law_crawl·assembly_crawl·backfill·cleanup) 모두 `pip install -r requirements.txt`로 통일. 이제 sb_client가 못 막는 "다른 라이브러리의 자동 최신화 회귀"까지 차단. 버전 올릴 땐 하나씩 바꿔 Run으로 검증(Dependabot 권장). 가벼운 워크플로도 전체 lock을 설치하지만(통일·일관성 우선) 무해. sb_client(HTTP/2 한 버그)와 requirements.txt(전체 자동 업데이트)는 상호보완.

---

## 16. 안정성·가시성 보강 3종 (2026-06-20, 커밋 998044c)

HTTP/2 사고에서 직접 겪은 불편(빈 브리핑·주말 오경보·점검 번거로움)을 근본 해결하기 위해 추가.

**① 빈 브리핑 방지 (morning_briefing.py)**: 본문(content) 확인 기사 0건이면 종료하던 것을 **요약(summary) → 제목(title) 순 폴백**(`fetch_items_fallback`)으로 변경. 폴백본은 맨 앞에 `⚠️ (본문 미확보 …` 접두사를 붙이고, `already_sent_today`가 이 접두사를 발견하면 '교체 허용'(False)을 반환 → PC가 나중에 본문을 채우면 **정식 본문본으로 자동 교체**(중복 발송 방지는 유지). 폴백 모드에선 SKT 영향분석(`add_urgent_analyses`) 생략(본문 빈약). 19·20일처럼 PC 꺼져 본문 미수집이어도 빈 브리핑이 안 나옴.
  - ※ 네이버 OpenAPI 기사는 크롤 시 `content=None`이라 PC refetch 전엔 summary도 없을 수 있음 → 그땐 제목 기반 간이 브리핑.

**② 워치독 '크롤러 인지'로 개선 (health_watchdog.py + check_news_health + system_health)**: 둘 다 "뉴스 DB 신선도"만 보고 경고하던 것을, **"크롤러가 실제로 성공했는지"까지 보고** '고장' vs '뉴스 없음(주말 등)'을 구분하도록 변경.
  - `crawler.py`가 매 실행 끝에 `system_health(key='last_crawl_run')` heartbeat를 upsert(신규 0건이어도 기록, 실패해도 무시).
  - 외부(health_watchdog.py): daily_crawl 최근 성공 <14h면 `crawl_running=true` → 뉴스 stale여도 30h 전까진 침묵(30h+면 'NAVER 키·필터 점검' 경고). daily_crawl은 ①에서 판정하므로 ② 루프에서 제외(중복 경고 방지).
  - 내부(check_news_health): heartbeat <3h면 `crawler_ok` → 뉴스 stale 14h라도 침묵, 30h+면 경고. heartbeat 없거나 stale면 14h에서 경고(예전 동작=안전 폴백, 크롤러 미배포/미실행 시).
  - 효과: 토요일 "26시간 멈춤" 같은 주말 오경보 제거, 진짜 고장(크롤러 미실행)일 때만 울림.

**③ 운영 상태 대시보드 (설정 밑 탭, app.js `loadOpsStatus` + index.html `panel-opsstatus`)**: 사이드바 설정 바로 밑 "운영 상태"(`go('opsstatus')`). 크롤러 heartbeat·뉴스 마지막 입력·오늘 브리핑·입법예고·국회 법안·보관 건수를 ✅/⚠️로 표시. "뉴스 마지막 입력"은 `crawler_ok`면 stale여도 ✅(새 뉴스 없음=정상). 경고 받았을 때 1차 점검 화면. 캐시버스터 `app.js?v=20260620a`.

**DB 변경(이미 적용)**: `system_health(key text pk, updated_at timestamptz, note text)` 테이블 + RLS·anon select 정책. `check_news_health()`를 heartbeat 인지 버전으로 교체. (마이그레이션: `create_system_health_table`, `smarter_check_news_health_heartbeat`)

**검증**: 크롤 #210에서 heartbeat 기록 확인(`note=new=0 total=107`), 운영 상태 탭 라이브 렌더링 확인("뉴스 마지막 입력"이 1일+ stale여도 크롤러 정상이라 ✅).

**사이드바 스크롤 수정(커밋 fe59bd8)**: 운영 상태 메뉴 추가로 항목이 늘면서, 화면(창)이 짧을 때 사이드바 하단의 설정·운영 상태가 잘려 보임(`.sidebar`가 flex column인데 `overflow` 미설정이라 넘침이 스크롤 안 됨). → `.sidebar`에 `overflow-y:auto; min-height:0` 추가. 이때 styles.css는 캐시버스터가 없어 `styles.css?v=20260620a` 신설(이후 CSS 수정 시 갱신 필요).

**PC 크롤러 heartbeat 확장(커밋 0e9c9d6, app.js?v=20260620b)**: "입법예고 최근 수집 4일 전 = 정상인가?" 질문에서 출발. 그 표시는 '마지막 새 항목'이지 '크롤러 실행 시각'이 아니라 모호 → 뉴스 크롤러처럼 PC 크롤러에도 heartbeat 추가.
  - `gov_notice_crawler.py` 끝에 `last_gov_notice_run`, `refetch_content.py` 끝(할 일 없음 조기 return 포함)에 `last_refetch_run` upsert(실패 무시).
  - 운영 상태 탭: '입법예고·정부고시 크롤러(heartbeat)'(✅ <25h, 매일 17:00) + '└ 입법예고 최근 새 항목'(마지막 lsAnc) + '본문 수집(refetch heartbeat)' 행으로 분리 → "PC 꺼져 안 돎" vs "새 예고 드물어 없음"을 구분.
  - 참고: lsAnc는 전체 1~2건 수준으로 드묾(전파·통신 입법예고 자체가 드뭄) → '최근 새 항목' 간격이 큰 건 정상. 검증 시 gov_notice 실행에서 신규 입법예고 1건(전기통신사업법 시행령) 수집 + heartbeat 정상 기록 확인.

---

## 17. 무뉴스 날 무음 누락 방지 — 시각무관 1일1회 통지 + placeholder (2026-06-21)

**계기**: 2026-06-21(일) "모닝 브리핑이 생성되지 않았다" 신고. 점검 결과 트리거 체인은 전부 정상이었음 — pg_cron briefing-trigger-0605/0620 succeeded, GitHub이 morning_briefing.yml dispatch를 204로 수락(PAT 유효, 같은 PAT로 도는 크롤 트리거도 당일 정상), 크롤러도 당일 08:47 KST 정상 heartbeat. 그런데도 06-21·06-19 브리핑이 없고 06-20은 17:13 KST에 늦게 생성됨.

**원인(고장 아님 — 진짜 '뉴스 없음')**: news_feed 신규 입력이 2026-06-19 18:47 KST(=09:47 UTC) 이후 끊김(평소 하루 11~94건 → 06-20·21 0건). daily_crawl #224 로그 확인 결과 `[네이버 뉴스] 106건 수집 (실패 키워드 0개)` → **NAVER 키 정상**, 가져온 106건이 전부 기존/15일 초과라 `[필터] 24건 15일 초과 — 제외` → `[신규] 0건`. 즉 금요일 저녁+주말 뉴스 가뭄(크롤러·키 이상 아님).
- morning_briefing.py가 24h 내 기사 0건이면 `fetch_items_fallback`(요약→제목)도 빈 결과 → "[종료] 최근 24시간 내 수집된 기사 자체가 없음"으로 **저장 없이** 종료. #16①의 빈-브리핑 폴백은 "기사는 있는데 본문 없음"만 막을 뿐 **기사 0건**은 못 막음(폴백도 24h 내 기사가 있어야 동작).
- 게다가 옛 코드는 그 생략 통지를 `datetime.now(KST).hour >= 9`일 때만 보냄. 트리거가 06:00~06:30대(hour<9)라 **통지조차 없이 조용히 종료** → "왜 브리핑이 안 왔지?" 무음 누락으로 오인.

**해결(2026-06-21, morning_briefing.py)**: 0건 분기를 `_handle_no_news()`로 교체.
- 시각 무관하게 **'🕊️ 오늘 모닝 브리핑 — 최근 24시간 내 신규 수집 기사 없음(크롤러 정상 작동, 시스템 이상 아님)' 텔레그램 1회** 발송.
- 대시보드 공백 방지용 **placeholder 브리핑**을 daily_briefings에 upsert. 맨 앞에 `🕊️ (신규 뉴스 없음 …` = `_NONEWS_PREFIX` 마커.
- **중복 차단(1일1회)**: 아침에 워크플로가 최대 4회(06:00 GitHub cron · 06:05 pg_cron · 06:20 pg_cron · 06:30 GitHub cron) 실행될 수 있음. pg_cron 2종은 `trigger_briefing_if_missing`이 placeholder를 "오늘 행 있음"으로 보고 dispatch 생략, 06:30 GitHub run은 무조건 돌지만 placeholder(_NONEWS_PREFIX) 감지 시 텔레그램 생략. 결과 **하루 1회만** 통지.
- **정식본 자동 교체**: `already_sent_today`가 `_NONEWS_PREFIX`도 `_FALLBACK_PREFIX`처럼 '교체 허용'(False)으로 처리 → 나중에 기사가 들어오면(예: 06:30 run에서 신규 확인) placeholder가 정식 브리핑으로 대체됨(#16① 폴백과 동일 패턴). 정식본엔 마커가 없으므로 이후 실행은 `already_sent_today`가 True 반환(추가 발송 없음).

**발송 시각**: 정상 흐름에선 ~06:00 KST 1회(그날 처음 성공한 실행에서 발송 + placeholder 저장). GitHub cron 06:00 슬롯이 드롭·지연되면 첫 통지가 06:05→06:20→06:30 순으로 늦춰질 수 있으나 어느 경우든 1회만.

**진단 메모(재발 시)**: 브리핑 미생성인데 트리거·PAT·크롤러 heartbeat가 다 정상이면 news_feed 24h 신규 0건을 의심. ① 대시보드 운영 상태 탭의 `last_crawl_run` heartbeat가 fresh + 신규0이면 고장 아님. ② daily_crawl 최신 Actions 로그 `[네이버 뉴스] N건`으로 'NAVER 키 만료(N=0·미설정·폴백만)' vs '진짜 뉴스 없음'(N>0·실패 키워드 0개) 가름. 06-21 건은 후자였음.

**검증**: 패치 후 `python3 -m py_compile morning_briefing.py` 통과. 당일(06-21) 공백은 수동 placeholder 브리핑으로 메움(이후 코드 배포로 자동화). PC 터미널에서 `git add morning_briefing.py` 커밋·푸시해야 다음 아침부터 적용(GitHub Actions는 main 기준).

---

## 부록 — 보고서 초안 제안 데이터 흐름

```
[등록] 내 보고서(docx/pdf/pptx/md/txt) → 브라우저 파싱 → report_samples(전문) → (PC) backfill_report_embeddings.py
                                                       └→ Haiku 증류 → report_style_rules(내 스타일)
[생성] "~~보고서 만들어줘"
   ├─ 형식: match_report_samples(유사 1~2편) + report_style_rules(스타일) + report_directives(항상 적용 지시)
   ├─ 내용: searchKeywords → buildRagContext (법령·뉴스 RAG)
   └─ sonnet(stream:true) → 내 형식의 초안
[학습] 말로 지시(이번만/항상) · 빨간펜(고쳐서 채택→편집-diff) · 👍/👎 → 임계 +2건 시 자동 재증류
```
