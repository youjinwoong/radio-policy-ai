"""
Supabase 클라이언트 공용 생성기.

supabase-py 2.31.0 / postgrest 2.31.0가 httpx[http2]를 끌어오면서 Supabase REST 호출이
HTTP/2 로 협상되고, Supabase 엔드포인트가 HTTP/2 연결을 끊어 `httpx.RemoteProtocolError:
Server disconnected`로 죽는 알려진 버그(supabase-py #1064, HTTP/2 keepalive 문제)를 회피한다.

해결: HTTP/1.1 강제(http2 미사용) + 재시도 3회 + keepalive 연결 1개로 제한.
모든 스크립트는 `create_client(...)` 대신 이 `make_client(...)`를 사용한다.
※ ClientOptions(httpx_client=...) 전달은 supabase-py 2.16.0+ 에서 지원.
"""
import httpx
from supabase import create_client, Client, ClientOptions


def make_client(url: str, key: str) -> Client:
    # transport를 명시하면 protocol(HTTP/1.1)·retries·limits가 transport 기준으로 적용된다.
    # HTTPTransport는 기본 http2=False → HTTP/1.1 사용(=Server disconnected 버그 원인 제거).
    transport = httpx.HTTPTransport(
        retries=3,
        limits=httpx.Limits(
            max_connections=100,
            max_keepalive_connections=1,   # keepalive 소켓 재사용 최소화(끊긴 연결 재사용 방지)
            keepalive_expiry=30,
        ),
    )
    http_client = httpx.Client(transport=transport, timeout=httpx.Timeout(30.0))
    return create_client(url, key, options=ClientOptions(httpx_client=http_client))
