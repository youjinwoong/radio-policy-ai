"""
PDF/TXT 법령·고시 업로드 스크립트
사용법: python upload_law_pdf.py <파일경로> [문서명] [카테고리]

입력 파일: .pdf 또는 .txt (법령 본문 텍스트)
카테고리 선택: 법령 / 고시 / ITU-R / 전파법 / 전파법_시행령 / 전파법_시행규칙 등

예시:
  python upload_law_pdf.py 전파법.pdf "전파법(법률)(제21065호)(20260102)" 전파법
  python upload_law_pdf.py 전파법_텍스트.txt "전파법(법률)(제21065호)(20260102)" 전파법
  python upload_law_pdf.py 고시2024-10.pdf "전파연구원 고시 2024-10호" 고시
"""

import sys
import os
import re
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

CHUNK_SIZE = 800    # 청크 최대 글자 수
CHUNK_OVERLAP = 100 # 청크 간 중복 글자 수


def extract_text_from_pdf(pdf_path: str) -> str:
    """PDF에서 텍스트 추출"""
    try:
        import pdfplumber
        text_parts = []
        with pdfplumber.open(pdf_path) as pdf:
            total = len(pdf.pages)
            for i, page in enumerate(pdf.pages, 1):
                text = page.extract_text()
                if text:
                    text_parts.append(text.strip())
                print(f"  페이지 {i}/{total} 처리 중...", end="\r")
        print()
        return "\n\n".join(text_parts)
    except ImportError:
        print("pdfplumber 미설치. 설치 중...")
        os.system(f"{sys.executable} -m pip install pdfplumber --quiet")
        return extract_text_from_pdf(pdf_path)


def chunk_text(text: str) -> list:
    """텍스트를 청크로 분할 (조문 헤더 경계 우선, 없으면 크기 기준)
    반환: [{'content': str, 'article_no': str | None}, ...]

    조문 헤더는 줄 시작의 "제N조(제목)" / "제N조의M(제목)" 형식만 인식.
    본문 내 인용("법 제24조제1항" 등)은 괄호가 없거나 줄 중간이므로 매칭되지 않음
    — 과거 인용 번호가 article_no로 오태깅되던 버그 수정 (2026-06-12).
    같은 조문이 크기 때문에 여러 청크로 나뉘면 모든 청크가 동일 article_no를 가짐.
    """
    # 조문 헤더 경계: 줄 시작 + 제N조(의M) + 여는 괄호
    header_pattern = re.compile(r'(?=^제\d+조(?:의\d+)?\()', re.MULTILINE)

    # 우선 조문 단위로 분할 시도
    splits = header_pattern.split(text)
    if len(splits) < 5:
        # 조문 구분이 없으면 단순 크기 기준 분할
        splits = [text]

    chunks = []
    for block in splits:
        block = block.strip()
        if not block:
            continue
        # 블록 맨 앞의 조문 헤더에서 조항번호+제목 추출 (없으면 None)
        # 예: '45조의2(준공검사의 면제 등)' — 제목 포함으로 AI 인용 시 조문 성격 즉시 인지
        m = re.match(r'제(\d+조(?:의\d+)?\([^)]*\))', block)
        article_no = m.group(1) if m else None
        if len(block) <= CHUNK_SIZE:
            chunks.append({'content': block, 'article_no': article_no})
        else:
            # 큰 블록은 CHUNK_SIZE 단위로 분할 (CHUNK_OVERLAP 중복)
            start = 0
            while start < len(block):
                end = start + CHUNK_SIZE
                chunks.append({'content': block[start:end], 'article_no': article_no})
                start += CHUNK_SIZE - CHUNK_OVERLAP

    return [c for c in chunks if len(c['content'].strip()) > 50]


def parse_chunk_metadata(content: str, doc_name: str) -> dict:
    """청크 내용·문서명에서 메타데이터 파싱 (조항번호는 chunk_text에서 처리)"""
    meta = {}
    # 고시번호: 문서명 또는 content 앞 300자
    m = re.search(r'(\d{4}-\d+)', doc_name)
    if not m:
        m = re.search(r'제(\d{4}-\d+)호', content[:300])
    if m:
        meta['notice_no'] = m.group(1)
    # 시행일: YYYY년 MM월 DD일 시행
    m = re.search(r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일[^.]{0,30}시행', content)
    if m:
        meta['effective_date'] = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    return meta


def upload_to_supabase(doc_name: str, doc_category: str, chunks: list) -> bool:
    """Supabase document_chunks 테이블에 업로드"""
    try:
        from supabase import create_client
    except ImportError:
        print("supabase 미설치. 설치 중...")
        os.system(f"{sys.executable} -m pip install supabase --quiet")
        from supabase import create_client

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("오류: .env 파일에 SUPABASE_URL, SUPABASE_SERVICE_KEY가 없습니다.")
        return False

    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # 기존 동일 doc_name 청크 삭제 (재업로드 시 중복 방지)
    existing = client.table("document_chunks").select("id").eq("doc_name", doc_name).execute()
    if existing.data:
        print(f"  기존 '{doc_name}' 청크 {len(existing.data)}개 삭제 중...")
        client.table("document_chunks").delete().eq("doc_name", doc_name).execute()

    # 배치 삽입 (50개씩) — 메타데이터 파싱 포함
    rows = []
    for i, chunk in enumerate(chunks):
        row = {"doc_name": doc_name, "doc_category": doc_category, "chunk_index": i, "content": chunk['content']}
        if chunk.get('article_no'):
            row['article_no'] = chunk['article_no']
        row.update(parse_chunk_metadata(chunk['content'], doc_name))
        rows.append(row)

    batch_size = 50
    total = len(rows)
    for i in range(0, total, batch_size):
        batch = rows[i:i + batch_size]
        client.table("document_chunks").insert(batch).execute()
        print(f"  업로드: {min(i + batch_size, total)}/{total}", end="\r")
    print()

    # documents 테이블 메타데이터 저장 (있으면 업데이트, 없으면 삽입)
    existing_doc = client.table("documents").select("id").eq("name", doc_name).execute()
    doc_meta = {"name": doc_name, "type": doc_category, "status": "최신"}
    if existing_doc.data:
        client.table("documents").update(doc_meta).eq("name", doc_name).execute()
    else:
        client.table("documents").insert(doc_meta).execute()

    return True


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not Path(pdf_path).exists():
        print(f"오류: 파일을 찾을 수 없습니다 → {pdf_path}")
        sys.exit(1)

    # 문서명: 인자 없으면 파일명에서 추출
    doc_name = sys.argv[2] if len(sys.argv) >= 3 else Path(pdf_path).stem
    doc_category = sys.argv[3] if len(sys.argv) >= 4 else "고시"

    # 기존 DB 카테고리(전파법, 전파법_시행령 등)도 허용 — 재업로드 시 원래 카테고리 유지
    VALID_CATEGORIES = (
        "법령", "고시", "ITU-R",
        "전파법", "전파법_시행령", "전파법_시행규칙",
        "전기통신사업법", "전기통신사업법_시행령",
        "방송통신발전기본법", "방송통신발전기본법_시행령",
        "기술기준", "적합성평가", "주파수할당", "주파수분배표",
        "전자파", "정보통신망법", "정보통신기반시설", "방송통신설비",
    )
    if doc_category not in VALID_CATEGORIES:
        print(f"오류: 지원하지 않는 카테고리입니다 (입력값: {doc_category})")
        print(f"  허용값: {', '.join(VALID_CATEGORIES)}")
        sys.exit(1)

    suffix = Path(pdf_path).suffix.lower()
    print(f"\n[1/4] 텍스트 추출: {pdf_path}")
    if suffix == ".txt":
        with open(pdf_path, "r", encod