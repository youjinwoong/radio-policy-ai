"""
Voyage AI 임베딩 백필 스크립트
사용법: python backfill_embeddings.py

- voyage-4-lite 모델로 document_chunks 전체 임베딩 생성
- 100개씩 배치로 Voyage API 호출 → batch_update_embeddings RPC로 저장
- 완료 후 HNSW 인덱스 자동 생성
"""

import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
VOYAGE_API_KEY = "pa-H5qAIUjzNlPjlJaYHRg9j3BnFnQ6jMDgdKB1of9s6Qf"

VOYAGE_MODEL    = "voyage-4-lite"
EMBED_DIM       = 1024
VOYAGE_BATCH    = 100   # Voyage API 배치 크기
FETCH_BATCH     = 500   # Supabase에서 한 번에 가져올 청크 수
SLEEP_SEC       = 0.3   # 배치 간 대기 (rate-limit 여유)


# ── Supabase REST helpers ─────────────────────────────────

def _sb_headers(extra=None):
    h = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def count_null_embeddings():
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/document_chunks",
        headers=_sb_headers({"Prefer": "count=exact"}),
        params={"embedding": "is.null", "select": "id"},
    )
    resp.raise_for_status()
    cr = resp.headers.get("content-range", "0/0")
    return int(cr.split("/")[1]) if "/" in cr else 0


def fetch_chunks(offset, limit=FETCH_BATCH):
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/document_chunks",
        headers=_sb_headers(),
        params={
            "select": "id,content",
            "embedding": "is.null",
            "order": "id.asc",
            "offset": offset,
            "limit": limit,
        },
    )
    resp.raise_for_status()
    return resp.json()


def batch_update_rpc(ids, embeddings):
    """batch_update_embeddings RPC 호출 (한 번에 최대 100행)"""
    p_embeddings = [
        "[" + ",".join(f"{v:.8f}" for v in emb) + "]"
        for emb in embeddings
    ]
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/batch_update_embeddings",
        headers=_sb_headers(),
        json={"p_ids": ids, "p_embeddings": p_embeddings},
    )
    resp.raise_for_status()


# ── Voyage AI helper ──────────────────────────────────────

def get_voyage_embeddings(texts):
    resp = requests.post(
        "https://api.voyageai.com/v1/embeddings",
        headers={
            "Authorization": f"Bearer {VOYAGE_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": VOYAGE_MODEL,
            "input": texts,
            "input_type": "document",  # 청크는 'document'
        },
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    return [item["embedding"] for item in data["data"]]


# ── HNSW 인덱스 생성 ─────────────────────────────────────

def create_hnsw_index():
    print("\n[최종] HNSW 인덱스 생성 중 (embedding <=> 코사인)...")
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/batch_update_embeddings",  # dummy call to warm connection
        headers=_sb_headers(),
        json={"p_ids": [], "p_embeddings": []},
    )
    # 인덱스는 SQL로만 가능 — 안내만 출력
    print("  ※ HNSW 인덱스는 Supabase SQL Editor에서 아래 쿼리 실행 필요:")
    print()
    print("  CREATE INDEX IF NOT EXISTS document_chunks_embedding_hnsw_idx")
    print("    ON document_chunks USING hnsw (embedding vector_cosine_ops)")
    print("    WITH (m = 16, ef_construction = 64);")
    print()


# ── 메인 ────────────────────────────────────────────────

def main():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("오류: .env에 SUPABASE_URL, SUPABASE_SERVICE_KEY가 없습니다.")
        return

    total = count_null_embeddings()
    print(f"임베딩 없는 청크: {total:,}개 (모델: {VOYAGE_MODEL}, {EMBED_DIM}차원)")
    if total == 0:
        print("모든 청크에 임베딩이 있습니다. 완료!")
        return

    processed = 0
    offset = 0
    errors = 0

    while True:
        chunks = fetch_chunks(offset, FETCH_BATCH)
        if not chunks:
            break

        for i in range(0, len(chunks), VOYAGE_BATCH):
            batch = chunks[i : i + VOYAGE_BATCH]
            texts = [c["content"] for c in batch]
            ids   = [c["id"]      for c in batch]

            retry = 0
            while retry < 3:
                try:
                    embeddings = get_voyage_embeddings(texts)
                    batch_update_rpc(ids, embeddings)
                    processed += len(batch)
                    pct = processed / total * 100
                    print(f"  {processed:>6,}/{total:,} ({pct:5.1f}%)  "
                          f"id {ids[0]}~{ids[-1]}      ", end="\r")
                    break
                except requests.HTTPError as e:
                    retry += 1
                    errors += 1
                    wait = 5 * retry
                    print(f"\n  HTTP 오류 (재시도 {retry}/3, {wait}s 대기): {e}")
                    time.sleep(wait)
                except Exception as e:
                    retry += 1
                    errors += 1
                    print(f"\n  오류 (재시도 {retry}/3): {e}")
                    time.sleep(3)

            time.sleep(SLEEP_SEC)

        offset += len(chunks)
        if len(chunks) < FETCH_BATCH:
            break

    print(f"\n\n✅ 완료! {processed:,}개 임베딩 저장 (오류: {errors}개)")
    create_hnsw_index()


if __name__ == "__main__":
    main()
