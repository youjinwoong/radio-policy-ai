# 전파정책 AI 프로젝트 — Claude Project 지침

## 프로젝트 개요

SKT Comm센터 기술정책팀의 전파·통신 정책 모니터링 자동화 시스템입니다.
- 대시보드: https://youjinwoong.github.io/radio-policy-ai/
- GitHub: https://github.com/youjinwoong/radio-policy-ai
- 담당자: 유진웅 (you.jinwoong@gmail.com)

## 로컬 파일 위치

```
C:\Users\SKTelecom\Desktop\frequence\radio-policy-ai\
├── crawler.py              # 메인 크롤러 (GitHub Actions 매시간)
├── morning_briefing.py     # 모닝 브리핑 생성·발송 (GitHub Actions 08:03 KST)
├── refetch_content.py      # 본문 재수집 + 뉴스 요약 자동 생성 (Windows 작업 스케줄러, 한국 IP 필수)
├── gov_notice_crawler.py   # 정부 고시·예규 크롤링 (Windows 작업 스케줄러 17:00)
├── upload_law_pdf.py       # PDF/MD/PPTX → document_chunks RAG 업로드
├── resend_briefing.py      # 특정 날짜 브리핑 즉시 재발송 (수동 실행용)
├── send_briefing.py        # 브리핑 발송 단독 스크립트
├── run_gov_crawler.bat     # gov_notice_crawler.py 배치 실행 파일
├── setup_scheduler.ps1     # Windows 작업 스케줄러 등록 스크립트
├── system_prompt.js        # 대시보드 AI 자문 시스템 프롬프트 관리
├── index.html / app.js     # 대시보드 프론트엔드 (GitHub Pages)
└── .github/workflows/
    ├── daily_crawl.yml     # 매시간 크롤링 워크플로우
    ├── morning_briefing.yml # 매일 08:03 KST 브리핑 워크플로우
    ├── backfill.yml        # 1달치 백필 (수동 1회용)
    └── cleanup.yml         # 뉴스 데이터 정리 (수동 1회용)
```

## Supabase DB

- **프로젝트명**: radio-policy-ai
- **Region**: ap-northeast-1 (도쿄)
- **Project ID**: zwkjedumfuhodckmtxxn
- **URL**: https://zwkjedumfuhodckmtxxn.supabase.co

### 주요 테이블

| 테이블 | 설명 |
|---|---|
| news_feed | 뉴스 기사 본문·요약·긴급도 (15일치 유지) |
| daily_briefings | 일일 브리핑 원문 (매일 1건 누적) |
| tech_terms | 자동 추출 기술 용어 (description·diagram_html·related_terms 포함) |
| document_chunks | 법령·고시·보도자료 RAG 청크 (13,000+건) |
| custom_knowledge | 팀 추가 지식 (수동 입력) |
| chat_logs | AI 자문 이력 |

## 시스템 구조 — 전체 흐름

### ① GitHub Actions 크롤러 (매시간, 자동 · PC 불필요)
```
cron: '5 0-11 * * *'       → 09:05~20:05 KST 매시간
      '5 13,18,22,23 * * *' → 22:05 / 03:05 / 07:05 / 08:05 KST
워크플로우: daily_crawl.yml
실행: crawler.py

흐름:
  네이버/Google RSS/20개 언론사 → 기사 수집
  → Claude Haiku: 긴급도 분류
    (즉시대응→긴급 / 금주검토→보통 / 동향파악→참고, DB에는 긴급/보통/참고로 저장)
  → Claude Haiku: 신규 기술 용어 추출 → tech_terms 저장
    → 신규 용어 저장 즉시 generate_term_descriptions() 호출
      → Claude Haiku로 description·diagram_html·related_terms 자동 생성 후 DB 업데이트
  → 15일 이내 신규 기사만 news_feed 저장
    ※ GitHub Actions에서는 본문 수집 스킵 (IS_GITHUB_ACTIONS=true 감지)

긴급 기사 감지 시:
  → 텔레그램 즉시 발송 + Resend API 이메일 → you.jinwoong@gmail.com
```

### ② Windows 작업 스케줄러 (PC 켜져 있을 때만, 한국 IP 필요)
```
RadioPolicy-RefetchContent (매시간):
  python refetch_content.py
  역할:
    - content=NULL 또는 100자 미만 기사 → 본문 전체 재수집
    - 본문 수집 직후 generate_summary()로 뉴스 요약 자동 생성 → news_feed.summary 저장
    - 실제 발행일로 published_at 보정
    - 15일 초과 기사 자동 삭제
    - 실행 마지막: summary 없는 기사 최대 30건 배치 백필
    - 실행 마지막: description 없는 tech_terms 최대 20건 배치 백필

전파정책_정부크롤러 (매일 17:00):
  python gov_notice_crawler.py
  역할: 국립전파연구원·과기정통부·방통위 고시·예규·입법예고 수집
  특이사항: curl_cffi TLS 지문 위장으로 정부 사이트 봇 차단 우회 (한국 IP 필수)

⚠️ Cowork 예약 태스크(radio-policy-crawler, gov-notice-crawler)는
   모두 비활성화 → Windows 작업 스케줄러로 전환 완료
```

### ③ GitHub Actions 모닝 브리핑 (매일 08:03 KST, 자동 · PC 불필요)
```
cron: '3 23 * * *'
워크플로우: morning_briefing.yml
실행: morning_briefing.py

흐름:
  최근 24h 본문 확인된 기사 조회 (content > 50자)
  → Claude Haiku: 브리핑 생성 (중복 주제 1건만, 본문 근거 요약)
  → daily_briefings 저장 + news_feed.summary 역저장
  → 텔레그램 발송 (4000자 제한) + Resend API 이메일

긴급 표시(🔴) 규칙:
  - SKT 또는 국내 사업에 직접적인 영향이 있는 기사에만 사용
  - 요약에서 "직접적인 영향 없음"으로 판단한 기사에 🔴 사용 금지 (모순 방지)
```

### ④ 대시보드 (GitHub Pages, 항상 접근 가능)
```
URL: https://youjinwoong.github.io/radio-policy-ai/
브라우저 → Supabase 직접 쿼리

기능:
  - 보도자료·뉴스: 기사 목록, 제목 유사도 기반 그룹핑, 본문 클릭 모달
    → 뉴스 클릭 시 주요 내용 요약: DB에 summary 있으면 즉시 표시, 없으면 브라우저에서 Haiku 생성
  - 보도자료: PDF/MD/PPTX 다중 파일 업로드 → RAG 청킹 저장
  - Daily Briefing: 브리핑 원문 열람
  - 기술 용어 위키: 용어 수집 시 설명·다이어그램 자동 생성 (첫 클릭 대기 없음)
    → "뉴스에서 용어 추출" 버튼: 저장 직후 백그라운드에서 설명 자동 생성
    → 용어 중복 방지: 공백 제거+소문자 정규화 비교 (2.6GHz == 2.6 GHz)
  - AI 자문: 법령 RAG(13,000+청크) + 최신 뉴스 기반 답변 (claude-sonnet-4-6)
  - 법령 DIFF 분석: 개정 전·후 파일 비교 분석
  - ITU-R 패널: PDF 업로드 버튼
```

### crawler.py 주요 함수
```
generate_term_descriptions(new_terms)                     # 신규 용어 설명·다이어그램 자동 생성 (Haiku)
generate_summary(title, source, published_at, content)    # 기사 요약 생성 (Haiku)
extract_tech_terms(items)                                  # 뉴스에서 기술 용어 추출 후 저장
```

### 알림 채널
```
발송 시점              | 채널          | 수신자
---------------------|--------------|------------------
매일 08:03 KST        | 텔레그램       | ID: 344506450
매일 08:03 KST        | 이메일(Resend) | you.jinwoong@gmail.com
긴급 기사 감지 즉시    | 텔레그램       | ID: 344506450
긴급 기사 감지 즉시    | 이메일(Resend) | you.jinwoong@gmail.com
```

## 표준 작업 패턴

```bash
# 코드 수정 후 배포
git add [파일명]
git commit -m "설명"
git push origin main

# git lock 오류 발생 시
del .git\HEAD.lock && git commit -m "..." && git push origin main

# 브리핑 수동 재발송 (오늘)
python resend_briefing.py

# 특정 날짜 브리핑 재발송
python resend_briefing.py 2026-06-07

# 정부 고시 수동 실행
python gov_notice_crawler.py

# 본문 재수집 + 요약 자동 생성 + 오래된 기사 정리
python refetch_content.py

# 법령/고시 PDF RAG 업로드
python upload_law_pdf.py 파일.pdf "문서명" 고시
# 카테고리: 법령 / 고시 / ITU-R (기본값: 고시)
```

## 브리핑 미수신 시 체크리스트

1. GitHub Actions 확인: https://github.com/youjinwoong/radio-policy-ai/actions/workflows/morning_briefing.yml
2. 실패 시 → "Run workflow" 수동 실행 (Actions가 가끔 cron skip함)
3. Actions 로그에서 `[텔레그램]`, `[Resend]` 라인 확인
4. 성공했는데 못 받았다면 → `python resend_briefing.py` 로컬 실행

## 하지 말아야 할 것

- **gov_notice_crawler.py를 GitHub Actions로 옮기지 말 것**
  정부 사이트가 해외 IP를 차단함. curl_cffi TLS 위장도 한국 IP에서만 안정적으로 동작.

- **Supabase 신규 프로젝트 생성 제안하지 말 것**
  무료 슬롯 2개(radio-policy-ai + wine-cellar-mgmt) 모두 사용 중.

- **Sonnet으로 긴급도 분류 업그레이드 제안하지 말 것**
  비용 절감 위해 Haiku 사용 중. 현재 품질로 충분.

- **Cowork 예약 태스크로 크롤러 재등록하지 말 것**
  Windows 작업 스케줄러로 전환 완료됨. 중복 실행 위험.

## 현재 알려진 제약사항

1. **이메일 수신**: Resend 도메인 미인증 → you.jinwoong@gmail.com만 수신 가능
   (lampman@sktelecom.com은 도메인 인증 후 가능)
2. **본문 수집**: PC 꺼져 있으면 RSS 요약(60자)만 저장 → refetch_content.py가 나중에 보완
   본문 없는 기사는 요약도 생성 불가 → 첫 클릭 시 브라우저에서 생성
3. **Supabase 슬롯**: 무료 2개 모두 사용 중
4. **Wine Cellar Supabase**: 데이터 없음, 7일 미접속 시 자동 정지 위험
5. **스포츠 기사 오탐**: "3G 연속" 등 통신 용어와 겹치는 스포츠 표현이 가끔 수집됨
   → EXCLUDE_KEYWORDS에 키워드 추가로 관리 (crawler.py 477번째 줄 부근)

## 사용 중인 외부 서비스

| 서비스 | 용도 | 한도 |
|---|---|---|
| GitHub Actions + Pages | 크롤링·브리핑 자동화 + 대시보드 호스팅 | 무료 Public 무제한 |
| Supabase | DB | 무료 500MB/프로젝트, 최대 2개 |
| Resend | 이메일 발송 | 100통/일, 3,000통/월 |
| Telegram Bot | 알림 | 무제한 |
| Anthropic API | Claude Haiku(크롤링·브리핑·요약·용어설명) / Sonnet(대시보드 AI자문) | 종량제 ~$2~3/월 |

## GitHub Secrets (Actions에서 사용)

`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`,
`EMAIL_FROM`, `EMAIL_PASSWORD`, `EMAIL_TO`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `RESEND_API_KEY`

## 프로젝트 지침 업데이트 규칙

**다음 작업 완료 시 이 파일(docs/claude_project_instructions.md)을 반드시 업데이트하고,
Claude Project Settings → Project Instructions에도 동일 내용을 붙여넣을 것:**

- 새 기능 추가 (새 함수, 새 자동화 흐름)
- 파일 구조 변경 (파일 추가·삭제·역할 변경)
- 시스템 흐름 변경 (실행 순서, 트리거 조건)
- "하지 말아야 할 것" 또는 "제약사항"에 해당하는 새 사실 발견
- 외부 서비스 변경 (모델명, API 엔드포인트 등)

단순 버그 수정(동작 방식 변화 없음)은 업데이트 불필요.

---
*최종 업데이트: 2026-06-10*
