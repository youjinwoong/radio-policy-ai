#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
전파정책 전문가 AI — RAG 인덱싱 스크립트 (키워드 검색 버전)
======================================================
사용법:
  1. pip install pdfplumber supabase
  2. 아래 CONFIG 섹션에 Supabase URL·Key와 폴더 경로 입력
  3. python rag_indexer.py

기능:
  - 전파법 관련 자료 폴더의 PDF/MD/TXT 파일 순회
  - 텍스트 추출 → 청크 분할 → Supabase 업로드
  - 임베딩 API 불필요 (Claude API 키만 있으면 됨)
"""

import os
import sys
import time
import logging
from pathlib import Path

# ============================================================
# CONFIG — 이 섹션만 수정하세요
# ============================================================
SUPABASE_URL = "https://zwkjedumfuhodckmtxxn.supabase.co"   # Supabase 프로젝트 URL
SUPABASE_KEY = "sb_publishable_2Q4UcrcmWn80JLobCBxNNA_p5GYyKUY"            # Supabase anon 키

# 문서 폴더 경로
DOC_FOLDER = r"C:\Users\SKTelecom\Desktop\전파법 관련 자료"

# 청크 설정
CHUNK_SIZE    = 700   # 문자 단위 청크 크기 (법령 조문 단위 고려)
CHUNK_OVERLAP = 100   # 청크 간 겹침 (문맥 연속성 유지)
MIN_CHUNK_LEN = 80    # 이보다 짧은 청크는 건너뜀

# Supabase 테이블명
TABLE_NAME = "document_chunks"

# 제외할 폴더명 (부분 일치)
EXCLUDE_DIRS = ["_업로드제외"]

# 처리할 확장자
INCLUDE_EXTS = {".pdf", ".md", ".txt"}
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger(__name__)


def get_category(filename: str) -> str:
    """파일명으로 카테고리 자동 분류"""
    if "전파법" in filename:
        if "시행령" in filename: return "전파법_시행령"
        if "시행규칙" in filename: return "전파법_시행규칙"
        return "전파법"
    if "전기통신사업법" in filename:
        if "시행령" in filename: return "전기통신사업법_시행령"
        return "전기통신사업법"
    if "정보통신망" in filename: return "정보통신망법"
    if "방송통신발전" in filename:
        if "시행령" in filename: return "방송통신발전기본법_시행령"
        return "방송통신발전기본법"
    if "방송통신기금" in filename: return "방송통신발전기본법"
    if "방송미디어통신" in filename: return "방송통신발전기본법"
    if "방송통신설비" in filename: return "방송통신설비"
    if "인터넷 멀티미디어 방송" in filename or "인터넷멀티미디어방송" in filename: return "방송통신설비"
    if "정보통신기반시설" in filename: return "정보통신기반시설"
    if "주파수분배" in filename or "주파수 분배" in filename: return "주파수분배표"
    if "주파수할당" in filename or "할당대가" in filename: return "주파수할당"
    if "전자파" in filename or "sar" in filename.lower() or "emc" in filename.lower(): return "전자파"
    if "적합성평가" in filename or "기자재" in filename: return "적합성평가"
    if "ITU" in filename or "itu" in filename.lower(): return "ITU-R"
    if "보도자료" in filename: return "보도자료"
    if "기술기준" in filename or "무선설비" in filename: return "기술기준"
    return "기타"


def extract_text(fpath: Path) -> str:
    """PDF 또는 텍스트 파일에서 텍스트 추출"""
    ext = fpath.suffix.lower()
    if ext == ".pdf":
        try:
            import pdfplumber
            with pdfplumber.open(fpath) as pdf:
                pages = []
                for i, page in enumerate(pdf.pages):
                    t = page.extract_text()
                    if t:
                        pages.append(f"[{i+1}페이지]\n{t}")
            return "\n\n".join(pages)
        except Exception as e:
            log.warning(f"PDF 추출 실패: {fpath.name} — {e}")
            return ""
    elif ext in (".md", ".txt"):
        try:
            return fpath.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            return fpath.read_text(encoding="cp949", errors="ignore")
    return ""


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list:
    """텍스트를 청크로 분할 (조문 경계 우선 인식)"""
    import re
    article_pattern = re.compile(r"(?=제\s*\d+\s*조[\s(])")
    parts = article_pattern.split(text)

    chunks = []
    current = ""

    for part in parts:
        if len(current) + len(part) <= size:
            current += part
        else:
            if len(current.strip()) >= MIN_CHUNK_LEN:
                chunks.append(current.strip())
            if len(part) > size:
                for i in range(0, len(part), size - overlap):
                    sub = part[i:i + size]
                    if len(sub.strip()) >= MIN_CHUNK_LEN:
                        chunks.append(sub.strip())
                current = part[-(overlap):]
            else:
                current = part

    if len(current.strip()) >= MIN_CHUNK_LEN:
        chunks.append(current.strip())

    return chunks


def upload_chunks(sb, chunks: list, batch_size: int = 100) -> int:
    """Supabase에 청크 업로드"""
    uploaded = 0
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        try:
            sb.table(TABLE_NAME).insert(batch).execute()
            uploaded += len(batch)
        except Exception as e:
            log.error(f"업로드 실패 (배치 {i}): {e}")
    return uploaded


def should_skip(path: Path) -> bool:
    """제외 폴더인지 확인"""
    for part in path.parts:
        for excl in EXCLUDE_DIRS:
            if excl in part:
                return True
    return False


def main():
    # 의존성 확인
    try:
        import pdfplumber
        from supabase import create_client
    except ImportError as e:
        print(f"\n❌ 필요한 패키지가 없습니다: {e}")
        print("다음 명령어로 설치하세요:")
        print("  pip install pdfplumber supabase")
        sys.exit(1)

    # 설정 확인
    if "XXXXXXXX" in SUPABASE_URL or "eyJhbGciOiJIUzI1NiIsInR5..." in SUPABASE_KEY:
        print("\n❌ CONFIG 섹션의 Supabase URL과 키를 먼저 설정하세요!")
        sys.exit(1)

    doc_folder = Path(DOC_FOLDER)
    if not doc_folder.exists():
        print(f"\n❌ 폴더를 찾을 수 없습니다: {DOC_FOLDER}")
        sys.exit(1)

    # Supabase 클라이언트 초기화
    from supabase import create_client
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    log.info(f"Supabase 연결 완료")
    log.info(f"폴더 스캔 시작: {doc_folder}")

    # 기존 데이터 초기화 여부 확인
    print("\n기존 document_chunks 데이터를 삭제하고 다시 시작할까요?")
    print("  y = 삭제 후 새로 인덱싱 (권장, 중복 방지)")
    print("  n = 기존 데이터 유지하고 추가만")
    choice = input("선택 (y/n): ").strip().lower()
    if choice == 'y':
        try:
            sb.table(TABLE_NAME).delete().neq('id', 0).execute()
            log.info("기존 데이터 삭제 완료")
        except Exception as e:
            log.warning(f"기존 데이터 삭제 실패: {e}")

    # 파일 목록 수집
    all_files = []
    for root, dirs, files in os.walk(doc_folder):
        root_path = Path(root)
        dirs[:] = [d for d in dirs if not any(excl in d for excl in EXCLUDE_DIRS)]
        for fname in files:
            fpath = root_path / fname
            if fpath.suffix.lower() in INCLUDE_EXTS and not should_skip(fpath):
                all_files.append(fpath)

    log.info(f"처리할 파일 수: {len(all_files)}개")

    total_chunks = 0
    total_uploaded = 0

    for idx, fpath in enumerate(all_files, 1):
        log.info(f"[{idx}/{len(all_files)}] {fpath.name}")

        text = extract_text(fpath)
        if not text or len(text.strip()) < 100:
            log.warning(f"  → 텍스트 없음, 건너뜀")
            continue

        chunks = chunk_text(text)
        if not chunks:
            log.warning(f"  → 청크 없음, 건너뜀")
            continue

        log.info(f"  → {len(chunks)}개 청크")

        records = [
            {
                "doc_name": fpath.name,
                "doc_category": get_category(fpath.name),
                "chunk_index": i,
                "content": chunk
            }
            for i, chunk in enumerate(chunks)
        ]

        uploaded = upload_chunks(sb, records)
        log.info(f"  → {uploaded}/{len(records)}개 업로드 완료")

        total_chunks += len(chunks)
        total_uploaded += uploaded
        time.sleep(0.05)  # Supabase rate limit 방지

    log.info("=" * 50)
    log.info(f"인덱싱 완료!")
    log.info(f"  처리 파일: {len(all_files)}개")
    log.info(f"  총 청크:   {total_chunks}개")
    log.info(f"  업로드:    {total_uploaded}개")
    log.info("=" * 50)

    # 결과 확인
    try:
        result = sb.table(TABLE_NAME).select("doc_category", count="exact").execute()
        log.info(f"Supabase 총 레코드: {result.count}개")
    except Exception as e:
        log.warning(f"결과 확인 실패: {e}")


if __name__ == "__main__":
    main()
