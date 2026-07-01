// ============================================================================
//  Supabase Edge Function : confluence-search
//  역할: 사용자 질문(텍스트)을 받아 팀 Confluence(Atlassian Cloud)를 CQL로
//        실시간 검색하고, 상위 페이지의 제목·링크·본문 발췌를 돌려준다.
//        대시보드 AI 자문(callClaude)이 호출해 "우리 팀 내부 문서"를 근거로 삼는다.
//
//  왜 Edge Function인가:
//   - Confluence Cloud REST API는 브라우저에서 직접 못 부른다(CORS 차단).
//   - 무엇보다 API 토큰을 app.js(공개 repo·브라우저)에 넣으면 안 된다.
//     → voyage-embed와 동일하게 토큰을 서버 측 Secret에 보관하고 여기서만 호출.
//
//  배포 방법 (둘 중 하나)
//   A) Supabase 대시보드 → Edge Functions → 'Create a new function'
//      → 이름을 정확히  confluence-search  로 입력 → 아래 코드 전체 붙여넣고 Deploy
//   B) (개발자) supabase CLI:  supabase functions deploy confluence-search
//
//  배포 후 반드시 Secret 등록 (Project Settings → Edge Functions → Secrets):
//
//   ▶ 사내 호스팅 Confluence (Server / Data Center) — 회사 도메인, PAT(Bearer) 인증  ← 우리 경우
//     CONFLUENCE_BASE_URL   = https://confluence.<회사도메인>       (사이트 루트, 끝 슬래시 없이. /wiki 붙이지 말 것)
//     CONFLUENCE_API_TOKEN  = Confluence → 프로필 → Settings → Personal Access Tokens 에서 발급
//     CONFLUENCE_SPACES     = (선택) 검색 한정 space key 쉼표구분 (예: TECH,POLICY). 비우면 권한 내 전체.
//     (CONFLUENCE_EMAIL 은 비워둔다 → 자동으로 Bearer PAT 인증 사용)
//
//   ▶ Atlassian Cloud (*.atlassian.net) — 이메일 + API 토큰(Basic) 인증
//     CONFLUENCE_BASE_URL   = https://<팀도메인>.atlassian.net/wiki  (끝 /wiki 포함, 슬래시 없이)
//     CONFLUENCE_EMAIL      = 토큰 발급 계정 이메일
//     CONFLUENCE_API_TOKEN  = id.atlassian.com → Security → API tokens 에서 발급
//     CONFLUENCE_SPACES     = (선택) 위와 동일.
//
//   인증 분기: CONFLUENCE_EMAIL 이 있으면 Basic(email:token)=Cloud, 없으면 Bearer(token)=Server/DC PAT.
//   * verify_jwt 는 꺼둔 상태로 사용(대시보드에서 anon 호출).
//   * 검색 결과는 토큰 발급 계정의 Confluence 열람 권한 범위만 나온다(권한 밖 문서는 안 나옴).
//   * SSO(SAML)가 걸린 사내 Confluence도 PAT는 REST API에서 그대로 통한다(SSO 우회).
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BASE_URL = (Deno.env.get('CONFLUENCE_BASE_URL') || '').replace(/\/+$/, '');
const EMAIL = Deno.env.get('CONFLUENCE_EMAIL') || '';
const API_TOKEN = Deno.env.get('CONFLUENCE_API_TOKEN') || '';
const SPACES = (Deno.env.get('CONFLUENCE_SPACES') || '').trim();
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
// charset=utf-8 명시: PowerShell 등 순진한 클라이언트가 응답을 Latin1로 오독해 한글이 깨지는 것 방지
// (브라우저 fetch().json()은 항상 UTF-8 디코딩이라 무관하지만, 명시가 안전).
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' };

// HTML(body.view) → 평문 발췌. 태그 제거 + 엔티티 복원 + 공백 정리 후 앞부분만.
function htmlToExcerpt(html: string, maxLen: number): string {
  const text = (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen) + ' …' : text;
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!BASE_URL || !API_TOKEN) {
      return new Response(
        JSON.stringify({ error: 'Confluence secrets not configured (need CONFLUENCE_BASE_URL + CONFLUENCE_API_TOKEN)' }),
        { status: 500, headers: jsonHeaders }
      );
    }

    const body = await req.json().catch(() => ({}));
    const query: string = (body && typeof body.query === 'string') ? body.query : '';
    const limit: number = Math.min(Math.max(Number(body?.limit) || 5, 1), 10);
    if (!query || query.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: 'query string (>=2 chars) is required' }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // CQL 조립. 사용자 텍스트의 큰따옴표·백슬래시는 제거해 CQL 문법 깨짐 방지.
    const safe = query.replace(/["\\]/g, ' ').trim().slice(0, 200);
    let cql = `type = page AND text ~ "${safe}"`;
    if (SPACES) {
      const keys = SPACES.split(',').map((s) => s.trim()).filter(Boolean).join(',');
      if (keys) cql += ` AND space in (${keys})`;
    }
    cql += ' ORDER BY lastmodified DESC';

    // Confluence Cloud REST API v1 content search (CQL + 본문 발췌).
    const url = `${BASE_URL}/rest/api/content/search`
      + `?cql=${encodeURIComponent(cql)}`
      + `&limit=${limit}`
      + `&expand=space,version,body.view`;

    // 인증 분기: 이메일이 있으면 Cloud(Basic email:token), 없으면 Server/DC(Bearer PAT).
    const authHeader = EMAIL
      ? `Basic ${btoa(`${EMAIL}:${API_TOKEN}`)}`
      : `Bearer ${API_TOKEN}`;
    const resp = await fetch(url, {
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
    });

    if (!resp.ok) {
      const err = await resp.text();
      return new Response(
        JSON.stringify({ error: `Confluence API error (HTTP ${resp.status}): ${err.slice(0, 400)}` }),
        { status: resp.status, headers: jsonHeaders }
      );
    }

    const data = await resp.json();
    const rows: any[] = Array.isArray(data?.results) ? data.results : [];
    // 페이지 링크 베이스: 응답의 _links.base(정식 절대경로·context path 포함)를 우선, 없으면 Secret BASE_URL.
    const linkBase = (data?._links?.base || BASE_URL).replace(/\/+$/, '');
    const results = rows.map((r) => {
      const webui = r?._links?.webui || '';
      return {
        title: r?.title || '(제목 없음)',
        space: r?.space?.name || r?.space?.key || '',
        url: webui ? `${linkBase}${webui}` : '',
        lastModified: (r?.version?.when || '').slice(0, 10),
        excerpt: htmlToExcerpt(r?.body?.view?.value || '', 900),
      };
    });

    return new Response(JSON.stringify({ results }), { headers: jsonHeaders });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: jsonHeaders });
  }
});
