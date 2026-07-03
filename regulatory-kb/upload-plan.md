# Confluence 업로드 계획 (법령 Knowledge Base / page_id 1104377342)

대상 공간: https://confluence.tde.sktelecom.com/spaces/~1108400/
루트 페이지: **법령 Knowledge Base (OKF 스타일)** (page_id 1104377342)
방식: **Atlassian MCP OAuth 인증 후 API 자동 생성** / 구조·메타데이터는 **페이지 기존 규약에 맞춤**

## 0. 선행 조건 (사용자 조치)
- 대화형 `claude` 세션에서 `/mcp` → Atlassian 인증, 또는 claude.ai 커넥터 설정에서 Atlassian 연결.
- 인증 계정은 이 공간에 **페이지 생성·편집 권한**이 있어야 함(현재 브라우저에서 "편집" 노출 확인됨).
- 인증 완료 후 "업로드 진행"이라고 알려주시면 아래 트리를 생성합니다.

## 1. 페이지 트리 매핑 (루트 하위)

루트 페이지의 기존 목차(01.도메인/02.공통/03.템플릿/99.변경이력)를 그대로 사용.

### 01.도메인 (법령군별 하위 페이지 → 각 concept 1페이지)
- **전파법** (18): 전파법 / 시행령 / 시행규칙 / [방통위 규칙] / [주파수 행정규칙 13] (할당 절차·대가·배분, 분배표, 공동사용, 분배변경 이용자지원, 공공용 주파수 2, 항공주파수, PLC 2, 종합정보시스템, 자원분석시스템)
- **전기통신사업법** (4): 법률 / 시행령 / 과기정통부 규정 / 단말 과징금 세부기준
- **정보통신망법** (3): 법률 / 시행령 / 시행규칙
- **방송통신발전기본법** (3): 법률 / 시행령 / 방발기금 운용·관리규정
- **방송통신설비 기술기준** (6): 규정(대통령령) / 안전성·신뢰성 / 표준시험방법 / IPTV 설비 / 적합여부 조사·시험 지침 / 기록·관리 대상 고시
- **단말장치 기술기준** (3): 현행(2025-13) / 구버전(2022-16, deprecated) / 충전·데이터(USB-C)
- **정보통신기반 보호** (1): 주요정보통신기반시설 보호지침
- **정보통신산업 진흥법** (3): 법률 / 시행령 / 시행규칙
- **부담금관리 기본법** (2): 법률 / 시행령
- **국가재정법** (2): 법률 / 시행령
- **국가회계법** (2): 법률 / 시행령
- **정부조직법** (1): 법률
- **규제업무 운영** (1): 방송미디어통신 규제업무 운영 규정
소계: 49페이지(법령 48 + 규제운영은 위 전기통신/발전법 인접 배치)

### 02.공통
- 전파·전기통신 규제 용어집 (glossary/terms.md)
- (선택) references 목록, manifest 요약

### 03.템플릿
- 법령/규정 문서 템플릿, 사내 정책 템플릿 (kb_scaffold_and_templates.md 4.1/4.2)

### 99.변경이력
- log.md 내용 이관(1~3차 확장 이력)

## 2. Frontmatter 필드 매핑 (페이지 규약 준수)

각 페이지 본문 최상단 YAML 블록:
| 규약 필수 필드 | 채우는 값 |
|---|---|
| type | 기존 concept type (Law/Regulation/Notice/Guideline/Procedure) |
| title | 기존 title (원문 제목 우선) |
| description | 기존 description |
| tags | 기존 tags |
| timestamp | 기존 timestamp(2026-07-02T00:00:00Z) |
| owner_team | **기술정책팀** |
| status | current→**active**, superseded→**deprecated** (단말장치 2022-16만 deprecated) |
| review_cycle | 법률·시행령·시행규칙=**annual**, 고시·훈령·예규·기술기준=**quarterly** |
| source_page_id | **생성 후 채움**(각 페이지 자신의 id) |
| source_url | **생성 후 채움**(각 페이지 자신의 url) |

확장 유지(OKF 허용, 데이터 손실 방지): `law_type, law_number, enforcement_date, competent_authority`, 원본 PDF 경로는 `original_pdf`로 유지, `superseded_by`(해당 시).

## 3. 업로드 절차(인증 후 실행)
1. 01/02/03/99 하위 페이지 존재 확인(없으면 생성).
2. 01.도메인 아래 12개 법령군 컨테이너 페이지 생성.
3. manifest.json 순회 → 각 concept를 해당 컨테이너 하위 페이지로 생성(제목=title).
   - **중복 방지**: 생성 전 제목으로 기존 페이지 검색 → 있으면 update, 없으면 create.
   - 생성 직후 반환된 page_id/url을 frontmatter의 source_page_id/source_url에 주입.
4. 본문: 마크다운 → Confluence storage format 변환(표·코드블록 포함).
5. 관계 링크: 문서 간 상대경로 링크를 생성된 Confluence 페이지 링크로 치환.
6. 99.변경이력에 업로드 일자·건수 기록. manifest.json의 각 entry에 confluence_page_id 캐시.

## 4. 미결/확인 필요
- review_cycle 기본값(위 제안) 그대로 사용할지.
- 03.템플릿에 올릴 원본(kb_scaffold_and_templates.md)의 어느 섹션까지 포함할지.
