// ════════════════════════════════════════════
//  SKT 전파정책 AI 분석 — 공통 시스템 프롬프트
// ════════════════════════════════════════════
const SKT_IMPACT_SYSTEM_PROMPT =
'당신은 SK텔레콤 Comm센터 기술정책팀 소속 전파정책 수석 전문위원이다.\n' +
'뉴스·이슈를 분석할 때 아래 SKT 현황과 관점을 반드시 반영하라.\n\n' +
'[SKT 주파수 보유 현황]\n' +
'- 800MHz (Band 5): LTE 전국망 핵심, 재난망 로밍 제공\n' +
'- 1.8GHz (Band 3): LTE/5G DSS, 도심 용량\n' +
'- 2.1GHz (Band 1): LTE 주력, 주파수 재할당 검토 대상\n' +
'- 2.6GHz (Band 7): LTE TDD 보조\n' +
'- 3.5GHz (n78): 5G SA/NSA 주력, 경쟁사 대비 최다 보유(100MHz)\n' +
'- 28GHz (n257): 5G mmWave 기업전용망, 커버리지 의무 이슈\n\n' +
'[SKT 핵심 사업 & 규제 민감 영역]\n' +
'- 5G 가입자 1위 유지 및 SA(단독모드) 전환 일정\n' +
'- 에이닷(AI), T맵, 메가TV, B2B(클라우드·IoT·보안·스마트팩토리)\n' +
'- 위성통신(스타링크 파트너십), D2D, NTN 사업 기회\n' +
'- 공공와이파이 T-WiFi 운영 (와이파이는 비면허 대역 사용 — 주파수 경매·할당 대상 아님)\n' +
'- 주파수 재할당 심사기준·대가 산정 방식 변화 리스크\n' +
'- MVNO(알뜰폰) 도매대가 규제, 설비 공동활용 의무\n' +
'- 망 이용대가·트래픽 급증 대응 비용 부담\n' +
'- 전자파 인체보호기준 강화 시 기지국 출력 제한 리스크\n\n' +
'[분석 관점 — 반드시 구체적으로]\n' +
'① 주파수·기술 관점: 보유 주파수 대역 직접 언급, 할당/재할당/이용기간 영향\n' +
'② 사업 관점: 매출·가입자·CAPEX에 미치는 영향, KT·LGU+ 대비 유불리\n' +
'③ 규제·CR 관점: 과기정통부·방통위 동향, 의견서 제출·국회 대응 필요성\n' +
'④ 대응 방향: CR팀이 즉시 취해야 할 구체적 액션\n\n' +
'[엄수 사항 — 할루시네이션 방지]\n' +
'- 뉴스에 명시된 사실만 근거로 쓴다. 뉴스에 없는 내용을 지어내지 않는다.\n' +
'- SKT 현황 정보는 국내 사업과의 관련성 분석에만 활용한다.\n' +
'- SKT 해외 사업·자회사 현황은 뉴스에 직접 언급된 경우에만 언급한다.\n' +
'- 경쟁사(KT·LGU+) 행동은 뉴스에 근거가 있을 때만 언급한다.\n' +
'- 불확실한 내용은 반드시 "~가능성", "~우려", "~검토 필요" 등으로 표시한다.\n\n' +
'XML 형식으로만 답변 (다른 텍스트 없이):\n' +
'<impact>SKT에 미치는 구체적 영향 2~3문장. 뉴스 근거 + SKT 관련 사업·주파수 명시. 추측은 가능성 표현 사용.</impact>\n' +
'<priority>\n' +
'아래 기준으로 셋 중 하나만 출력:\n' +
'- 즉시대응: ① 이동통신 품질·장비·기지국·공공 와이파이 관련 불만/부정/민원 기사\n' +
'             ② 전파·전자파·무선국·주파수 관련 불만/부정/규제강화 기사\n' +
'             ③ 법적 조치·행정처분·과징금·허가취소 등 SKT에 직접 영향\n' +
'- 금주검토: ① 이동통신 품질·장비·기지국·공공 와이파이 관련 정보성·동향 기사\n' +
'             ② 전파·전자파·무선국·주파수 관련 정보성·정책 동향 기사\n' +
'             ③ 입법예고·개정안·정책 발표 등 SKT에 간접 영향\n' +
'- 동향파악: 위 두 기준에 해당하지 않는 해외 동향·업계 일반 트렌드·참고용 기사\n' +
'</priority>';

// ════════════════════════════════════════════
//  Config (localStorage + Supabase app_config)
// ════════════════════════════════════════════
const CFG_KEY = 'radio_policy_config';
let _remoteClaudeKey = null; // Supabase에서 로드한 Claude 키 캐시

function getConfig() {
  try {
    var cfg = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
    // localStorage에 Claude 키 없으면 Supabase에서 로드한 값 사용
    if (!cfg.claudeKey && _remoteClaudeKey) cfg.claudeKey = _remoteClaudeKey;
    return cfg;
  } catch(e) { return {}; }
}
function saveConfig(c) { localStorage.setItem(CFG_KEY, JSON.stringify(c)); }

// Supabase app_config에서 Claude 키 로드 (페이지 시작 시 1회 실행)
async function loadRemoteConfig() {
  if (!sb) return;
  try {
    var { data } = await sb.from('app_config').select('key,value');
    if (!data) return;
    data.forEach(function(row) {
      if (row.key === 'claude_key' && row.value) {
        _remoteClaudeKey = row.value;
      }
    });
  } catch(e) { console.warn('app_config 로드 실패:', e); }
}

// ════════════════════════════════════════════
//  Supabase
// ════════════════════════════════════════════
// 기본 Supabase 연결 정보 (anon key는 클라이언트 공개 설계)
const DEFAULT_SB_URL = 'https://zwkjedumfuhodckmtxxn.supabase.co';
const DEFAULT_SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3a2plZHVtZnVob2Rja210eHhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MjQ1MjMsImV4cCI6MjA5NTEwMDUyM30.jxMwPgngbSGugU-1GuLNV7EiURONz7JT85F4WdqMisU';

let sb = null;
function initSupabase() {
  const cfg = getConfig();
  const sbUrl = cfg.sbUrl || DEFAULT_SB_URL;
  const sbKey = cfg.sbKey || DEFAULT_SB_KEY;
  try {
    sb = window.supabase.createClient(sbUrl, sbKey);
    return true;
  } catch(e) { return false; }
}

// ════════════════════════════════════════════
//  RAG — 키워드 검색 + Haiku 쿼리 확장 (동의어·법령 용어)
// ════════════════════════════════════════════
let lastRagSources = [];
let lastConfluenceFailed = false; // 직전 자문에서 컨플루언스 검색이 실패해 생략됐는지 (무음 실패 가시화)

function extractKeywords(text) {
  // 한국어 조사·어미·불용어 제거
  var stopwords = ['이','가','은','는','을','를','의','에','에서','으로','로','과','와','도',
    '만','그','이것','저것','그것','있다','없다','하다','되다','이다','어떻게','어떤',
    '무엇','언제','어디','왜','누가','대해','관해','통해','위해','따라','대한','관한',
    '통한','위한','있는','없는','하는','되는','인','이란','이라는','라는','라고',
    '이고','이며','하고','이나','이나','또는','그리고','하지만','그러나','따라서'];
  // 조사 어미 제거 (예: "면허세에" → "면허세") — 잘린 어간도 ilike 부분일치로 검색됨
  var josa = /(에서는|으로는|에서의|이라는|에서도|에서|에는|으로|로는|보다|부터|까지|처럼|마다|조차|밖에|은|는|이|가|을|를|의|에|와|과|도|만)$/;
  var words = text.split(/[\s,\.·\·\(\)\[\]\「\」\『\』\<\>\:;\!\?]+/)
    .map(function(w) { return w.replace(/[^가-힣a-zA-Z0-9\.]/g, '').trim(); })
    .map(function(w) { var s = w.replace(josa, ''); return s.length >= 2 ? s : w; })
    .filter(function(w) { return w.length >= 2 && !stopwords.includes(w); });
  // 법령 키워드 우선 (조문번호, 주제어)
  var priority = words.filter(function(w) {
    return /제\d+조|주파수|할당|재할당|전자파|ITU|5G|6G|EMC|SAR|고시|시행령|시행규칙|적합성|기술기준|무선국|면허|허가|신청|승인|폐업|폐지|이용기간/.test(w);
  });
  var rest = words.filter(function(w) { return !priority.includes(w); });
  var all = priority.concat(rest);
  // 중복 제거
  return all.filter(function(v, i, a) { return a.indexOf(v) === i; }).slice(0, 5);
}

// 쿼리 확장 — Haiku로 동의어·법령 공식 용어 키워드 생성 (실패 시 빈 배열 → 기존 키워드만 사용)
async function expandQueryKeywords(query) {
  try {
    var { claudeKey } = getConfig();
    if (!claudeKey) return [];
    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: '당신은 한국 전파·통신 법령 검색 전문가입니다. 사용자 질문을 법령·고시 원문에서 실제 쓰이는 공식 용어로 확장합니다.',
        messages: [{ role: 'user', content: '다음 질문을 법령·고시 문서 검색용 키워드로 확장해줘. 질문 표현과 다른 동의어, 법령 공식 용어, 관련 조문 주제어 위주로 6~8개. 쉼표로만 구분해 한 줄로 출력하고 설명은 금지:\n\n' + query }]
      })
    });
    if (!res.ok) return [];
    var data = await res.json();
    var text = (data.content && data.content[0] && data.content[0].text) || '';
    return text.split(',')
      .map(function(w) { return w.trim().replace(/^["'\d\.\)\s]+|["'\s]+$/g, ''); })
      .filter(function(w) { return w.length >= 2 && w.length <= 25; })
      .slice(0, 8);
  } catch(e) { console.warn('쿼리 확장 실패 (기본 키워드로 진행):', e); return []; }
}

async function getQueryEmbedding(query, model) {
  // Supabase Edge Function(voyage-embed)으로 질의 임베딩 생성 (키 노출 없음)
  // model 미지정=voyage-4-lite(document_chunks 조문) / 'voyage-law-2'(kb_chunks 법령요약).
  // 저장·질의 모델은 반드시 일치해야 함(모델별 임베딩 공간이 달라 혼용 시 검색 무의미).
  try {
    if (!sb) return null;
    var body = { query: query };
    if (model) body.model = model;
    var result = await sb.functions.invoke('voyage-embed', { body: body });
    if (result.error) { console.warn('voyage-embed 오류:', result.error); return null; }
    return (result.data && result.data.embedding) ? result.data.embedding : null;
  } catch(e) { console.warn('시맨틱 임베딩 실패 (폴백):', e); return null; }
}

async function searchKeywords(query, lawOnly) {
  if (!sb) return [];
  if (lawOnly === undefined) lawOnly = false;
  var baseKeywords = extractKeywords(query);
  var expanded = await expandQueryKeywords(query);
  // 기본 키워드 우선 + 확장 키워드 보강 (공백 제거·소문자 정규화로 중복 제거)
  var keywords = [];
  var seenKw = new Set();
  baseKeywords.concat(expanded).forEach(function(w) {
    var norm = w.replace(/\s+/g, '').toLowerCase();
    if (norm.length >= 2 && !seenKw.has(norm)) { seenKw.add(norm); keywords.push(w); }
  });
  if (keywords.length === 0) return [];

  var seen = new Set();
  var results = [];

  // trgm + 시맨틱 검색 병렬 실행 (키워드 루프와 동시 진행)
  var trgmPromise = null;
  var semanticPromise = null;
  if (query && query.length >= 3) {
    trgmPromise = sb.rpc('search_chunks_trgm', {
      query_text: query,
      match_threshold: 0.12,
      match_count: 8
    }).then(function(r) { return r.data || []; }).catch(function(e) {
      console.warn('trgm 검색 오류:', e); return [];
    });
    // 시맨틱: Edge Function으로 임베딩 → pgvector 코사인 유사도
    semanticPromise = getQueryEmbedding(query).then(function(emb) {
      if (!emb) return [];
      return sb.rpc('match_chunks_semantic', {
        query_embedding: emb,
        match_threshold: 0.45,
        match_count: 8
      }).then(function(r) { return r.data || []; }).catch(function(e) {
        console.warn('시맨틱 검색 오류:', e); return [];
      });
    });
  }

  // 키워드별로 검색 (최대 10개 키워드, 키워드당 4청크) — 전 키워드 동시 조회 후 원래 순서로 병합
  var kwList = [];
  for (var ki = 0; ki < Math.min(keywords.length, 10); ki++) {
    if (keywords[ki].length >= 2) kwList.push(keywords[ki]);
  }
  var kwResults = await Promise.all(kwList.map(function(kw) {
    return sb
      .from('document_chunks')
      .select('id, doc_name, doc_category, chunk_index, content, notice_no, article_no, effective_date')
      .eq('is_approved', true)  // 승인 게이트: trgm·시맨틱 RPC와 동일하게 승인 전 문서 제외
      .ilike('content', '%' + kw + '%')
      .limit(4)
      .then(function(resp) { return resp.data || []; })
      .catch(function(e) { console.warn('키워드 검색 오류:', kw, e); return []; });
  }));
  kwResults.forEach(function(rows) {
    for (var ri = 0; ri < rows.length; ri++) {
      var row = rows[ri];
      if (!seen.has(row.id)) {
        seen.add(row.id);
        results.push(row);
      }
    }
  });

  // trgm 결과 병합
  if (trgmPromise) {
    var trgmRows = await trgmPromise;
    trgmRows.forEach(function(row) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        row._trgm_score = row.trgm_score || 0;
        results.push(row);
      } else {
        for (var ri = 0; ri < results.length; ri++) {
          if (results[ri].id === row.id) {
            results[ri]._trgm_score = row.trgm_score || 0;
            if (!results[ri].article_no && row.article_no) results[ri].article_no = row.article_no;
            if (!results[ri].notice_no && row.notice_no) results[ri].notice_no = row.notice_no;
            if (!results[ri].effective_date && row.effective_date) results[ri].effective_date = row.effective_date;
            break;
          }
        }
      }
    });
    console.log('trgm 검색:', trgmRows.length + '개 청크');
  }

  // 시맨틱 결과 병합
  if (semanticPromise) {
    var semanticRows = await semanticPromise;
    semanticRows.forEach(function(row) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        row._semantic_score = row.similarity || 0;
        results.push(row);
      } else {
        for (var ri = 0; ri < results.length; ri++) {
          if (results[ri].id === row.id) {
            results[ri]._semantic_score = row.similarity || 0;
            if (!results[ri].article_no && row.article_no) results[ri].article_no = row.article_no;
            if (!results[ri].notice_no && row.notice_no) results[ri].notice_no = row.notice_no;
            if (!results[ri].effective_date && row.effective_date) results[ri].effective_date = row.effective_date;
            break;
          }
        }
      }
    });
    console.log('시맨틱 검색:', semanticRows.length + '개 청크');
  }

  // 하이브리드 점수(정규화): 키워드는 무제한 누적이라 결과 내 최대값으로 0~1 정규화,
  // trgm·시맨틱은 원래 0~1 절대 척도라 그대로 사용하되 시맨틱(의미 유사도)에 2배 가중.
  // 흔한 단어 물량이 의미 적합도를 압도하던 문제 교정 (배경역사 #23)
  var maxKwScore = 0;
  results.forEach(function(r) {
    var score = 0;
    for (var ki = 0; ki < Math.min(keywords.length, 10); ki++) {
      var kw = keywords[ki].toLowerCase();
      var w = baseKeywords.includes(keywords[ki]) ? 2 : 1;
      if ((r.content || '').toLowerCase().includes(kw)) score += w;
      if ((r.doc_name || '').toLowerCase().includes(kw)) score += w;
    }
    r._score = score;
    if (score > maxKwScore) maxKwScore = score;
  });
  results.forEach(function(r) {
    r._hybrid_score = (maxKwScore > 0 ? r._score / maxKwScore : 0)
      + (r._trgm_score     || 0)
      + (r._semantic_score || 0) * 2;
  });
  results.sort(function(a, b) { return b._hybrid_score - a._hybrid_score; });

  console.log('3중 하이브리드 (키워드확장 ' + expanded.length + '개 + trgm + 시맨틱):', keywords.slice(0,10).join(', '), '->', results.length + '개 청크 (상위 12개 사용)');
  return results.slice(0, 12);
}

async function fetchLawTrackContext() {
  // AI 자문 보조용: 최근 법령·고시 개정 + 입법예고 동향(요약). 조문 인용은 지식베이스 원문 우선.
  if (!sb) return '';
  try {
    var resp = await sb.from('law_amendments')
      .select('law_nm,law_type,ann_type,public_dt,enf_dt,summary')
      .order('public_dt', { ascending: false }).limit(500);
    var rows = resp.data || [];
    var dg = function(v) { return String(v || '').replace(/\D/g, ''); };
    var latest = {};
    rows.forEach(function(r) {
      if (r.law_type === 'lsAnc') { latest['lsAnc::' + (r.law_nm || '')] = r; return; }
      var k = r.law_nm || '';
      if (!latest[k] || dg(r.public_dt) > dg(latest[k].public_dt)) latest[k] = r;
    });
    var now = new Date();
    var todayStr = now.toISOString().slice(0,10).replace(/-/g,'');
    var d180 = new Date(now - 180 * 86400000).toISOString().slice(0,10).replace(/-/g,'');
    var items = Object.keys(latest).map(function(k) { return latest[k]; }).filter(function(r) {
      if (r.law_type === 'lsAnc') return true;
      if (dg(r.enf_dt) >= todayStr) return true;
      return dg(r.public_dt) >= d180;
    }).sort(function(a, b) { return dg(b.public_dt).localeCompare(dg(a.public_dt)); }).slice(0, 25);
    if (!items.length) return '';
    var fmt = function(v) { var d = dg(v); return d.length === 8 ? d.slice(0,4)+'.'+d.slice(4,6)+'.'+d.slice(6) : '—'; };
    var lines = items.map(function(r) {
      var typ = r.law_type === 'lsAnc' ? '입법예고' : (r.ann_type || '개정');
      var dates = r.law_type === 'lsAnc' ? ('의견마감 ' + fmt(r.enf_dt)) : ('공포 ' + fmt(r.public_dt) + ', 시행 ' + fmt(r.enf_dt));
      var sm = (r.summary || '').trim();
      return '\u2022 [' + typ + '] ' + (r.law_nm || '') + ' (' + dates + ')' + (sm ? ': ' + sm : '');
    });
    return '\n\n---\n\n[최근 행정부 법령·고시 개정·입법예고 동향]\n' +
      '(최근 추적된 변경/입법예고 요약. 정확한 조문 인용은 지식베이스 법령 원문을 우선하세요.)\n' +
      lines.join('\n');
  } catch (e) {
    console.warn('lawtrack context 로드 실패:', e);
    return '';
  }
}

function buildRagContext(chunks) {
  if (!chunks || chunks.length === 0) return '';
  const items = chunks.map(function(c, i) {
    var meta = [];
    if (c.article_no) meta.push('조항: ' + c.article_no);
    if (c.notice_no) meta.push('고시번호: ' + c.notice_no);
    if (c.effective_date) meta.push('시행일: ' + c.effective_date);
    var metaStr = meta.length ? ' [' + meta.join(' | ') + ']' : '';
    var sim = c._semantic_score ? ' (시맨틱: ' + (c._semantic_score * 100).toFixed(0) + '%)' : (c._trgm_score ? ' (trgm: ' + (c._trgm_score * 100).toFixed(0) + '%)' : '');
    return '[참조 ' + (i+1) + '] 출처: ' + c.doc_name + ' (' + c.doc_category + ')' + metaStr + sim + '\n' + c.content;
  });
  return '\n\n---\n\n[RAG 검색 결과 — 질문과 관련된 실제 법령·고시 원문]\n아래 내용은 질문과 의미적으로 유사한 문서 청크를 검색한 결과입니다. 반드시 아래 원문을 최우선으로 인용하고, 조항 번호와 내용이 일치하는지 확인하여 답변하세요:\n\n' + items.join('\n\n---\n\n');
}

async function searchConfluence(query) {
  // 팀 컨플루언스(Atlassian Cloud) 실시간 검색. Edge Function(confluence-search)이
  // API 토큰을 서버 측 Secret에 들고 대신 호출 → 브라우저 노출 없음(voyage-embed와 동일 패턴).
  // 미배포·미설정·오류 시엔 []를 돌려 자문이 죽지 않고 기존 흐름 그대로 진행한다.
  lastConfluenceFailed = false;
  try {
    if (!sb || !query || query.trim().length < 2) return [];
    var result = await sb.functions.invoke('confluence-search', { body: { query: query, limit: 5 } });
    if (result.error) { lastConfluenceFailed = true; console.warn('confluence-search 오류 (건너뜀):', result.error); return []; }
    return (result.data && Array.isArray(result.data.results)) ? result.data.results : [];
  } catch(e) { lastConfluenceFailed = true; console.warn('컨플루언스 검색 실패 (건너뜀):', e); return []; }
}

function buildConfluenceContext(pages) {
  if (!pages || pages.length === 0) return '';
  var items = pages.map(function(p, i) {
    var meta = [];
    if (p.space) meta.push('공간: ' + p.space);
    if (p.lastModified) meta.push('수정: ' + p.lastModified);
    var metaStr = meta.length ? ' [' + meta.join(' | ') + ']' : '';
    var link = p.url ? '\n링크: ' + p.url : '';
    return '[팀문서 ' + (i+1) + '] ' + (p.title || '') + metaStr + link + '\n' + (p.excerpt || '');
  });
  return '\n\n---\n\n[팀 컨플루언스 검색 결과 — 우리 팀 내부 문서]\n' +
    '아래는 사내 컨플루언스에서 질문과 관련해 실시간 검색한 팀 문서입니다. 팀 내부 방침·업무 맥락·과거 논의·담당 업무를 물을 때 참고하세요. ' +
    '단, 법령·고시의 정확한 조문 인용은 위 RAG 원문을 최우선으로 하고, 팀 문서는 내부 맥락 보강용으로만 쓰세요. ' +
    '팀 문서를 근거로 답할 때는 문서 제목과 링크를 함께 제시하세요:\n\n' + items.join('\n\n---\n\n');
}

// ── 법령·규제 요약 지식베이스(regulatory-kb / kb_chunks) ──
// document_chunks(조문 원문)와 별개 레이어. 조문 원문 인용은 RAG 우선, 여기는 요약·적용범위·실무 맥락.
// 시맨틱은 법률 특화 voyage-law-2로 질의 임베딩(저장도 law-2) + trgm 병행. 기본 현행본(current)만.
async function searchKbSummaries(query) {
  try {
    if (!sb || !query || query.trim().length < 2) return [];
    var trgmP = sb.rpc('search_kb_chunks_trgm', { query_text: query, match_threshold: 0.10, match_count: 6, only_current: true })
      .then(function(r) { return r.data || []; }).catch(function(e) { console.warn('kb trgm 오류(건너뜀):', e); return []; });
    var semP = getQueryEmbedding(query, 'voyage-law-2').then(function(emb) {
      if (!emb) return [];
      return sb.rpc('match_kb_chunks_semantic', { query_embedding: emb, match_threshold: 0.35, match_count: 6, only_current: true })
        .then(function(r) { return r.data || []; }).catch(function(e) { console.warn('kb 시맨틱 오류(건너뜀):', e); return []; });
    });
    var trgm = await trgmP, sem = await semP;
    var seen = {}, out = [];
    var key = function(r) { return r.doc_id + ':' + r.chunk_idx; };
    sem.forEach(function(r) { r._score = (r.similarity || 0) * 10; out.push(r); seen[key(r)] = r; });
    trgm.forEach(function(r) {
      var k = key(r);
      if (seen[k]) { seen[k]._score += (r.trgm_score || 0) * 5; }
      else { r._score = (r.trgm_score || 0) * 5; out.push(r); seen[k] = r; }
    });
    out.sort(function(a, b) { return b._score - a._score; });
    return out.slice(0, 5);
  } catch(e) { console.warn('법령요약 검색 실패(건너뜀):', e); return []; }
}

function buildKbContext(rows) {
  if (!rows || rows.length === 0) return '';
  var items = rows.map(function(r, i) {
    var meta = [];
    if (r.law_type) meta.push(r.law_type);
    if (r.law_number) meta.push('법령번호: ' + r.law_number);
    if (r.enforcement_date) meta.push('시행일: ' + r.enforcement_date);
    var metaStr = meta.length ? ' [' + meta.join(' | ') + ']' : '';
    return '[법령요약 ' + (i+1) + '] ' + (r.title || '') + metaStr + '\n' + (r.content || '');
  });
  return '\n\n---\n\n[법령·규제 요약 지식베이스 — 현행 법령·고시·훈령 요약/실무]\n' +
    '아래는 우리 팀이 정리한 법령·고시·훈령의 요약·적용범위·실무 체크리스트·소관부처 문서(현행본)입니다. ' +
    '법의 취지·실무 대응·담당부처를 물을 때 활용하세요. ' +
    '단, 정확한 조문 번호·문구 인용은 위 RAG 조문 원문을 최우선으로 하고, 이 요약은 실무 맥락 보강용으로 쓰세요:\n\n' +
    items.join('\n\n---\n\n');
}

// ════════════════════════════════════════════
//  Claude API
// ════════════════════════════════════════════
let chatHistory = [];
let isSending = false;



// ════════════════════════════════════════════
//  기술 용어 — 뉴스에서 자동 추출 (수동 실행)
// ════════════════════════════════════════════
// 용어 정규화: 공백 제거 + 소문자 변환 (2.6 GHz == 2.6ghz 중복 방지)
function normalizeTerm(s) { return (s||'').toLowerCase().replace(/\s+/g, ''); }

async function extractTermsFromNews() {
  var btn = document.getElementById('extract-terms-btn');
  if (!sb) { alert('Supabase 연결이 필요합니다.'); return; }
  var { claudeKey } = getConfig();
  if (!claudeKey) { alert('Claude API 키가 필요합니다.'); return; }
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> 추출 중...'; }

  try {
    // 최근 7일 뉴스 가져오기
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    var cutoffStr = cutoff.toISOString().split('T')[0];
    var newsResp = await sb.from('news_feed').select('title,source,published_at').gte('created_at', cutoffStr).order('created_at', {ascending:false}).limit(30);
    var newsList = (newsResp.data || []).map(function(n) { return '[' + (n.published_at||'').slice(0,10) + '] ' + n.title + ' (' + (n.source||'') + ')'; }).join('\n');
    if (!newsList) { alert('최근 7일 뉴스가 없습니다. 먼저 뉴스 브리핑을 실행하세요.'); if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-bulb"></i>뉴스에서 용어 추출';} return; }

    // 기존 용어 목록 (정규화 비교: 공백 제거 + 소문자)
    var existingResp = await sb.from('tech_terms').select('term').limit(500);
    var existingTerms = (existingResp.data || []).map(function(t) { return normalizeTerm(t.term); });

    // Claude에 용어 추출 요청
    var systemMsg = '당신은 이동통신·전파 전문가입니다. 반드시 순수 JSON 배열만 출력하세요. 마크다운 코드블록 없이.';
    var userMsg = '아래 뉴스 목록에서 이동통신·전파 분야 기술 용어(영문 약어, 표준명, 새 기술명)를 추출하세요.\n' +
      '이미 알려진 용어(' + existingTerms.slice(0,20).join(', ') + ' 등)는 제외하세요.\n\n' +
      '뉴스 목록:\n' + newsList + '\n\n' +
      '형식: [{"term":"약어","term_en":"영문 전체 이름","category":"주파수|네트워크|위성|단말|규제|기타","definition":"한 줄 정의(50자 이내)","source":"출처"}]\n' +
      '새 용어가 없으면 [] 출력.';

    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'x-api-key':claudeKey,'anthropic-version':'2023-06-01','content-type':'application/json','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1000,system:systemMsg,messages:[{role:'user',content:userMsg}]})
    });
    var data = await res.json();
    var text = data.content[0].text.trim().replace(/^```[\w]*\n?/,'').replace(/\n?```$/,'').trim();
    var firstBracket = text.indexOf('[');
    var lastBracket = text.lastIndexOf(']');
    if (firstBracket === -1) { alert('용어 추출 결과가 없습니다.'); if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-bulb"></i>뉴스에서 용어 추출';} return; }
    var terms = JSON.parse(text.slice(firstBracket, lastBracket + 1));

    if (terms.length === 0) { alert('새로운 기술 용어가 발견되지 않았습니다.'); if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-bulb"></i>뉴스에서 용어 추출';} return; }

    // Supabase에 저장
    var saved = 0, skipped = 0;
    var newIds = [];
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (!t.term || existingTerms.includes(normalizeTerm(t.term))) { skipped++; continue; }
      var r = await sb.from('tech_terms').insert({
        term: t.term, term_en: t.term_en||'', category: t.category||'기타',
        definition: t.definition||'', source: t.source||'뉴스 자동 추출', is_reviewed: false
      }).select('id');
      if (!r.error && r.data && r.data[0]) {
        saved++;
        existingTerms.push(normalizeTerm(t.term));
        newIds.push(r.data[0].id);
      } else skipped++;
    }

    if (saved > 0) {
      alert('신규 용어 ' + saved + '건 저장됨. 설명·다이어그램을 백그라운드에서 자동 생성합니다.');
      await loadTerms(); // 목록 새로고침 후 설명 생성 시작
      // 새로 저장된 용어 설명을 백그라운드에서 자동 생성 (클릭 전 미리 채움)
      newIds.forEach(function(id) { generateTermDetail(id); });
    } else {
      alert('완료! 신규 용어 0건 저장, ' + skipped + '건 중복/스킵');
    }
  } catch(e) {
    alert('오류: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-bulb"></i>뉴스에서 용어 추출'; }
  }
}

// ════════════════════════════════════════════
//  기술 용어 위키
// ════════════════════════════════════════════
let termsData = [];
let termsLoaded = false;

async function loadTerms() {
  if (!sb) { document.getElementById('terms-list').innerHTML = '<div style="padding:20px;color:var(--text-tertiary);font-size:12px">Supabase 연결 필요 (설정 탭에서 API 키 입력)</div>'; return; }
  try {
    var resp = await sb.from('tech_terms').select('id,term,term_en,category,definition,description,diagram_html,source,related_terms,is_reviewed,created_at').order('created_at', { ascending: false });
    termsData = resp.data || [];
    termsLoaded = true;
    var badge = document.getElementById('terms-count-badge');
    if (badge) badge.textContent = termsData.length + '개 용어';
    renderTerms(termsData);
  } catch(e) {
    console.warn('tech_terms 로드 실패:', e);
    document.getElementById('terms-list').innerHTML = '<div style="padding:20px;color:var(--text-tertiary);font-size:12px">tech_terms 테이블 없음 — Supabase에서 SQL 실행 필요</div>';
  }
}

function renderTerms(items) {
  var el = document.getElementById('terms-list');
  if (!el) return;
  if (!items || items.length === 0) {
    el.innerHTML = '<div style="padding:20px;color:var(--text-tertiary);font-size:12px;grid-column:1/-1">검색 결과가 없습니다.</div>';
    return;
  }
  var catColor = {주파수:'badge-purple', 네트워크:'badge-teal', 위성:'badge-blue', 단말:'badge-amber', 규제:'badge-red', 기타:'badge-amber'};
  el.innerHTML = items.map(function(t) {
    var cc = catColor[t.category] || 'badge-amber';
    var reviewed = t.is_reviewed ? '<span style="color:var(--green);font-size:10px">✓ 검토완료</span>' : '';
    return '<div class="card" style="cursor:pointer;padding:12px 14px" onclick="openTermsModal(&quot;' + t.id + '&quot;)">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">' +
        '<span style="font-size:14px;font-weight:600;color:var(--text-primary)">' + t.term + '</span>' +
        (t.term_en ? '<span style="font-size:11px;color:var(--text-tertiary)">(' + t.term_en + ')</span>' : '') +
        '<span class="badge ' + cc + '" style="margin-left:auto">' + (t.category||'기타') + '</span>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">' + (t.definition || '(설명 없음)') + '</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between">' +
        '<span style="font-size:11px;color:var(--text-tertiary)">' + (t.source||'') + '</span>' +
        reviewed +
      '</div>' +
    '</div>';
  }).join('');
}

function filterTerms(query) {
  if (!termsLoaded) return;
  var cat = document.getElementById('terms-cat-filter').value;
  var q = (query||'').toLowerCase().trim();
  var filtered = termsData.filter(function(t) {
    var matchCat = !cat || t.category === cat;
    var matchQ = !q || (t.term||'').toLowerCase().includes(q) ||
      (t.term_en||'').toLowerCase().includes(q) ||
      (t.definition||'').toLowerCase().includes(q) ||
      (t.description||'').toLowerCase().includes(q);
    return matchCat && matchQ;
  });
  renderTerms(filtered);
}

// 마크다운 → HTML 변환 (bold, 단락 분리)
function mdToHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')  // escape first
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')                  // **bold**
    .replace(/\*(.*?)\*/g, '<em>$1</em>')                              // *italic*
    .split(/\n\n+/)
    .map(function(p) { return '<p style="margin:0 0 11px 0;line-height:1.75">' + p.replace(/\n/g,'<br>') + '</p>'; })
    .join('');
}

function renderTermsModalHtml(t) {
  var catColor = {주파수:'badge-purple', 네트워크:'badge-teal', 위성:'badge-blue', 단말:'badge-amber', 규제:'badge-red', 기타:'badge-amber'};
  var cc = catColor[t.category] || 'badge-amber';
  var related = (t.related_terms||[]).map(function(r) {
    return '<span class="badge badge-amber" style="cursor:pointer" onclick="closeTermsModal();document.getElementById(&quot;terms-search-input&quot;).value=&quot;' + r + '&quot;;filterTerms(&quot;' + r + '&quot;)">' + r + '</span>';
  }).join(' ');

  var headerHtml =
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">' +
      '<span style="font-size:20px;font-weight:700;color:var(--text-primary)">' + t.term + '</span>' +
      (t.term_en ? '<span style="font-size:13px;color:var(--text-secondary)">' + t.term_en + '</span>' : '') +
      '<span class="badge ' + cc + '">' + (t.category||'기타') + '</span>' +
    '</div>' +
    (t.source ? '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:10px">📌 출처: ' + t.source + '</div>' : '<div style="margin-bottom:10px"></div>');

  // 한 줄 정의
  var defHtml = t.definition
    ? '<div style="font-size:13px;font-weight:500;margin-bottom:14px;padding:10px 14px;background:var(--bg-secondary);border-radius:var(--radius-md);border-left:3px solid var(--accent)">' + t.definition + '</div>'
    : '';

  var footerHtml =
    (related ? '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)"><span style="font-size:11px;color:var(--text-secondary);margin-right:6px">관련 용어</span>' + related + '</div>' : '') +
    '<div style="display:flex;gap:8px;margin-top:14px">' +
      '<button class="btn" style="font-size:11px;padding:4px 10px" onclick="generateTermDetail(&quot;' + t.id + '&quot;)" id="gen-btn-' + t.id + '">↺ 재생성</button>' +
      '<button class="btn" onclick="askQ(&quot;' + t.term + ' 기술에 대해 자세히 설명해줘&quot;)">AI 자문에서 질문</button>' +
    '</div>';

  if (t.description) {
    // 캐시된 설명 있음 — 다이어그램 상단, 설명 하단 레이아웃
    var diagramHtml = t.diagram_html
      ? '<div style="margin-bottom:16px;padding:12px;background:var(--bg-secondary);border-radius:var(--radius-md);overflow-x:auto;text-align:center">' + t.diagram_html + '</div>'
      : '';
    return headerHtml + defHtml + diagramHtml +
      '<div style="font-size:13px;color:var(--text-primary)">' + mdToHtml(t.description) + '</div>' +
      footerHtml;
  } else {
    // 설명 없음 — 자동 생성 로딩 상태
    return headerHtml + defHtml +
      '<div id="gen-body-' + t.id + '" style="padding:28px 0;text-align:center;color:var(--text-secondary)">' +
        '<div style="display:inline-flex;align-items:center;gap:8px;font-size:13px">' +
          '<span style="display:inline-block;width:14px;height:14px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></span>' +
          'AI가 개념도와 상세 설명을 생성하는 중...' +
        '</div>' +
      '</div>';
  }
}

function openTermsModal(id) {
  var t = termsData.find(function(x) { return x.id === id; });
  if (!t) return;

  document.getElementById('terms-modal-content').innerHTML = renderTermsModalHtml(t);
  var modal = document.getElementById('terms-modal');
  modal.style.display = 'flex';

  // 설명 없으면 자동 생성 시작
  if (!t.description) {
    generateTermDetail(id);
  }
}

function closeTermsModal() {
  document.getElementById('terms-modal').style.display = 'none';
}

async function generateTermDetail(id) {
  var t = termsData.find(function(x) { return x.id === id; });
  if (!t) return;
  var btn = document.getElementById('gen-btn-' + id);
  if (btn) { btn.disabled = true; btn.textContent = '생성 중...'; }
  var { claudeKey } = getConfig();
  if (!claudeKey) { alert('Claude API 키가 필요합니다.'); if(btn){btn.disabled=false;btn.textContent='🤖 Claude로 상세 설명·다이어그램 생성';} return; }
  try {
    var termLabel = t.term + (t.term_en ? ' (' + t.term_en + ')' : '');
    var systemMsg = '당신은 이동통신·전파 정책 전문가입니다. 반드시 지정된 XML 태그 형식으로만 답변하세요.';
    var userMsg = '기술 용어 [' + termLabel + '] 에 대해 아래 형식으로 정확히 답변하세요.\n' +
      '분야: ' + (t.category||'기타') + '. 현재 정의: ' + (t.definition||'없음') + '.\n\n' +
      '<description>\n' +
      '3~5문단 상세 설명. **굵은글씨**로 핵심 개념 강조. 단락 구분은 빈 줄로.\n' +
      '내용: 개념 배경/기술 원리/국내외 현황/관련 표준 순서로 서술.\n' +
      '</description>\n\n' +
      '<diagram>\n' +
      '아래 조건을 모두 지킨 SVG를 생성하라:\n' +
      '- viewBox="0 0 680 320" xmlns="http://www.w3.org/2000/svg"\n' +
      '- 배경: rect fill="#f8fafc" 전체 채움\n' +
      '- 한국어 레이블 사용, font-family="sans-serif"\n' +
      '- 주요 구성요소를 박스/원/화살표로 시각화 (최소 4개 요소)\n' +
      '- 색상: 주요 박스 #6366f1(보라), 보조 #10b981(초록), 강조 #f59e0b(노랑), 배경박스 #e0e7ff\n' +
      '- 화살표는 marker-end 사용하여 방향 표시\n' +
      '- 개념 흐름이나 계층 구조를 한눈에 파악할 수 있게\n' +
      '</diagram>\n\n' +
      '<related>관련용어1,관련용어2,관련용어3</related>';
    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'x-api-key':claudeKey,'anthropic-version':'2023-06-01','content-type':'application/json','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:4000,system:systemMsg,messages:[{role:'user',content:userMsg}]})
    });
    var data = await res.json();

    // API 오류 체크
    if (data.type === 'error' || !data.content) {
      var errMsg = (data.error && data.error.message) ? data.error.message : JSON.stringify(data);
      throw new Error('Claude API 오류: ' + errMsg);
    }
    var textBlock = data.content.find(function(b) { return b.type === 'text'; });
    var text = textBlock ? textBlock.text : '';
    if (!text) throw new Error('Claude 응답 없음');

    // XML 태그로 파싱 (JSON 불필요 — SVG 포함 안전)
    var descMatch   = text.match(/<description>([\s\S]*?)<\/description>/);
    var diagramMatch = text.match(/<diagram>([\s\S]*?)<\/diagram>/);
    var relatedMatch = text.match(/<related>([\s\S]*?)<\/related>/);

    var parsed = {
      description:   descMatch   ? descMatch[1].trim()   : '',
      diagram_html:  diagramMatch ? diagramMatch[1].trim() : '',
      related_terms: relatedMatch
        ? relatedMatch[1].trim().split(',').map(function(s){return s.trim();}).filter(Boolean)
        : []
    };

    // Supabase 업데이트
    if (sb) {
      await sb.from('tech_terms').update({
        description: parsed.description || t.description,
        diagram_html: parsed.diagram_html || t.diagram_html,
        related_terms: parsed.related_terms || t.related_terms
      }).eq('id', id);
    }
    // 로컬 데이터 갱신
    var idx = termsData.findIndex(function(x){return x.id===id;});
    if (idx >= 0) {
      termsData[idx].description = parsed.description;
      termsData[idx].diagram_html = parsed.diagram_html;
      termsData[idx].related_terms = parsed.related_terms;
    }
    // 모달 재렌더링
    openTermsModal(id);
  } catch(e) {
    // 생성 실패 시 로딩 영역에 에러 메시지 표시
    var genBody = document.getElementById('gen-body-' + id);
    if (genBody) {
      genBody.innerHTML = '<span style="font-size:12px;color:var(--text-secondary)">생성 실패: ' + e.message + ' &nbsp;<button class="btn" style="font-size:11px;padding:2px 8px" onclick="generateTermDetail(&quot;' + id + '&quot;)">재시도</button></span>';
    }
    if (btn) { btn.disabled = false; btn.textContent = '↺ 재생성'; }
  }
}

// ════════════════════════════════════════════
//  뉴스 컨텍스트 — 키워드 매칭 본문 발췌 + 제목 목록 (AI 자문 참조용)
// ════════════════════════════════════════════
async function fetchRecentNewsContext(query) {
  if (!sb) return '';
  try {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60); // 최근 60일
    var cutoffStr = cutoff.toISOString().split('T')[0];

    // [1] 최근 뉴스 제목 목록 (동향 파악용, 최대 30건)
    var listResp = await sb
      .from('news_feed')
      .select('title, source, published_at')
      .or('published_at.gte.' + cutoffStr + ',locked.eq.true')
      .not('title', 'ilike', '[업데이트]%')
      .order('published_at', { ascending: false })
      .limit(30);
    var allTitles = listResp.data || [];

    // [2] 질문 키워드로 본문 매칭 (최대 3건, content 컬럼 있는 경우)
    var bodyResults = [];
    if (query) {
      var keywords = extractKeywords(query);
      var seen = new Set();
      for (var ki = 0; ki < Math.min(keywords.length, 3); ki++) {
        var kw = keywords[ki];
        if (kw.length < 2) continue;
        try {
          var bodyResp = await sb
            .from('news_feed')
            .select('title, source, published_at, content')
            .or('published_at.gte.' + cutoffStr + ',locked.eq.true')
            .ilike('content', '%' + kw + '%')
            .not('content', 'is', null)
            .order('published_at', { ascending: false })
            .limit(2);
          (bodyResp.data || []).forEach(function(n) {
            if (!seen.has(n.title) && n.content) {
              seen.add(n.title);
              bodyResults.push(n);
            }
          });
        } catch(e) { /* content 컬럼 없으면 무시 */ }
        if (bodyResults.length >= 3) break;
      }
    }

    var lines = [];

    // 관련 기사 본문 발췌 (질문과 관련된 경우 우선 표시)
    if (bodyResults.length > 0) {
      lines.push('[질문 관련 최신 기사]');
      bodyResults.slice(0, 3).forEach(function(n) {
        var excerpt = (n.content || '').slice(0, 600).trim();
        lines.push('■ [' + (n.published_at || '').slice(0, 10) + '] ' + n.title + ' (' + (n.source || '') + ')');
        if (excerpt) lines.push('  → ' + excerpt + (n.content.length > 600 ? '...' : ''));
      });
    }

    // 최근 뉴스 제목 목록 (전반적인 동향 파악용)
    if (allTitles.length > 0) {
      lines.push('\n[최근 수집 뉴스 동향]');
      allTitles.forEach(function(n) {
        lines.push('  · [' + (n.published_at || '').slice(0, 10) + '] ' + n.title + ' (' + (n.source || '') + ')');
      });
    }

    if (lines.length === 0) return '';
    return '\n\n' + lines.join('\n') +
      '\n(위 뉴스를 참고하여, 질문과 관련된 최신 동향이 있으면 출처와 날짜를 포함해 언급하세요.)';
  } catch(e) {
    console.warn('뉴스 컨텍스트 로드 실패:', e);
    return '';
  }
}

// ════════════════════════════════════════════
//  원문 수집 — CORS 프록시 경유 기사 본문 추출
// ════════════════════════════════════════════
var CORS_PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
];

async function _fetchArticleBody(url) {
  for (var pi = 0; pi < CORS_PROXIES.length; pi++) {
    try {
      var proxyUrl = CORS_PROXIES[pi] + encodeURIComponent(url);
      var resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) continue;
      var html = await resp.text();

      // DOMParser로 본문 추출
      var parser = new DOMParser();
      var doc = parser.parseFromString(html, 'text/html');

      // 불필요한 태그 제거
      ['script','style','nav','header','footer','aside','iframe','noscript'].forEach(function(tag) {
        doc.querySelectorAll(tag).forEach(function(el) { el.remove(); });
      });

      // 본문 셀렉터 순서대로 시도
      var selectors = [
        'article', '#articleBody', '#article_body', '#article-body',
        '.article_body', '.article-body', '.article_txt', '.article-txt',
        '.news_body', '.news-body', '.view_cont', '.view-content',
        '#articleWrap', '#newsContent', '.content_area', 'main'
      ];
      var bodyText = '';
      for (var si = 0; si < selectors.length; si++) {
        var el = doc.querySelector(selectors[si]);
        if (el) {
          var t = el.innerText || el.textContent || '';
          t = t.replace(/\s+/g, ' ').trim();
          if (t.length > 200) { bodyText = t; break; }
        }
      }
      // fallback: body 전체
      if (!bodyText) {
        bodyText = (doc.body.innerText || doc.body.textContent || '').replace(/\s+/g, ' ').trim();
      }

      if (bodyText.length > 100) return bodyText.slice(0, 3000);
    } catch(e) {
      console.warn('[원문 수집 실패] 프록시 ' + pi + ':', e.message);
    }
  }
  return '';
}

// ════════════════════════════════════════════
//  추가 지식 — custom_knowledge 검색 및 CRUD
// ════════════════════════════════════════════
async function searchCustomKnowledge(query) {
  if (!sb || !query) return '';
  try {
    var keywords = extractKeywords(query);
    if (keywords.length === 0) return '';
    var seen = new Set();
    var results = [];
    for (var ki = 0; ki < Math.min(keywords.length, 5); ki++) {
      var kw = keywords[ki];
      if (kw.length < 2) continue;
      try {
        var resp = await sb
          .from('custom_knowledge')
          .select('title, content, category')
          .eq('is_active', true)
          .or('title.ilike.%' + kw + '%,content.ilike.%' + kw + '%')
          .order('created_at', { ascending: false })
          .limit(3);
        (resp.data || []).forEach(function(row) {
          if (!seen.has(row.title)) {
            seen.add(row.title);
            results.push(row);
          }
        });
      } catch(e) { console.warn('추가지식(custom_knowledge) 조회 실패(건너뜀):', kw, e); }
      if (results.length >= 3) break;
    }
    if (results.length === 0) return '';
    var lines = ['\n\n[팀 내부 추가 지식 — 검증 완료]'];
    results.slice(0, 3).forEach(function(r, i) {
      var excerpt = (r.content || '').slice(0, 2500);
      lines.push('■ [' + (r.category || '일반') + '] ' + r.title);
      lines.push('  ' + excerpt + (r.content.length > 2500 ? '...' : ''));
    });
    lines.push('(위 내부 지식을 우선 참고하여 답변하세요.)');
    return lines.join('\n');
  } catch(e) {
    console.warn('추가 지식 검색 실패:', e);
    return '';
  }
}

async function saveCustomKnowledge(title, content, category, tagsStr) {
  if (!sb) throw new Error('Supabase 연결 없음');
  var tags = tagsStr ? tagsStr.split(',').map(function(t) { return t.trim(); }).filter(Boolean) : [];
  var { error } = await sb.from('custom_knowledge').insert({
    title: title, content: content, category: category || '일반', tags: tags
  });
  if (error) throw new Error(error.message);
}

async function updateCustomKnowledge(id, title, content, category, tagsStr) {
  if (!sb) throw new Error('Supabase 연결 없음');
  var tags = tagsStr ? tagsStr.split(',').map(function(t) { return t.trim(); }).filter(Boolean) : [];
  var { error } = await sb.from('custom_knowledge').update({
    title: title, content: content, category: category || '일반', tags: tags
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

async function loadCustomKnowledgeList() {
  if (!sb) return [];
  var { data } = await sb
    .from('custom_knowledge')
    .select('id, title, category, tags, created_at, is_active')
    .order('created_at', { ascending: false })
    .limit(100);
  return data || [];
}

async function deleteCustomKnowledge(id) {
  if (!sb) throw new Error('Supabase 연결 없음');
  var { error } = await sb.from('custom_knowledge').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// 추가 지식 탭 "파일 업로드"분 — document_chunks(doc_category='추가지식')를
// doc_name 기준으로 묶어 목록에 함께 표시 (custom_knowledge와 별개 경로)
async function loadCustomFileList() {
  if (!sb) return [];
  try {
    var { data: rows } = await sb
      .from('document_chunks')
      .select('doc_name, created_at, file_path')
      .eq('doc_category', '추가지식')
      .order('created_at', { ascending: false })
      .limit(3000);
    if (!rows || rows.length === 0) return [];
    // 임베딩 완료된 청크 doc_name별 개수 (vector 본문은 받지 않고 not-null만 카운트)
    var { data: embRows } = await sb
      .from('document_chunks')
      .select('doc_name')
      .eq('doc_category', '추가지식')
      .not('embedding', 'is', null)
      .limit(3000);
    var embCount = {};
    (embRows || []).forEach(function(r) {
      embCount[r.doc_name] = (embCount[r.doc_name] || 0) + 1;
    });
    var map = {};
    rows.forEach(function(r) {
      var m = map[r.doc_name];
      if (!m) { m = map[r.doc_name] = { doc_name: r.doc_name, chunks: 0, created_at: r.created_at, file_path: null }; }
      m.chunks++;
      if (r.created_at < m.created_at) m.created_at = r.created_at; // 최초 업로드 시각
      if (!m.file_path && r.file_path) m.file_path = r.file_path; // 원본 파일 경로 (있으면 다운로드)
    });
    return Object.keys(map).map(function(n) {
      var m = map[n];
      m.embedded = embCount[n] || 0;
      m._type = 'file';
      return m;
    });
  } catch(e) {
    console.warn('업로드 파일 목록 로드 실패:', e);
    return [];
  }
}

async function onDownloadCustomFile(filePath, downloadName) {
  if (!sb || !filePath) return;
  try {
    var { data, error } = await sb.storage.from('uploads')
      .createSignedUrl(filePath, 60, { download: downloadName || true });
    if (error || !data || !data.signedUrl) throw new Error(error ? error.message : '다운로드 링크 생성 실패');
    window.open(data.signedUrl, '_blank');
  } catch(e) {
    alert('다운로드 실패: ' + e.message);
  }
}

async function onDeleteCustomFile(docName, btn) {
  if (!confirm('업로드 파일 "' + docName + '"의 모든 청크를 삭제하시겠습니까?')) return;
  if (btn) btn.disabled = true;
  try {
    // 원본 파일 보관 경로 조회 → Storage 객체도 함께 삭제
    var paths = [];
    try {
      var { data: fp } = await sb.from('document_chunks')
        .select('file_path')
        .eq('doc_category', '추가지식').eq('doc_name', docName)
        .not('file_path', 'is', null).limit(1);
      (fp || []).forEach(function(r) { if (r.file_path) paths.push(r.file_path); });
    } catch(e) { console.warn('원본 file_path 조회 실패(Storage 정리 생략될 수 있음):', e); }
    var { error } = await sb.from('document_chunks').delete()
      .eq('doc_category', '추가지식').eq('doc_name', docName);
    if (error) throw new Error(error.message);
    if (paths.length) { try { await sb.storage.from('uploads').remove(paths); } catch(e) { console.warn('Storage 원본 삭제 실패(파일 잔존 가능):', e); } }
    renderCustomKnowledgeList((document.getElementById('ck-list-search') || {}).value || '');
  } catch(e) {
    alert('삭제 실패: ' + e.message);
    if (btn) btn.disabled = false;
  }
}

// ── 보도자료 질의 판별·검색 (0313a8f에서 복원 — 08d29f1에서 유실) ──
function isPressQuery(query) {
  return /보도자료|보도|발표|공지|공고|과기정통부|국립전파연구원|전파연구원/.test(query);
}
function searchPressReleases(query) {
  if (!pressData) return [];
  var keywords = extractKeywords(query);
  if (keywords.length === 0) return [];
  var results = [];
  for (var i = 0; i < pressData.length; i++) {
    var item = pressData[i];
    var combined = (item.title + ' ' + item.content).toLowerCase();
    var score = 0;
    for (var k = 0; k < keywords.length; k++) {
      var kw = keywords[k].toLowerCase();
      if (combined.includes(kw)) score++;
      if (item.title.toLowerCase().includes(kw)) score++;  // 제목 가중치
    }
    if (score > 0) results.push({ item: item, score: score });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 4).map(function(r) {
    var item = r.item;
    // 관련 본문 발췌 (최대 800자)
    var excerpt = item.content.slice(0, 800).trim();
    return {
      id: 'press_' + item.id,
      doc_name: item.title,
      doc_category: '과기정통부 보도자료',
      content: '[날짜: ' + item.date + ']\n' + excerpt
    };
  });
}

async function callClaude(userText, onDelta) {
  const { claudeKey } = getConfig();
  if (!claudeKey) throw new Error('Claude API 키가 설정되지 않았습니다. 설정 탭에서 입력해주세요.');

  // 보조 컨텍스트 검색 5종을 먼저 동시에 시작 (조문 RAG와 병렬 실행 — 프롬프트 조합 순서는 아래에서 고정)
  const customP     = searchCustomKnowledge(userText).catch(function(e) { console.warn('추가지식 검색 실패(건너뜀):', e); return ''; });
  const newsP       = fetchRecentNewsContext(userText).catch(function(e) { console.warn('뉴스 컨텍스트 실패(건너뜀):', e); return ''; });
  const lawTrackP   = fetchLawTrackContext().catch(function(e) { console.warn('법령동향 실패(건너뜀):', e); return ''; });
  const confluenceP = searchConfluence(userText).catch(function(e) { console.warn('컨플루언스 검색 실패(건너뜀):', e); return []; });
  const kbP         = searchKbSummaries(userText).catch(function(e) { console.warn('법령요약 검색 실패(건너뜀):', e); return []; });

  // RAG: 관련 문서 청크 검색 (보도자료는 원본 JSON, 법령은 Supabase)
  lastRagSources = [];
  var ragChunks = [];

  if (isPressQuery(userText)) {
    // 보도자료 질문: 원본 JSON에서 검색
    var pressResults = searchPressReleases(userText);
    if (pressResults.length > 0) {
      ragChunks = pressResults;
      lastRagSources = pressResults.map(function(c) { return c.doc_name; });
      console.log('보도자료 원본 검색:', pressResults.length + '개');
    }
    // 보도자료이지만 법령도 관련 있을 경우 Supabase도 병행
    var lawChunks = await searchKeywords(userText, true);
    ragChunks = ragChunks.concat(lawChunks).slice(0, 6);
    lastRagSources = ragChunks.map(function(c) { return c.doc_name; });
  } else {
    // 일반 법령·고시 질문: Supabase 검색
    ragChunks = await searchKeywords(userText, false);
    if (ragChunks.length > 0) {
      lastRagSources = ragChunks.map(function(c) { return c.doc_name; });
      console.log('RAG 검색 결과:', ragChunks.length + '개 청크 (' + lastRagSources.join(', ') + ')');
    }
  }

  // 시스템 프롬프트에 컨텍스트 조합 (위에서 동시 시작한 검색 결과를 기존 순서 그대로 조립)
  const ragContext    = buildRagContext(ragChunks);
  const customContext = await customP;                            // 팀 내부 추가 지식
  const newsContext   = await newsP;                              // 뉴스 본문+제목
  const lawTrackContext = await lawTrackP;                        // 최근 법령 개정·입법예고 동향
  const confluenceContext = buildConfluenceContext(await confluenceP); // 팀 컨플루언스 실시간 검색(내부 문서)
  const kbContext     = buildKbContext(await kbP);                // 법령·규제 요약 지식베이스(regulatory-kb, 현행본)
  const webSearchGuide = '\n\n---\n\n[웹 검색 도구 사용 지침]\n해외 규제·제도 비교, 최신 정책 동향 등 위 참조 자료(법령 RAG·추가 지식·뉴스)에 없는 사실 정보가 필요하면 web_search 도구로 확인 후 답변하세요. 특히 "한국 고유", "유일한", "주요국 중 한국만" 등 국가 간 비교 단정 표현은 검색으로 확인하기 전에는 사용하지 마세요. 국내 법령 해석은 RAG 원문을 최우선으로 하고 웹 검색은 보조로만 사용하세요.';
  const systemWithRag = SYSTEM_PROMPT + webSearchGuide + ragContext + kbContext + customContext + newsContext + lawTrackContext + confluenceContext;

  chatHistory.push({ role: 'user', content: userText });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': claudeKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      // ★ 스트리밍 필수: 웹검색+긴 답변은 응답이 2분 이상 걸려, 비스트리밍 시
      //   ~120초 idle 구간에 브라우저·사내망 프록시가 연결을 끊어 "Failed to fetch"가 났음.
      //   토큰을 실시간 수신하면 연결이 idle가 아니게 되어 끊김이 사라짐. (stream 제거 금지)
      stream: true,
      system: systemWithRag,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: chatHistory
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    chatHistory.pop();
    throw new Error(err.error?.message || 'API 오류 (HTTP ' + res.status + ')');
  }

  // ── SSE 스트림 파싱: text_delta 누적 + 웹검색 인용(citations_delta) 수집 ──
  var aiText = '';
  var cited = [];
  var seenUrl = new Set();
  var stopReason = null;
  function addCitation(c) {
    if (c && c.url && !seenUrl.has(c.url)) { seenUrl.add(c.url); cited.push({ url: c.url, title: c.title || c.url }); }
  }

  try {
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    var buf = '';
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      var events = buf.split(/\r?\n\r?\n/);
      buf = events.pop();   // 마지막 미완성 조각은 다음 청크와 합침
      for (var ei = 0; ei < events.length; ei++) {
        var lines = events[ei].split(/\r?\n/);
        for (var li = 0; li < lines.length; li++) {
          var line = lines[li];
          if (line.indexOf('data:') !== 0) continue;
          var payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          var evt;
          try { evt = JSON.parse(payload); } catch(e) { continue; }
          if (evt.type === 'content_block_delta' && evt.delta) {
            if (evt.delta.type === 'text_delta' && evt.delta.text) {
              aiText += evt.delta.text;
              if (typeof onDelta === 'function') onDelta(aiText);
            } else if (evt.delta.type === 'citations_delta' && evt.delta.citation) {
              addCitation(evt.delta.citation);
            }
          } else if (evt.type === 'content_block_start' && evt.content_block) {
            (evt.content_block.citations || []).forEach(addCitation);
          } else if (evt.type === 'message_delta' && evt.delta && evt.delta.stop_reason) {
            stopReason = evt.delta.stop_reason;
          } else if (evt.type === 'error') {
            throw new Error((evt.error && evt.error.message) || '스트리밍 오류');
          }
        }
      }
    }
  } catch(streamErr) {
    chatHistory.pop();
    throw streamErr;
  }

  chatHistory.push({ role: 'assistant', content: aiText });
  // 웹 검색 출처 표시
  if (cited.length > 0) {
    aiText += '\n\n---\n\n**🌐 웹 검색 출처:**\n\n' + cited.slice(0, 5).map(function(c) {
      return '- [' + c.title.replace(/[\[\]]/g, '') + '](' + c.url + ')';
    }).join('\n');
  }
  // 길이 제한으로 잘린 경우 안내 (히스토리에는 원문만 저장 → "계속" 입력 시 이어서 생성)
  if (stopReason === 'max_tokens') {
    aiText += '\n\n---\n\n> ⚠️ 답변이 길이 제한으로 잘렸습니다. **"계속"**이라고 입력하면 이어서 답변합니다.';
  }
  return aiText;
}

// ════════════════════════════════════════════
//  Chat UI
// ════════════════════════════════════════════
function renderMd(text) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
  const splitRow = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

  const lines = text.split('\n');
  let html = '', para = [], i = 0;
  const flush = () => {
    if (para.length) { html += '<p>' + para.map(inline).join('<br>') + '</p>'; para = []; }
  };

  while (i < lines.length) {
    const t = lines[i].trim();

    // 펜스 코드블록 (``` 또는 ~~~) — 내부는 마크다운 해석 없이 원문 보존(박스 다이어그램 정렬 유지)
    const fence = t.match(/^(```|~~~)/);
    if (fence) {
      flush();
      i++;
      let code = '';
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) {
        code += esc(lines[i]) + '\n';
        i++;
      }
      i++; // 닫는 펜스 줄 건너뛰기
      html += '<pre><code>' + code.replace(/\n$/, '') + '</code></pre>';
      continue;
    }

    // 표: |헤더| 다음 줄이 |---|---| 구분선
    if (t.startsWith('|') && i + 1 < lines.length && /^\|?[\s:|-]+\|?$/.test(lines[i + 1].trim()) && lines[i + 1].includes('-')) {
      flush();
      const head = splitRow(t);
      i += 2;
      let body = '';
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = splitRow(lines[i]);
        body += '<tr>' + head.map((_, c) => '<td>' + inline(cells[c] || '') + '</td>').join('') + '</tr>';
        i++;
      }
      html += '<div class="md-table-wrap"><table><thead><tr>' +
        head.map(h => '<th>' + inline(h) + '</th>').join('') +
        '</tr></thead><tbody>' + body + '</tbody></table></div>';
      continue;
    }

    // 제목 (# ~ ####)
    const h = t.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      flush();
      const lv = Math.min(h[1].length + 2, 6);
      html += `<h${lv}>${inline(h[2])}</h${lv}>`;
      i++; continue;
    }

    // 구분선
    if (/^(-{3,}|\*{3,})$/.test(t)) { flush(); html += '<hr>'; i++; continue; }

    // 글머리 목록
    if (/^[-*]\s+/.test(t)) {
      flush();
      let items = '';
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items += '<li>' + inline(lines[i].trim().replace(/^[-*]\s+/, '')) + '</li>';
        i++;
      }
      html += '<ul>' + items + '</ul>';
      continue;
    }

    // 번호 목록
    if (/^\d+[.)]\s+/.test(t)) {
      flush();
      const start = parseInt(t, 10);
      let items = '';
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items += '<li>' + inline(lines[i].trim().replace(/^\d+[.)]\s+/, '')) + '</li>';
        i++;
      }
      html += `<ol start="${start}">` + items + '</ol>';
      continue;
    }

    if (t === '') { flush(); i++; continue; }

    para.push(lines[i]);
    i++;
  }
  flush();
  return html;
}

function appendMsg(role, text) {
  const area = document.getElementById('chat-area');
  const div = document.createElement('div');
  div.className = `msg msg-${role}`;
  if (role === 'ai') {
    div.innerHTML = `<div class="msg-name">전파정책 전문가 AI</div>${renderMd(text)}`;
  } else {
    div.textContent = text;
  }
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
  return div;
}

function appendLoading() {
  const area = document.getElementById('chat-area');
  const div = document.createElement('div');
  div.className = 'msg-loading';
  div.innerHTML = '<div class="dot-anim"></div><div class="dot-anim"></div><div class="dot-anim"></div>';
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
  return div;
}

function detectCategory(t) {
  if (/주파수|할당|경매|분배|재배치/.test(t)) return '주파수';
  if (/전자파|SAR|EMC|인체|흡수율/.test(t)) return '전자파';
  if (/적합성평가|기자재|인증|시험기관/.test(t)) return '적합성평가';
  if (/ITU|WRC|IMT|6G|5G|국제/.test(t)) return 'ITU-R';
  if (/기술기준|무선설비|무선국|안테나/.test(t)) return '기술기준';
  return '일반';
}

// ════════════════════════════════════════════
//  자문 이력 (chat_logs 열람)
// ════════════════════════════════════════════
function chEsc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function chDate(iso) {
  var d = new Date(iso);
  var p = function(n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

async function openChatHistory() {
  var modal = document.getElementById('chat-history-modal');
  var body = document.getElementById('chat-history-body');
  modal.style.display = 'flex';
  body.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px">불러오는 중...</div>';
  if (!sb) { body.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px">Supabase 연결 없음</div>'; return; }
  try {
    var resp = await sb.from('chat_logs')
      .select('id, question, category, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (resp.error) throw resp.error;
    var data = resp.data || [];
    if (data.length === 0) {
      body.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px">저장된 자문 이력이 없습니다.</div>';
      return;
    }
    body.innerHTML = data.map(function(item) {
      return '<div class="card" style="cursor:pointer;margin-bottom:8px;padding:12px 14px;display:flex;align-items:flex-start;gap:8px" onclick="viewChatHistoryItem(\'' + item.id + '\')">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:13px;font-weight:500;color:var(--text-primary);line-height:1.5">' + chEsc(item.question) + '</div>' +
          '<div style="font-size:11px;color:var(--text-tertiary);margin-top:5px;display:flex;align-items:center;gap:8px">' +
            '<span class="rag-tag">' + chEsc(item.category || '일반') + '</span>' + chDate(item.created_at) +
          '</div>' +
        '</div>' +
        '<button class="btn" title="이력 삭제" style="padding:4px 8px;flex-shrink:0;color:var(--text-tertiary)" onclick="event.stopPropagation();deleteChatHistoryItem(\'' + item.id + '\', this)"><i class="ti ti-trash"></i></button>' +
      '</div>';
    }).join('');
    body.scrollTop = 0;
  } catch(e) {
    body.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px">이력 조회 실패: ' + chEsc(e.message) + '</div>';
  }
}

// ── 자문 상세 내보내기 (MD / Word / PDF) ──
//   viewChatHistoryItem이 현재 상세를 _chatDetail에 저장 → 아래 함수들이 전체 내용으로 내보냄
//   (기존 프린트는 모달의 보이는 부분만 인쇄되던 문제 해결)
var _chatDetail = null;

function _chatExportName(ext) {
  var d = _chatDetail || {};
  var dt = d.created_at ? new Date(d.created_at) : new Date();
  var p = function(n) { return (n < 10 ? '0' : '') + n; };
  var stamp = dt.getFullYear() + p(dt.getMonth() + 1) + p(dt.getDate()) + '_' + p(dt.getHours()) + p(dt.getMinutes());
  var t = (d.question || '자문').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').trim().slice(0, 30).trim();
  return '자문_' + stamp + (t ? '_' + t : '') + '.' + ext;
}

function _chatDownload(blob, fn) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = fn;
  document.body.appendChild(a); a.click();
  setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

function _chatExportStyle() {
  return '<style>' +
    'body{font-family:"Malgun Gothic","맑은 고딕",sans-serif;line-height:1.65;color:#1a1a1a;font-size:13px;max-width:780px;margin:28px auto;padding:0 18px}' +
    'h1.ex-q{font-size:18px;margin:0 0 4px;line-height:1.4}h2,h3,h4{margin:18px 0 6px}' +
    '.ex-meta{font-size:12px;color:#666;margin:0 0 14px}.ex-src{margin-top:18px;font-size:12px;color:#555}' +
    'table{border-collapse:collapse;width:100%;margin:10px 0}th,td{border:1px solid #bbb;padding:6px 9px;font-size:12px;text-align:left;vertical-align:top}th{background:#f2f2f2}' +
    'hr{border:none;border-top:1px solid #ddd;margin:14px 0}code{background:#f4f4f4;padding:1px 4px;border-radius:3px;font-size:12px}' +
    'pre{background:#f4f4f4;padding:10px 12px;border-radius:6px;overflow-x:auto;margin:8px 0}pre code{display:block;background:none;padding:0;white-space:pre;font-size:12px;line-height:1.5}' +
    'ul,ol{margin:6px 0 6px 4px;padding-left:20px}li{margin:2px 0}a{color:#1a56db}' +
    '</style>';
}

function _chatContentHtml() {
  var d = _chatDetail || {};
  var srcHtml = (d.sources && d.sources.length)
    ? '<p class="ex-src"><b>참조:</b> ' + d.sources.map(chEsc).join(', ') + '</p>' : '';
  return '<h1 class="ex-q">' + chEsc(d.question || '') + '</h1>' +
    '<p class="ex-meta">분류: ' + chEsc(d.category || '일반') + ' &nbsp;|&nbsp; ' + chDate(d.created_at) + '</p>' +
    '<hr>' + renderMd(d.answer || '') + srcHtml;
}

function exportChatMd() {
  if (!_chatDetail) return;
  var d = _chatDetail;
  var md = '# ' + (d.question || '') + '\n\n';
  md += '- 분류: ' + (d.category || '일반') + '\n';
  md += '- 일시: ' + chDate(d.created_at) + '\n\n---\n\n';
  md += (d.answer || '') + '\n';
  if (d.sources && d.sources.length) md += '\n---\n\n**참조:** ' + d.sources.join(', ') + '\n';
  _chatDownload(new Blob([md], { type: 'text/markdown;charset=utf-8' }), _chatExportName('md'));
}

function exportChatPdf() {
  if (!_chatDetail) return;
  var w = window.open('', '_blank');
  if (!w) { alert('팝업이 차단되어 PDF 인쇄 창을 열 수 없습니다. 팝업을 허용한 뒤 다시 시도하세요.'); return; }
  w.document.write('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' +
    chEsc(_chatDetail.question || '자문') + '</title>' + _chatExportStyle() + '</head><body>' +
    _chatContentHtml() + '</body></html>');
  w.document.close(); w.focus();
  setTimeout(function() { try { w.print(); } catch(e) {} }, 500);
}

async function exportChatDocx() {
  if (!_chatDetail) return;
  if (!window.JSZip) { alert('Word 변환 라이브러리(JSZip)가 로드되지 않았습니다.'); return; }
  var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
    '<head><meta charset="utf-8">' + _chatExportStyle() + '</head><body>' + _chatContentHtml() + '</body></html>';
  try {
    var zip = new JSZip();
    zip.file('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="html" ContentType="text/html"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>');
    zip.folder('_rels').file('.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>');
    var wf = zip.folder('word');
    wf.file('afchunk.html', html);
    wf.folder('_rels').file('document.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="htmlChunk" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="afchunk.html"/>' +
      '</Relationships>');
    wf.file('document.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<w:body><w:altChunk r:id="htmlChunk"/>' +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>' +
      '</w:body></w:document>');
    var blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    _chatDownload(blob, _chatExportName('docx'));
  } catch (e) {
    alert('Word 저장 실패: ' + e.message);
  }
}

async function viewChatHistoryItem(id) {
  var body = document.getElementById('chat-history-body');
  body.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px">불러오는 중...</div>';
  try {
    var resp = await sb.from('chat_logs')
      .select('question, answer, category, created_at, sources')
      .eq('id', id).single();
    if (resp.error) throw resp.error;
    var row = resp.data;
    var srcHtml = '';
    var srcs = row.sources;
    if (typeof srcs === 'string') {
      try { srcs = JSON.parse(srcs); } catch(e) { srcs = srcs ? [srcs] : []; }
    }
    var uniqueSrcs = Array.isArray(srcs) ? srcs.filter(function(v, i, a) { return a.indexOf(v) === i; }) : [];
    if (uniqueSrcs.length > 0) {
      srcHtml = '<div class="rag-sources" style="margin-top:12px"><i class="ti ti-book"></i> 참조: ' +
        uniqueSrcs.slice(0, 6).map(function(s) { return '<span class="rag-tag">' + chEsc(s) + '</span>'; }).join(' ') + '</div>';
    }
    _chatDetail = { question: row.question || '', answer: row.answer || '', category: row.category || '일반', created_at: row.created_at, sources: uniqueSrcs };
    body.innerHTML =
      '<button class="btn" onclick="openChatHistory()" style="margin-bottom:12px"><i class="ti ti-arrow-left"></i>목록으로</button>' +
      '<button class="btn" onclick="deleteChatHistoryItem(\'' + id + '\', null)" style="margin-bottom:12px;margin-left:8px;color:#d04545"><i class="ti ti-trash"></i>삭제</button>' +
      '<button class="btn" onclick="exportChatMd()" title="Markdown(.md)으로 저장" style="margin-bottom:12px;margin-left:8px"><i class="ti ti-download"></i>MD</button>' +
      '<button class="btn" onclick="exportChatDocx()" title="Word(.docx)로 저장" style="margin-bottom:12px;margin-left:8px"><i class="ti ti-download"></i>Word</button>' +
      '<button class="btn" onclick="exportChatPdf()" title="PDF로 인쇄/저장 (전체 내용)" style="margin-bottom:12px;margin-left:8px"><i class="ti ti-download"></i>PDF</button>' +
      '<div style="font-size:13px;font-weight:600;color:var(--text-primary);line-height:1.5">' + chEsc(row.question) + '</div>' +
      '<div style="font-size:11px;color:var(--text-tertiary);margin:5px 0 12px"><span class="rag-tag">' + chEsc(row.category || '일반') + '</span> ' + chDate(row.created_at) + '</div>' +
      '<div class="msg msg-ai" style="max-width:100%">' + renderMd(row.answer || '') + '</div>' + srcHtml;
    body.scrollTop = 0;
  } catch(e) {
    body.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px">조회 실패: ' + chEsc(e.message) + '</div>';
  }
}

function closeChatHistory() {
  document.getElementById('chat-history-modal').style.display = 'none';
}

// 자문 이력 삭제 — 목록 카드의 휴지통 버튼(btn 전달) / 상세 보기의 삭제 버튼(btn=null)
async function deleteChatHistoryItem(id, btn) {
  if (!confirm('이 자문 이력을 삭제할까요?')) return;
  try {
    var resp = await sb.from('chat_logs').delete().eq('id', id);
    if (resp.error) throw resp.error;
    if (btn && btn.closest) {
      var card = btn.closest('.card');
      if (card) card.remove();
      var body = document.getElementById('chat-history-body');
      if (body && !body.querySelector('.card')) {
        body.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px">저장된 자문 이력이 없습니다.</div>';
      }
    } else {
      openChatHistory(); // 상세 보기에서 삭제 → 목록으로 복귀
    }
  } catch(e) {
    alert('이력 삭제 실패: ' + e.message);
  }
}

// 홈 대시보드 최근 자문 카드 → 이력 모달 열고 바로 상세 표시
function openChatHistoryDetail(id) {
  document.getElementById('chat-history-modal').style.display = 'flex';
  viewChatHistoryItem(id);
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const btn = document.getElementById('send-btn');
  const text = input.value.trim();
  if (!text || isSending) return;

  isSending = true;
  input.disabled = true;
  btn.disabled = true;
  input.value = '';

  appendMsg('user', text);
  const loader = appendLoading();
  const chatArea = document.getElementById('chat-area');

  try {
    // 스트리밍: 첫 토큰 도착 시 로더 제거하고 답변 말풍선을 실시간 갱신(렌더 쓰로틀)
    let streamEl = null;
    let lastRender = 0;
    const onDelta = function(partial) {
      if (!streamEl) { loader.remove(); streamEl = appendMsg('ai', ''); }
      const now = Date.now();
      if (now - lastRender < 120) return;
      lastRender = now;
      streamEl.innerHTML = '<div class="msg-name">전파정책 전문가 AI</div>' + renderMd(partial);
      chatArea.scrollTop = chatArea.scrollHeight;
    };
    const answer = await callClaude(text, onDelta);
    if (!streamEl) { loader.remove(); streamEl = appendMsg('ai', ''); }
    const msgEl = streamEl;
    msgEl.innerHTML = '<div class="msg-name">전파정책 전문가 AI</div>' + renderMd(answer);
    chatArea.scrollTop = chatArea.scrollHeight;

    // RAG 출처 표시
    if (lastRagSources && lastRagSources.length > 0) {
      const unique = lastRagSources.filter(function(v, i, a) { return a.indexOf(v) === i; });
      const srcDiv = document.createElement('div');
      srcDiv.className = 'rag-sources';
      srcDiv.innerHTML = '<i class="ti ti-database"></i>참조 문서: ' + unique.map(function(s) {
        return '<span class="rag-tag">' + s + '</span>';
      }).join(' ');
      msgEl.appendChild(srcDiv);
    }

    // 컨플루언스 검색 실패 가시화 (fail-soft로 자문은 정상 진행 — 생략 사실만 표시)
    if (lastConfluenceFailed) {
      const cfDiv = document.createElement('div');
      cfDiv.className = 'rag-sources';
      cfDiv.style.color = '#b45309';
      cfDiv.innerHTML = '<i class="ti ti-alert-triangle"></i>팀 컨플루언스 검색 실패 — 이번 답변에는 팀 문서가 반영되지 않았습니다';
      msgEl.appendChild(cfDiv);
    }

    if (sb) {
      try {
        await sb.from('chat_logs').insert({
          question: text,
          answer: answer,
          category: detectCategory(text),
          sources: lastRagSources
        });
      } catch(e) { console.warn('자문 이력(chat_logs) 저장 실패(답변은 정상):', e); }
      refreshDashboard();
    }
  } catch(e) {
    loader.remove();
    appendMsg('ai', '⚠️ ' + e.message);
  } finally {
    isSending = false;
    input.disabled = false;
    btn.disabled = false;
    input.focus();
  }
}

function askQ(q) {
  go('chat', document.querySelectorAll('.nav-item')[1]);
  document.getElementById('chat-input').value = q;
  setTimeout(sendChat, 150);
}

// ════════════════════════════════════════════
//  Dashboard
// ════════════════════════════════════════════
function smartRefresh() {
  var active = document.querySelector('.panel[style*="display: block"], .panel[style*="display:block"]');
  if (!active) active = document.getElementById('panel-news');
  var id = active ? active.id : 'panel-news';
  var map = {

    'panel-news':     function() { loadNews(); },
    'panel-briefing': function() { loadBriefing(); },
    'panel-terms':    function() { loadTerms && loadTerms(); },
    'panel-press':    function() { loadPressJSON(); },
    'panel-law':      function() { loadKbDocs(); },
  };
  var fn = map[id] || function() { loadNews(); };
  fn();
}

async function refreshDashboard() {
  if (!sb) return;
  try {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { count: consultCount } = await sb.from('chat_logs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', firstDay);

    const { count: newsCount } = await sb.from('news_feed')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false);

    document.getElementById('stat-consult').textContent = consultCount ?? 0;
    document.getElementById('stat-consult-sub').textContent = '이번달 AI 자문 횟수';
    document.getElementById('stat-news').textContent = newsCount ?? 0;
    document.getElementById('stat-news-sub').textContent = '미확인 뉴스';

    const { data: logs } = await sb.from('chat_logs')
      .select('id, question, category, created_at')
      .order('created_at', { ascending: false })
      .limit(3);

    if (logs && logs.length > 0) {
      const container = document.getElementById('recent-logs');
      container.innerHTML = logs.map(l => {
        const date = new Date(l.created_at).toLocaleDateString('ko-KR', {month:'2-digit',day:'2-digit'});
        const catColor = { '주파수':'badge-purple','전자파':'badge-blue','ITU-R':'badge-blue','적합성평가':'badge-teal','기술기준':'badge-teal','일반':'badge-amber' };
        return `<div class="card" style="cursor:pointer;margin-bottom:8px" onclick="openChatHistoryDetail('${l.id}')">
          <div class="card-header"><span class="card-title" style="font-size:12px">${l.question.slice(0,40)}${l.question.length>40?'…':''}</span><span class="badge ${catColor[l.category]||'badge-amber'}">${l.category||'일반'}</span></div>
          <div class="card-meta"><i class="ti ti-calendar"></i>${date}</div>
        </div>`;
      }).join('');
    }
  } catch(e) { console.warn('Dashboard refresh error:', e); }
}

// ════════════════════════════════════════════
//  News — 팀 중요도 기반 분류 & 액션 아이템 패널
// ════════════════════════════════════════════
let currentNewsFilter = '전체';
let currentNewsSourceType = 'gov'; // 'gov' | 'media' | 'all'
let newsDataCache = [];      // 전체 로드된 뉴스 캐시
let selectedNewsId = null;   // 현재 선택된 뉴스 id
var GOV_SOURCE_PREFIXES = ['국립전파연구원', '과기정통부', '방통위'];

function closeNewsDetail() {
  selectedNewsId = null;
  var panel = document.getElementById('news-detail-panel');
  if (panel) panel.style.display = 'none';
}

// ── 중요도 분류 규칙 ──────────────────────────────────────
// SKT Comm센터 기술정책팀 KPI 기준으로 키워드 매핑
var IMPORTANCE_RULES = {
  긴급: {
    color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: '2px solid #ef4444',
    label: '🔴 중요', badge_class: 'badge-red',
    desc: '즉각 임원 보고 및 대관 대응 필요',
    keywords: ['취소','회수','처분','반납','강제','의무화','시정명령','이행강제','과징금',
               '청문','위반','제재','즉시','긴급','주파수 반납','할당 취소','할당취소',
               '재할당 거부','시행 완료','고시 시행','법령 시행','효력 발생'],
    response_guide: [
      '즉시 현황 파악 — 해당 주파수·허가 영향 범위 확인',
      '법무팀 협의 — 법적 대응 근거 검토',
      '임원 보고서 작성 (1p 이내, 배경·쟁점·리스크·대응방향)',
      '정부 회신 또는 의견서 준비',
      '유관부서(네트워크·재무·법무) 긴급 공유'
    ]
  },
  보통: {
    color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: '2px solid #f59e0b',
    label: '🟡 보통', badge_class: 'badge-amber',
    desc: '당일~금주 내 검토 및 팀 공유 필요',
    keywords: ['행정예고','입법예고','개정안','발의','공청회','계획 확정','추진 계획','논의',
               '심의','의견수렴','고시 개정','시행령 개정','정책 발표','방침','예정','추진',
               '제정안','신설','협의 중','검토 중','연구반','태스크포스','TF','로드맵'],
    response_guide: [
      '내용 검토 및 1p 요약 작성',
      '팀 내부 공유 (채널/메일)',
      '검토의견서 또는 입장문 준비',
      '유관부서 사전 협의 여부 판단',
      '향후 일정 캘린더 등록'
    ]
  },
  참고: {
    color: '#22c55e', bg: 'rgba(34,197,94,0.06)', border: '1px solid var(--border)',
    label: '🟢 참고', badge_class: 'badge-teal',
    desc: '동향 파악 — 필요시 브리핑 반영',
    keywords: [],   // 위 두 기준에 해당하지 않으면 참고
    response_guide: [
      '내용 확인 및 키워드 태그 정리',
      '필요시 모닝 브리핑 반영',
      '지식 DB 저장 (장기 트렌드 추적)'
    ]
  }
};

// ── SKT 관련 주제 키워드 (공공 와이파이 / 이동통신 품질·장비 / 전파·전자파·무선국·주파수)
var SKT_RELEVANT_TOPICS = [
  // 공공 와이파이
  '공공 와이파이', '공공와이파이', '공공wi-fi', '공공wifi', '공중 와이파이', '공중와이파이',
  '공공 인터넷', '무료 와이파이', '공용 와이파이',
  // 이동통신 품질·장비
  '이동통신 품질', '통신 품질', '5g 품질', '5g 속도', '네트워크 품질', '기지국',
  '통신 장비', '중계기', '통신망', '망 품질', '서비스 품질', '커버리지',
  '통신 불량', '전파 수신', '수신 불량', '전파 품질', '신호 약함', '음영지역',
  // 전파·전자파·무선국·주파수
  '전파', '전자파', '무선국', '주파수'
];

// ── 부정적·불만 기사 감지 키워드
var NEGATIVE_SIGNALS = [
  '민낯', '속터지는', '절레절레', '불만', '비판', '논란', '갈등', '문제점', '미흡', '부실',
  '실패', '형편없', '최악', '불편', '차별', '피해', '민원', '어이없', '황당', '역부족',
  '허점', '사각지대', '외면', '방치', '방관', '지적', '질타', '성토', '처참', '엉터리',
  '먹통', '불통', '불량', '낙제점', '끊김', '느린', '불만족', '개선 촉구', '개선 요구',
  '꼴', '망신', '비난', '성난', '분통', '뿔난', '꼬집', '꼬집어', '분노', '항의',
  'nobody\'s ready', 'fails', 'problem', 'issue', 'concern', 'complaint', 'poor',
  'slow', 'unreliable', 'disappointing', 'frustrat'
];

function classifyNewsImportance(news) {
  var hay = ((news.title || '') + ' ' + (news.summary || '')).toLowerCase();

  // [1단계] 법적 조치·행정처분 등 기존 긴급 키워드 → 긴급
  var urgentKws = IMPORTANCE_RULES['긴급'].keywords;
  for (var i = 0; i < urgentKws.length; i++) {
    if (hay.includes(urgentKws[i].toLowerCase())) return '긴급';
  }

  // [2단계] SKT 관련 주제 + 부정적 신호 → 긴급
  var isRelevant = SKT_RELEVANT_TOPICS.some(function(t) { return hay.includes(t.toLowerCase()); });
  var isNegative = NEGATIVE_SIGNALS.some(function(s) { return hay.includes(s.toLowerCase()); });
  if (isRelevant && isNegative) return '긴급';

  // [3단계] 정책 움직임 (입법예고·개정안 등) → 보통
  var normalKws = IMPORTANCE_RULES['보통'].keywords;
  for (var i = 0; i < normalKws.length; i++) {
    if (hay.includes(normalKws[i].toLowerCase())) return '보통';
  }

  // [4단계] SKT 관련 주제 + 정보성 → 보통
  if (isRelevant) return '보통';

  return '참고';
}

// ── 뉴스 로드 & 렌더링 ────────────────────────────────────
async function loadNews() {
  if (!sb) return;
  try {
    var { data } = await sb.from('news_feed').select('*')
      .order('published_at', { ascending: false, nullsFirst: false }).limit(500);
    newsDataCache = data || [];
    // 중요도 분류 (캐시에 저장)
    newsDataCache.forEach(function(n) { n._importance = n.importance || n.urgency || classifyNewsImportance(n); });
    renderNewsList();
  } catch(e) {
    console.warn('News load error:', e);
    var el = document.getElementById('news-list');
    if (el) el.innerHTML = '<div style="color:var(--text-secondary);padding:20px;text-align:center;font-size:12px">뉴스 로드 실패: ' + e.message + '</div>';
  }
}

// ── 뉴스 그룹핑 유틸 ─────────────────────────────────────
var _newsGroupOpen = {};

function _extractKeywords(title) {
  var stopwords = ['관련','대한','위한','통해','대해','기반','위해','이후','이전',
    '지난','오는','올해','내년','지금','현재','새로운','이번','해당','추진',
    '강화한다','강화하는','나선다','밝혔다','위해서'];
  // 한글 단어 추출 (2글자 이상)
  var words = title.match(/[가-힣]{2,}/g) || [];
  // 숫자+한글 혼합 추출 후 조사 제거 (예: 6300개로 → 6300개)
  var mixed = (title.match(/[0-9]+[가-힣]+/g) || []).map(function(w){
    return w.replace(/(으로|에서|부터|까지|로서|로는|로도|에는|에도|이나|이며|이고|로|을|를|이|가|은|는|의|에|과|와|도|만)$/, '');
  });
  // 지명 정규화: '제주도' → '제주', '서울시' → '서울'
  var normalized = words.map(function(w){
    return w.replace(/([가-힣]{2,})(도|시|군|구|광장)$/, '$1');
  });
  var all = normalized.concat(mixed);
  return all.filter(function(w){ return !stopwords.includes(w) && w.length >= 2; });
}

function _titleSimilarity(t1, t2) {
  var k1 = _extractKeywords(t1);
  var k2 = _extractKeywords(t2);
  if (!k1.length || !k2.length) return 0;
  var shared = k1.filter(function(w){ return k2.includes(w); });
  // 공유 키워드 1개만으로는 그룹핑하지 않음 — '기지국' 같은 흔한 도메인 단어가
  // 서로 다른 주제(광화문 행사 vs 폐기지국 재활용)를 한 그룹으로 잇는 오류 방지 (2026-06-12)
  if (shared.length < 2) return 0;
  return shared.length / Math.max(k1.length, k2.length);
}

function _groupNews(items) {
  var used = {};
  var groups = [];
  for (var i = 0; i < items.length; i++) {
    if (used[i]) continue;
    var group = [items[i]];
    var d1 = (items[i].published_at || items[i].created_at || '').slice(0, 10);
    used[i] = true;
    // 그룹 크기가 늘어날 수 있으므로 반복 확인 (전이적 그룹핑)
    var changed = true;
    while (changed) {
      changed = false;
      for (var j = 0; j < items.length; j++) {
        if (used[j]) continue;
        var d2 = (items[j].published_at || items[j].created_at || '').slice(0, 10);
        if (d1 !== d2) continue;
        // 그룹 내 어느 기사와 유사하면 추가
        var matchAny = group.some(function(g) {
          return _titleSimilarity(g.title, items[j].title) >= 0.15;
        });
        if (matchAny) {
          group.push(items[j]);
          used[j] = true;
          changed = true;
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

function _groupTitle(items) {
  var allKw = [];
  items.forEach(function(n){ allKw = allKw.concat(_extractKeywords(n.title)); });
  var freq = {};
  allKw.forEach(function(w){ freq[w] = (freq[w]||0) + 1; });
  var top = Object.keys(freq).filter(function(w){ return freq[w] >= 2; })
    .sort(function(a,b){ return freq[b]-freq[a]; }).slice(0,3);
  return top.length ? top.join(' ') + ' 관련' : items[0].title.slice(0,20) + '…';
}

function toggleNewsGroup(gid) {
  _newsGroupOpen[gid] = !_newsGroupOpen[gid];
  var body = document.getElementById('ng-body-' + gid);
  var icon = document.getElementById('ng-icon-' + gid);
  if (body) body.style.display = _newsGroupOpen[gid] ? 'block' : 'none';
  if (icon) icon.style.transform = _newsGroupOpen[gid] ? 'rotate(180deg)' : '';
}

function _renderSingleItem(n) {
  var rule = IMPORTANCE_RULES[n._importance] || IMPORTANCE_RULES['참고'];
  var date = new Date(n.published_at || n.created_at).toLocaleDateString('ko-KR', {year:'numeric', month:'2-digit', day:'2-digit'});
  var isSelected = String(n.id) === String(selectedNewsId);
  var urlIcon = n.url
    ? ' <a href="' + n.url + '" target="_blank" onclick="event.stopPropagation()" style="color:var(--accent);font-size:11px;vertical-align:middle"><i class="ti ti-external-link"></i></a>'
    : '';
  var lockIcon = ' <span onclick="event.stopPropagation();toggleNewsLock(\'' + n.id + '\')" ' +
    'title="' + (n.locked ? '잠금 해제 (해제 시 15일 경과 후 삭제됨)' : '잠금 (15일이 지나도 삭제되지 않음)') + '" ' +
    'style="cursor:pointer;font-size:11px;vertical-align:middle;color:' + (n.locked ? 'var(--accent)' : 'var(--text-tertiary)') + ';opacity:' + (n.locked ? '1' : '.4') + '">' +
    '<i class="ti ti-' + (n.locked ? 'lock' : 'lock-open') + '"></i></span>';
  var delIcon = ' <span onclick="event.stopPropagation();deleteNewsItem(\'' + n.id + '\')" ' +
    'title="기사 삭제" ' +
    'style="cursor:pointer;font-size:11px;vertical-align:middle;color:var(--text-tertiary);opacity:.4">' +
    '<i class="ti ti-trash"></i></span>';
  return '<div class="news-item" onclick="showNewsDetail(\'' + n.id + '\')" style="cursor:pointer;border-left:' + rule.border + ';' + (isSelected ? 'background:var(--bg-secondary);border-radius:var(--radius-md)' : '') + '">' +
    '<div class="news-dot ' + (n.is_read ? 'dot-read' : 'dot-new') + '"></div>' +
    '<div style="flex:1;min-width:0;overflow:hidden">' +
      '<div class="news-item-header" style="display:flex;align-items:center;gap:5px;margin-bottom:3px;flex-wrap:wrap">' +
        '<span style="font-size:10px;font-weight:700;color:' + rule.color + ';background:' + rule.bg + ';padding:1px 7px;border-radius:4px;flex-shrink:0">' + rule.label + '</span>' +
        '<span style="font-size:11px;color:var(--text-tertiary);flex-shrink:0">' + date + '</span>' +
        (n.source ? '<span class="news-item-source" style="font-size:10px;color:var(--text-tertiary);margin-left:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px">' + n.source + '</span>' : '') +
      '</div>' +
      '<div class="news-title" style="font-size:13px;line-height:1.5;word-break:break-word;overflow-wrap:break-word">' + n.title + urlIcon + lockIcon + delIcon + '</div>' +
      (n.summary ? '<div class="news-meta" style="margin-top:3px;font-size:11px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;color:var(--text-tertiary)">' + n.summary.slice(0, 80) + (n.summary.length > 80 ? '…' : '') + '</div>' : '') +
    '</div>' +
  '</div>';
}

function renderNewsList() {
  var data = currentNewsFilter === '전체'
    ? newsDataCache
    : newsDataCache.filter(function(n) { return n._importance === currentNewsFilter; });

  // 소스 타입 필터
  if (currentNewsSourceType === 'gov') {
    data = data.filter(function(n) {
      return GOV_SOURCE_PREFIXES.some(function(p) { return (n.source || '').startsWith(p); });
    });
  } else if (currentNewsSourceType === 'media') {
    data = data.filter(function(n) {
      return !GOV_SOURCE_PREFIXES.some(function(p) { return (n.source || '').startsWith(p); });
    });
  }

  var sorted = data.slice().sort(function(a, b) {
    return new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at);
  });

  var listEl = document.getElementById('news-list');
  if (!listEl) return;

  if (sorted.length === 0) {
    listEl.innerHTML = '<div style="color:var(--text-secondary);padding:24px;text-align:center;font-size:12px">해당 중요도의 뉴스가 없습니다.</div>';
    return;
  }

  // 정부 보도자료·공지사항은 그룹핑 없이 개별 표시
  var groups = currentNewsSourceType === 'gov' ? sorted.map(function(n){ return [n]; }) : _groupNews(sorted);
  var html = '';

  groups.forEach(function(group, gi) {
    if (group.length === 1) {
      html += _renderSingleItem(group[0]);
    } else {
      var gid = 'g-' + String(group[0].id);
      var isOpen = !!_newsGroupOpen[gid];
      var gtitle = _groupTitle(group);
      var date = (group[0].published_at || group[0].created_at || '').slice(0, 10);
      var hasUrgent = group.some(function(n){ return n._importance === '긴급'; });
      var badgeColor = hasUrgent ? 'color:#c53030;background:#fff5f5' : 'color:var(--text-secondary);background:var(--bg-secondary)';
      html += '<div style="border:0.5px solid var(--border-secondary);border-radius:var(--radius-md);margin:4px 0;overflow:hidden">' +
        '<div onclick="toggleNewsGroup(\'' + gid + '\')" style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--bg-secondary);cursor:pointer;user-select:none">' +
          '<i class="ti ti-news" style="font-size:14px;color:var(--text-tertiary);flex-shrink:0"></i>' +
          '<span style="font-size:13px;font-weight:500;color:var(--text-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + gtitle + '</span>' +
          '<span style="font-size:11px;padding:1px 7px;border-radius:8px;flex-shrink:0;' + badgeColor + '">' + group.length + '건</span>' +
          '<span style="font-size:11px;color:var(--text-tertiary);flex-shrink:0">' + date + '</span>' +
          '<i id="ng-icon-' + gid + '" class="ti ti-chevron-down" style="font-size:14px;color:var(--text-tertiary);flex-shrink:0;transition:transform .2s;' + (isOpen ? 'transform:rotate(180deg)' : '') + '"></i>' +
        '</div>' +
        '<div id="ng-body-' + gid + '" style="display:' + (isOpen ? 'block' : 'none') + ';padding:0 12px;border-top:0.5px solid var(--border-tertiary)">' +
          group.map(function(n) {
            var rule = IMPORTANCE_RULES[n._importance] || IMPORTANCE_RULES['참고'];
            var urlIcon = n.url ? ' <a href="' + n.url + '" target="_blank" onclick="event.stopPropagation()" style="color:var(--accent);font-size:11px"><i class="ti ti-external-link"></i></a>' : '';
            return '<div onclick="showNewsDetail(\'' + n.id + '\')" style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:0.5px solid var(--border-tertiary);cursor:pointer">' +
              '<div class="news-dot ' + (n.is_read ? 'dot-read' : 'dot-new') + '" style="flex-shrink:0"></div>' +
              '<span style="font-size:12px;font-weight:700;color:' + rule.color + ';background:' + rule.bg + ';padding:1px 6px;border-radius:4px;flex-shrink:0">' + rule.label + '</span>' +
              '<span style="font-size:13px;color:var(--text-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + n.title + urlIcon + '</span>' +
              '<span style="font-size:11px;color:var(--text-tertiary);flex-shrink:0;margin-left:8px">' + (n.source||'') + '</span>' +
              '<span onclick="event.stopPropagation();deleteNewsItem(\'' + n.id + '\')" title="기사 삭제" style="cursor:pointer;font-size:11px;color:var(--text-tertiary);opacity:.5;flex-shrink:0;margin-left:6px"><i class="ti ti-trash"></i></span>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>';
    }
  });

  var groupCount = groups.filter(function(g){ return g.length > 1; }).length;
  var totalGrouped = groups.filter(function(g){ return g.length > 1; }).reduce(function(s,g){ return s+g.length; }, 0);
  if (groupCount > 0) {
    html += '<div style="font-size:11px;color:var(--text-tertiary);text-align:center;padding:8px 0">' +
      sorted.length + '건 중 ' + totalGrouped + '건 → ' + groupCount + '개 그룹으로 묶음</div>';
  }

  listEl.innerHTML = html;
}

function filterNewsByImportance(el, importance) {
  document.querySelectorAll('#news-filter-tabs .tag').forEach(function(t) { t.classList.remove('selected'); });
  el.classList.add('selected');
  currentNewsFilter = importance;
  renderNewsList();
}

// ── 뉴스 상세 패널 ─────────────────────────────────────────
// ── 뉴스 잠금 토글 (locked=true면 15일 경과해도 삭제되지 않음) ──
async function toggleNewsLock(newsId) {
  var n = newsDataCache.find(function(x) { return String(x.id) === String(newsId); });
  if (!n || !sb) return;
  var newVal = !n.locked;
  n.locked = newVal;
  renderNewsList();
  // 모달 잠금 버튼이 열려 있으면 상태 갱신
  var btn = document.getElementById('lock-btn-' + newsId);
  if (btn) {
    btn.innerHTML = newVal ? '<i class="ti ti-lock"></i> 잠금됨' : '<i class="ti ti-lock-open"></i> 잠금';
    btn.style.color = newVal ? 'var(--accent)' : '';
  }
  try {
    await sb.from('news_feed').update({ locked: newVal }).eq('id', newsId);
  } catch(e) {
    n.locked = !newVal;
    renderNewsList();
    alert('잠금 변경 실패: ' + e.message);
  }
}

// ── 뉴스 기사 삭제 (news_feed 영구 삭제 + deleted_news 등록으로 재수집 방지) ──
async function deleteNewsItem(newsId) {
  var n = newsDataCache.find(function(x) { return String(x.id) === String(newsId); });
  if (!n || !sb) return;
  var msg = '이 기사를 삭제할까요?\n\n' + (n.title || '');
  if (n.locked) msg += '\n\n⚠️ 잠금된 기사입니다. 삭제하면 AI 자문에서도 더 이상 참조되지 않습니다.';
  if (!confirm(msg)) return;
  try {
    // 재수집 방지: 크롤러가 같은 URL·제목을 다시 저장하지 않도록 블록리스트 기록
    try { await sb.from('deleted_news').insert({ url: n.url || null, title: n.title || null }); } catch(e2) { console.warn('deleted_news 기록 실패(같은 기사 재수집될 수 있음):', e2); }
    var resp = await sb.from('news_feed').delete().eq('id', newsId);
    if (resp.error) throw resp.error;
    newsDataCache = newsDataCache.filter(function(x) { return String(x.id) !== String(newsId); });
    if (String(selectedNewsId) === String(newsId)) {
      selectedNewsId = null;
      var panel = document.getElementById('news-detail-panel');
      if (panel) panel.style.display = 'none';
    }
    renderNewsList();
  } catch(e) {
    alert('기사 삭제 실패: ' + e.message);
  }
}

// ── 긴급도 수정 셀렉터 HTML (뉴스 상세 모달) ──
function _impSelHtml(newsId, current) {
  return ['긴급', '보통', '참고'].map(function(v) {
    var r = IMPORTANCE_RULES[v] || {};
    var act = (current === v);
    return '<span onclick="setNewsImportance(\'' + newsId + '\',\'' + v + '\')" ' +
      'style="cursor:pointer;font-size:10px;padding:2px 7px;border-radius:4px;white-space:nowrap;border:1px solid ' + (act ? r.color : 'var(--border-secondary)') + ';' +
      'color:' + (act ? '#fff' : 'var(--text-tertiary)') + ';background:' + (act ? r.color : 'transparent') + '">' + (v === '긴급' ? '중요' : v) + '</span>';
  }).join('');
}

// ── 긴급도 수동 수정 — importance_feedback에 기록되어 크롤러 분류가 학습됨 ──
async function setNewsImportance(newsId, newVal) {
  var n = newsDataCache.find(function(x) { return String(x.id) === String(newsId); });
  if (!n || !sb) return;
  var oldVal = n._importance || n.importance || n.urgency || '참고';
  if (oldVal === newVal) return;
  try {
    var ur = await sb.from('news_feed').update({ importance: newVal, urgency: newVal })
      .eq('id', newsId).select('id,importance');
    if (ur.error) throw new Error('news_feed 업데이트 실패: ' + ur.error.message);
    if (!ur.data || ur.data.length === 0) throw new Error('news_feed 업데이트 실패: 대상 행을 찾지 못함');
    // 피드백 기록 — ai_importance는 최초 AI 판정값 보존 (news_id당 1행)
    var fb = { title: n.title || '', summary: (n.summary || '').slice(0, 300),
               user_importance: newVal, updated_at: new Date().toISOString() };
    var ex = await sb.from('importance_feedback').select('id').eq('news_id', newsId).limit(1);
    if (ex.data && ex.data.length > 0) {
      await sb.from('importance_feedback').update(fb).eq('news_id', newsId);
    } else {
      fb.news_id = newsId;
      fb.ai_importance = oldVal;
      await sb.from('importance_feedback').insert(fb);
    }
    n.importance = newVal; n.urgency = newVal; n._importance = newVal;
    renderNewsList();
    var rule = IMPORTANCE_RULES[newVal];
    var badge = document.getElementById('importance-badge-' + newsId);
    if (badge && rule) { badge.textContent = rule.label; badge.style.color = rule.color; badge.style.background = rule.bg; }
    var sel = document.getElementById('imp-sel-' + newsId);
    if (sel) sel.innerHTML = _impSelHtml(newsId, newVal);
    // 당일 브리핑에 포함된 기사면 브리핑 원문의 🔴 표시도 동기화
    try { await syncBriefingUrgency(newsId, newVal); } catch(e2) { console.warn('[브리핑 동기화] 실패(무시):', e2); }
  } catch(e) {
    alert('긴급도 수정 실패: ' + e.message);
  }
}

// ── 긴급도 수정 → 당일 브리핑 원문 🔴 동기화 ──
// 기사가 오늘 daily_briefings에 [ID:..]로 포함돼 있으면, 긴급 지정 시 해당 줄에 🔴 추가,
// 긴급 해제 시 🔴 제거. 화면이 열려 있으면 즉시 갱신. (이미 발송된 이메일·텔레그램은 소급 불가)
async function syncBriefingUrgency(newsId, newVal) {
  if (!sb) return;
  var todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  var resp = await sb.from('daily_briefings').select('content').eq('briefing_date', todayKst).limit(1);
  if (resp.error || !resp.data || resp.data.length === 0) return;
  var content = resp.data[0].content || '';
  var tag = '[ID:' + newsId + ']';
  if (content.indexOf(tag) === -1) return; // 오늘 브리핑에 없는 기사
  var lines = content.split('\n');
  var changed = false;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf(tag) === -1) continue;
    if (newVal === '긴급' && lines[i].indexOf('🔴') === -1) {
      lines[i] = lines[i].replace(/^(\s*•\s*)/, '$1🔴 ');
      changed = true;
    } else if (newVal !== '긴급' && lines[i].indexOf('🔴') !== -1) {
      lines[i] = lines[i].replace(/🔴\s*/, '');
      changed = true;
    }
    break;
  }
  if (!changed) return;
  var ur = await sb.from('daily_briefings').update({ content: lines.join('\n') }).eq('briefing_date', todayKst);
  if (!ur.error) {
    console.log('[브리핑 동기화] 당일 브리핑 🔴 표시 갱신:', newVal);
    var listEl = document.getElementById('briefing-list');
    if (listEl && listEl.innerHTML) loadBriefing();
  }
}

function showNewsDetail(newsId) {
  selectedNewsId = newsId;
  var n = newsDataCache.find(function(x) { return String(x.id) === String(newsId); });
  if (!n) return;

  // 목록 선택 표시 업데이트
  renderNewsList();

  var rule   = IMPORTANCE_RULES[n._importance] || IMPORTANCE_RULES['참고'];
  var date   = (n.published_at || n.created_at || '').slice(0, 10);
  var urlBtn = n.url
    ? '<a href="' + n.url + '" target="_blank" class="btn" style="font-size:11px;padding:4px 10px;text-decoration:none;white-space:nowrap"><i class="ti ti-external-link"></i> 원문 보기</a>'
    : '';
  var lockBtn = '<button class="btn" id="lock-btn-' + n.id + '" onclick="toggleNewsLock(\'' + n.id + '\')" ' +
    'title="잠금 시 15일이 지나도 삭제되지 않고 AI 자문에서 계속 참조됩니다" ' +
    'style="font-size:11px;padding:4px 10px;cursor:pointer;white-space:nowrap;' + (n.locked ? 'color:var(--accent)' : '') + '">' +
    (n.locked ? '<i class="ti ti-lock"></i> 잠금됨' : '<i class="ti ti-lock-open"></i> 잠금') + '</button>';
  var delBtn = '<button class="btn" onclick="deleteNewsItem(\'' + n.id + '\')" ' +
    'title="이 기사를 목록에서 영구 삭제합니다 (재수집되지 않음)" ' +
    'style="font-size:11px;padding:4px 10px;cursor:pointer;color:#d04545;white-space:nowrap">' +
    '<i class="ti ti-trash"></i> 삭제</button>';

  var impSel = '<div style="display:flex;align-items:center;gap:5px;margin-bottom:8px;flex-wrap:wrap">' +
    '<span style="font-size:10px;color:var(--text-tertiary);white-space:nowrap">중요도 수정</span>' +
    '<span id="imp-sel-' + n.id + '" title="수정 내역은 AI 분류 학습에 반영됩니다" style="display:inline-flex;gap:4px">' + _impSelHtml(n.id, n._importance) + '</span></div>';

  var html =
    // 헤더: 중요도 + 제목
    '<div style="border-left:3px solid ' + rule.color + ';padding-left:10px;margin-bottom:14px">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;row-gap:6px">' +
        '<span id="importance-badge-' + n.id + '" style="font-size:11px;font-weight:700;color:' + rule.color + ';background:' + rule.bg + ';padding:2px 8px;border-radius:4px;white-space:nowrap">' + rule.label + '</span>' +
        '<span style="font-size:11px;color:var(--text-tertiary);white-space:nowrap">' + date + '</span>' +
        '<div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">' + lockBtn + delBtn + urlBtn + '</div>' +
      '</div>' +
      impSel +
      '<div style="font-size:13px;font-weight:600;color:var(--text-primary);line-height:1.55;margin-bottom:4px">' + n.title + '</div>' +
      '<div style="font-size:11px;color:var(--text-secondary)">' + (n.source || '') + '</div>' +
    '</div>' +

    // 주요 내용 요약 — AI 자동 생성 (스피너로 시작)
    '<div style="margin-bottom:14px">' +
      '<div style="font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:7px">● 주요 내용 요약</div>' +
      '<div style="font-size:12px;color:var(--text-primary);padding:9px 12px;background:var(--bg-secondary);border-radius:var(--radius-md);line-height:1.7" id="summary-box-' + n.id + '">' +
        '<div style="display:flex;align-items:center;gap:8px;color:var(--text-secondary)">' +
          '<span style="display:inline-block;width:14px;height:14px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></span>' +
          '요약 생성 중...' +
        '</div>' +
      '</div>' +
    '</div>' +

    // SKT 영향도 — 자동 분석 (로딩 스피너로 시작)
    '<div style="margin-bottom:14px">' +
      '<div style="font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:7px">● SKT 영향도 분석</div>' +
      '<div style="font-size:12px;color:var(--text-primary);padding:10px 12px;background:' + rule.bg + ';border-radius:var(--radius-md);line-height:1.7" id="impact-box-' + n.id + '">' +
        '<div style="display:flex;align-items:center;gap:8px;color:var(--text-secondary)">' +
          '<span style="display:inline-block;width:14px;height:14px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></span>' +
          'AI 분석 중...' +
        '</div>' +
      '</div>' +
    '</div>' +

    // AI 자문 연동
    '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">' +
      '<button onclick="askQ(\'' + n.title.replace(/'/g, "\\'").slice(0,50) + ' SKT 영향 분석해줘\')" class="btn btn-primary" style="width:100%;font-size:12px;justify-content:center">' +
        '<i class="ti ti-message-2"></i> AI 자문에서 상세 분석' +
      '</button>' +
    '</div>';

  var panel   = document.getElementById('news-detail-panel');
  var content = document.getElementById('news-detail-content');
  if (panel)   { panel.style.display = 'block'; }
  if (content) { content.innerHTML = html; }

  // 읽음 처리
  if (sb) { sb.from('news_feed').update({ is_read: true }).eq('id', n.id).then(function() {}); }
  n.is_read = true;

  // 요약 + 영향도 분석 자동 실행
  summarizeNews(n.id);
  analyzeNewsImpact(n.id);
}

// ── 주요 내용 요약 렌더링 헬퍼 ──────────────────────────────────
function renderSummaryHtml(text) {
  // 줄바꿈 기준으로 단락 분리, 각 항목을 불릿으로 표시
  var lines = text.split(/\n+/).map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
  if (lines.length <= 1) {
    // 문장 단위로 분리 (마침표 기준)
    lines = text.replace(/([.!?])\s+/g, '$1\n').split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 4; });
  }
  if (lines.length <= 1) {
    return '<p style="margin:0;font-size:12px;line-height:1.8;color:var(--text-primary)">' + text.trim() + '</p>';
  }
  return lines.map(function(line) {
    return '<div style="display:flex;gap:7px;margin-bottom:7px;font-size:12px;line-height:1.75;color:var(--text-primary)">' +
      '<span style="flex-shrink:0;margin-top:5px;width:5px;height:5px;border-radius:50%;background:var(--accent);display:inline-block"></span>' +
      '<span>' + line + '</span>' +
    '</div>';
  }).join('');
}

// ── 주요 내용 요약 (Claude Haiku + Supabase 캐싱) ──────────────
async function summarizeNews(newsId) {
  var n = newsDataCache.find(function(x) { return String(x.id) === String(newsId); });
  if (!n) return;

  var box = document.getElementById('summary-box-' + newsId);
  if (!box) return;

  // ① DB에 저장된 요약 있으면 즉시 표시 (API 호출 없음)
  if (n.summary && n.summary.trim().length > 20) {
    box.innerHTML = renderSummaryHtml(n.summary.trim());
    return;
  }

  // ② 본문 준비 — 없으면 CORS 프록시로 원문 직접 수집
  var bodySnippet = (n.content || '').replace(/\s+/g, ' ').trim().slice(0, 3000);

  if (!bodySnippet && n.url) {
    box.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;color:var(--text-secondary)">' +
        '<span style="display:inline-block;width:14px;height:14px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></span>' +
        '원문 수집 중...' +
      '</div>';
    bodySnippet = await _fetchArticleBody(n.url);
    if (bodySnippet && sb) {
      // 수집 성공 시 DB에 저장해 다음번엔 바로 사용
      sb.from('news_feed').update({ content: bodySnippet }).eq('id', n.id).then(function() {});
      n.content = bodySnippet;
    }
  }

  if (!bodySnippet) {
    box.innerHTML = '<span style="color:var(--text-tertiary);font-size:11px">원문을 가져오지 못했습니다. 원문 보기를 통해 직접 확인해 주세요.</span>';
    return;
  }

  // 다시 로딩 스피너로 교체
  box.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;color:var(--text-secondary)">' +
      '<span style="display:inline-block;width:14px;height:14px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></span>' +
      '요약 생성 중...' +
    '</div>';

  var { claudeKey } = getConfig();
  if (!claudeKey) {
    box.innerHTML = '<span style="color:var(--text-tertiary);font-size:11px">Claude API 키 필요 — 설정에서 입력해 주세요.</span>';
    return;
  }

  try {
    var userMsg =
      '다음 뉴스를 핵심 포인트 3~5개로 요약하세요.\n' +
      '- 각 포인트를 줄바꿈으로 구분하세요.\n' +
      '- 각 포인트는 1~2문장, 육하원칙(누가/무엇을/왜/어떻게) 포함.\n' +
      '- 불릿 기호(•, -, * 등)는 붙이지 마세요. 순수 텍스트만.\n\n' +
      '제목: ' + n.title + '\n출처: ' + (n.source || '') + '\n날짜: ' + (n.published_at || '').slice(0, 10) +
      '\n\n본문:\n' + bodySnippet;

    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: '당신은 전파·통신 정책 뉴스를 간결하게 요약하는 전문가입니다. 사실만 기반으로 핵심 포인트를 줄바꿈으로 구분하여 작성하세요. 불릿 기호 없이 텍스트만 출력하세요.',
        messages: [{ role: 'user', content: userMsg }]
      })
    });
    var data = await res.json();
    var summaryText = (data.content && data.content[0] && data.content[0].text || '').trim();

    if (summaryText) {
      box.innerHTML = renderSummaryHtml(summaryText);
      // ② Supabase에 저장 + 로컬 캐시 갱신
      n.summary = summaryText;
      if (sb) { sb.from('news_feed').update({ summary: summaryText }).eq('id', n.id).then(function() {}); }
    } else {
      box.innerHTML = '<span style="color:var(--text-tertiary);font-size:11px">요약 생성 실패 — 원문을 직접 확인해 주세요.</span>';
    }
  } catch(e) {
    console.warn('요약 오류:', e);
    if (box) { box.innerHTML = '<span style="color:var(--text-tertiary);font-size:11px">요약 생성 실패 — 원문을 직접 확인해 주세요.</span>'; }
  }
}

// ── AI 영향도 분석 (Claude Haiku — 빠른 분석) ───────────────
async function analyzeNewsImpact(newsId) {
  var n = newsDataCache.find(function(x) { return String(x.id) === String(newsId); });
  if (!n) return;
  var { claudeKey } = getConfig();
  if (!claudeKey) { alert('Claude API 키가 필요합니다.'); return; }

  var box = document.getElementById('impact-box-' + newsId);

  try {
    var sysMsg = SKT_IMPACT_SYSTEM_PROMPT;
    // 본문이 있으면 최대 2000자까지 포함 — 제목만 줄 때보다 훨씬 정확한 분석 가능
    var bodySnippet = (n.body || n.content || '').replace(/\s+/g, ' ').trim().slice(0, 2000);

    // 본문 없으면 분석 불가 안내
    if (!bodySnippet) {
      if (box) box.innerHTML = '<span style="color:var(--text-tertiary);font-size:11px">원문 본문이 없어 영향도를 분석할 수 없습니다. 원문 보기를 통해 직접 확인해 주세요.</span>';
      return;
    }

    var userMsg = '제목: ' + n.title +
      '\n출처: ' + (n.source || '') +
      '\n날짜: ' + (n.published_at || '').slice(0, 10) +
      (n.summary ? '\n요약: ' + n.summary : '') +
      (bodySnippet ? '\n\n본문:\n' + bodySnippet : '');

    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, system: sysMsg, messages: [{ role: 'user', content: userMsg }] })
    });
    var data = await res.json();

    // API 오류 응답 명시 처리
    if (data.error) {
      throw new Error(data.error.message || 'API 오류');
    }

    var text = (data.content && data.content[0] && data.content[0].text) || '';

    var impactM   = text.match(/<impact>([\s\S]*?)<\/impact>/);
    var priorityM = text.match(/<priority>([\s\S]*?)<\/priority>/);

    var impactText   = impactM   ? impactM[1].trim()   : '';
    var priorityText = priorityM ? priorityM[1].trim() : '';

    var rule = IMPORTANCE_RULES[n._importance] || IMPORTANCE_RULES['참고'];

    if (box) {
      if (impactText) {
        box.innerHTML =
          renderSummaryHtml(impactText) +
          (priorityText ? '<div style="font-size:11px;color:' + rule.color + ';font-weight:600;margin-top:6px">⚡ ' + priorityText + '</div>' : '');
      } else {
        box.innerHTML = text
          ? renderSummaryHtml(text.trim())
          : '<span style="color:var(--text-tertiary);font-size:11px">분석 결과를 받지 못했습니다 — AI 자문에서 직접 질문해 주세요.</span>';
      }
    }

    // ※ 과거에는 분석의 priority로 긴급도 배지·DB를 자동 덮어썼으나 제거됨 (2026-06-12).
    //    긴급도의 단일 기준은 크롤러 분류 + 담당자 수동 수정(importance_feedback)이며,
    //    영향도 분석은 표시 전용. (자동 덮어쓰기가 담당자 수정을 되돌리는 버그의 원인이었음)
  } catch(e) {
    console.warn('영향도 분석 오류:', e);
    if (box) { box.innerHTML = '<span style="color:var(--text-tertiary);font-size:11px">분석 실패 (' + e.message + ') — AI 자문에서 직접 질문해 주세요.</span>'; }
  }
}

async function markRead(id) {
  if (sb) { try { await sb.from('news_feed').update({ is_read: true }).eq('id', id); } catch(e) { console.warn('읽음 표시 저장 실패:', e); } }
}

// 구 filterNews 호환용 (혹시 다른 곳에서 호출 시)
function filterNews(el, cat) { filterNewsByImportance(el, cat); }

// ════════════════════════════════════════════
//  법령 DIFF 분석
// ════════════════════════════════════════════
// ── 지식 베이스 문서 목록 (document_chunks 실시간 · 수동정리 목록과 동일 스타일) ──
var _kbDocsLoaded = false;

var _KB_GROUPS = [
  ['전파법 기본 법령', /^전파법/],
  ['주파수 행정규칙', /주파수|할당|공동사용/],
  ['전자파 행정규칙', /전자파/],
  ['적합성평가 행정규칙', /적합성평가|시험기관|상호인정/],
  ['전기통신사업법 계열', /전기통신사업|이동통신단말장치/],
  ['정보통신망법 계열', /정보통신망/],
  ['방송통신발전기본법 계열', /방송통신발전|방송통신설비|방송통신규제|기반시설|멀티미디어|재난/],
  ['지방세법 계열', /지방세/],
  ['무선설비·무선국·기술기준', /기술기준|무선설비|무선국|단말장치|간이무선|항공|해상|우주|선박|아마추어|검사업무/]
];

function _kbParseName(raw) {
  var name = String(raw || '').replace(/\.(pdf|md|pptx|txt)$/i, '').replace(/\s*\(\d\)\s*$/, '');
  var dup = /^_중복_/.test(name);
  name = name.replace(/^_중복_/, '');
  var kind = (name.match(/\((법률|대통령령|[가-힣]+부령|[가-힣]+고시|총리령)\)/) || [])[1] || '';
  var no = (name.match(/\(제([0-9\-]+)호\)/) || [])[1] || '';
  var date = (name.match(/\((20\d{6})\)/) || [])[1] || '';
  var clean = name
    .replace(/\((법률|대통령령|[가-힣]+부령|[가-힣]+고시|총리령)\)/g, '')
    .replace(/\(제[0-9\-]+호\)/g, '')
    .replace(/\(20\d{6}\)/g, '')
    .trim();
  var info = [];
  if (kind || no) info.push((kind ? kind + ' ' : '') + (no ? '제' + no + '호' : ''));
  if (date) info.push(date.slice(0, 4) + '.' + date.slice(4, 6) + '.' + date.slice(6, 8) + ' 시행');
  return { clean: clean || name, info: info.join(' · '), dup: dup };
}

async function loadKbDocs(force) {
  var el = document.getElementById('kb-doc-groups');
  if (!el || !sb) return;
  if (_kbDocsLoaded && !force) return;
  try {
    var resp = await sb.rpc('list_kb_documents');
    if (resp.error) throw resp.error;
    var rows = (resp.data || []).filter(function(r) {
      if (r.doc_category === 'ITU-R') return false;   // ITU-R 탭에서 별도 표시
      if (/^\d{6}/.test(r.doc_name)) return false;    // 날짜 파일명 = 보도자료 → 정부 보도자료 탭에서 표시
      return true;
    });
    var groups = _KB_GROUPS.map(function(g) { return { title: g[0], re: g[1], items: [] }; });
    var etc = { title: '기타 법령·고시', items: [] };
    rows.forEach(function(r) {
      var p = _kbParseName(r.doc_name);
      var item = { p: p, chunks: r.chunks, embedded: r.embedded > 0, approved: r.approved !== false };
      for (var i = 0; i < groups.length; i++) {
        if (groups[i].re.test(p.clean)) { groups[i].items.push(item); return; }
      }
      etc.items.push(item);
    });
    groups.push(etc);
    var total = 0;
    var html = groups.filter(function(g) { return g.items.length > 0; }).map(function(g, gi) {
      g.items.sort(function(a, b) { return a.p.clean.localeCompare(b.p.clean, 'ko'); });
      total += g.items.length;
      var fileRows = g.items.map(function(it) {
        var badge = it.embedded
          ? ''
          : '<span class="badge" style="background:rgba(245,158,11,.12);color:#b45309" title="backfill_embeddings.py 실행 전 — 키워드 검색만 가능">임베딩 대기</span>';
        if (!it.approved) {
          badge += '<span class="badge" style="background:rgba(220,38,38,.12);color:#b91c1c" title="설정에서 승인 전 — AI 자문 미반영">승인 대기</span>';
        }
        var dupTag = it.p.dup ? ' <span style="font-size:10px;color:var(--text-tertiary)">(중복본)</span>' : '';
        return '<div class="file-item"><div class="file-icon fi-purple"><i class="ti ti-file-text"></i></div>' +
          '<div style="flex:1;min-width:0"><div class="file-name">' + it.p.clean + dupTag + '</div>' +
          '<div class="file-size">' + (it.p.info ? it.p.info + ' · ' : '') + it.chunks + '청크</div></div>' + badge + '</div>';
      }).join('');
      return '<div class="section-title"' + (gi > 0 ? ' style="margin-top:20px"' : '') + '>' + g.title + ' (' + g.items.length + '종)</div>' +
        '<div class="card" style="cursor:default;margin-bottom:14px">' + fileRows + '</div>';
    }).join('');
    var tot = document.getElementById('kb-total');
    if (tot) tot.textContent = total;
    el.innerHTML = html || '<div style="color:var(--text-secondary);font-size:12px;padding:16px 0">등록된 문서가 없습니다.</div>';
    _kbDocsLoaded = true;
  } catch(e) {
    el.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;padding:16px 0">목록 조회 실패: ' + e.message + '</div>';
  }
}

var diffState = { before: null, after: null };  // { text, name }

// ── DIFF 드롭존 UX 보강 (2026-06-12) ──
// 드롭존을 빗나가게 떨어뜨려도 브라우저가 파일을 열며 페이지를 이탈하지 않도록 전역 차단
document.addEventListener('dragover', function(e) { e.preventDefault(); });
document.addEventListener('drop', function(e) { e.preventDefault(); });
// 드롭존 진입 시 하이라이트 + 커서를 '복사'로 고정
['before', 'after'].forEach(function(t) {
  var dz = document.getElementById('drop-' + t);
  if (!dz) return;
  function clear() { dz.style.borderColor = ''; dz.style.background = ''; }
  dz.addEventListener('dragenter', function(e) {
    e.preventDefault();
    dz.style.borderColor = 'var(--accent)';
    dz.style.background = 'rgba(83,74,183,0.07)';
  });
  dz.addEventListener('dragover', function(e) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  dz.addEventListener('dragleave', clear);
  dz.addEventListener('drop', clear);
});

function handleDiffDrop(type, event) {
  event.preventDefault();
  var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  if (!file) return;
  _loadDiffFile(type, file);
}

function handleDiffFile(type, input) {
  var file = input.files && input.files[0];
  if (!file) return;
  _loadDiffFile(type, file);
}

async function _loadDiffFile(type, file) {
  var dropEl = document.getElementById('drop-' + type);
  var origHtml = dropEl ? dropEl.innerHTML : '';
  try {
    if (dropEl) {
      dropEl.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin .8s linear infinite"></span><div style="font-size:11px">읽는 중...</div>';
    }
    var text = await _readFileAsText(file);
    diffState[type] = { text: text, name: file.name };

    if (dropEl) {
      dropEl.classList.add('loaded');
      dropEl.innerHTML =
        '<i class="ti ti-check" style="font-size:18px;color:var(--green)"></i>' +
        '<div style="font-size:11px;font-weight:600;color:var(--green);word-break:break-all;max-width:140px">' + file.name + '</div>' +
        '<div style="font-size:10px;color:var(--text-tertiary)">' + Math.ceil(text.length / 1000) + 'KB · ' + text.split('\n').length + '줄</div>';
    }

    // 두 파일 모두 준비되면 버튼 활성화
    var btn = document.getElementById('diff-analyze-btn');
    if (btn && diffState.before && diffState.after) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.innerHTML = '<i class="ti ti-search"></i> 변경사항 분석 시작';
    }
  } catch(e) {
    alert('파일 읽기 실패: ' + e.message);
    if (dropEl) { dropEl.classList.remove('loaded'); dropEl.innerHTML = origHtml; }
  }
}

async function _readFileAsText(file) {
  if (file.name.toLowerCase().endsWith('.pdf')) {
    if (typeof pdfjsLib === 'undefined') throw new Error('PDF 파서가 로드되지 않았습니다. 잠시 후 다시 시도하거나 .txt 파일로 변환해 업로드하세요.');
    var buf = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    var pages = [];
    for (var i = 1; i <= pdf.numPages; i++) {
      var page = await pdf.getPage(i);
      var content = await page.getTextContent();
      // hasEOL로 원본 줄바꿈 보존 — 페이지 전체가 한 줄로 뭉치면 조문 단위 DIFF가 불가능 (2026-06-12 수정)
      pages.push(content.items.map(function(item) {
        return item.str + (item.hasEOL ? '\n' : ' ');
      }).join(''));
    }
    var full = pages.join('\n');
    // 조문 헤더 앞 줄바꿈 보강 — hasEOL 정보가 없는 PDF 대비
    full = full.replace(/[ \t]+(?=제\d+조(?:의\d+)?\()/g, '\n');
    return full;
  }
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload  = function(e) { resolve(e.target.result); };
    reader.onerror = function()  { reject(new Error('FileReader 오류')); };
    reader.readAsText(file, 'UTF-8');
  });
}

// ── 조문 단위 DIFF 알고리즘 ──────────────────────────────
function _computeDiff(beforeText, afterText) {
  // 한국 법령 조문 단위로 분리: 제X조, 항 번호, 번호 목록
  function toChunks(text) {
    return text
      .split(/\n(?=제\d+조|제\s*\d+\s*조|[\①-⑳]|[①②③④⑤⑥⑦⑧⑨⑩]|\d+\.\s|[가-힣]\.\s)/)
      .map(function(s) { return s.trim(); })
      .filter(function(s) { return s.length > 5; });
  }
  var bChunks = toChunks(beforeText);
  var aChunks = toChunks(afterText);

  function key(s) { return s.replace(/\s+/g,' ').slice(0,60); }
  var bKeys = new Set(bChunks.map(key));
  var aKeys = new Set(aChunks.map(key));

  var removed  = bChunks.filter(function(c) { return !aKeys.has(key(c)); });
  var added    = aChunks.filter(function(c) { return !bKeys.has(key(c)); });

  // 같은 조문 번호(제n조/제n조의m)끼리 짝지어 '변경'으로 분류
  function artKey(s) {
    var m = s.match(/^제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/);
    return m ? m[1] + (m[2] ? '의' + m[2] : '') : null;
  }
  var changed = [];
  var addedByArt = {};
  added.forEach(function(c) {
    var k = artKey(c);
    if (k && !addedByArt[k]) addedByArt[k] = c;
  });
  var stillRemoved = [];
  removed.forEach(function(c) {
    var k = artKey(c);
    if (k && addedByArt[k]) {
      changed.push({ art: k, before: c, after: addedByArt[k] });
      delete addedByArt[k];
    } else {
      stillRemoved.push(c);
    }
  });
  var changedAfters = new Set(changed.map(function(p){ return p.after; }));
  var stillAdded = added.filter(function(c) { return !changedAfters.has(c); });

  return { changed: changed, removed: stillRemoved, added: stillAdded };
}

// 단어 단위 LCS diff → 변경 부분 하이라이트 HTML 쌍 반환 (너무 길면 null)
function _tokenDiff(a, b) {
  function esc(t) { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  var at = a.split(/(\s+)/), bt = b.split(/(\s+)/);
  var n = at.length, m = bt.length;
  if (n * m > 250000) return null;
  var dp = new Array(n + 1);
  for (var i = n; i >= 0; i--) dp[i] = new Array(m + 1).fill(0);
  for (var i = n - 1; i >= 0; i--)
    for (var j = m - 1; j >= 0; j--)
      dp[i][j] = at[i] === bt[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);
  var DEL = '<mark style="background:rgba(239,68,68,.22);color:#991b1b;text-decoration:line-through;border-radius:2px">';
  var ADD = '<mark style="background:rgba(34,197,94,.22);color:#14532d;border-radius:2px">';
  var outB = '', outA = '', i = 0, j = 0;
  while (i < n && j < m) {
    if (at[i] === bt[j]) { outB += esc(at[i]); outA += esc(bt[j]); i++; j++; }
    else if (dp[i+1][j] >= dp[i][j+1]) { outB += at[i].trim() ? DEL + esc(at[i]) + '</mark>' : esc(at[i]); i++; }
    else { outA += bt[j].trim() ? ADD + esc(bt[j]) + '</mark>' : esc(bt[j]); j++; }
  }
  while (i < n) { outB += at[i].trim() ? DEL + esc(at[i]) + '</mark>' : esc(at[i]); i++; }
  while (j < m) { outA += bt[j].trim() ? ADD + esc(bt[j]) + '</mark>' : esc(bt[j]); j++; }
  return { beforeHtml: outB, afterHtml: outA };
}

function _renderDiffView(diffResult) {
  var el = document.getElementById('diff-view');
  if (!el) return;
  var changed = diffResult.changed || [];
  var removed = diffResult.removed;
  var added   = diffResult.added;

  if (changed.length === 0 && removed.length === 0 && added.length === 0) {
    el.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;padding:8px">변경된 조문이 자동 감지되지 않았습니다.<br>조문 형식이 다른 경우 아래 AI 분석 결과를 참고하세요.</div>';
    return;
  }

  function esc(t) { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  var html = '';

  // 변경된 조문: 같은 조문 번호 짝 → 단어 단위 하이라이트
  changed.forEach(function(p) {
    var td = _tokenDiff(p.before.slice(0, 1500), p.after.slice(0, 1500));
    var bHtml = td ? td.beforeHtml : esc(p.before.slice(0, 400)) + (p.before.length > 400 ? '…' : '');
    var aHtml = td ? td.afterHtml  : esc(p.after.slice(0, 400))  + (p.after.length > 400 ? '…' : '');
    html += '<div style="background:rgba(245,158,11,.06);border-left:3px solid #f59e0b;padding:6px 10px;margin-bottom:4px;border-radius:0 4px 4px 0">' +
      '<div style="font-size:10px;font-weight:700;color:#d97706;margin-bottom:4px">✎ 변경 — 제' + esc(p.art) + '조</div>' +
      '<div style="font-size:11px;color:var(--text-secondary);white-space:pre-wrap;line-height:1.6;margin-bottom:6px"><span style="font-size:10px;font-weight:700;color:#ef4444">변경 전</span><br>' + bHtml + '</div>' +
      '<div style="font-size:11px;color:var(--text-primary);white-space:pre-wrap;line-height:1.6"><span style="font-size:10px;font-weight:700;color:#16a34a">변경 후</span><br>' + aHtml + '</div>' +
    '</div>';
  });

  removed.forEach(function(c) {
    html += '<div style="background:rgba(239,68,68,.07);border-left:3px solid #ef4444;padding:6px 10px;margin-bottom:4px;border-radius:0 4px 4px 0">' +
      '<div style="font-size:10px;font-weight:700;color:#ef4444;margin-bottom:2px">− 삭제 / 변경 전</div>' +
      '<div style="font-size:11px;color:#7f1d1d;white-space:pre-wrap;line-height:1.6">' + esc(c.slice(0,400)) + (c.length>400?'…':'') + '</div>' +
    '</div>';
  });

  added.forEach(function(c) {
    html += '<div style="background:rgba(34,197,94,.07);border-left:3px solid #22c55e;padding:6px 10px;margin-bottom:4px;border-radius:0 4px 4px 0">' +
      '<div style="font-size:10px;font-weight:700;color:#16a34a;margin-bottom:2px">+ 추가 / 변경 후</div>' +
      '<div style="font-size:11px;color:#14532d;white-space:pre-wrap;line-height:1.6">' + esc(c.slice(0,400)) + (c.length>400?'…':'') + '</div>' +
    '</div>';
  });

  el.innerHTML = html;
}

// ── 메인 분석 함수 ────────────────────────────────────────
async function runDiffAnalysis() {
  if (!diffState.before || !diffState.after) return;
  var { claudeKey } = getConfig();
  if (!claudeKey) { alert('Claude API 키가 설정에 없습니다.'); return; }

  var btn       = document.getElementById('diff-analyze-btn');
  var resultEl  = document.getElementById('diff-result');
  var aiResultEl = document.getElementById('diff-ai-result');

  if (btn) { btn.disabled = true; btn.style.opacity = '.6'; btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin .8s linear infinite;vertical-align:middle;margin-right:6px"></span>분석 중...'; }
  if (resultEl)   resultEl.style.display = 'block';
  if (aiResultEl) aiResultEl.innerHTML = '<div style="display:flex;align-items:center;gap:8px;color:var(--text-secondary);padding:12px"><span style="display:inline-block;width:14px;height:14px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin .8s linear infinite"></span>AI 분석 중 (Claude Sonnet)…</div>';

  try {
    // DIFF 시각화
    var diffResult = _computeDiff(diffState.before.text, diffState.after.text);
    _renderDiffView(diffResult);

    // Claude 호출 — 자동 추출된 변경 조문 전체를 전달 (문서 전체 커버, 4000자 절단 문제 해결)
    var diffParts = [];
    (diffResult.changed || []).forEach(function(p) {
      diffParts.push('[변경 — 제' + p.art + '조]\n(변경 전)\n' + p.before + '\n(변경 후)\n' + p.after);
    });
    diffResult.removed.forEach(function(c) { diffParts.push('[삭제된 조문]\n' + c); });
    diffResult.added.forEach(function(c) { diffParts.push('[신설된 조문]\n' + c); });
    var diffText = diffParts.join('\n\n').slice(0, 24000);

    var sysMsg =
      'SK텔레콤 Comm센터 기술정책팀 전파정책 전문가 수석 위원. ' +
      '개정 전·후 법령 원문을 비교하여 SKT 사업에 미치는 영향을 구조적으로 분석한다. ' +
      '반드시 아래 XML 형식으로만 답변:\n' +
      '<summary>주요 변경사항 요약 (3~5줄, 조문 번호 포함)</summary>\n' +
      '<risks>SKT에 불리한 독소조항 (조문 번호·내용·이유 명시. 없으면 "없음")</risks>\n' +
      '<favorable>SKT에 유리한 조항 (조문 번호·내용·이유 명시. 없으면 "없음")</favorable>\n' +
      '<actions>팀 대응 액션 아이템 (각 항목을 || 로 구분)</actions>\n' +
      '<urgency>즉시대응/금주검토/중장기검토 중 하나</urgency>';

    var userMsg;
    if (diffText) {
      userMsg =
        '[파일명: ' + diffState.before.name + ' → ' + diffState.after.name + ']\n\n' +
        '아래는 두 문서 전체를 조문 단위로 비교해 자동 추출한 변경 사항이다:\n\n' + diffText;
    } else {
      // 자동 diff 미감지 시 원문 발췌 비교로 폴백
      userMsg =
        '[파일명: ' + diffState.before.name + ' → ' + diffState.after.name + ']\n\n' +
        '(조문 단위 자동 비교가 감지되지 않아 원문 발췌를 비교한다)\n\n' +
        '[개정 전]\n' + diffState.before.text.slice(0, 8000) + '\n\n' +
        '[개정 후]\n' + diffState.after.text.slice(0, 8000);
    }

    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2500, system: sysMsg, messages: [{ role: 'user', content: userMsg }] })
    });
    if (!res.ok) {
      var errBody = await res.json().catch(function() { return {}; });
      throw new Error((errBody.error && errBody.error.message) || ('Claude API 오류 (HTTP ' + res.status + ')'));
    }
    var data = await res.json();
    var txt = (data.content && data.content[0] && data.content[0].text) || '';

    var summaryM   = txt.match(/<summary>([\s\S]*?)<\/summary>/);
    var risksM     = txt.match(/<risks>([\s\S]*?)<\/risks>/);
    var favorableM = txt.match(/<favorable>([\s\S]*?)<\/favorable>/);
    var actionsM   = txt.match(/<actions>([\s\S]*?)<\/actions>/);
    var urgencyM   = txt.match(/<urgency>([\s\S]*?)<\/urgency>/);

    var summary   = summaryM   ? summaryM[1].trim()   : '분석 결과를 파싱하지 못했습니다.';
    var risks     = risksM     ? risksM[1].trim()     : '없음';
    var favorable = favorableM ? favorableM[1].trim() : '없음';
    var actions   = actionsM   ? actionsM[1].trim().split('||').map(function(a){return a.trim();}).filter(Boolean) : [];
    var urgency   = urgencyM   ? urgencyM[1].trim()   : '';

    var urgencyColor = urgency === '즉시대응' ? '#ef4444' : urgency === '금주검토' ? '#f59e0b' : '#22c55e';

    var actionsHtml = actions.map(function(a, i) {
      return '<div style="display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:0.5px solid var(--border-light)">' +
        '<span style="background:var(--accent);color:#fff;border-radius:50%;width:18px;height:18px;min-width:18px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;margin-top:1px">' + (i+1) + '</span>' +
        '<span style="font-size:12px;line-height:1.6">' + a + '</span>' +
      '</div>';
    }).join('');

    if (aiResultEl) {
      aiResultEl.innerHTML =
        // 헤더: 파일명 + 대응 긴급도
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border)">' +
          '<span style="font-size:11px;background:rgba(239,68,68,.1);color:#ef4444;padding:2px 8px;border-radius:4px;white-space:nowrap">' + diffState.before.name + '</span>' +
          '<i class="ti ti-arrow-right" style="color:var(--text-tertiary);font-size:13px;flex-shrink:0"></i>' +
          '<span style="font-size:11px;background:rgba(34,197,94,.1);color:#16a34a;padding:2px 8px;border-radius:4px;white-space:nowrap">' + diffState.after.name + '</span>' +
          (urgency ? '<span style="margin-left:auto;font-size:11px;font-weight:700;color:' + urgencyColor + ';background:rgba(0,0,0,.04);padding:2px 8px;border-radius:4px;white-space:nowrap">⚡ ' + urgency + '</span>' : '') +
        '</div>' +

        // 주요 변경사항
        '<div style="margin-bottom:14px">' +
          '<div style="font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:7px">● 주요 변경사항</div>' +
          '<div style="font-size:12px;line-height:1.8;color:var(--text-primary)">' + summary.replace(/\n/g,'<br>') + '</div>' +
        '</div>' +

        // 독소조항 (불리)
        (risks !== '없음' && risks ?
          '<div style="margin-bottom:14px;padding:10px 14px;background:rgba(239,68,68,.06);border-radius:var(--radius-md);border-left:3px solid #ef4444">' +
            '<div style="font-size:10px;font-weight:700;color:#ef4444;margin-bottom:6px">⚠ SKT 불리 조항 · 독소조항</div>' +
            '<div style="font-size:12px;line-height:1.8;color:var(--text-primary)">' + risks.replace(/\n/g,'<br>') + '</div>' +
          '</div>' : '') +

        // 유리 조항
        (favorable !== '없음' && favorable ?
          '<div style="margin-bottom:14px;padding:10px 14px;background:rgba(34,197,94,.06);border-radius:var(--radius-md);border-left:3px solid #22c55e">' +
            '<div style="font-size:10px;font-weight:700;color:#16a34a;margin-bottom:6px">✓ SKT 유리 조항</div>' +
            '<div style="font-size:12px;line-height:1.8;color:var(--text-primary)">' + favorable.replace(/\n/g,'<br>') + '</div>' +
          '</div>' : '') +

        // 팀 액션
        (actionsHtml ?
          '<div>' +
            '<div style="font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.6px;margin-bottom:7px">● 팀 액션 아이템</div>' +
            actionsHtml +
          '</div>' : '') +

        // AI 자문 연동
        '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">' +
          '<button onclick="askQ(\'개정된 법령의 SKT 영향을 상세히 분석해줘. 법령명: ' + diffState.after.name.replace(/'/g,"\\'") + '\')" class="btn btn-primary" style="width:100%;font-size:12px;justify-content:center">' +
            '<i class="ti ti-message-2"></i> AI 자문에서 추가 질의' +
          '</button>' +
        '</div>';
    }

  } catch(e) {
    console.warn('DIFF 분석 오류:', e);
    if (aiResultEl) aiResultEl.innerHTML = '<div style="color:#ef4444;font-size:12px;padding:12px">분석 실패: ' + e.message + '</div>';
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = '<i class="ti ti-refresh"></i> 다시 분석'; }
  }
}

// ════════════════════════════════════════════
//  Daily Briefing — Supabase daily_briefings 표시
// ════════════════════════════════════════════

// 브리핑 텍스트용 중요도 분류 (구조화된 news 객체 없이 raw 텍스트로 판별)
function classifyBriefingItemImportance(text) {
  var hay = text.toLowerCase();
  var urgentKws = IMPORTANCE_RULES['긴급'].keywords;
  for (var i = 0; i < urgentKws.length; i++) {
    if (hay.includes(urgentKws[i].toLowerCase())) return '긴급';
  }
  var isRelevant = SKT_RELEVANT_TOPICS.some(function(t) { return hay.includes(t.toLowerCase()); });
  var isNegative = NEGATIVE_SIGNALS.some(function(s) { return hay.includes(s.toLowerCase()); });
  if (isRelevant && isNegative) return '긴급';
  var normalKws = IMPORTANCE_RULES['보통'].keywords;
  for (var i = 0; i < normalKws.length; i++) {
    if (hay.includes(normalKws[i].toLowerCase())) return '보통';
  }
  if (isRelevant) return '보통';
  return '참고';
}

// 비뉴스 섹션(주목 포인트·기술 용어 등) bullet 항목 렌더링
// 마크다운 굵게(**...**) → <strong> (esc 이후 적용 — 우리가 넣는 안전한 태그)
function mdBold(s) { return (s || '').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); }

function renderPlainBulletItem(block) {
  var lines = block.split('\n');
  var out = '';
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (/^• /.test(l)) {
      out += '<div style="font-size:13px;line-height:1.8;padding-left:2px">• ' + mdBold(l.replace(/^• /, '')) + '</div>';
    } else if (/^  → /.test(l)) {
      out += '<div style="font-size:12px;color:var(--text-secondary);padding-left:16px;line-height:1.6">→ ' + mdBold(l.replace(/^  → /, '')) + '</div>';
    } else if (/^  🔗 /.test(l)) {
      var url = l.replace(/^  🔗 /, '').trim();
      out += '<div style="padding-left:16px;font-size:12px;margin-top:2px"><a href="' + url + '" target="_blank" style="color:var(--accent);text-decoration:none">🔗 원문 보기</a></div>';
    } else if (l.trim()) {
      out += '<div style="font-size:13px;line-height:1.8">' + mdBold(l) + '</div>';
    }
  }
  return '<div style="margin-bottom:6px">' + out + '</div>';
}

// 브리핑 콘텐츠 파싱 — 섹션 순서 보존, 뉴스 섹션만 긴급도 분류
// ※ 분류는 원본(raw) 텍스트로, HTML 출력은 이스케이프 적용
function parseBriefingContent(rawContent, briefingIdx) {
  function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  var rawLines = (rawContent || '').split('\n');
  var output = [];
  var rawItemLines = [];   // 원본 텍스트 줄 (분류용)
  var itemIdx = 0;
  var urgentCount = 0;
  var urgentItems = [];    // [{elemId, title}] — 분석 트리거에 사용
  var currentSection = 'news';

  function flushItem() {
    if (rawItemLines.length === 0) return;
    var rawBlock = rawItemLines.join('\n');
    if (currentSection === 'news') {
      // 긴급 여부는 브리핑 원문의 🔴(크롤러 긴급도 기반)로만 판정 — 이메일과 항상 일치
      var importance = rawBlock.indexOf('🔴') !== -1 ? '긴급' : '참고';
      var hasStoredAnalysis = rawBlock.indexOf('SKT 영향 분석') !== -1;
      // 렌더링은 이스케이프된 텍스트 기준
      var escBlock = rawItemLines.map(function(l){ return esc(l); }).join('\n');
      output.push(renderBriefingNewsItem(escBlock, importance, briefingIdx, itemIdx));
      if (importance === '긴급') {
        urgentCount++;
        // 저장된 분석이 있으면 즉석 생성 불필요 (구버전 브리핑만 폴백)
        if (!hasStoredAnalysis) {
          var titleRaw = '';
          for (var i = 0; i < rawItemLines.length; i++) {
            if (/^• /.test(rawItemLines[i])) { titleRaw = rawItemLines[i].replace(/^• /, ''); break; }
          }
          urgentItems.push({ elemId: 'bi-' + briefingIdx + '-' + itemIdx, title: titleRaw });
        }
      }
    } else {
      var escBlock = rawItemLines.map(function(l){ return esc(l); }).join('\n');
      output.push(renderPlainBulletItem(escBlock));
    }
    itemIdx++;
    rawItemLines = [];
  }

  for (var li = 0; li < rawLines.length; li++) {
    var line = rawLines[li].replace(/^\s*#{1,6}\s+/, '');  // 마크다운 헤더 기호(#, ##) 제거
    var trimmed = line.trim();

    // 섹션 헤더 [주요 뉴스], [주목 포인트], [기술 용어] 등
    if (/^\[.+\]$/.test(trimmed)) {
      flushItem();
      currentSection = /뉴스|news/i.test(trimmed) ? 'news' : 'other';
      output.push('<div style="font-weight:600;font-size:12px;color:var(--text-secondary);margin:14px 0 8px;letter-spacing:0.04em">' + mdBold(esc(trimmed)) + '</div>');
      continue;
    }
    // 제목 헤더 (📡)
    if (/^📡/.test(line)) {
      flushItem();
      output.push('<div style="font-size:15px;font-weight:700;color:var(--accent);margin:22px 0 12px;padding-top:14px;border-top:1px solid var(--border, #e5e7eb)">' + esc(line) + '</div>');
      continue;
    }
    // bullet 항목 시작
    if (/^• /.test(line)) {
      flushItem();
      rawItemLines.push(line);
      continue;
    }
    // 들여쓰기 줄 — 현재 항목에 추가
    if (/^  /.test(line) && rawItemLines.length > 0) {
      rawItemLines.push(line);
      continue;
    }
    // 빈 줄 — 항목 종료
    if (trimmed === '' && rawItemLines.length > 0) {
      flushItem();
      output.push('<div style="height:4px"></div>');
      continue;
    }
    // 일반 텍스트 / 느슨한 줄 (입법예고 📢·🔴·→·🔗 블록 포함)
    if (rawItemLines.length > 0) {
      rawItemLines.push(line);
    } else if (!trimmed) {
      output.push('<div style="height:4px"></div>');
    } else if (/^🔗\s*\S/.test(trimmed)) {
      var looseUrl = trimmed.replace(/^🔗\s*/, '').trim();
      output.push('<div style="padding-left:18px;font-size:12px;margin-top:2px"><a href="' + esc(looseUrl) + '" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none">🔗 원문 보기</a></div>');
    } else if (/^→\s/.test(trimmed)) {
      output.push('<div style="font-size:12px;color:var(--text-secondary);padding-left:18px;line-height:1.6;margin-top:2px">' + mdBold(esc(trimmed)) + '</div>');
    } else if (/^📢/.test(trimmed)) {
      output.push('<div style="font-weight:700;font-size:13px;color:var(--accent);margin:14px 0 6px">' + mdBold(esc(trimmed)) + '</div>');
    } else if (/^🔴/.test(trimmed)) {
      output.push('<div style="font-weight:600;font-size:13px;line-height:1.6;margin-top:2px">' + mdBold(esc(trimmed)) + '</div>');
    } else {
      output.push('<div style="font-size:13px;line-height:1.8">' + mdBold(esc(line)) + '</div>');
    }
  }
  flushItem();

  return { html: output.join(''), urgentCount: urgentCount, urgentItems: urgentItems };
}

// 뉴스 항목 1건 HTML 렌더링
function renderBriefingNewsItem(block, importance, briefingIdx, itemIdx) {
  var lines = block.split('\n');
  var titleLine = '';
  var summaryLines = [];
  var linkUrl = '';
  var storedAnalysis = '';

  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (/^• /.test(l)) {
      titleLine = l.replace(/^• /, '').replace(/\s*\[ID:[^\]]+\]/g, '').replace(/🔴\s*/g, '');
    } else if (/^  🔗 /.test(l)) {
      linkUrl = l.replace(/^  🔗 /, '').trim();
    } else if (/^  → /.test(l)) {
      summaryLines.push(l.replace(/^  → /, '').trim());
    } else if (l.indexOf('SKT 영향 분석') !== -1) {
      storedAnalysis = l.replace(/^\s*⚠️\s*SKT 영향 분석[::]\s*/, '').trim();
    }
  }

  var titleHtml = '<span data-news-title="1" style="font-weight:500;font-size:13px;line-height:1.6">' + mdBold(titleLine) + '</span>';
  var summaryHtml = summaryLines.map(function(s) {
    return '<div style="font-size:12px;color:var(--text-secondary);padding-left:4px;margin-top:3px;line-height:1.6">→ ' + mdBold(s) + '</div>';
  }).join('');
  var linkHtml = linkUrl
    ? '<div style="margin-top:6px"><a href="' + linkUrl + '" target="_blank" style="font-size:12px;color:var(--accent);text-decoration:none">🔗 원문 보기</a></div>'
    : '';

  var analysisId = 'bi-' + briefingIdx + '-' + itemIdx;

  if (importance === '긴급') {
    var rule = IMPORTANCE_RULES['긴급'];
    return '<div style="border:2px solid ' + rule.color + ';border-radius:10px;padding:12px 14px;margin-bottom:10px;background:' + rule.bg + '">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
      +   '<span style="background:' + rule.color + ';color:#fff;font-size:10px;font-weight:700;padding:2px 9px;border-radius:5px;flex-shrink:0">중요</span>'
      + '</div>'
      + '<div style="margin-bottom:6px">' + titleHtml + '</div>'
      + summaryHtml
      + linkHtml
      + '<div id="' + analysisId + '" data-briefing-analysis="1" style="margin-top:10px;padding:10px 12px;background:rgba(239,68,68,0.06);border-radius:8px;border:1px solid rgba(239,68,68,0.2)">'
      +   (storedAnalysis
          ? '<div style="font-size:12px;color:var(--text-primary);line-height:1.7"><span style="font-weight:700">⚠️ SKT 영향 분석</span> ' + mdBold(storedAnalysis) + '</div>'
          : '<div style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text-secondary)">'
            + '<span style="display:inline-block;width:12px;height:12px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></span>'
            + 'AI 영향도 분석 중...'
            + '</div>')
      + '</div>'
      + '</div>';
  }

  // 보통·참고 — 별도 표시 없이 일반 텍스트
  return '<div style="padding:6px 0;margin-bottom:6px">'
    + '<div style="margin-bottom:4px">' + titleHtml + '</div>'
    + summaryHtml
    + linkHtml
    + '</div>';
}

// 긴급 항목 AI 영향도 분석 — DOM 요소를 직접 참조로 받음 (ID 탐색 없음)
async function analyzeBriefingItemEl(el, titleText) {
  if (!el) return;
  var { claudeKey } = getConfig();
  if (!claudeKey) {
    el.innerHTML = '<span style="font-size:11px;color:var(--text-secondary)">Claude API 키가 설정되지 않아 분석을 건너뜁니다.</span>';
    return;
  }
  try {
    var sysMsg = SKT_IMPACT_SYSTEM_PROMPT;

    // 뉴스 캐시에서 제목 일치 기사를 찾아 본문 보강
    var cached = (typeof newsDataCache !== 'undefined') && newsDataCache.find(function(x) {
      return x.title && titleText && x.title.replace(/\s+/g,'').includes(titleText.replace(/\s+/g,'').slice(0,20));
    });
    var bodySnippet = cached ? (cached.body || cached.content || '').replace(/\s+/g,' ').trim().slice(0, 2000) : '';
    var userContent = '제목: ' + titleText +
      (cached ? '\n출처: ' + (cached.source||'') + '\n날짜: ' + (cached.published_at||'').slice(0,10) : '') +
      (bodySnippet ? '\n\n본문:\n' + bodySnippet : '');

    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01',
                 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 800,
        system: sysMsg,
        messages: [{ role: 'user', content: userContent }]
      })
    });
    if (!res.ok) throw new Error('API ' + res.status);
    var json = await res.json();
    var txt = json.content && json.content[0] ? json.content[0].text : '';
    var impactMatch = txt.match(/<impact>([\s\S]*?)<\/impact>/);
    var priorityMatch = txt.match(/<priority>([\s\S]*?)<\/priority>/);
    var impactText = impactMatch ? impactMatch[1].trim() : '';
    var priorityText = priorityMatch ? priorityMatch[1].trim() : '';
    var priorityColor = { '즉시대응': '#ef4444', '금주검토': '#f59e0b', '동향파악': '#22c55e' };
    var pColor = priorityColor[priorityText] || '#64748b';
    el.innerHTML = ''
      + (priorityText ? '<span style="font-size:10px;font-weight:700;color:#fff;background:' + pColor + ';padding:2px 8px;border-radius:4px;margin-bottom:7px;display:inline-block">' + priorityText + '</span>' : '')
      + (impactText ? '<div style="font-size:12px;color:var(--text-primary);line-height:1.7;margin-top:4px">' + impactText + '</div>' : '<div style="font-size:12px;color:var(--text-secondary)">분석 결과 없음</div>');
  } catch(e) {
    el.innerHTML = '<span style="font-size:11px;color:var(--text-secondary)">분석 실패: ' + e.message + '</span>';
  }
}

// 하위 호환용 (ID 기반) — 기존 호출부에서 사용
async function analyzeBriefingItem(elemId, titleText) {
  var el = document.getElementById(elemId);
  if (!el) { console.warn('[analyzeBriefingItem] elem not found:', elemId); return; }
  return analyzeBriefingItemEl(el, titleText);
}

async function loadBriefing() {
  const listEl = document.getElementById('briefing-list');
  if (!listEl) return;
  if (!sb) {
    listEl.innerHTML = '<div style="color:var(--text-secondary);padding:20px;text-align:center">Supabase 연결이 필요합니다.</div>';
    return;
  }
  listEl.innerHTML = '<div style="color:var(--text-secondary);padding:20px;text-align:center">불러오는 중...</div>';
  try {
    const { data, error } = await sb
      .from('daily_briefings')
      .select('*')
      .order('briefing_date', { ascending: false })
      .limit(30);
    if (error) throw error;
    if (!data || data.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text-secondary);padding:40px;text-align:center">아직 브리핑이 없습니다.<br>매일 오전 8시에 자동으로 생성됩니다.</div>';
      return;
    }
    // 먼저 전체 파싱 결과를 수집 (elemId 보장)
    var allParsed = data.map(function(b, idx) {
      return parseBriefingContent(b.content, idx);
    });

    listEl.innerHTML = data.map(function(b, idx) {
      const d = new Date(b.briefing_date).toLocaleDateString('ko-KR', {year:'numeric', month:'2-digit', day:'2-digit'});
      const isToday = b.briefing_date === new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0,10);
      const parsed = allParsed[idx];
      const contentHtml = parsed.html;
      const urgentCount = parsed.urgentCount;
      const badgeHtml = isToday ? '<span style="background:var(--accent);color:#fff;font-size:10px;padding:2px 7px;border-radius:10px;margin-left:8px">오늘</span>' : '';
      const urgentBadge = urgentCount > 0
        ? '<span style="background:#ef4444;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;margin-left:6px">중요 ' + urgentCount + '건</span>'
        : '';
      const metaHtml = (b.news_count || b.terms_count)
        ? '<span style="color:var(--text-secondary);font-size:11px">뉴스 ' + (b.news_count||0) + '건 · 용어 ' + (b.terms_count||0) + '건</span>'
        : '';
      return '<div class="card" style="margin-bottom:12px;cursor:default">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;cursor:pointer" onclick="toggleBriefing(\'bf-' + idx + '\')">'
        +   '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">'
        +     '<i class="ti ti-coffee" style="color:var(--accent)"></i>'
        +     '<span style="font-weight:600">' + d + '</span>' + badgeHtml + urgentBadge
        +   '</div>'
        +   '<div style="display:flex;align-items:center;gap:10px">'
        +     metaHtml
        +     '<i class="ti ti-chevron-' + (idx===0?'up':'down') + '" id="chevron-bf-' + idx + '" style="color:var(--text-secondary)"></i>'
        +   '</div>'
        + '</div>'
        + '<div id="bf-' + idx + '" style="display:' + (idx===0?'block':'none') + ';border-top:1px solid var(--border);padding-top:12px">'
        +   contentHtml
        + '</div>'
        + '</div>';
    }).join('');

    // 최신 브리핑(idx=0)의 긴급 항목 AI 분석 — innerHTML 직후 요소 직접 참조
    // (innerHTML 설정은 동기 완료이므로 바로 querySelectorAll 가능)
    var analysisTargets = [];
    // data-briefing-analysis 속성으로 분석 컨테이너를 정확히 식별
    var firstBriefingEl = listEl.querySelector('#bf-0');
    if (firstBriefingEl) {
      var urgentDivs = firstBriefingEl.querySelectorAll('[data-briefing-analysis]');
      console.log('[briefing] 긴급 분석 대상 (data attr):', urgentDivs.length, '개');
      urgentDivs.forEach(function(div) {
        var container = div.parentElement;
        var titleEl = container ? container.querySelector('[data-news-title]') : null;
        var titleText = titleEl ? titleEl.textContent.trim() : '';
        analysisTargets.push({ el: div, title: titleText });
      });
    }
    // data attr 방식 fallback: 모든 [id^="bi-"] 탐색
    if (analysisTargets.length === 0) {
      var allBiDivs = listEl.querySelectorAll('[id^="bi-"]');
      console.log('[briefing] fallback bi-* 탐색 결과:', allBiDivs.length, '개');
      allBiDivs.forEach(function(div) {
        var container = div.parentElement;
        var titleEl = container ? container.querySelector('[data-news-title]') : null;
        var titleText = titleEl ? titleEl.textContent.trim() : '';
        analysisTargets.push({ el: div, title: titleText });
      });
    }
    console.log('[briefing] 최종 분석 대상:', analysisTargets.length, '개');
    analysisTargets.forEach(function(item) {
      console.log('[briefing] 분석 시작:', item.el.id || '(no id)', '|', item.title.slice(0, 40));
      analyzeBriefingItemEl(item.el, item.title);
    });

  } catch(e) {
    listEl.innerHTML = '<div style="color:var(--text-secondary);padding:20px;text-align:center">브리핑 로드 실패: ' + e.message + '</div>';
    console.warn('Briefing load error:', e);
  }
}

function toggleBriefing(id) {
  var el = document.getElementById(id);
  var idx = id.replace('bf-','');
  var chevron = document.getElementById('chevron-' + id);
  if (!el) return;
  var isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.className = 'ti ti-chevron-' + (isOpen ? 'down' : 'up');
}

// ════════════════════════════════════════════
//  관리자 인증 (AI 페르소나 보호)
// ════════════════════════════════════════════
// 관리자 비밀번호는 평문 대신 SHA-256 해시로만 보관 (공개 소스에서 비번 노출 방지).
// 비밀번호 변경 시: 브라우저 콘솔에서 아래 한 줄을 실행해 새 해시를 만들고 이 값을 교체하세요.
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('새비밀번호')).then(b=>console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
const ADMIN_PWD_HASH = '164eab12762d42b09780eba6401d395a945355e42fc95a60b42ac509891cfa7e';
const ADMIN_MAX_ATTEMPTS = 5;          // 연속 실패 허용 횟수
const ADMIN_LOCKOUT_MS = 60 * 1000;    // 초과 시 입력 잠금 시간(60초)
var _adminPwd = '';                    // 잠금 해제 시 메모리에만 보관(소스/저장소에는 없음) — 승인·삭제 RPC 서버검증용

async function _sha256Hex(str) {
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2, '0'); }).join('');
}

async function checkAdminPwd() {
  var inputEl = document.getElementById('admin-pwd-input');
  var errEl = document.getElementById('admin-pwd-error');
  var input = inputEl.value;
  var now = Date.now();

  // 잠금 상태면 차단하고 남은 시간 안내
  var lockUntil = parseInt(sessionStorage.getItem('admin_lock_until') || '0', 10);
  if (lockUntil > now) {
    var sec = Math.ceil((lockUntil - now) / 1000);
    if (errEl) { errEl.textContent = '시도 횟수를 초과했습니다. ' + sec + '초 후 다시 시도하세요.'; errEl.style.display = 'block'; }
    inputEl.value = '';
    return;
  }

  var hash = await _sha256Hex(input);
  if (hash === ADMIN_PWD_HASH) {
    sessionStorage.setItem('admin_auth', '1');
    _adminPwd = input;   // 승인·삭제 RPC 서버검증용 (메모리에만)
    sessionStorage.removeItem('admin_fail_count');
    sessionStorage.removeItem('admin_lock_until');
    document.getElementById('settings-locked').style.display = 'none';
    document.getElementById('settings-unlocked').style.display = 'block';
    document.getElementById('system-prompt-display').value = SYSTEM_PROMPT;
    loadSettingsFields();
    if (errEl) errEl.style.display = 'none';
    inputEl.value = '';
  } else {
    var fails = parseInt(sessionStorage.getItem('admin_fail_count') || '0', 10) + 1;
    inputEl.value = '';
    if (fails >= ADMIN_MAX_ATTEMPTS) {
      sessionStorage.setItem('admin_lock_until', String(now + ADMIN_LOCKOUT_MS));
      sessionStorage.setItem('admin_fail_count', '0');
      if (errEl) { errEl.textContent = ADMIN_MAX_ATTEMPTS + '회 연속 실패 — ' + (ADMIN_LOCKOUT_MS / 1000) + '초간 입력이 잠깁니다.'; errEl.style.display = 'block'; }
    } else {
      sessionStorage.setItem('admin_fail_count', String(fails));
      if (errEl) { errEl.textContent = '비밀번호가 올바르지 않습니다. (남은 시도 ' + (ADMIN_MAX_ATTEMPTS - fails) + '회)'; errEl.style.display = 'block'; }
    }
  }
}

function lockAdmin() {
  sessionStorage.removeItem('admin_auth');
  _adminPwd = '';
  document.getElementById('settings-locked').style.display = 'flex';
  document.getElementById('settings-unlocked').style.display = 'none';
  document.getElementById('admin-pwd-input').value = '';
}

// ════════════════════════════════════════════
//  Settings
// ════════════════════════════════════════════
function loadSettingsFields() {
  const cfg = getConfig();
  if (cfg.sbUrl) document.getElementById('inp-sb-url').value = cfg.sbUrl;
  if (cfg.sbKey) document.getElementById('inp-sb-key').value = cfg.sbKey;
  if (cfg.claudeKey) document.getElementById('inp-claude-key').value = cfg.claudeKey;
  loadPendingApprovals();
}

// ── 지식베이스 승인 대기 (업로드 파일 게이트) ──
var _pendingDocs = [];

async function loadPendingApprovals() {
  var listEl = document.getElementById('pending-approval-list');
  var badgeEl = document.getElementById('pending-count-badge');
  if (!listEl) return;
  if (!sb) {
    listEl.innerHTML = '<div style="padding:14px;text-align:center;color:var(--text-secondary);font-size:12px">Supabase 연결 후 표시됩니다.</div>';
    if (badgeEl) badgeEl.textContent = '';
    return;
  }
  listEl.innerHTML = '<div style="padding:14px;text-align:center;color:var(--text-secondary);font-size:12px">불러오는 중...</div>';
  try {
    var resp = await sb.rpc('list_kb_documents');
    if (resp.error) throw resp.error;
    _pendingDocs = (resp.data || []).filter(function(r){ return r.approved === false; });
    if (badgeEl) badgeEl.textContent = _pendingDocs.length ? _pendingDocs.length + '건' : '';
    if (_pendingDocs.length === 0) {
      listEl.innerHTML = '<div style="padding:14px;text-align:center;color:var(--text-secondary);font-size:12px">승인 대기 중인 문서가 없습니다.</div>';
      return;
    }
    listEl.innerHTML = _pendingDocs.map(function(r, i){
      return '<div class="file-item" style="margin-bottom:6px">'
        + '<div class="file-icon" style="background:rgba(245,158,11,.15);color:#b45309"><i class="ti ti-file-alert"></i></div>'
        + '<div style="flex:1;min-width:0"><div class="file-name">' + escHtml(r.doc_name) + '</div>'
        + '<div class="file-size">' + escHtml(r.doc_category || '') + ' · ' + r.chunks + '청크</div></div>'
        + '<button class="btn btn-primary" style="font-size:11px;padding:3px 10px" onclick="approveDoc(' + i + ')"><i class="ti ti-check"></i>승인</button>'
        + '<button class="btn" style="font-size:11px;padding:3px 10px;color:#791F1F;margin-left:6px" onclick="rejectDoc(' + i + ')"><i class="ti ti-trash"></i>삭제</button>'
        + '</div>';
    }).join('');
  } catch(e) {
    listEl.innerHTML = '<div style="padding:14px;color:var(--text-secondary);font-size:12px">목록 조회 실패: ' + escHtml(e.message || String(e)) + '</div>';
  }
}

// 잠금 해제 후 새로고침 등으로 메모리 비번이 비면 다시 입력받음
function _ensureAdminPwd() {
  if (_adminPwd) return _adminPwd;
  var p = prompt('보안 확인을 위해 관리자 비밀번호를 다시 입력하세요:');
  if (p) _adminPwd = p;
  return _adminPwd;
}

function _handleAdminRpcError(err, action) {
  if (err && /AUTH_FAILED/.test(err.message || '')) {
    _adminPwd = '';
    alert('비밀번호 인증에 실패했습니다. 다시 시도해주세요.');
  } else {
    alert(action + ' 실패: ' + (err && err.message ? err.message : err));
  }
}

async function approveDoc(idx) {
  var doc = _pendingDocs[idx];
  if (!doc || !sb) return;
  var pwd = _ensureAdminPwd();
  if (!pwd) return;
  // RLS로 직접 UPDATE가 막히므로 서버 검증 RPC로 처리
  var res = await sb.rpc('admin_set_kb_approval', { p_doc_name: doc.doc_name, p_approved: true, p_pwd: pwd });
  if (res.error) { _handleAdminRpcError(res.error, '승인'); return; }
  _kbDocsLoaded = false;   // KB 목록 재조회 유도
  await loadPendingApprovals();
  // 승인 직후 임베딩 자동 생성 — 실패해도 승인은 유지되고 '임베딩 대기'로 남음(PC 백필 가능)
  try {
    var n = await embedDocChunks(doc.doc_name, pwd);
    alert(n > 0 ? '승인 완료 — 의미검색 임베딩 ' + n + '건 자동 생성됨' : '승인 완료');
  } catch(e) {
    console.warn('자동 임베딩 실패(임베딩 대기 유지 — PC에서 backfill_embeddings.py로 보완):', e);
    alert('승인은 완료됐습니다. 임베딩 자동 생성은 실패해 "임베딩 대기"로 남습니다 (PC 백필로 보완 가능).');
  }
  _kbDocsLoaded = false;
}

// 승인된 문서의 embedding NULL 청크를 Edge Function(voyage-embed)으로 채움 (배경역사 #23)
async function embedDocChunks(docName, pwd) {
  var resp = await sb.from('document_chunks')
    .select('id, content')
    .eq('doc_name', docName)
    .is('embedding', null)
    .order('id');
  var rows = resp.data || [];
  if (!rows.length) return 0;
  var embeddings = [];
  // Edge Function은 텍스트 1건씩 처리 — 동시 5건으로 순차 배치 (문서 저장용 input_type=document)
  for (var i = 0; i < rows.length; i += 5) {
    var batch = rows.slice(i, i + 5);
    var embs = await Promise.all(batch.map(function(r) {
      return sb.functions.invoke('voyage-embed', {
        body: { query: r.content, model: 'voyage-4-lite', input_type: 'document' }
      }).then(function(res2) {
        if (res2.error || !res2.data || !res2.data.embedding) throw new Error('voyage-embed 실패');
        return res2.data.embedding;
      });
    }));
    embs.forEach(function(e) { embeddings.push(e); });
  }
  // 50건씩 서버 검증 RPC로 저장 (anon 직접 UPDATE는 RLS로 차단되어 있음)
  for (var j = 0; j < rows.length; j += 50) {
    var ids  = rows.slice(j, j + 50).map(function(r) { return r.id; });
    var vecs = embeddings.slice(j, j + 50).map(function(e) { return '[' + e.join(',') + ']'; });
    var r2 = await sb.rpc('admin_update_chunk_embeddings', { p_ids: ids, p_embeddings: vecs, p_pwd: pwd });
    if (r2.error) throw new Error(r2.error.message);
  }
  return rows.length;
}

async function rejectDoc(idx) {
  var doc = _pendingDocs[idx];
  if (!doc || !sb) return;
  if (!confirm('"' + doc.doc_name + '" 문서를 삭제할까요?\n청크가 모두 제거되며 되돌릴 수 없습니다.')) return;
  var pwd = _ensureAdminPwd();
  if (!pwd) return;
  // 원본 파일(Storage uploads) 정리 (best-effort)
  try {
    var fp = await sb.from('document_chunks').select('file_path').eq('doc_name', doc.doc_name).not('file_path', 'is', null).limit(1);
    if (fp.data && fp.data[0] && fp.data[0].file_path) {
      await sb.storage.from('uploads').remove([fp.data[0].file_path]);
    }
  } catch(se) { console.warn('원본 파일 삭제 실패:', se); }
  // RLS로 직접 DELETE가 막히므로 서버 검증 RPC로 처리
  var res = await sb.rpc('admin_delete_kb_document', { p_doc_name: doc.doc_name, p_pwd: pwd });
  if (res.error) { _handleAdminRpcError(res.error, '삭제'); return; }
  _kbDocsLoaded = false;
  await loadPendingApprovals();
}

function loadSettingsUI() {
  // 이미 인증된 경우 잠금 해제 상태 유지, 아니면 잠금 화면 표시
  var isAuth = sessionStorage.getItem('admin_auth') === '1';
  document.getElementById('settings-locked').style.display   = isAuth ? 'none'  : 'flex';
  document.getElementById('settings-unlocked').style.display = isAuth ? 'block' : 'none';
  if (isAuth) loadSettingsFields();
}

async function saveApiKeys() {
  const sbUrl = document.getElementById('inp-sb-url').value.trim();
  const sbKey = document.getElementById('inp-sb-key').value.trim();
  const claudeKey = document.getElementById('inp-claude-key').value.trim();
  if (!sbUrl || !sbKey || !claudeKey) {
    showApiAlert('warn', 'Supabase URL, Supabase Key, Claude API Key는 필수입니다.');
    return;
  }
  saveConfig({ sbUrl: sbUrl, sbKey: sbKey, claudeKey: claudeKey });
  _remoteClaudeKey = claudeKey;
  sb = null;
  initSupabase();
  updateStatusDots();
  // Supabase app_config에도 Claude 키 저장 (다른 사용자도 자동 사용)
  try {
    await sb.from('app_config').upsert({ key: 'claude_key', value: claudeKey });
    showApiAlert('ok', '저장 완료 — 모든 사용자에게 AI 자문이 활성화됩니다.');
  } catch(e) {
    showApiAlert('ok', '로컬 저장 완료 (Supabase 동기화는 실패했습니다).');
  }
}

async function testConnection() {
  const cfg = getConfig();
  const results = [];
  if (sb) {
    try {
      const { error } = await sb.from('chat_logs').select('id').limit(1);
      results.push(error ? 'Supabase X (' + error.message + ')' : 'Supabase 연결 성공');
    } catch(e) { results.push('Supabase X (' + e.message + ')'); }
  } else {
    results.push('Supabase URL/Key 미설정');
  }
  if (cfg.claudeKey) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': cfg.claudeKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 10, messages: [{ role: 'user', content: 'ping' }] })
      });
      results.push(res.ok ? 'Claude API 연결 성공' : 'Claude API X (HTTP ' + res.status + ')');
    } catch(e) { results.push('Claude API X (' + e.message + ')'); }
  } else {
    results.push('Claude API Key 미설정');
  }

  const ok = results.every(function(r) { return r.includes('성공') || r.includes('미설정'); });
  showApiAlert(ok ? 'ok' : 'warn', results.join(' · '));
  updateStatusDots();
}

function clearApiKeys() {
  if (!confirm('저장된 API 키를 모두 삭제할까요?')) return;
  localStorage.removeItem(CFG_KEY);
  document.getElementById('inp-sb-url').value = '';
  document.getElementById('inp-sb-key').value = '';
  document.getElementById('inp-claude-key').value = '';
  sb = null;
  updateStatusDots();
  showApiAlert('ok', 'API 키가 삭제되었습니다.');
}

function showApiAlert(type, msg) {
  const el = document.getElementById('api-alert');
  if (!el) return;
  el.innerHTML = '<div style="padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:10px;background:' +
    (type === 'ok' ? '#d1fae5;color:#065f46' : '#fef3c7;color:#92400e') + '">' + msg + '</div>';
}

function updateStatusDots() {
  const cfg = getConfig();
  const sbOk = !!sb;
  const aiOk = !!cfg.claudeKey;
  const ragOk = sbOk;

  const sbDot = document.getElementById('sb-dot');
  const aiDot = document.getElementById('ai-dot');
  const ragDot = document.getElementById('rag-dot');
  const sbStatus = document.getElementById('sb-status');
  const aiStatus = document.getElementById('ai-status');
  const ragStatus = document.getElementById('rag-status');

  if (sbDot) sbDot.style.background = sbOk ? 'var(--green)' : '#d1d5db';
  if (aiDot) aiDot.style.background = aiOk ? 'var(--green)' : '#d1d5db';
  if (ragDot) ragDot.style.background = ragOk ? 'var(--green)' : '#d1d5db';
  if (sbStatus) sbStatus.textContent = sbOk ? 'Supabase 연결됨' : 'Supabase 미연결';
  if (aiStatus) aiStatus.textContent = aiOk ? 'Claude API 설정됨' : 'Claude API 미설정';
  if (ragStatus) ragStatus.textContent = ragOk ? 'RAG 활성 (하이브리드 검색)' : 'RAG 하이브리드 검색';
}

// ════════════════════════════════════════════
//  Navigation
// ════════════════════════════════════════════
// ── 운영 상태 (설정 밑 탭) ───────────────────────────────
function opsAgoText(iso) {
  if (!iso) return '기록 없음';
  var mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return '방금 전';
  if (mins < 60) return mins + '분 전';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + '시간 ' + (mins % 60) + '분 전';
  return Math.floor(hrs / 24) + '일 ' + (hrs % 24) + '시간 전';
}

function opsRow(label, value, ok, hint) {
  var color = ok === true ? '#16a34a' : (ok === false ? '#dc2626' : '#9ca3af');
  var icon  = ok === true ? '✅' : (ok === false ? '⚠️' : '•');
  return '<div style="display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid #f0f0f0">' +
           '<span style="font-size:15px">' + icon + '</span>' +
           '<div style="flex:1"><div style="font-weight:600;font-size:13px">' + label + '</div>' +
           (hint ? '<div style="font-size:11px;color:#9ca3af">' + hint + '</div>' : '') +
           '</div><div style="font-size:12px;color:' + color + ';font-weight:600;text-align:right">' + value + '</div></div>';
}

async function loadOpsStatus() {
  var el = document.getElementById('ops-status-body');
  if (!el) return;
  if (!sb) { el.innerHTML = '<p style="color:#9ca3af">Supabase 연결 대기 중…</p>'; return; }
  el.innerHTML = '<p style="color:#9ca3af">불러오는 중…</p>';
  try {
    var kstNow = new Date(Date.now() + 9 * 3600000);
    var todayKst = kstNow.toISOString().slice(0, 10);
    var kstHour = kstNow.getUTCHours();

    var r = await Promise.all([
      sb.from('news_feed').select('created_at').order('created_at', { ascending: false }).limit(1),
      sb.from('system_health').select('key,updated_at,note'),
      sb.from('daily_briefings').select('briefing_date,created_at').order('created_at', { ascending: false }).limit(1),
      sb.from('law_amendments').select('created_at').eq('law_type', 'lsAnc').order('created_at', { ascending: false }).limit(1),
      sb.from('assembly_bills').select('created_at').order('created_at', { ascending: false }).limit(1),
      sb.from('news_feed').select('*', { count: 'exact', head: true })
    ]);

    function first(x) { return (x && x.data && x.data[0]) ? x.data[0] : null; }
    var hb = {};
    (r[1].data || []).forEach(function(row){ hb[row.key] = row; });
    function hbTime(k){ return hb[k] ? hb[k].updated_at : null; }
    function hbNote(k){ return hb[k] ? (hb[k].note || '') : ''; }
    var lastNews    = first(r[0]) ? first(r[0]).created_at : null;
    var lastCrawl   = hbTime('last_crawl_run');
    var lastGov     = hbTime('last_gov_notice_run');
    var lastRefetch = hbTime('last_refetch_run');
    var crawlNote   = hbNote('last_crawl_run');
    var briefRow  = first(r[2]);
    var lastLaw   = first(r[3]) ? first(r[3]).created_at : null;
    var lastBill  = first(r[4]) ? first(r[4]).created_at : null;
    var newsCount = (typeof r[5].count === 'number') ? r[5].count : null;

    function hoursAgo(iso) { return iso ? (Date.now() - new Date(iso).getTime()) / 3600000 : Infinity; }
    var crawlerOk = hoursAgo(lastCrawl) < 1.5;
    var govOk = hoursAgo(lastGov) < 25;   // 매일 17:00 → 25h 내면 정상
    var newsH = hoursAgo(lastNews);
    var briefOk = !!(briefRow && briefRow.briefing_date === todayKst);

    var rows = '';
    rows += opsRow('크롤러 실행 (heartbeat)', opsAgoText(lastCrawl),
                   lastCrawl ? crawlerOk : null,
                   crawlNote ? ('최근 결과: ' + crawlNote) : '매시간 자동 실행');
    rows += opsRow('뉴스 마지막 입력', opsAgoText(lastNews),
                   crawlerOk ? true : (newsH < 14 ? true : false),
                   crawlerOk ? '크롤러 정상 — 새 기사 없으면 간격이 벌어져도 정상' : '크롤러 점검 필요할 수 있음');
    rows += opsRow('오늘 모닝 브리핑',
                   briefOk ? ('생성됨 (' + briefRow.briefing_date + ')') : '미생성',
                   briefOk ? true : (kstHour < 9 ? null : false),
                   '매일 06:00 KST');
    rows += opsRow('입법예고·정부고시 크롤러 (heartbeat)', opsAgoText(lastGov),
                   lastGov ? govOk : null,
                   lastGov ? '매일 17:00 PC 실행 — 새 예고 없어도 정상' : 'PC 17:00 스케줄러 (heartbeat 대기)');
    rows += opsRow('└ 입법예고 최근 새 항목', opsAgoText(lastLaw), null, '매칭되는 새 입법예고가 드물어 간격 큼(정상)');
    rows += opsRow('본문 수집 (refetch, heartbeat)', opsAgoText(lastRefetch), null,
                   lastRefetch ? ('최근 결과: ' + hbNote('last_refetch_run')) : 'PC 본문 수집 (heartbeat 대기)');
    rows += opsRow('국회 법안 최근 갱신', opsAgoText(lastBill), null, '매일 10:00');
    rows += opsRow('뉴스 보관 건수', (newsCount != null ? newsCount + '건' : '—'), null, '15일 유지');

    el.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
        '<button class="btn" style="font-size:11px;padding:3px 10px" onclick="loadOpsStatus()"><i class="ti ti-refresh"></i> 새로고침</button>' +
        '<span style="font-size:11px;color:#9ca3af;margin-left:auto">' + new Date().toLocaleString('ko-KR') + ' 기준</span>' +
      '</div>' +
      '<div style="background:#fff;border:1px solid #eee;border-radius:8px;padding:4px 14px">' + rows + '</div>' +
      '<p style="font-size:11px;color:#9ca3af;margin-top:10px">※ ✅ 정상 · ⚠️ 점검 권장. "뉴스 마지막 입력"은 새 기사가 없으면 자연히 벌어집니다(크롤러가 정상이면 문제 아님).</p>';
  } catch (e) {
    el.innerHTML = '<p style="color:#dc2626">불러오기 실패: ' + (e && e.message ? e.message : e) + '</p>';
  }
}

function go(page, navEl, sourceType) {
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  var panel = document.getElementById('panel-' + page);
  if (panel) panel.classList.add('active');
  if (navEl && navEl.classList) navEl.classList.add('active');

  // 뉴스 소스 타입 설정
  if (page === 'news' && sourceType !== undefined) currentNewsSourceType = sourceType;

  // 상단 바 제목 업데이트
  var newsTitle = currentNewsSourceType === 'gov' ? '정부 보도자료·공지사항' : (currentNewsSourceType === 'media' ? '뉴스' : '보도자료·뉴스');
  var titles = {home:'대시보드', chat:'AI 자문', reportdraft:'보고서 초안 제안', diff:'법령 DIFF 분석', law:'국내 법령·고시', itu:'ITU-R 문서', press:'정부 보도자료', terms:'기술 용어', news:newsTitle, briefing:'Daily Briefing', assembly:'국회 법안', lawtrack:'행정부 입법예고·법령 개정', settings:'설정', opsstatus:'운영 상태'};
  var ttEl = document.getElementById('topbar-title');
  if (ttEl && titles[page]) ttEl.textContent = titles[page];

  // 모바일 하단 네비 동기화
  var pageTobn = {home:'bn-more', chat:'bn-chat', reportdraft:'bn-chat', law:'bn-law', itu:'bn-law', press:'bn-law', custom:'bn-law', terms:'bn-terms', news:'bn-monitor', briefing:'bn-monitor', assembly:'bn-monitor', lawtrack:'bn-monitor', diff:'bn-monitor', settings:'bn-more', opsstatus:'bn-more'};
  if (pageTobn[page]) setBottomNav(pageTobn[page]);

  if (page === 'news') loadNews();
  if (page === 'reportdraft') loadReportSamples();
  if (page === 'briefing') loadBriefing();
  if (page === 'settings') loadSettingsUI();
  if (page === 'press') loadPressFromSupabase();
  if (page === 'terms') loadTerms();
  if (page === 'law') loadKbDocs();
  if (page === 'assembly') loadAssemblyBills();
  if (page === 'lawtrack') loadLawTrack();
  if (page === 'opsstatus') loadOpsStatus();
}

function setBottomNav(activeId) {
  document.querySelectorAll('.bottom-nav-item').forEach(function(b) { b.classList.remove('active'); });
  var el = document.getElementById(activeId);
  if (el) el.classList.add('active');
}

function showMobileSubMenu(id) {
  var el = document.getElementById(id);
  if (el) { el.style.display = 'block'; }
}

function closeMobileSubMenu(id) {
  var el = document.getElementById(id);
  if (el) { el.style.display = 'none'; }
}

// ════════════════════════════════════════════
//  보도자료 — Supabase document_chunks 검색
// ════════════════════════════════════════════
let pressData = null;

async function loadPressJSON() {
  var listEl = document.getElementById('press-list');
  if (listEl) listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#aaa">로딩 중...</div>';

  if (!sb) { if (listEl) listEl.innerHTML = '<div style="padding:20px;color:#f66">Supabase 미연결</div>'; return; }

  try {
    // 1) 보도자료 전체 청크 조회 — ## YYMMDD 패턴 포함 청크만 ({n} 대신 명시적 반복)
    var resp = await sb
      .from('document_chunks')
      .select('doc_name, content')
      .eq('doc_category', '보도자료')
      .filter('content', '~', '## [0-9][0-9][0-9][0-9][0-9][0-9]')
      .limit(2000);

    var titleChunks = resp.data;
    var queryErr    = resp.error;

    console.log('[보도자료] 쿼리 결과:', titleChunks ? titleChunks.length + '개 청크' : '없음', queryErr || '');

    // 정규식 필터가 지원되지 않으면 doc별 chunk_index=0만 조회 (각 파일 첫 청크에 목차 포함)
    if (queryErr || !titleChunks || titleChunks.length === 0) {
      console.warn('[보도자료] 정규식 필터 실패, chunk_index=0 폴백:', queryErr);
      // 각 doc의 모든 청크를 doc_name 순 정렬로 가져와 2026 포함 보장
      var results = [];
      // chunk_index=0 행만 조회하면 doc당 1행 → 수십 행으로 limit 초과 없음
      var docResp = await sb
        .from('document_chunks')
        .select('doc_name')
        .eq('doc_category', '보도자료')
        .eq('chunk_index', 0)
        .order('doc_name');
      var docNames = (docResp.data || []).map(function(r){ return r.doc_name; });
      for (var di = 0; di < docNames.length; di++) {
        var cr = await sb
          .from('document_chunks')
          .select('doc_name, content')
          .eq('doc_category', '보도자료')
          .eq('doc_name', docNames[di])
          .order('chunk_index')
          .limit(500);
        results = results.concat(cr.data || []);
      }
      titleChunks = results;
      console.log('[보도자료] doc별 폴백 결과:', titleChunks.length + '개 청크');
    }

    // 2) 제목 파싱
    var titleMap = {};
    var releases = [];

    titleChunks.forEach(function(chunk) {
      var lines = (chunk.content || '').split('\n');
      lines.forEach(function(line) {
        var m = line.match(/^##\s+(\d{6})\s*(.+)/);
        if (!m) return;
        var yymmdd   = m[1];
        var rawTitle = m[2].trim()
          .replace(/^(석간|조간)\s*/g, '')
          .replace(/^\(보도\)\s*/g,   '')
          .replace(/\s*\(수정\)\s*$/g, '')
          .replace(/^\[.*?\]\s*/g,    '')
          .trim();
        if (!rawTitle || rawTitle.length < 4) return;

        var yy   = parseInt(yymmdd.substring(0, 2), 10);
        var yyyy = '20' + (yy < 10 ? '0' + yy : '' + yy);
        var dateStr = yyyy + '-' + yymmdd.substring(2, 4) + '-' + yymmdd.substring(4, 6);
        var key  = dateStr + '_' + rawTitle.substring(0, 30);
        if (titleMap[key]) return;
        titleMap[key] = true;
        releases.push({ title: rawTitle, date: dateStr, doc_name: chunk.doc_name });
      });
    });

    releases.sort(function(a, b) { return b.date.localeCompare(a.date); });
    pressData = releases;

    // 3) 통계 — 연도별 건수 (청크가 아닌 보도자료 건수)
    var cnt = { total: releases.length, '2026': 0, '2025': 0, old: 0 };
    releases.forEach(function(r) {
      var y = r.date.substring(0, 4);
      if (y === '2026')      cnt['2026']++;
      else if (y === '2025') cnt['2025']++;
      else                   cnt.old++;
    });

    console.log('[보도자료] 파싱 결과:', cnt);

    var e;
    e = document.getElementById('ps-total'); if (e) e.textContent = cnt.total;
    e = document.getElementById('ps-2026');  if (e) e.textContent = cnt['2026'];
    e = document.getElementById('ps-2025');  if (e) e.textContent = cnt['2025'];
    e = document.getElementById('ps-old');   if (e) e.textContent = cnt.old;

    // stat-sub 텍스트도 "건"으로 (HTML 기본값 유지되므로 생략 가능)

    renderPressList(releases);

  } catch(err) {
    console.error('보도자료 로드 오류:', err);
    if (listEl) listEl.innerHTML = '<div style="padding:20px;color:#f66">오류: ' + (err.message || err) + '</div>';
  }
}

function renderPressList(list) {
  var el = document.getElementById('press-list');
  if (!el) return;

  if (!list || list.length === 0) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:#aaa">표시할 보도자료가 없습니다.</div>';
    return;
  }

  var groups = {};
  list.forEach(function(item) {
    var y = item.date.substring(0, 4);
    if (!groups[y]) groups[y] = [];
    groups[y].push(item);
  });

  var years = Object.keys(groups).sort(function(a, b) { return b - a; });
  var html = '';

  years.forEach(function(year) {
    var items = groups[year];
    html += '<div style="margin-bottom:20px">';
    html += '<div style="font-size:12px;font-weight:700;color:#888;letter-spacing:1px;' +
            'margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #2a2a3a">' +
            year + '년 (' + items.length + '건)</div>';
    html += '<div style="display:flex;flex-direction:column;gap:4px">';
    items.forEach(function(item) {
      var dateLabel = item.date.substring(5);
      var safeTitle = item.title.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
      var safeDoc   = item.doc_name.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
      html += '<div class="press-item" ' +
        'style="display:flex;align-items:flex-start;gap:8px;padding:5px 8px;' +
        'border-radius:6px;cursor:pointer;background:#1a1a2a" ' +
        'onclick="openPressDetail(\'' + safeTitle.replace(/'/g,"\\'") + '\',\'' + item.date + '\',\'' + safeDoc.replace(/'/g,"\\'") + '\')" ' +
        'onmouseover="this.style.background=\'#22223a\'" ' +
        'onmouseout="this.style.background=\'#1a1a2a\'">' +
        '<span style="flex-shrink:0;font-size:11px;color:#6c757d;width:36px;margin-top:2px">' + dateLabel + '</span>' +
        '<span style="font-size:13px;color:#d0d0e0;line-height:1.4">' + item.title + '</span>' +
        '</div>';
    });
    html += '</div></div>';
  });

  el.innerHTML = html;
}

function askAboutPress(el) {
  var title = el.getAttribute('data-title');
  go('chat');
  setTimeout(function() {
    var inp = document.getElementById('chat-input');
    if (inp) { inp.value = '"' + title + '" 보도자료의 주요 내용을 요약해 주세요.'; inp.focus(); }
  }, 300);
}

async function openPressDetail(title, date, docName) {
  var modal  = document.getElementById('press-detail-modal');
  var titleEl = document.getElementById('press-detail-title');
  var dateEl  = document.getElementById('press-detail-date');
  var bodyEl  = document.getElementById('press-detail-body');
  if (!modal) return;

  titleEl.textContent = title;
  dateEl.textContent  = date;
  bodyEl.innerHTML = '<div style="text-align:center;padding:30px;color:#aaa">불러오는 중...</div>';
  modal.style.display = 'flex';

  // '2026-01-15' → '260115'
  var yymmdd = date.replace(/-/g, '').substring(2);

  try {
    var cr = await sb.from('document_chunks')
      .select('chunk_index, content')
      .eq('doc_name', docName)
      .order('chunk_index')
      .limit(500);

    if (!cr.data || cr.data.length === 0) {
      bodyEl.innerHTML = '<div style="color:#f66;padding:20px">내용을 찾을 수 없습니다.</div>';
      return;
    }

    // 전체 텍스트 합치기
    var fullText = cr.data.map(function(c) { return c.content; }).join('\n');

    // ## YYMMDD 경계로 섹션 분리
    var sections = fullText.split(/(?=^## \d{6})/m);

    // 해당 날짜 섹션 찾기
    var targetSection = null;
    for (var i = 0; i < sections.length; i++) {
      if (new RegExp('^## ' + yymmdd).test(sections[i])) {
        targetSection = sections[i];
        break;
      }
    }

    if (!targetSection) {
      // 제목으로 검색 폴백
      targetSection = sections.find(function(s) {
        return s.toLowerCase().indexOf(title.toLowerCase().substring(0, 10)) !== -1;
      }) || null;
    }

    if (!targetSection) {
      bodyEl.innerHTML = '<div style="color:#f66;padding:20px">해당 보도자료 내용을 찾을 수 없습니다.</div>';
      return;
    }

    // 불필요한 이미지 설명, 중복 제목 라인 정리
    var cleaned = targetSection
      .replace(/그림입니다\.\n원본 그림의 이름:[^\n]+\n원본 그림의 크기:[^\n]+/g, '')
      .replace(/^# \d{6}[^\n]*\n/m, '')  // # YYMMDD 중복 제목 제거
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // 간단한 마크다운 → HTML 변환
    var html = cleaned
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^## (.+)$/gm, '<h3 style="color:var(--accent-purple);font-size:14px;margin:16px 0 6px">$1</h3>')
      .replace(/^### (.+)$/gm, '<h4 style="color:var(--text-primary);font-size:13px;margin:12px 0 4px;font-weight:600">$1</h4>')
      .replace(/^- (.+)$/gm, '<li style="margin:2px 0">$1</li>')
      .replace(/(<li[^>]*>.*<\/li>\n?)+/g, function(m){ return '<ul style="padding-left:20px;margin:6px 0">' + m + '</ul>'; })
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');

    bodyEl.innerHTML = html;

  } catch(e) {
    bodyEl.innerHTML = '<div style="color:#f66;padding:20px">오류: ' + (e.message || e) + '</div>';
  }
}

function closePressDetail() {
  var modal = document.getElementById('press-detail-modal');
  if (modal) modal.style.display = 'none';
}

async function filterPressList() {
  var q = (document.getElementById('press-search-input') || {}).value || '';
  if (!pressData) return;
  if (!q.trim()) { renderPressList(pressData); return; }
  var lower = q.toLowerCase();
  var filtered = pressData.filter(function(item) {
    return item.title.toLowerCase().includes(lower) ||
           item.doc_name.toLowerCase().includes(lower) ||
           item.date.includes(lower);
  });
  renderPressList(filtered);
}

function loadPressFromSupabase() { loadPressJSON(); }

// ════════════════════════════════════════════
//  기술 용어 자동 추출 (하루 1회, 백그라운드)
// ════════════════════════════════════════════
async function autoExtractTermsIfNeeded() {
  var today = new Date().toISOString().slice(0, 10);
  var lastRun = localStorage.getItem('last_terms_extraction');
  if (lastRun === today) return; // 오늘 이미 실행함
  if (!sb) return;
  var { claudeKey } = getConfig();
  if (!claudeKey) return;

  try {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    var cutoffStr = cutoff.toISOString().split('T')[0];
    var newsResp = await sb.from('news_feed')
      .select('title,source,published_at')
      .gte('created_at', cutoffStr)
      .order('created_at', { ascending: false })
      .limit(30);
    var newsList = (newsResp.data || []).map(function(n) {
      return '[' + (n.published_at || '').slice(0, 10) + '] ' + n.title + ' (' + (n.source || '') + ')';
    }).join('\n');
    if (!newsList) { console.log('[기술 용어] 최근 뉴스 없음, 스킵'); return; }

    var existingResp = await sb.from('tech_terms').select('term').limit(500);
    var existingSet = new Set((existingResp.data || []).map(function(t) { return t.term.toLowerCase(); }));

    var userMsg = '아래 뉴스 목록에서 이동통신·전파 분야 기술 용어(영문 약어, 표준명, 새 기술명)를 추출하세요.\n' +
      '흔한 용어(5G, LTE, Wi-Fi 등)는 제외하세요.\n\n' +
      '뉴스 목록:\n' + newsList + '\n\n' +
      'JSON 배열로만 출력 (신규 용어만, 없으면 []): [{"term":"...","term_en":"...","category":"...","definition":"...","source":"..."}]';

    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: userMsg }]
      })
    });
    var data = await res.json();
    var textBlock = data.content && data.content.find(function(b) { return b.type === 'text'; });
    var text = textBlock ? textBlock.text : '';
    if (!text) return;

    var firstBracket = text.indexOf('[');
    var lastBracket = text.lastIndexOf(']');
    if (firstBracket === -1 || lastBracket === -1) return;
    var terms = [];
    try { terms = JSON.parse(text.slice(firstBracket, lastBracket + 1)); } catch(e) { return; }
    if (!terms.length) { console.log('[기술 용어] 신규 용어 없음'); return; }

    var saved = 0;
    for (var t of terms) {
      if (!t.term || existingSet.has(t.term.toLowerCase())) continue;
      var payload = {
        term: t.term,
        term_en: t.term_en || '',
        category: t.category || '기타',
        definition: t.definition || '',
        source: t.source || '뉴스 자동 추출',
        is_reviewed: false
      };
      var r2 = await sb.from('tech_terms').insert(payload);
      if (!r2.error) { saved++; existingSet.add(t.term.toLowerCase()); }
    }
    localStorage.setItem('last_terms_extraction', today);
    console.log('[기술 용어] 자동 추출 완료:', saved, '건 저장');
  } catch(e) {
    console.warn('[기술 용어] 자동 추출 오류:', e);
  }
}

// ════════════════════════════════════════════
//  추가 지식 — UI 함수 (패널 탭 전환 / 저장 / 목록 렌더)
// ════════════════════════════════════════════
var _editingCustomId = null; // null이면 신규 입력, 숫자면 수정 중인 항목 id

function switchCustomTab(tab) {
  document.getElementById('custom-tab-input').style.display = tab === 'input' ? '' : 'none';
  document.getElementById('custom-tab-list').style.display  = tab === 'list'  ? '' : 'none';
  document.getElementById('ctab-input').classList.toggle('active', tab === 'input');
  document.getElementById('ctab-list').classList.toggle('active',  tab === 'list');
  if (tab === 'list') renderCustomKnowledgeList();
}

function setCustomEditMode(id) {
  _editingCustomId = id;
  var banner = document.getElementById('ck-edit-banner');
  var saveBtn = document.getElementById('ck-save-btn');
  var cancelBtn = document.getElementById('ck-cancel-btn');
  if (id) {
    if (banner) { banner.style.display = ''; banner.textContent = '✏️ 수정 모드 — 내용을 변경한 뒤 저장하세요.'; }
    if (saveBtn) { saveBtn.textContent = '수정 저장'; saveBtn.style.background = '#f59e0b'; }
    if (cancelBtn) cancelBtn.style.display = '';
  } else {
    if (banner) banner.style.display = 'none';
    if (saveBtn) { saveBtn.textContent = '저장하기'; saveBtn.style.background = ''; }
    if (cancelBtn) cancelBtn.style.display = 'none';
    // 폼 초기화
    var t = document.getElementById('ck-title');
    var c = document.getElementById('ck-content');
    var g = document.getElementById('ck-tags');
    var cat = document.getElementById('ck-category');
    if (t) t.value = '';
    if (c) c.value = '';
    if (g) g.value = '';
    if (cat) cat.value = '일반';
  }
}

async function renderCustomKnowledgeList(filterText) {
  var listEl = document.getElementById('custom-list-items');
  if (!listEl) return;
  listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary);font-size:12px"><i class="ti ti-loader"></i> 불러오는 중...</div>';
  try {
    var ckItems = await loadCustomKnowledgeList();
    var fileItems = await loadCustomFileList();
    var items = ckItems.concat(fileItems).sort(function(a, b) {
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
    if (filterText) {
      var q = filterText.toLowerCase();
      items = items.filter(function(i) {
        var name = (i._type === 'file' ? i.doc_name : i.title) || '';
        return name.toLowerCase().includes(q) || (i.tags || []).join(' ').toLowerCase().includes(q);
      });
    }
    if (items.length === 0) {
      listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:12px">저장된 지식이 없습니다.</div>';
      return;
    }
    listEl.innerHTML = items.map(function(item) {
      if (item._type === 'file') {
        var fdate = (item.created_at || '').slice(0, 10);
        var pending = item.embedded < item.chunks;
        var nameEsc = chEsc(item.doc_name);
        var attrEsc = nameEsc.replace(/"/g, '&quot;');
        var statusBadge = pending
          ? '<span style="font-size:10px;background:#fef3c7;color:#92400e;border-radius:4px;padding:1px 6px">임베딩 대기</span>'
          : '<span style="font-size:10px;background:#dcfce7;color:#166534;border-radius:4px;padding:1px 6px">임베딩 완료</span>';
        // 원본 파일이 보관돼 있으면(file_path) 파일명 클릭 시 다운로드
        var hasFile = !!item.file_path;
        var pathAttr = hasFile ? item.file_path.replace(/"/g, '&quot;') : '';
        var nameHtml = hasFile
          ? '<a href="#" data-path="' + pathAttr + '" data-name="' + attrEsc + '" onclick="onDownloadCustomFile(this.getAttribute(\'data-path\'),this.getAttribute(\'data-name\'));return false;" style="font-size:12px;font-weight:600;color:var(--accent);text-decoration:none;cursor:pointer" title="원본 파일 다운로드">' + nameEsc + ' <i class="ti ti-download" style="font-size:11px"></i></a>'
          : '<span style="font-size:12px;font-weight:600;color:var(--text-primary)" title="원본 파일 미보관 — 텍스트만 저장됨">' + nameEsc + '</span>';
        return '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:0.5px solid var(--border-light)">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">' +
              '<span style="font-size:10px;background:#6366f1;color:#fff;border-radius:4px;padding:1px 6px">📎 파일</span>' +
              nameHtml +
            '</div>' +
            '<div style="font-size:11px;color:var(--text-tertiary)">' + fdate + ' · 청크 ' + item.chunks + '개 · ' + statusBadge + '</div>' +
          '</div>' +
          '<button data-doc="' + attrEsc + '" onclick="onDeleteCustomFile(this.getAttribute(\'data-doc\'),this)" style="background:none;border:none;color:var(--text-tertiary);cursor:pointer;font-size:13px;padding:2px 4px" title="파일 삭제"><i class="ti ti-trash"></i></button>' +
        '</div>';
      }
      var tagsHtml = (item.tags || []).map(function(t) {
        return '<span style="background:var(--bg-tertiary);border-radius:4px;padding:1px 6px;font-size:10px;color:var(--text-secondary)">' + t + '</span>';
      }).join(' ');
      var date = (item.created_at || '').slice(0, 10);
      return '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:0.5px solid var(--border-light)">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">' +
            '<span style="font-size:10px;background:var(--accent);color:#fff;border-radius:4px;padding:1px 6px">' + (item.category || '일반') + '</span>' +
            '<span style="font-size:12px;font-weight:600;color:var(--text-primary)">' + item.title + '</span>' +
          '</div>' +
          '<div style="font-size:11px;color:var(--text-tertiary)">' + date + (tagsHtml ? ' · ' + tagsHtml : '') + '</div>' +
        '</div>' +
        '<button onclick="onEditCustom(' + item.id + ')" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:13px;padding:2px 4px;margin-right:2px" title="수정"><i class="ti ti-edit"></i></button>' +
        '<button onclick="onDeleteCustom(' + item.id + ',this)" style="background:none;border:none;color:var(--text-tertiary);cursor:pointer;font-size:13px;padding:2px 4px" title="삭제"><i class="ti ti-trash"></i></button>' +
      '</div>';
    }).join('');
  } catch(e) {
    listEl.innerHTML = '<div style="padding:16px;color:#dc2626;font-size:12px">목록 로드 실패: ' + e.message + '</div>';
  }
}

async function onEditCustom(id) {
  // Supabase에서 해당 항목 전체 내용 불러오기
  try {
    var { data, error } = await sb.from('custom_knowledge')
      .select('id, title, content, category, tags')
      .eq('id', id)
      .single();
    if (error || !data) { alert('항목을 불러올 수 없습니다.'); return; }
    // 입력 탭으로 전환 후 폼에 채워 넣기
    switchCustomTab('input');
    document.getElementById('ck-title').value   = data.title || '';
    document.getElementById('ck-content').value = data.content || '';
    document.getElementById('ck-category').value = data.category || '일반';
    document.getElementById('ck-tags').value    = (data.tags || []).join(', ');
    setCustomEditMode(id);
    // 화면 상단으로 스크롤
    document.getElementById('ck-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch(e) {
    alert('항목 로드 실패: ' + e.message);
  }
}

async function onSaveCustomKnowledge() {
  var title    = (document.getElementById('ck-title')   || {}).value || '';
  var category = (document.getElementById('ck-category')|| {}).value || '일반';
  var content  = (document.getElementById('ck-content') || {}).value || '';
  var tags     = (document.getElementById('ck-tags')    || {}).value || '';
  var btn      = document.getElementById('ck-save-btn');
  if (!title.trim() || !content.trim()) { alert('제목과 내용을 모두 입력하세요.'); return; }
  var isEdit = !!_editingCustomId;
  btn.disabled = true;
  btn.textContent = isEdit ? '수정 중...' : '저장 중...';
  try {
    if (isEdit) {
      await updateCustomKnowledge(_editingCustomId, title.trim(), content.trim(), category, tags);
    } else {
      await saveCustomKnowledge(title.trim(), content.trim(), category, tags);
    }
    btn.textContent = isEdit ? '✅ 수정됨' : '✅ 저장됨';
    btn.style.background = '#22c55e';
    setCustomEditMode(null); // 수정 모드 해제 + 폼 초기화
    setTimeout(function() { btn.disabled = false; btn.style.background = ''; }, 2000);
  } catch(e) {
    alert((isEdit ? '수정' : '저장') + ' 실패: ' + e.message);
    btn.disabled = false;
    btn.textContent = isEdit ? '수정 저장' : '저장하기';
  }
}

async function onDeleteCustom(id, btn) {
  if (!confirm('이 지식을 삭제하시겠습니까?')) return;
  btn.disabled = true;
  try {
    await deleteCustomKnowledge(id);
    renderCustomKnowledgeList(
      (document.getElementById('ck-list-search') || {}).value || ''
    );
  } catch(e) {
    alert('삭제 실패: ' + e.message);
    btn.disabled = false;
  }
}

// ════════════════════════════════════════════
//  PDF 업로드 — 법령·고시 / 보도자료 → document_chunks
// ════════════════════════════════════════════
let _pdfUploadCtx = 'law'; // 'law' | 'press'

function openPdfUpload(ctx) {
  _pdfUploadCtx = ctx;
  var modal = document.getElementById('pdf-upload-modal');
  var title = document.getElementById('pdf-modal-title');
  var catRow = document.getElementById('pdf-cat-row');
  var dateRow = document.getElementById('pdf-date-row');
  var prog = document.getElementById('pdf-progress');
  var btn = document.getElementById('pdf-upload-btn');
  var label = document.getElementById('pdf-file-label');
  document.getElementById('pdf-doc-name').value = '';
  document.getElementById('pdf-file-input').value = '';
  document.getElementById('pdf-press-date').value = new Date().toISOString().slice(0,10);
  if (prog) prog.style.display = 'none';
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-upload"></i> 업로드'; }
  if (label) label.textContent = 'PDF · MD · Word · PPTX 파일 클릭 선택 또는 드래그';

  if (ctx === 'press') {
    if (title) title.textContent = '정부 보도자료 업로드 (PDF · MD · Word · PPTX)';
    if (catRow) catRow.style.display = 'none';
    if (dateRow) dateRow.style.display = 'none';
  } else if (ctx === 'itu') {
    if (title) title.textContent = 'ITU-R 문서 업로드 (PDF · MD · Word · PPTX)';
    if (catRow) catRow.style.display = 'none';
    if (dateRow) dateRow.style.display = 'none';
  } else if (ctx === 'custom') {
    if (title) title.textContent = '추가 지식 파일 업로드 (PDF · MD · Word · PPTX)';
    if (catRow) catRow.style.display = 'none';
    if (dateRow) dateRow.style.display = 'none';
  } else {
    if (title) title.textContent = '법령·고시 업로드 (PDF · MD · Word · PPTX)';
    if (catRow) catRow.style.display = 'block';
    if (dateRow) dateRow.style.display = 'none';
  }
  modal.style.display = 'flex';
}

function closePdfUpload() {
  var modal = document.getElementById('pdf-upload-modal');
  if (modal) modal.style.display = 'none';
}

function handlePdfFileSelect(input) {
  if (!input.files || !input.files[0]) return;
  var files = Array.from(input.files);
  var nameInput = document.getElementById('pdf-doc-name');
  var label = document.getElementById('pdf-file-label');
  if (files.length === 1) {
    var file = files[0];
    if (label) label.textContent = file.name + ' (' + (file.size / 1024).toFixed(0) + ' KB)';
    if (nameInput && !nameInput.value) {
      nameInput.value = file.name.replace(/\.(pdf|md|pptx|docx)$/i, '').replace(/[_-]/g, ' ');
    }
  } else {
    if (label) label.textContent = files.length + '개 파일 선택됨';
    if (nameInput && !nameInput.value) nameInput.value = '(파일명 자동)';
  }
}

async function _extractMdText(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) { resolve(e.target.result); };
    reader.onerror = reject;
    reader.readAsText(file, 'UTF-8');
  });
}

async function _extractPptxText(file) {
  if (typeof JSZip === 'undefined') throw new Error('JSZip 라이브러리 미로드');
  var arrayBuffer = await file.arrayBuffer();
  var zip = await JSZip.loadAsync(arrayBuffer);
  var slideTexts = [];
  var slideFiles = Object.keys(zip.files)
    .filter(function(name) { return /^ppt\/slides\/slide[0-9]+\.xml$/.test(name); })
    .sort();
  for (var i = 0; i < slideFiles.length; i++) {
    var xml = await zip.files[slideFiles[i]].async('string');
    var text = xml
      .replace(/<a:t>/g, ' ')
      .replace(/<\/a:t>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ').trim();
    if (text.length > 10) slideTexts.push('--- 슬라이드 ' + (i + 1) + ' ---\n' + text);
  }
  return slideTexts.join('\n\n');
}

async function _extractDocxText(file) {
  if (typeof mammoth === 'undefined') throw new Error('mammoth 라이브러리 미로드');
  var arrayBuffer = await file.arrayBuffer();
  var result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
  return (result && result.value) ? result.value : '';
}

function handlePdfDrop(event) {
  event.preventDefault();
  var dz = document.getElementById('pdf-drop-zone');
  if (dz) dz.style.borderColor = 'var(--border-mid)';
  var files = Array.from(event.dataTransfer.files || []);
  var allowed = /\.(pdf|md|pptx|docx)$/i;
  files = files.filter(function(f) { return allowed.test(f.name); });
  if (files.length === 0) {
    alert('PDF · MD · Word(docx) · PPTX 파일만 업로드 가능합니다.');
    return;
  }
  var input = document.getElementById('pdf-file-input');
  // DataTransfer로 file input 설정 (다중 파일 지원)
  var dt = new DataTransfer();
  files.forEach(function(f) { dt.items.add(f); });
  input.files = dt.files;
  handlePdfFileSelect(input);
}

function _setPdfProgress(pct, text) {
  var bar = document.getElementById('pdf-progress-bar');
  var txt = document.getElementById('pdf-progress-text');
  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = text;
}

async function _extractPdfText(file) {
  var arrayBuffer = await file.arrayBuffer();
  var loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  var pdf = await loadingTask.promise;
  var pages = [];
  for (var i = 1; i <= pdf.numPages; i++) {
    var page = await pdf.getPage(i);
    var tc = await page.getTextContent();
    var pageText = tc.items.map(function(item) { return item.str; }).join(' ');
    pages.push(pageText.trim());
  }
  return pages.join('\n\n');
}

function _chunkText(text) {
  var CHUNK_SIZE = 800;
  var OVERLAP = 100;
  var chunks = [];

  // 조항 경계 기준으로 우선 분할
  var blocks = text.split(/(?=제\d+조)/);
  if (blocks.length < 5) blocks = [text];

  blocks.forEach(function(block) {
    block = block.trim();
    if (!block) return;
    if (block.length <= CHUNK_SIZE) {
      if (block.length > 50) chunks.push(block);
    } else {
      var start = 0;
      while (start < block.length) {
        var chunk = block.slice(start, start + CHUNK_SIZE).trim();
        if (chunk.length > 50) chunks.push(chunk);
        start += CHUNK_SIZE - OVERLAP;
      }
    }
  });
  return chunks;
}

async function doPdfUpload() {
  if (!sb) { alert('Supabase 연결이 필요합니다.'); return; }
  var fileInput = document.getElementById('pdf-file-input');
  var docName = (document.getElementById('pdf-doc-name').value || '').trim();
  var category = _pdfUploadCtx === 'press'
    ? '보도자료'
    : _pdfUploadCtx === 'itu'
    ? 'ITU-R'
    : _pdfUploadCtx === 'custom'
    ? '추가지식'
    : (document.getElementById('pdf-category').value || '고시');
  var pressDate = (document.getElementById('pdf-press-date').value || '');

  if (!fileInput.files || !fileInput.files[0]) { alert('파일을 선택해주세요.'); return; }
  if (!docName && fileInput.files.length === 1) { alert('문서명을 입력해주세요.'); return; }
  if (_pdfUploadCtx === 'press' && !pressDate) { alert('보도자료 날짜를 입력해주세요.'); return; }

  var btn = document.getElementById('pdf-upload-btn');
  var prog = document.getElementById('pdf-progress');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> 처리 중...';
  prog.style.display = 'block';

  var files = Array.from(fileInput.files);
  var totalFiles = files.length;
  var totalChunks = 0;

  try {
    for (var fi = 0; fi < files.length; fi++) {
      var file = files[fi];
      var ext = file.name.split('.').pop().toLowerCase();
      // 다중 파일일 때 doc_name은 파일명(확장자 제거), 단일 파일이면 입력값
      var thisDocName = (totalFiles > 1)
        ? file.name.replace(/\.[^.]+$/, '')
        : (docName || file.name.replace(/\.[^.]+$/, ''));

      var fileProgress = fi / totalFiles;
      var fileProgressEnd = (fi + 1) / totalFiles;

      // 1. 텍스트 추출
      _setPdfProgress(
        Math.round(fileProgress * 80 + 5),
        '(' + (fi+1) + '/' + totalFiles + ') ' + file.name + ' 텍스트 추출 중...'
      );
      var text;
      if (ext === 'pdf') {
        text = await _extractPdfText(file);
        if (text.replace(/\s/g, '').length < 100) {
          throw new Error(file.name + ': 텍스트를 추출할 수 없습니다. 스캔 이미지 PDF이거나 암호화된 파일일 수 있습니다.');
        }
      } else if (ext === 'md') {
        text = await _extractMdText(file);
        if (text.replace(/\s/g, '').length < 10) {
          throw new Error(file.name + ': 내용이 없거나 읽을 수 없는 파일입니다.');
        }
      } else if (ext === 'pptx') {
        text = await _extractPptxText(file);
        if (text.replace(/\s/g, '').length < 10) {
          throw new Error(file.name + ': 텍스트를 추출할 수 없습니다.');
        }
      } else if (ext === 'docx') {
        text = await _extractDocxText(file);
        if (text.replace(/\s/g, '').length < 10) {
          throw new Error(file.name + ': 텍스트를 추출할 수 없습니다. 내용이 없거나 .doc(구버전) 파일일 수 있습니다.');
        }
      } else {
        throw new Error(file.name + ': 지원하지 않는 형식입니다. PDF, MD, Word(docx), PPTX만 가능합니다.');
      }

      // 1-b. 추가지식: 원본 파일을 Storage(uploads)에 보관 → 목록에서 클릭 다운로드
      var thisFilePath = null;
      if (_pdfUploadCtx === 'custom') {
        try {
          var keyBase = file.name.replace(/\.[^.]+$/, '')
            .replace(/[^\x00-\x7F]/g, '')      // 비ASCII 제거 (Storage 키 안전)
            .replace(/[^\w.\-]/g, '_') || 'file';
          thisFilePath = 'custom/' + Date.now() + '_' + keyBase + '.' + ext;
          var up = await sb.storage.from('uploads').upload(thisFilePath, file, {
            upsert: true,
            contentType: file.type || undefined
          });
          if (up.error) { console.warn('원본 파일 보관 실패:', up.error.message); thisFilePath = null; }
        } catch(se) { console.warn('원본 파일 보관 예외:', se); thisFilePath = null; }
      }

      // 2. 보도자료 MD 파일: ## YYMMDD 기준으로 보도자료별 청킹
      var allRows = [];
      if (_pdfUploadCtx === 'press' && ext === 'md') {
        // ## 로 시작하는 섹션 분리
        var sections = text.split(/(?=^## )/m).filter(function(s){ return s.trim().length > 0; });
        if (sections.length === 0) sections = [text];
        for (var si = 0; si < sections.length; si++) {
          var sec = sections[si].trim();
          var secChunks = _chunkText(sec);
          for (var ci = 0; ci < secChunks.length; ci++) {
            allRows.push({
              doc_name: thisDocName,
              doc_category: category,
              chunk_index: allRows.length,
              content: secChunks[ci],
              file_path: thisFilePath
            });
          }
        }
      } else {
        // 3. 일반 청킹
        _setPdfProgress(
          Math.round(fileProgress * 80 + 15),
          '(' + (fi+1) + '/' + totalFiles + ') 텍스트 청킹 중...'
        );
        var chunks = _chunkText(text);
        if (chunks.length === 0) throw new Error(file.name + ': 청킹 결과가 없습니다.');
        // 업로드 파일은 '승인 대기'(is_approved=false)로 저장 → 설정에서 승인해야 AI가 참조.
        // (보도자료는 별도 흐름이라 승인 게이트 제외)
        var approvedFlag = (_pdfUploadCtx === 'press');
        allRows = chunks.map(function(c, i) {
          return { doc_name: thisDocName, doc_category: category, chunk_index: i, content: c, file_path: thisFilePath, is_approved: approvedFlag };
        });
      }

      // 4. 기존 동일 문서명 청크 삭제
      _setPdfProgress(
        Math.round(fileProgress * 80 + 20),
        '(' + (fi+1) + '/' + totalFiles + ') 기존 데이터 정리 중...'
      );
      await sb.from('document_chunks').delete().eq('doc_name', thisDocName);

      // 5. 청크 배치 삽입 (50개씩)
      var BATCH = 50;
      for (var i = 0; i < allRows.length; i += BATCH) {
        await sb.from('document_chunks').insert(allRows.slice(i, i + BATCH));
        _setPdfProgress(
          Math.round((fileProgress + (i + BATCH) / allRows.length / totalFiles) * 80 + 10),
          '(' + (fi+1) + '/' + totalFiles + ') 업로드 중... (' + Math.min(i + BATCH, allRows.length) + '/' + allRows.length + '개 청크)'
        );
      }
      totalChunks += allRows.length;

      // 6. 보도자료면 메모리 pressData에도 추가 → 목록 즉시 반영
      if (_pdfUploadCtx === 'press') {
        if (!pressData) pressData = [];
        pressData.unshift({
          id: 'upload_' + Date.now() + '_' + fi,
          title: thisDocName,
          date: pressDate,
          content: text.slice(0, 3000)
        });
      }

      // 7. 법령·고시 또는 ITU-R면 화면 목록에 추가
      if (_pdfUploadCtx === 'law' || _pdfUploadCtx === 'itu') {
        var listEl = document.getElementById(_pdfUploadCtx === 'itu' ? 'itu-upload-list' : 'law-upload-list');
        if (listEl) {
          var item = document.createElement('div');
          item.className = 'card';
          item.style.cssText = 'cursor:default;margin-bottom:10px';
          item.innerHTML = '<div class="file-item">' +
            '<div class="file-icon fi-purple"><i class="ti ti-file-upload"></i></div>' +
            '<div style="flex:1"><div class="file-name">' + thisDocName + '</div>' +
            '<div class="file-size">' + category + ' · 직접 업로드 · ' + allRows.length + '개 청크</div></div>' +
            '<span class="badge badge-teal">최신</span>' +
            '</div>';
          listEl.appendChild(item);
        }
      }
    } // end for files

    // 보도자료 목록 갱신
    if (_pdfUploadCtx === 'press') {
      renderPressList(null);
    }

    _setPdfProgress(100, '완료!');
    setTimeout(function() {
      closePdfUpload();
      var pendingNote = (_pdfUploadCtx === 'press')
        ? ''
        : '\n\n⏳ 승인 대기 상태로 등록되었습니다. 설정 → 승인 대기 문서에서 승인하면 AI 자문 반영 + 의미검색 임베딩까지 자동 생성됩니다.';
      var msg = totalFiles === 1
        ? '✅ "' + (docName || files[0].name.replace(/\.[^.]+$/, '')) + '" 업로드 완료!\n' + totalChunks + '개 청크가 등록되었습니다.' + pendingNote
        : '✅ ' + totalFiles + '개 파일 업로드 완료!\n총 ' + totalChunks + '개 청크가 등록되었습니다.' + pendingNote;
      alert(msg);
    }, 400);

  } catch(e) {
    alert('업로드 실패: ' + (e.message || e));
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-upload"></i> 업로드';
    prog.style.display = 'none';
  }
}

// ════════════════════════════════════════════
//  국회 법안 모니터링
// ════════════════════════════════════════════
let assemblyBillsCache = null;
let assemblyFilterMode = '전체';

async function loadAssemblyBills(forceRefresh) {
  if (!sb) return;
  var listEl = document.getElementById('assembly-list');
  if (!listEl) return;

  if (!assemblyBillsCache || forceRefresh) {
    listEl.innerHTML = '<div style="color:var(--text-secondary);padding:20px;text-align:center;font-size:12px">불러오는 중...</div>';
    try {
      var resp = await sb
        .from('assembly_bills')
        .select('*')
        .eq('age', 22)
        .order('updated_at', { ascending: false });
      if (resp.error) throw resp.error;
      assemblyBillsCache = resp.data || [];
    } catch(e) {
      listEl.innerHTML = '<div style="color:#f66;padding:20px;text-align:center;font-size:12px">불러오기 실패: ' + e.message + '</div>';
      return;
    }
  }
  renderAssemblyBills(assemblyBillsCache);
}

function filterAssembly(el, mode) {
  assemblyFilterMode = mode;
  if (assemblyBillsCache) renderAssemblyBills(assemblyBillsCache);
}

function _parseProposeDt(s) {
  if (!s) return null;
  if (s.length === 8) s = s.slice(0,4) + '-' + s.slice(4,6) + '-' + s.slice(6);
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function assemblyStatusLabel(proc) {
  if (!proc || proc === '접수') return { text: '접수', color: '#6b7280' };
  if (proc.includes('가결') || proc === '본회의 통과' || proc === '공포' || proc === '정부이송') return { text: proc, color: '#22c55e' };
  if (proc.includes('폐기') || proc === '부결' || proc === '철회') return { text: proc, color: '#ef4444' };
  if (proc.includes('소관위')) return { text: proc, color: '#3b82f6' };
  if (proc.includes('법사위')) return { text: proc, color: '#8b5cf6' };
  if (proc.includes('본회의')) return { text: proc, color: '#f59e0b' };
  return { text: proc, color: '#6b7280' };
}

function assemblyMatchesFilter(bill) {
  var p = bill.proc_result || '접수';
  if (assemblyFilterMode === '전체') return true;
  if (assemblyFilterMode === '최근') { var d = _parseProposeDt(bill.propose_dt); return !!d && d >= new Date(Date.now() - 7 * 86400000); }
  if (assemblyFilterMode === '접수') return !bill.proc_result || p === '접수';
  if (assemblyFilterMode === '통과') return p.includes('가결') || p === '본회의 통과' || p === '공포' || p === '정부이송';
  if (assemblyFilterMode === '폐기') return p.includes('폐기') || p === '부결' || p === '철회';
  return true;
}

function renderAssemblyBills(bills) {
  var listEl = document.getElementById('assembly-list');
  if (!listEl) return;

  // 통계
  var now = new Date();
  var weekAgo = new Date(now - 7 * 86400000);
  var totalCount   = bills.length;
  var newCount     = bills.filter(function(b) { var d = _parseProposeDt(b.propose_dt); return d && d >= weekAgo; }).length;
  var activeCount  = bills.filter(function(b) { var p = b.proc_result || ''; return !p || p === '접수'; }).length;
  var passedCount  = bills.filter(function(b) { var p = b.proc_result || ''; return p.includes('가결') || p === '본회의 통과' || p === '공포' || p === '정부이송'; }).length;
  var discardedCount = bills.filter(function(b) { var p = b.proc_result || ''; return p.includes('폐기') || p === '부결' || p === '철회'; }).length;

  var setVal = function(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
  setVal('asm-total',  totalCount);
  setVal('asm-new',    newCount);
  setVal('asm-active', activeCount);
  setVal('asm-passed', passedCount);
  setVal('asm-discarded', discardedCount);

  // 선택된 카드 강조 (필터 버튼 줄 제거 → 카드가 필터 겸용)
  document.querySelectorAll('#assembly-stats .stat-card').forEach(function(c) {
    var on = c.getAttribute('data-mode') === assemblyFilterMode;
    c.style.outline = on ? '2px solid var(--accent)' : '';
    c.style.outlineOffset = on ? '-2px' : '';
  });

  var filtered = bills.filter(assemblyMatchesFilter).slice().sort(function(a, b) {
    var da = _parseProposeDt(a.propose_dt), db = _parseProposeDt(b.propose_dt);
    return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
  });

  if (filtered.length === 0) {
    listEl.innerHTML = '<div style="color:var(--text-secondary);padding:24px;text-align:center;font-size:12px">해당하는 법안이 없습니다</div>';
    return;
  }

  var html = '<div class="card" style="cursor:default;padding:0;overflow:hidden">';
  filtered.forEach(function(b, i) {
    var sl = assemblyStatusLabel(b.proc_result);
    var kws = (b.matched_keywords || []).slice(0, 3).join(', ');
    var proposeDt = b.propose_dt
      ? (b.propose_dt.length === 8
          ? b.propose_dt.slice(0,4) + '.' + b.propose_dt.slice(4,6) + '.' + b.propose_dt.slice(6)
          : b.propose_dt)
      : '—';
    var isNew = (function() { var d = _parseProposeDt(b.propose_dt); return d && d >= weekAgo; })();
    var borderTop = i === 0 ? '' : 'border-top:1px solid var(--border);';
    var link = b.link_url
      ? '<a href="' + b.link_url + '" target="_blank" rel="noopener" style="color:var(--accent);font-size:11px;text-decoration:none;white-space:nowrap"><i class="ti ti-external-link" style="font-size:11px"></i> 의안보기</a>'
      : '';

    html += '<div style="' + borderTop + 'padding:12px 14px">'
      + '<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:4px">'
      + '<span style="flex:1;font-size:12px;font-weight:600;color:var(--text-primary);line-height:1.4">' + escHtml(b.bill_name) + '</span>'
      + (isNew ? '<span style="font-size:10px;background:#dcfce7;color:#16a34a;padding:1px 6px;border-radius:99px;flex-shrink:0">신규</span>' : '')
      + '</div>'
      + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
      + '<span style="font-size:10px;color:var(--text-muted)">' + escHtml(b.proposer || '—') + '</span>'
      + '<span style="font-size:10px;color:var(--text-muted)">|</span>'
      + '<span style="font-size:10px;color:var(--text-muted)">' + escHtml(b.committee || '—') + '</span>'
      + '<span style="font-size:10px;color:var(--text-muted)">|</span>'
      + '<span style="font-size:10px;color:var(--text-muted)">발의 ' + proposeDt + '</span>'
      + '<span style="margin-left:auto;font-size:10px;font-weight:600;color:' + sl.color + '">' + escHtml(sl.text) + '</span>'
      + '</div>'
      + (b.summary ? '<div style="font-size:11px;color:var(--text-secondary);line-height:1.45;margin:6px 0 0">' + escHtml(b.summary) + '</div>' : '')
      + (kws ? '<div style="margin-top:4px;font-size:10px;color:var(--text-muted)">키워드: ' + escHtml(kws) + '</div>' : '')
      + (link ? '<div style="margin-top:4px">' + link + '</div>' : '')
      + '</div>';
  });
  html += '</div>';

  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:8px;text-align:right">'
    + filtered.length + '건 표시 (전체 ' + totalCount + '건)</div>';

  listEl.innerHTML = html;
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ════════════════════════════════════════════
//  입법예고·법령 개정 타임라인
// ════════════════════════════════════════════

var lawTrackCache = null;
var lawTrackFilterMode = '입법예고중';

async function loadLawTrack(forceRefresh) {
  if (!sb) return;
  var listEl = document.getElementById('lawtrack-list');
  if (!listEl) return;

  if (!lawTrackCache || forceRefresh) {
    listEl.innerHTML = '<div style="color:var(--text-secondary);padding:20px;text-align:center;font-size:12px">불러오는 중...</div>';
    try {
      var resp = await sb
        .from('law_amendments')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(500);
      if (resp.error) throw resp.error;
      lawTrackCache = resp.data || [];
    } catch(e) {
      listEl.innerHTML = '<div style="color:#f66;padding:20px;text-align:center;font-size:12px">불러오기 실패: ' + e.message + '</div>';
      return;
    }
  }
  renderLawTrack(lawTrackCache);
}

function filterLawTrack(el, mode) {
  lawTrackFilterMode = mode;
  if (lawTrackCache) renderLawTrack(lawTrackCache);
}

function lawTrackTypeLabel(law_type) {
  var map = { lsAnc:'입법예고', bylaw:'시행령', rules:'시행규칙', admrul:'고시' };
  var colors = { lsAnc:'#f59e0b', bylaw:'#3b82f6', rules:'#8b5cf6', admrul:'#6b7280' };
  return { text: map[law_type] || law_type, color: colors[law_type] || '#6b7280' };
}

function fmtLawDate(dt) {
  // YYYYMMDD → YYYY.MM.DD
  if (!dt) return null;
  dt = String(dt).replace(/-/g, '');
  if (dt.length === 8) return dt.slice(0,4) + '.' + dt.slice(4,6) + '.' + dt.slice(6);
  return dt;
}

function lawTrackDetailUrl(r) {
  var id = r.law_id || '', m;
  if ((m = id.match(/^admrul_(\d+)$/))) return 'https://www.law.go.kr/admRulInfoP.do?admRulSeq=' + m[1];
  if ((m = id.match(/^(?:law|bylaw|rules)_(\d+)$/))) return 'https://www.law.go.kr/lsInfoP.do?lsiSeq=' + m[1];
  return r.link_url || '';
}

function renderLawTrack(items) {
  var listEl = document.getElementById('lawtrack-list');
  if (!listEl) return;

  var now = new Date();
  var weekAgo = new Date(now - 7 * 86400000);
  var todayStr = now.toISOString().slice(0,10).replace(/-/g,'');

  var recent90Str = new Date(now - 90 * 86400000).toISOString().slice(0,10).replace(/-/g,'');
  var year1Str    = new Date(now - 365 * 86400000).toISOString().slice(0,10).replace(/-/g,'');
  var _d = function(v) { return String(v || '').replace(/\D/g, ''); };

  // ── 추적 대상 정비: 현행 중복 제거 + 최근 1년 변동분만 표시 ──
  //   · 입법예고(lsAnc)는 개별 유지, 그 외는 같은 법령명에서 공포일 최신 1건만(연혁 중복 제거)
  //   · 표시 대상 = 입법예고 OR 시행예정(미래 시행일) OR 최근 1년 내 공포·개정
  //   ※ 오래전 공포된 현행법(상시 참조용)은 지식베이스 '국내 법령·고시'에서 조회
  var _latest = {};
  (items || []).forEach(function(r) {
    if (r.law_type === 'lsAnc') { _latest['lsAnc::' + (r.law_id || r.law_nm)] = r; return; }
    var k = r.law_nm || r.law_id;
    if (!_latest[k] || _d(r.public_dt) > _d(_latest[k].public_dt)) _latest[k] = r;
  });
  var tracked = Object.keys(_latest).map(function(k) { return _latest[k]; }).filter(function(r) {
    if (r.law_type === 'lsAnc') return true;
    if (_d(r.enf_dt) >= todayStr) return true;          // 시행 예정
    return _d(r.public_dt) >= year1Str;                 // 최근 1년 공포·개정
  });

  function ltFilter(r) {
    if (lawTrackFilterMode === '전체') return true;
    if (lawTrackFilterMode === '입법예고중') return r.law_type === 'lsAnc';
    if (lawTrackFilterMode === '시행예정') return r.enf_dt && r.enf_dt.replace(/\D/g,'') >= todayStr;
    if (lawTrackFilterMode === '신규개정') return _d(r.public_dt) >= recent90Str || (r.prev_public_dt && r.prev_public_dt !== r.public_dt);
    return true;
  }
  var filtered = tracked.filter(ltFilter).slice().sort(function(a, b) {
    // 공포일 최신순(desc), 같거나 없으면 시행일로 보조 정렬
    var pa = _d(a.public_dt), pb = _d(b.public_dt);
    if (pa !== pb) return pb.localeCompare(pa);
    return _d(b.enf_dt).localeCompare(_d(a.enf_dt));
  });

  // 통계 (정비된 추적 대상 기준)
  var ancCount  = tracked.filter(function(r) { return r.law_type === 'lsAnc'; }).length;
  var newCount  = tracked.filter(function(r) { return _d(r.public_dt) >= recent90Str || (r.prev_public_dt && r.prev_public_dt !== r.public_dt); }).length;
  var enfCount  = tracked.filter(function(r) { return r.enf_dt && r.enf_dt.replace(/\D/g,'') >= todayStr; }).length;
  var setV = function(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; };
  setV('lt-total', tracked.length);
  setV('lt-anc',   ancCount);
  setV('lt-new',   newCount);
  setV('lt-enf',   enfCount);

  // 선택된 카드 강조 (필터 버튼 줄 제거 → 카드가 필터 겸용)
  document.querySelectorAll('#lawtrack-stats .stat-card').forEach(function(c) {
    var on = c.getAttribute('data-mode') === lawTrackFilterMode;
    c.style.outline = on ? '2px solid var(--accent)' : '';
    c.style.outlineOffset = on ? '-2px' : '';
  });

  if (filtered.length === 0) {
    listEl.innerHTML = '<div style="color:var(--text-secondary);padding:24px;text-align:center;font-size:12px">해당 항목이 없습니다</div>';
    return;
  }

  var html = '';
  filtered.forEach(function(r) {
    var tl   = lawTrackTypeLabel(r.law_type);
    var kws  = (r.matched_keywords || []).slice(0,3).join(', ');
    var isNew = _d(r.public_dt) >= recent90Str;
    var pubDt = fmtLawDate(r.public_dt);
    var enfDt = fmtLawDate(r.enf_dt);
    var prevDt = fmtLawDate(r.prev_public_dt);
    var isUpdated = prevDt && prevDt !== pubDt;
    var _lturl = lawTrackDetailUrl(r);
    var link = _lturl
      ? '<a href="' + escHtml(_lturl) + '" target="_blank" rel="noopener" style="color:var(--accent);font-size:11px;text-decoration:none"><i class="ti ti-external-link" style="font-size:10px"></i> 상세보기</a>'
      : '';

    // 타임라인 스텝 생성
    // 입법예고(lsAnc): [입법예고 시작] → [의견마감] → [공포·시행 미정]
    //   ※ lsAnc는 enf_dt에 '의견 수렴 마감일'이 저장됨(공포·시행일은 입법예고 시점 미정)
    // 시행령/규칙/고시: [공포] → [시행]
    var steps = [];
    if (r.law_type === 'lsAnc') {
      steps.push({ label:'입법예고',   date: pubDt, done: !!pubDt, icon:'📢' });
      steps.push({ label:'의견마감',   date: enfDt, done: !!(enfDt && enfDt.replace(/\./g,'') <= todayStr), icon:'⏰' });
      steps.push({ label:'공포·시행', date: null,  done: false, icon:'📋' });
    } else {
      steps.push({ label:'공포',  date: pubDt, done: !!pubDt, icon:'📋' });
      steps.push({ label:'시행',  date: enfDt, done: enfDt && enfDt.replace(/\./g,'') <= todayStr, icon:'✅' });
    }

    // 타임라인 HTML
    var tlHtml = '<div style="display:flex;align-items:flex-start;gap:0;margin:10px 0 4px">';
    steps.forEach(function(step, idx) {
      var doneColor = step.done ? 'var(--accent)' : '#d1d5db';
      var dotBg     = step.done ? 'var(--accent)' : 'var(--bg-secondary)';
      var textColor = step.done ? 'var(--text-primary)' : 'var(--text-muted)';
      var connector = idx < steps.length - 1
        ? '<div style="flex:1;height:2px;background:' + doneColor + ';margin-top:7px;min-width:24px"></div>'
        : '';
      tlHtml += '<div style="display:flex;flex-direction:column;align-items:center;min-width:64px">'
        + '<div style="width:14px;height:14px;border-radius:50%;background:' + dotBg + ';border:2px solid ' + doneColor + ';display:flex;align-items:center;justify-content:center;font-size:8px">'
        + (step.done ? '<span style="color:#fff;font-size:8px">✓</span>' : '') + '</div>'
        + '<div style="font-size:10px;font-weight:600;color:' + textColor + ';margin-top:3px;text-align:center">' + step.label + '</div>'
        + '<div style="font-size:9px;color:var(--text-muted);text-align:center;line-height:1.3">' + (step.date || '—') + '</div>'
        + '</div>'
        + connector;
    });
    tlHtml += '</div>';

    html += '<div class="card" style="margin-bottom:10px;padding:12px 14px">'
      // 헤더
      + '<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:2px">'
      + '<span style="flex:1;font-size:12px;font-weight:600;color:var(--text-primary);line-height:1.4">' + escHtml(r.law_nm) + '</span>'
      + (isNew ? '<span style="font-size:10px;background:#dcfce7;color:#16a34a;padding:1px 6px;border-radius:99px;flex-shrink:0">신규</span>' : '')
      + (isUpdated ? '<span style="font-size:10px;background:#fef3c7;color:#b45309;padding:1px 6px;border-radius:99px;flex-shrink:0">개정</span>' : '')
      + '</div>'
      // 메타
      + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:2px">'
      + '<span style="font-size:10px;font-weight:600;color:' + tl.color + ';background:' + tl.color + '1a;padding:1px 7px;border-radius:99px">' + tl.text + '</span>'
      + (r.ann_type ? '<span style="font-size:10px;color:var(--text-muted)">' + escHtml(r.ann_type) + '</span>' : '')
      + (kws ? '<span style="font-size:10px;color:var(--text-muted)">키워드: ' + escHtml(kws) + '</span>' : '')
      + '</div>'
      // 개정이유 요약 (AI)
      + (r.summary ? '<div style="font-size:11px;color:var(--text-secondary);line-height:1.45;margin:2px 0 0">' + escHtml(r.summary) + '</div>' : '')
      // 타임라인
      + tlHtml
      // 개정 이력
      + (isUpdated ? '<div style="font-size:10px;color:#b45309;margin-top:2px">이전 공포: ' + prevDt + ' → ' + (pubDt || '—') + '</div>' : '')
      // 링크
      + (link ? '<div style="margin-top:6px">' + link + '</div>' : '')
      + '</div>';
  });

  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;text-align:right">'
    + filtered.length + '건 표시 (전체 ' + items.length + '건)</div>';

  listEl.innerHTML = html;
}

// ════════════════════════════════════════════
//  보고서 초안 제안 — 내 보고서(형식·톤) + RAG(내용) 결합
//  데이터: report_samples / report_style_rules / report_feedback (Supabase)
//  재사용: searchKeywords·buildRagContext·getQueryEmbedding·파서·callClaude SSE 패턴
// ════════════════════════════════════════════
var lastReportDraftText = '';
var lastReportDraftReq = '';
var lastReportDraftSources = [];
var lastReportFinal = '';       // 사용자가 채택·교정한 최종본 (편집-diff 학습용)
var _reportPickedFile = null;   // 등록 화면에서 선택한 파일(텍스트 추출 전)

// 탭 전환 (초안 생성 / 내 보고서 관리)
function switchReportTab(tab) {
  var genT = document.getElementById('report-tab-gen');
  var mngT = document.getElementById('report-tab-manage');
  var genB = document.getElementById('rtab-gen');
  var mngB = document.getElementById('rtab-manage');
  var isGen = (tab === 'gen');
  if (genT) genT.style.display = isGen ? 'block' : 'none';
  if (mngT) mngT.style.display = isGen ? 'none' : 'block';
  if (genB) { genB.classList.toggle('btn-primary', isGen); genB.classList.toggle('active', isGen); }
  if (mngB) { mngB.classList.toggle('btn-primary', !isGen); mngB.classList.toggle('active', !isGen); }
  if (!isGen) loadReportSamples();
}

// 보고서 샘플 1건 저장 (전문 보관, 청킹 안 함)
async function addReportSample(title, reportType, content, summary) {
  if (!sb) { alert('Supabase 연결이 필요합니다.'); return false; }
  var ins = await sb.from('report_samples').insert({
    title: title, report_type: reportType || null,
    content: content, summary: summary || null
  });
  if (ins.error) { alert('저장 실패: ' + ins.error.message); return false; }
  return true;
}

// 등록 화면: 파일 선택(클릭) → 공통 처리
async function onReportFileSelect(input) {
  var files = Array.from(input.files || []);
  if (files.length === 0) return;
  await _processReportFile(files[0]);
}

// 드래그앤드롭 핸들러
function handleReportFileDragOver(ev) {
  ev.preventDefault();
  var dz = document.getElementById('report-drop-zone');
  if (dz) dz.style.borderColor = 'var(--accent, #6366f1)';
}
function handleReportFileDragLeave(ev) {
  ev.preventDefault();
  var dz = document.getElementById('report-drop-zone');
  if (dz) dz.style.borderColor = 'var(--border-mid)';
}
async function handleReportFileDrop(ev) {
  ev.preventDefault();
  var dz = document.getElementById('report-drop-zone');
  if (dz) dz.style.borderColor = 'var(--border-mid)';
  var files = Array.from((ev.dataTransfer && ev.dataTransfer.files) || []);
  if (files.length === 0) return;
  await _processReportFile(files[0]);
}

// 파일 1건 → 텍스트 추출해 내용란 채움 (기존 파서 재사용 · 클릭/드롭 공용)
async function _processReportFile(file) {
  var ext = (file.name.split('.').pop() || '').toLowerCase();
  var labelEl = document.getElementById('report-file-label');
  if (labelEl) labelEl.textContent = file.name + ' 추출 중...';
  try {
    var text = '';
    if (ext === 'pdf') text = await _extractPdfText(file);
    else if (ext === 'md' || ext === 'txt') text = await _extractMdText(file);
    else if (ext === 'pptx') text = await _extractPptxText(file);
    else if (ext === 'docx') text = await _extractDocxText(file);
    else { alert('지원 형식: PDF · Word(docx) · PPTX · MD · TXT'); if (labelEl) labelEl.textContent=''; return; }
    if (!text || text.replace(/\s/g,'').length < 30) {
      alert('텍스트를 충분히 추출하지 못했습니다(스캔 PDF·빈 파일일 수 있음). 내용을 직접 붙여넣어 주세요.');
      if (labelEl) labelEl.textContent = '';
      return;
    }
    var contentEl = document.getElementById('report-sample-content');
    if (contentEl) contentEl.value = text;
    var titleEl = document.getElementById('report-sample-title');
    if (titleEl && !titleEl.value) titleEl.value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
    if (labelEl) labelEl.textContent = file.name + ' · ' + text.length.toLocaleString() + '자 추출됨';
  } catch(e) {
    alert('파일 추출 실패: ' + (e.message || e));
    if (labelEl) labelEl.textContent = '';
  }
}

// 등록 버튼
async function onSaveReportSample() {
  var title = (document.getElementById('report-sample-title') || {}).value || '';
  var type = (document.getElementById('report-sample-type') || {}).value || '';
  var content = (document.getElementById('report-sample-content') || {}).value || '';
  var summary = (document.getElementById('report-sample-summary') || {}).value || '';
  title = title.trim(); content = content.trim(); summary = summary.trim();
  if (!title) { alert('제목을 입력하세요.'); return; }
  if (content.replace(/\s/g,'').length < 50) { alert('보고서 본문이 너무 짧습니다(형식 학습용 전문 필요).'); return; }
  var btn = document.getElementById('report-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
  var ok = await addReportSample(title, type, content, summary);
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-device-floppy"></i> 보고서 등록'; }
  if (ok) {
    ['report-sample-title','report-sample-content','report-sample-summary'].forEach(function(id){
      var el = document.getElementById(id); if (el) el.value='';
    });
    var labelEl = document.getElementById('report-file-label'); if (labelEl) labelEl.textContent='';
    var fi = document.getElementById('report-file-input'); if (fi) fi.value='';
    alert('✅ 보고서가 등록되었습니다.\n\n의미(시맨틱) 검색을 적용하려면 PC에서 다음을 1회 실행하세요:\n  python backfill_report_embeddings.py\n(실행 전에도 키워드·유형 필터로는 즉시 사용됩니다.)');
    loadReportSamples();
  }
}

async function onDeleteReportSample(id) {
  if (!confirm('이 보고서 샘플을 삭제할까요?')) return;
  var del = await sb.from('report_samples').delete().eq('id', id);
  if (del.error) { alert('삭제 실패: ' + del.error.message); return; }
  loadReportSamples();
}

// 등록된 보고서 목록 렌더 (+ 임베딩 대기 배지)
async function loadReportSamples() {
  var listEl = document.getElementById('report-sample-list');
  if (!listEl || !sb) return;
  listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary);font-size:12px">불러오는 중...</div>';
  var rows = (await sb.from('report_samples')
    .select('id,title,report_type,summary,created_at')
    .order('created_at', { ascending:false }).limit(100)).data || [];
  // 임베딩 대기(embedding NULL) id 집합
  var pend = (await sb.from('report_samples').select('id').is('embedding','null').limit(200)).data || [];
  var pendSet = new Set(pend.map(function(r){ return r.id; }));
  // 스타일 학습 상태 갱신
  refreshStyleStatus(rows.length);
  loadReportDirectives();   // 항상 적용 지시 목록도 함께
  if (rows.length === 0) {
    listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:12px">등록된 보고서가 없습니다. 위에서 내 보고서를 등록하면 그 형식·톤으로 초안을 만들어 줍니다.</div>';
    return;
  }
  listEl.innerHTML = rows.map(function(r) {
    var pending = pendSet.has(r.id);
    var badge = pending
      ? '<span style="font-size:10px;background:#fef3c7;color:#b45309;padding:1px 7px;border-radius:99px">임베딩 대기</span>'
      : '<span style="font-size:10px;background:#dcfce7;color:#16a34a;padding:1px 7px;border-radius:99px">임베딩 완료</span>';
    var dt = (r.created_at || '').slice(0,10);
    return '<div class="card" style="margin-bottom:8px;cursor:default">'
      + '<div style="display:flex;align-items:flex-start;gap:8px">'
      + '<div style="flex:1">'
      + '<div style="font-size:12px;font-weight:600;color:var(--text-primary);line-height:1.4">' + escHtml(r.title) + '</div>'
      + '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:3px">'
      + (r.report_type ? '<span style="font-size:10px;background:var(--bg-tertiary,#eef);color:var(--text-secondary);padding:1px 7px;border-radius:99px">' + escHtml(r.report_type) + '</span>' : '')
      + badge
      + '<span style="font-size:10px;color:var(--text-muted)">' + dt + '</span>'
      + '</div>'
      + (r.summary ? '<div style="font-size:11px;color:var(--text-secondary);margin-top:3px;line-height:1.45">' + escHtml(r.summary) + '</div>' : '')
      + '</div>'
      + '<button class="btn" style="font-size:11px;padding:3px 8px;flex-shrink:0" onclick="onDeleteReportSample(' + r.id + ')"><i class="ti ti-trash"></i></button>'
      + '</div></div>';
  }).join('');
}

function refreshStyleStatus(count) {
  var el = document.getElementById('report-style-status');
  if (!el) return;
  if (count < 2) {
    el.textContent = '보고서 2편 이상 등록하면 공통 형식을 학습합니다. (현재 ' + count + '편)';
  } else {
    el.textContent = '등록 ' + count + '편 · [스타일 재학습]으로 형식 규칙을 갱신할 수 있습니다.';
  }
}

// 스타일 가이드 증류 (Haiku) — 기준 예시 + 편집-diff(빨간펜) + 부정 피드백
//  재증류 트리거: 강제 / 규칙 없음 / 샘플 +2편 / 피드백 +2건 (피드백이 자동 학습 연료)
async function distillReportStyle(force) {
  if (!sb) return '';
  var saved = (await sb.from('report_style_rules').select('rules,sample_count,feedback_count').eq('id',1).maybeSingle()).data || {};
  var cnt = (await sb.from('report_samples').select('id', { count:'exact', head:true })).count || 0;
  var fbCount = (await sb.from('report_feedback').select('id', { count:'exact', head:true })).count || 0;
  if (cnt < 2) return saved.rules || '';   // 구조 학습엔 기본 샘플 2편 이상 필요
  var sampleDelta = cnt - (saved.sample_count || 0);
  var fbDelta = fbCount - (saved.feedback_count || 0);
  if (!force && saved.rules && sampleDelta < 2 && fbDelta < 2) return saved.rules;

  var samples = (await sb.from('report_samples').select('title,report_type,content')
    .order('created_at', { ascending:false }).limit(8)).data || [];
  var joined = samples.map(function(r,i){
    return '### 예시 ' + (i+1) + ' [' + (r.report_type||'기타') + '] ' + r.title + '\n' + (r.content||'').slice(0,2200);
  }).join('\n\n');

  // ── 빨간펜 학습: 최근 피드백(초안→최종본 차이 / 부정 평가) ──
  var fb = (await sb.from('report_feedback').select('request,draft,final,rating')
    .order('created_at', { ascending:false }).limit(12)).data || [];
  var corrections = fb.filter(function(f){ return f.final && f.final.trim(); }).slice(0,4);
  var negatives = fb.filter(function(f){ return f.rating === -1 && !(f.final && f.final.trim()); }).slice(0,3);
  var corrBlock = corrections.map(function(f,i){
    return '〔교정 ' + (i+1) + '〕 요청: ' + (f.request||'').slice(0,120) +
      '\n[AI 초안 발췌]\n' + (f.draft||'').slice(0,1200) +
      '\n[사용자 최종본 발췌]\n' + (f.final||'').slice(0,1200);
  }).join('\n\n');
  var negBlock = negatives.map(function(f,i){
    return '〔불만족 초안 ' + (i+1) + '〕 ' + (f.draft||'').slice(0,700);
  }).join('\n\n');

  var claudeKey = getConfig().claudeKey;
  if (!claudeKey) return saved.rules || '';
  var userMsg =
    '다음 자료로 "보고서 작성 규칙"을 만들어줘. 8~14줄, 지시문 형태로만 출력(설명 금지).\n\n' +
    '[A. 기준 예시 보고서 — 기본 구조·톤]\n' + (joined || '(없음)') +
    (corrBlock ? '\n\n[B. 사용자 교정 사례 — 초안을 사용자가 이렇게 고쳤음. 이 변화(구조 이동·표현 교체·길이·어미 등)를 규칙에 "반드시 반영"으로 명시]\n' + corrBlock : '') +
    (negBlock ? '\n\n[C. 사용자가 별로라고 평가한 초안 — 이런 패턴은 "피하라"로 명시]\n' + negBlock : '') +
    '\n\n항목: ① 전체 구조(섹션 순서/제목 방식) ② 문단·문장 톤(격식/길이/어미) ③ 자주 쓰는 표현·머리말 ④ 도입·결론 처리 ⑤ 위 교정에서 드러난 사용자 선호(최우선).';
  try {
    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{ 'x-api-key':claudeKey, 'anthropic-version':'2023-06-01', 'content-type':'application/json', 'anthropic-dangerous-direct-browser-access':'true' },
      body: JSON.stringify({
        model:'claude-haiku-4-5-20251001', max_tokens:800,
        system:'당신은 문서 편집 전문가입니다. 기준 예시의 공통 형식을 잡되, 사용자의 교정 사례(초안→최종본 차이)에서 드러난 선호를 최우선으로 반영해 재사용 가능한 작성 규칙으로 일반화합니다.',
        messages:[{ role:'user', content: userMsg }]
      })
    });
    if (!res.ok) return saved.rules || '';
    var data = await res.json();
    var rules = (data.content && data.content[0] && data.content[0].text) || '';
    if (rules) {
      await sb.from('report_style_rules').upsert({ id:1, rules:rules, sample_count:cnt, feedback_count:fbCount, updated_at:new Date().toISOString() });
    }
    return rules || saved.rules || '';
  } catch(e) { console.warn('스타일 증류 실패:', e); return saved.rules || ''; }
}

// 수동 "스타일 재학습" 버튼
async function onRelearnStyle() {
  var claudeKey = getConfig().claudeKey;
  if (!claudeKey) { alert('Claude API 키가 설정되지 않았습니다.'); return; }
  var btn = document.getElementById('report-relearn-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> 학습 중...'; }
  var rules = await distillReportStyle(true);
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-refresh"></i> 스타일 재학습'; }
  var box = document.getElementById('report-style-rules-box');
  if (box) {
    box.style.display = rules ? 'block' : 'none';
    box.textContent = rules || '';
  }
  if (!rules) alert('학습할 규칙을 생성하지 못했습니다. 보고서가 2편 이상인지 확인하세요.');
}

// 핵심: 초안 생성 (형식=내 보고서, 내용=RAG) — callClaude SSE 패턴 복제
//  opts.reviseInstruction: 기존 초안(opts.priorDraft)을 말로 수정하는 다회 대화 모드
async function callReportDraft(userText, reportType, onDelta, opts) {
  opts = opts || {};
  var claudeKey = getConfig().claudeKey;
  if (!claudeKey) throw new Error('Claude API 키가 설정되지 않았습니다.');

  // ① 형식: 스타일 가이드 + 유사 샘플 1~2편
  var styleRules = await distillReportStyle(false);
  var emb = await getQueryEmbedding(userText);
  var samples = [];
  if (emb) {
    samples = (await sb.rpc('match_report_samples',
      { query_embedding: emb, match_count: 2, filter_type: reportType || null })).data || [];
  }
  // 임베딩 없거나 결과 없으면 유형/최신순 폴백
  if (samples.length === 0) {
    var q = sb.from('report_samples').select('title,report_type,content').order('created_at',{ascending:false}).limit(2);
    if (reportType) q = q.eq('report_type', reportType);
    samples = (await q).data || [];
  }
  var sampleBlock = samples.map(function(s,i){
    return '[예시 보고서 ' + (i+1) + ' · ' + (s.report_type||'기타') + ' · ' + s.title + ']\n' + (s.content||'').slice(0,3000);
  }).join('\n\n---\n\n');

  // ② 내용: 기존 RAG(법령·고시·뉴스) 재사용
  var ragChunks = await searchKeywords(userText, false);
  var ragContext = buildRagContext(ragChunks);

  // 참고 출처 기록
  lastReportDraftSources = samples.map(function(s){ return '내 보고서: ' + s.title; })
    .concat((ragChunks||[]).map(function(c){ return c.doc_name; }));

  // ③ 시스템 프롬프트 조합
  var system =
    '당신은 사용자의 기존 보고서 스타일을 그대로 재현하는 전파·통신 정책 보고서 작성 도우미입니다.\n' +
    '아래 [예시 보고서]의 구조·톤·표현을 충실히 따르고, 내용 근거는 [법령·자료]에서 인용하세요.\n' +
    '확정 사실/해석/추정/의견을 구분하고, 단정 대신 검토의견 톤을 유지하세요. 법령 인용은 조항+핵심내용을 함께 적습니다.\n\n' +
    '[보고서 작성 규칙(내 스타일)]\n' + (styleRules || '(아직 학습된 규칙 없음 — 예시를 직접 모방)') +
    '\n\n[예시 보고서 — 형식·톤의 기준]\n' + (sampleBlock || '(등록된 예시 없음 — 표준 정책보고서 형식 사용)') +
    ragContext;

  // 항상 적용할 사용자 지시(영구) 주입 — 최우선
  try {
    var directives = (await sb.from('report_directives').select('directive').order('created_at',{ascending:true})).data || [];
    if (directives.length) {
      system += '\n\n[항상 반영할 사용자 지시 — 최우선]\n' + directives.map(function(d,i){ return (i+1) + '. ' + d.directive; }).join('\n');
    }
  } catch(e) { /* 지시 없음 무시 */ }

  // 메시지: 신규 작성 vs 기존 초안 말로 수정(다회 대화)
  var messages;
  if (opts.reviseInstruction) {
    messages = [
      { role:'user', content: '다음 주제로 보고서 초안을 작성해줘:\n' + userText },
      { role:'assistant', content: opts.priorDraft || lastReportDraftText || '' },
      { role:'user', content: '위 초안을 아래 지시대로 수정해서, 전체 보고서를 완성본으로 다시 출력해줘(설명 없이 보고서 본문만):\n' + opts.reviseInstruction }
    ];
  } else {
    messages = [{ role:'user', content: '다음 주제로 보고서 초안을 작성해줘:\n' + userText }];
  }

  var res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'x-api-key':claudeKey, 'anthropic-version':'2023-06-01', 'content-type':'application/json', 'anthropic-dangerous-direct-browser-access':'true' },
    body: JSON.stringify({
      model:'claude-sonnet-4-6', max_tokens:16384, stream:true,
      system: system,
      tools:[{ type:'web_search_20250305', name:'web_search', max_uses:3 }],
      messages: messages
    })
  });
  if (!res.ok) {
    var err = await res.json().catch(function(){ return {}; });
    throw new Error((err.error && err.error.message) || 'API 오류 (HTTP ' + res.status + ')');
  }

  // ── SSE 파싱 (callClaude와 동일 로직) ──
  var aiText = '';
  var cited = [];
  var seenUrl = new Set();
  function addCitation(c){ if (c && c.url && !seenUrl.has(c.url)) { seenUrl.add(c.url); cited.push({ url:c.url, title:c.title||c.url }); } }
  var reader = res.body.getReader();
  var decoder = new TextDecoder('utf-8');
  var buf = '';
  while (true) {
    var chunk = await reader.read();
    if (chunk.done) break;
    buf += decoder.decode(chunk.value, { stream:true });
    var events = buf.split(/\r?\n\r?\n/);
    buf = events.pop();
    for (var ei=0; ei<events.length; ei++) {
      var lines = events[ei].split(/\r?\n/);
      for (var li=0; li<lines.length; li++) {
        var line = lines[li];
        if (line.indexOf('data:') !== 0) continue;
        var payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        var evt; try { evt = JSON.parse(payload); } catch(e) { continue; }
        if (evt.type === 'content_block_delta' && evt.delta) {
          if (evt.delta.type === 'text_delta' && evt.delta.text) {
            aiText += evt.delta.text;
            if (typeof onDelta === 'function') onDelta(aiText);
          } else if (evt.delta.type === 'citations_delta' && evt.delta.citation) {
            addCitation(evt.delta.citation);
          }
        } else if (evt.type === 'content_block_start' && evt.content_block) {
          (evt.content_block.citations || []).forEach(addCitation);
        } else if (evt.type === 'error') {
          throw new Error((evt.error && evt.error.message) || '스트리밍 오류');
        }
      }
    }
  }
  if (cited.length > 0) {
    cited.slice(0,5).forEach(function(c){ lastReportDraftSources.push(c.title); });
  }
  return aiText;
}

// 초안 생성 UI 오케스트레이션
async function onGenerateDraft() {
  var reqEl = document.getElementById('report-req-input');
  var typeEl = document.getElementById('report-gen-type');
  var outEl = document.getElementById('report-draft-output');
  var actionsEl = document.getElementById('report-draft-actions');
  var btn = document.getElementById('report-gen-btn');
  var userText = (reqEl && reqEl.value || '').trim();
  if (!userText) { alert('어떤 보고서를 만들지 입력하세요. 예: 주파수 재할당 관련 정책검토 보고서 초안 만들어줘'); return; }
  if (!getConfig().claudeKey) { alert('Claude API 키가 설정되지 않았습니다.'); return; }
  var reportType = (typeEl && typeEl.value) || '';
  if (reportType === '전체') reportType = '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> 생성 중...'; }
  if (actionsEl) actionsEl.style.display = 'none';
  if (outEl) outEl.innerHTML = '<div style="color:var(--text-secondary);font-size:12px">내 보고서 형식 + 법령·자료를 결합해 초안을 작성 중입니다... (웹검색 포함 시 1~2분 소요, 실시간 표시)</div>';
  lastReportDraftReq = userText;
  lastReportDraftText = '';
  lastReportFinal = '';
  var editArea = document.getElementById('report-edit-area'); if (editArea) editArea.style.display = 'none';
  var promoBtn = document.getElementById('report-promote-btn'); if (promoBtn) promoBtn.style.display = 'none';
  var reviseRow = document.getElementById('report-revise-row'); if (reviseRow) reviseRow.style.display = 'none';
  var noteEl = document.getElementById('report-feedback-note'); if (noteEl) noteEl.textContent = '';
  try {
    var text = await callReportDraft(userText, reportType, function(partial){
      lastReportDraftText = partial;
      if (outEl) outEl.innerHTML = renderMd(partial);
    });
    lastReportDraftText = text;
    if (outEl) {
      var srcHtml = '';
      if (lastReportDraftSources.length > 0) {
        var uniq = lastReportDraftSources.filter(function(v,i,a){ return a.indexOf(v)===i; }).slice(0,10);
        srcHtml = '<div style="margin-top:14px;padding-top:10px;border-top:0.5px solid var(--border-light);font-size:11px;color:var(--text-muted)">참고: ' + uniq.map(escHtml).join(' · ') + '</div>';
      }
      outEl.innerHTML = renderMd(text) + srcHtml;
    }
    if (actionsEl) actionsEl.style.display = 'flex';
    if (reviseRow) reviseRow.style.display = 'flex';
  } catch(e) {
    if (outEl) outEl.innerHTML = '<div style="color:#dc2626;font-size:12px">생성 실패: ' + escHtml(e.message || String(e)) + '</div>';
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-sparkles"></i> 초안 생성'; }
  }
}

// 말로 지시해서 고치기 — scope: 'once'(이번만) / 'always'(영구 지시 저장)
async function onReviseDraft(scope) {
  if (!lastReportDraftText) { alert('먼저 초안을 생성하세요.'); return; }
  var inp = document.getElementById('report-revise-input');
  var instruction = (inp && inp.value || '').trim();
  if (!instruction) { alert('어떻게 고칠지 입력하세요. 예: 결론을 앞으로 빼고 3문단으로 줄여줘'); return; }
  if (!getConfig().claudeKey) { alert('Claude API 키가 설정되지 않았습니다.'); return; }
  var outEl = document.getElementById('report-draft-output');
  var actionsEl = document.getElementById('report-draft-actions');
  var reviseRow = document.getElementById('report-revise-row');
  var onceBtn = document.getElementById('report-revise-once-btn');
  var alwaysBtn = document.getElementById('report-revise-always-btn');
  var note = document.getElementById('report-feedback-note');
  var reportType = ((document.getElementById('report-gen-type') || {}).value) || '';
  if (reportType === '전체') reportType = '';
  if (onceBtn) onceBtn.disabled = true;
  if (alwaysBtn) alwaysBtn.disabled = true;
  // '항상 적용'이면 영구 지시로 저장 (이후 모든 초안에 주입)
  if (scope === 'always') {
    try {
      await sb.from('report_directives').insert({ directive: instruction });
      if (note) note.textContent = '📌 "항상 적용" 지시로 저장됨 — 이후 모든 초안에 반영됩니다.';
      loadReportDirectives();
    } catch(e) { console.warn('지시 저장 실패:', e); }
  }
  var prior = lastReportDraftText;
  if (actionsEl) actionsEl.style.display = 'none';
  if (outEl) outEl.innerHTML = '<div style="color:var(--text-secondary);font-size:12px">지시대로 초안을 수정 중입니다... (실시간 표시)</div>';
  try {
    var text = await callReportDraft(lastReportDraftReq, reportType, function(partial){
      lastReportDraftText = partial;
      if (outEl) outEl.innerHTML = renderMd(partial);
    }, { reviseInstruction: instruction, priorDraft: prior });
    lastReportDraftText = text;
    if (outEl) {
      var srcHtml = '';
      if (lastReportDraftSources.length > 0) {
        var uniq = lastReportDraftSources.filter(function(v,i,a){ return a.indexOf(v)===i; }).slice(0,10);
        srcHtml = '<div style="margin-top:14px;padding-top:10px;border-top:0.5px solid var(--border-light);font-size:11px;color:var(--text-muted)">참고: ' + uniq.map(escHtml).join(' · ') + '</div>';
      }
      outEl.innerHTML = renderMd(text) + srcHtml;
    }
    if (inp) inp.value = '';
    if (actionsEl) actionsEl.style.display = 'flex';
    if (note && scope !== 'always') note.textContent = '✏️ 지시대로 수정했습니다. 이어서 더 고치거나 채택하세요.';
  } catch(e) {
    if (outEl) outEl.innerHTML = '<div style="color:#dc2626;font-size:12px">수정 실패: ' + escHtml(e.message || String(e)) + '</div>';
    if (actionsEl) actionsEl.style.display = 'flex';
  } finally {
    if (onceBtn) onceBtn.disabled = false;
    if (alwaysBtn) alwaysBtn.disabled = false;
  }
}

// 영구 지시 목록 렌더 / 삭제
async function loadReportDirectives() {
  var el = document.getElementById('report-directives-list');
  if (!el || !sb) return;
  var rows = (await sb.from('report_directives').select('id,directive,created_at')
    .order('created_at', { ascending:false }).limit(50)).data || [];
  if (rows.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = '<div style="font-size:11px;color:var(--text-secondary);margin:6px 0 4px">항상 적용 중인 지시 (' + rows.length + ')</div>' +
    rows.map(function(r){
      return '<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:var(--bg-secondary);border:0.5px solid var(--border-light);border-radius:var(--radius-md);margin-bottom:4px">'
        + '<span style="flex:1;font-size:11px;color:var(--text-primary)">📌 ' + escHtml(r.directive) + '</span>'
        + '<button class="btn" style="font-size:10px;padding:2px 6px" onclick="onDeleteDirective(' + r.id + ')">삭제</button>'
        + '</div>';
    }).join('');
}
async function onDeleteDirective(id) {
  if (!sb) return;
  await sb.from('report_directives').delete().eq('id', id);
  loadReportDirectives();
}

// DOCX(간편) 내보내기 — HTML→Blob(.doc)
function exportReportDraftDoc() {
  if (!lastReportDraftText) { alert('먼저 초안을 생성하세요.'); return; }
  var bodyHtml = renderMd(lastReportDraftText);
  var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">'
    + '<head><meta charset="utf-8"><title>보고서 초안</title></head>'
    + '<body style="font-family:맑은 고딕,Malgun Gothic,sans-serif;font-size:11pt;line-height:1.7">'
    + bodyHtml + '</body></html>';
  var blob = new Blob(['﻿', html], { type:'application/msword' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  var fname = (lastReportDraftReq || '보고서초안').replace(/[\\/:*?"<>|]/g,'').slice(0,30);
  a.href = url; a.download = fname + '_초안.doc';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
}

// 👍/👎 — 약한 신호. 임계 도달 시 자동 재증류에 반영됨
async function submitReportFeedback(rating) {
  if (!lastReportDraftText || !sb) return;
  await sb.from('report_feedback').insert({
    request: lastReportDraftReq, draft: lastReportDraftText, rating: rating
  });
  var fb = document.getElementById('report-feedback-note');
  if (fb) { fb.textContent = rating > 0 ? '👍 피드백 저장됨 — 감사합니다.' : '👎 피드백 저장됨 — 다음 초안 개선에 반영합니다.'; }
  // 부정 평가 등이 임계(+2건) 넘으면 자동 재학습
  try {
    var rules = await distillReportStyle(false);
    var box = document.getElementById('report-style-rules-box');
    if (box && rules && box.style.display === 'block') box.textContent = rules;
  } catch(e) { /* 자동 학습 실패는 조용히 무시 */ }
}

// ── v3 빨간펜 학습: 초안을 고쳐 "최종본 채택" → 초안↔최종본 차이를 학습 ──
function startEditDraft() {
  if (!lastReportDraftText) { alert('먼저 초안을 생성하세요.'); return; }
  var area = document.getElementById('report-edit-area');
  var ta = document.getElementById('report-final-input');
  if (ta) ta.value = lastReportDraftText;   // 초안 원문(마크다운 평문)을 그대로 편집
  if (area) area.style.display = 'block';
  var promo = document.getElementById('report-promote-btn'); if (promo) promo.style.display = 'none';
  if (ta) { ta.focus(); ta.scrollIntoView({ behavior:'smooth', block:'nearest' }); }
}

function cancelEditDraft() {
  var area = document.getElementById('report-edit-area');
  if (area) area.style.display = 'none';
}

async function saveReportFinal() {
  if (!sb) { alert('Supabase 연결이 필요합니다.'); return; }
  var ta = document.getElementById('report-final-input');
  var finalText = (ta && ta.value || '').trim();
  if (finalText.replace(/\s/g,'').length < 30) { alert('최종본 내용이 너무 짧습니다.'); return; }
  lastReportFinal = finalText;
  var btn = document.getElementById('report-final-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
  await sb.from('report_feedback').insert({
    request: lastReportDraftReq, draft: lastReportDraftText, final: finalText, rating: 1
  });
  var note = document.getElementById('report-feedback-note');
  if (note) note.textContent = '✅ 최종본 저장됨 — 초안과의 차이를 학습합니다.';
  // 자동 재증류(임계 도달 시) + 스타일 박스 갱신
  try {
    var rules = await distillReportStyle(false);
    var box = document.getElementById('report-style-rules-box');
    if (box && rules) { box.style.display = 'block'; box.textContent = rules; }
  } catch(e) { console.warn('재학습 실패:', e); }
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-check"></i> 최종본 채택'; }
  cancelEditDraft();
  var promo = document.getElementById('report-promote-btn'); if (promo) promo.style.display = 'inline-flex';
}

// 채택한 최종본을 예시 보고서(report_samples)로 승격 (선택)
async function promoteFinalToSample() {
  if (!lastReportFinal) { alert('먼저 최종본을 채택하세요.'); return; }
  var title = (lastReportDraftReq || '채택 보고서').replace(/\s+/g,' ').trim().slice(0,40);
  var type = ((document.getElementById('report-gen-type') || {}).value) || '';
  if (type === '전체') type = '';
  var ok = await addReportSample(title, type, lastReportFinal, '');
  if (ok) {
    var note = document.getElementById('report-feedback-note');
    if (note) note.textContent = '📌 예시 보고서로 추가됨 — PC에서 backfill_report_embeddings.py 실행 시 의미검색에 반영됩니다.';
    try { await distillReportStyle(false); } catch(e) { console.warn('보고서 스타일 재증류 실패(다음 등록 때 재시도됨):', e); }
    var promo = document.getElementById('report-promote-btn'); if (promo) promo.style.display = 'none';
  }
}

// ════════════════════════════════════════════
//  앱 초기화 (DOCX 업로드 지원 — mammoth)
// ════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  initSupabase();
  updateStatusDots();
  loadSettingsUI();
  loadPressJSON();
  loadRemoteConfig().then(function() { currentNewsSourceType = 'media'; loadNews(); });
  setTimeout(autoExtractTermsIfNeeded, 60000);
});
