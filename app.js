// ════════════════════════════════════════════
//  SKT 전파정책 AI 분석 — 공통 시스템 프롬프트
// ════════════════════════════════════════════
const SKT_IMPACT_SYSTEM_PROMPT =
'당신은 SK텔레콤 CR센터 기술정책팀 소속 전파정책 수석 전문위원이다.\n' +
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
'<priority>즉시대응/금주검토/동향파악 중 하나</priority>';

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
//  RAG — 키워드 기반 Supabase 검색 (Voyage AI 불필요)
// ════════════════════════════════════════════
let lastRagSources = [];

function extractKeywords(text) {
  // 한국어 조사·어미·불용어 제거
  var stopwords = ['이','가','은','는','을','를','의','에','에서','으로','로','과','와','도',
    '만','그','이것','저것','그것','있다','없다','하다','되다','이다','어떻게','어떤',
    '무엇','언제','어디','왜','누가','대해','관해','통해','위해','따라','대한','관한',
    '통한','위한','있는','없는','하는','되는','인','이란','이라는','라는','라고',
    '이고','이며','하고','이나','이나','또는','그리고','하지만','그러나','따라서'];
  var words = text.split(/[\s,\.·\·\(\)\[\]\「\」\『\』\<\>\:;\!\?]+/)
    .map(function(w) { return w.replace(/[^가-힣a-zA-Z0-9\.]/g, '').trim(); })
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

async function searchKeywords(query, lawOnly) {
  if (!sb) return [];
  if (lawOnly === undefined) lawOnly = false;
  var keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  var seen = new Set();
  var results = [];

  // 키워드별로 검색 (최대 3개 키워드)
  for (var ki = 0; ki < Math.min(keywords.length, 3); ki++) {
    var kw = keywords[ki];
    if (kw.length < 2) continue;
    try {
      var resp = await sb
        .from('document_chunks')
        .select('id, doc_name, doc_category, content')
        .ilike('content', '%' + kw + '%')
        .limit(3);
      if (resp.data) {
        for (var ri = 0; ri < resp.data.length; ri++) {
          var row = resp.data[ri];
          if (!seen.has(row.id)) {
            seen.add(row.id);
            results.push(row);
          }
        }
      }
    } catch(e) { console.warn('키워드 검색 오류:', kw, e); }
  }
  console.log('키워드 검색:', keywords.slice(0,3).join(', '), '->', results.length + '개 청크');
  return results.slice(0, 5);
}

function buildRagContext(chunks) {
  if (!chunks || chunks.length === 0) return '';
  const items = chunks.map(function(c, i) {
    var sim = c.similarity ? ' (유사도: ' + (c.similarity * 100).toFixed(0) + '%)' : '';
    return '[참조 ' + (i+1) + '] 출처: ' + c.doc_name + ' (' + c.doc_category + ')' + sim + '\n' + c.content;
  });
  return '\n\n---\n\n[RAG 검색 결과 — 질문과 관련된 실제 법령·고시 원문]\n아래 내용은 질문과 의미적으로 유사한 문서 청크를 검색한 결과입니다. 반드시 아래 원문을 최우선으로 인용하고, 조항 번호와 내용이 일치하는지 확인하여 답변하세요:\n\n' + items.join('\n\n---\n\n');
}

// ════════════════════════════════════════════
//  Claude API
// ════════════════════════════════════════════
let chatHistory = [];
let isSending = false;



// ════════════════════════════════════════════
//  기술 용어 — 뉴스에서 자동 추출 (수동 실행)
// ════════════════════════════════════════════
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

    // 기존 용어 목록
    var existingResp = await sb.from('tech_terms').select('term').limit(500);
    var existingTerms = (existingResp.data || []).map(function(t) { return t.term.toLowerCase(); });

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
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (!t.term || existingTerms.includes(t.term.toLowerCase())) { skipped++; continue; }
      var r = await sb.from('tech_terms').insert({
        term: t.term, term_en: t.term_en||'', category: t.category||'기타',
        definition: t.definition||'', source: t.source||'뉴스 자동 추출', is_reviewed: false
      });
      if (!r.error) { saved++; existingTerms.push(t.term.toLowerCase()); }
      else skipped++;
    }

    alert('완료! 신규 용어 ' + saved + '건 저장, ' + skipped + '건 중복/스킵');
    if (saved > 0) loadTerms(); // 목록 새로고침
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
      .gte('published_at', cutoffStr)
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
            .gte('published_at', cutoffStr)
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
//  추가 지식 — custom_knowledge 검색 및 CRUD
// ════════════════════════════════════════════
async function searchCustomKnowledge(query) {
  if (!sb || !query) return '';
  try {
    var keywords = extractKeywords(query);
    if (keywords.length === 0) return '';
    var seen = new Set();
    var results = [];
    for (var ki = 0; ki < Math.min(keywords.length, 3); ki++) {
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
      } catch(e) {}
      if (results.length >= 3) break;
    }
    if (results.length === 0) return '';
    var lines = ['\n\n[팀 내부 추가 지식 — 검증 완료]'];
    results.slice(0, 3).forEach(function(r, i) {
      var excerpt = (r.content || '').slice(0, 800);
      lines.push('■ [' + (r.category || '일반') + '] ' + r.title);
      lines.push('  ' + excerpt + (r.content.length > 800 ? '...' : ''));
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

async function callClaude(userText) {
  const { claudeKey } = getConfig();
  if (!claudeKey) throw new Error('Claude API 키가 설정되지 않았습니다. 설정 탭에서 입력해주세요.');

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

  // 시스템 프롬프트에 컨텍스트 조합
  const ragContext    = buildRagContext(ragChunks);
  const customContext = await searchCustomKnowledge(userText);   // 팀 내부 추가 지식
  const newsContext   = await fetchRecentNewsContext(userText);  // 뉴스 본문+제목
  const systemWithRag = SYSTEM_PROMPT + ragContext + customContext + newsContext;

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
      max_tokens: 4096,
      system: systemWithRag,
      messages: chatHistory
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    chatHistory.pop();
    throw new Error(err.error?.message || 'API 오류 (HTTP ' + res.status + ')');
  }

  const data = await res.json();
  const aiText = data.content[0].text;
  chatHistory.push({ role: 'assistant', content: aiText });
  return aiText;
}

// ════════════════════════════════════════════
//  Chat UI
// ════════════════════════════════════════════
function renderMd(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .split('\n\n').map(p => p ? `<p>${p.replace(/\n/g,'<br>')}</p>` : '').join('');
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

  try {
    const answer = await callClaude(text);
    loader.remove();
    const msgEl = appendMsg('ai', answer);

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

    if (sb) {
      try {
        await sb.from('chat_logs').insert({
          question: text,
          answer: answer,
          category: detectCategory(text),
          sources: lastRagSources
        });
      } catch(e) {}
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
      .select('question, category, created_at')
      .order('created_at', { ascending: false })
      .limit(3);

    if (logs && logs.length > 0) {
      const container = document.getElementById('recent-logs');
      container.innerHTML = logs.map(l => {
        const date = new Date(l.created_at).toLocaleDateString('ko-KR', {month:'2-digit',day:'2-digit'});
        const catColor = { '주파수':'badge-purple','전자파':'badge-blue','ITU-R':'badge-blue','적합성평가':'badge-teal','기술기준':'badge-teal','일반':'badge-amber' };
        return `<div class="card" style="cursor:default;margin-bottom:8px">
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
let newsDataCache = [];      // 전체 로드된 뉴스 캐시
let selectedNewsId = null;   // 현재 선택된 뉴스 id

// ── 중요도 분류 규칙 ──────────────────────────────────────
// SKT CR센터 기술정책팀 KPI 기준으로 키워드 매핑
var IMPORTANCE_RULES = {
  긴급: {
    color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: '2px solid #ef4444',
    label: '🔴 긴급', badge_class: 'badge-red',
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
      .order('published_at', { ascending: false, nullsFirst: false }).limit(50);
    newsDataCache = data || [];
    // 중요도 분류 (캐시에 저장)
    newsDataCache.forEach(function(n) { n._importance = classifyNewsImportance(n); });
    renderNewsList();
  } catch(e) {
    console.warn('News load error:', e);
    var el = document.getElementById('news-list');
    if (el) el.innerHTML = '<div style="color:var(--text-secondary);padding:20px;text-align:center;font-size:12px">뉴스 로드 실패: ' + e.message + '</div>';
  }
}

function renderNewsList() {
  var data = currentNewsFilter === '전체'
    ? newsDataCache
    : newsDataCache.filter(function(n) { return n._importance === currentNewsFilter; });

  // 날짜 내림차순 정렬
  var sorted = data.slice().sort(function(a, b) {
    return new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at);
  });

  var listEl = document.getElementById('news-list');
  if (!listEl) return;

  if (sorted.length === 0) {
    listEl.innerHTML = '<div style="color:var(--text-secondary);padding:24px;text-align:center;font-size:12px">해당 중요도의 뉴스가 없습니다.</div>';
    return;
  }

  listEl.innerHTML = sorted.map(function(n) {
    var rule = IMPORTANCE_RULES[n._importance] || IMPORTANCE_RULES['참고'];
    var date = new Date(n.published_at || n.created_at).toLocaleDateString('ko-KR', {month:'2-digit', day:'2-digit'});
    var isSelected = String(n.id) === String(selectedNewsId);
    var urlIcon = n.url
      ? ' <a href="' + n.url + '" target="_blank" onclick="event.stopPropagation()" style="color:var(--accent);font-size:11px;vertical-align:middle"><i class="ti ti-external-link"></i></a>'
      : '';
    return '<div class="news-item" onclick="showNewsDetail(\'' + n.id + '\')" style="cursor:pointer;border-left:' + rule.border + ';' + (isSelected ? 'background:var(--bg-secondary);border-radius:var(--radius-md)' : '') + '">' +
      '<div class="news-dot ' + (n.is_read ? 'dot-read' : 'dot-new') + '"></div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">' +
          '<span style="font-size:10px;font-weight:700;color:' + rule.color + ';background:' + rule.bg + ';padding:1px 7px;border-radius:4px">' + rule.label + '</span>' +
          '<span style="font-size:11px;color:var(--text-tertiary)">' + date + '</span>' +
          (n.source ? '<span style="font-size:10px;color:var(--text-tertiary);margin-left:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80px">' + n.source + '</span>' : '') +
        '</div>' +
        '<div class="news-title" style="font-size:13px;line-height:1.5">' + n.title + urlIcon + '</div>' +
        (n.summary ? '<div class="news-meta" style="margin-top:3px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + n.summary.slice(0,60) + (n.summary.length>60?'…':'') + '</div>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

function filterNewsByImportance(el, importance) {
  document.querySelectorAll('#news-filter-tabs .tag').forEach(function(t) { t.classList.remove('selected'); });
  el.classList.add('selected');
  currentNewsFilter = importance;
  renderNewsList();
}

// ── 뉴스 상세 패널 ─────────────────────────────────────────
function showNewsDetail(newsId) {
  selectedNewsId = newsId;
  var n = newsDataCache.find(function(x) { return String(x.id) === String(newsId); });
  if (!n) return;

  // 목록 선택 표시 업데이트
  renderNewsList();

  var rule   = IMPORTANCE_RULES[n._importance] || IMPORTANCE_RULES['참고'];
  var date   = (n.published_at || n.created_at || '').slice(0, 10);
  var urlBtn = n.url
    ? '<a href="' + n.url + '" target="_blank" class="btn" style="font-size:11px;padding:4px 10px;text-decoration:none"><i class="ti ti-external-link"></i> 원문 보기</a>'
    : '';

  var html =
    // 헤더: 중요도 + 제목
    '<div style="border-left:3px solid ' + rule.color + ';padding-left:10px;margin-bottom:14px">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">' +
        '<span style="font-size:11px;font-weight:700;color:' + rule.color + ';background:' + rule.bg + ';padding:2px 8px;border-radius:4px">' + rule.label + '</span>' +
        '<span style="font-size:11px;color:var(--text-tertiary)">' + date + '</span>' +
        (urlBtn ? '<div style="margin-left:auto">' + urlBtn + '</div>' : '') +
      '</div>' +
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

  // ② 본문이 없으면 API 호출하지 않고 안내 메시지 표시
  var bodySnippet = (n.content || '').replace(/\s+/g, ' ').trim().slice(0, 3000);
  if (!bodySnippet) {
    box.innerHTML = '<span style="color:var(--text-tertiary);font-size:11px">본문이 수집되지 않은 기사입니다. 원문 보기를 통해 직접 확인해 주세요.</span>';
    return;
  }

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
      (bodySnippet ? '\n\n본문:\n' + bodySnippet : '');

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
  } catch(e) {
    console.warn('영향도 분석 오류:', e);
    if (box) { box.innerHTML = '<span style="color:var(--text-tertiary);font-size:11px">분석 실패 (' + e.message + ') — AI 자문에서 직접 질문해 주세요.</span>'; }
  }
}

async function markRead(id) {
  if (sb) { try { await sb.from('news_feed').update({ is_read: true }).eq('id', id); } catch(e) {} }
}

// 구 filterNews 호환용 (혹시 다른 곳에서 호출 시)
function filterNews(el, cat) { filterNewsByImportance(el, cat); }

// ════════════════════════════════════════════
//  법령 DIFF 분석
// ════════════════════════════════════════════
var diffState = { before: null, after: null };  // { text, name }

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
      pages.push(content.items.map(function(item) { return item.str; }).join(' '));
    }
    return pages.join('\n');
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

  // 첫 50자를 키로 사용해 추가/삭제 분류
  function key(s) { return s.replace(/\s+/g,' ').slice(0,60); }
  var bKeys = new Set(bChunks.map(key));
  var aKeys = new Set(aChunks.map(key));

  var removed  = bChunks.filter(function(c) { return !aKeys.has(key(c)); });
  var added    = aChunks.filter(function(c) { return !bKeys.has(key(c)); });

  return { removed: removed, added: added };
}

function _renderDiffView(diffResult) {
  var el = document.getElementById('diff-view');
  if (!el) return;
  var removed = diffResult.removed;
  var added   = diffResult.added;

  if (removed.length === 0 && added.length === 0) {
    el.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;padding:8px">변경된 조문이 자동 감지되지 않았습니다.<br>조문 형식이 다른 경우 아래 AI 분석 결과를 참고하세요.</div>';
    return;
  }

  function esc(t) { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  var html = '';

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

    // Claude 호출 (앞 4000자씩 — 실무 법령 기준 충분한 분량)
    var bExcerpt = diffState.before.text.slice(0, 4000);
    var aExcerpt = diffState.after.text.slice(0, 4000);

    var sysMsg =
      'SK텔레콤 CR센터 기술정책팀 전파정책 전문가 수석 위원. ' +
      '개정 전·후 법령 원문을 비교하여 SKT 사업에 미치는 영향을 구조적으로 분석한다. ' +
      '반드시 아래 XML 형식으로만 답변:\n' +
      '<summary>주요 변경사항 요약 (3~5줄, 조문 번호 포함)</summary>\n' +
      '<risks>SKT에 불리한 독소조항 (조문 번호·내용·이유 명시. 없으면 "없음")</risks>\n' +
      '<favorable>SKT에 유리한 조항 (조문 번호·내용·이유 명시. 없으면 "없음")</favorable>\n' +
      '<actions>팀 대응 액션 아이템 (각 항목을 || 로 구분)</actions>\n' +
      '<urgency>즉시대응/금주검토/중장기검토 중 하나</urgency>';

    var userMsg =
      '[파일명: ' + diffState.before.name + ' → ' + diffState.after.name + ']\n\n' +
      '[개정 전]\n' + bExcerpt + '\n\n' +
      '[개정 후]\n' + aExcerpt;

    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2500, system: sysMsg, messages: [{ role: 'user', content: userMsg }] })
    });
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
function renderPlainBulletItem(block) {
  var lines = block.split('\n');
  var out = '';
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (/^• /.test(l)) {
      out += '<div style="font-size:13px;line-height:1.8;padding-left:2px">• ' + l.replace(/^• /, '') + '</div>';
    } else if (/^  → /.test(l)) {
      out += '<div style="font-size:12px;color:var(--text-secondary);padding-left:16px;line-height:1.6">→ ' + l.replace(/^  → /, '') + '</div>';
    } else if (/^  🔗 /.test(l)) {
      var url = l.replace(/^  🔗 /, '').trim();
      out += '<div style="padding-left:16px;font-size:12px;margin-top:2px"><a href="' + url + '" target="_blank" style="color:var(--accent);text-decoration:none">🔗 원문 보기</a></div>';
    } else if (l.trim()) {
      out += '<div style="font-size:13px;line-height:1.8">' + l + '</div>';
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
      // 분류는 원본 텍스트 기준
      var importance = classifyBriefingItemImportance(rawBlock);
      // 렌더링은 이스케이프된 텍스트 기준
      var escBlock = rawItemLines.map(function(l){ return esc(l); }).join('\n');
      output.push(renderBriefingNewsItem(escBlock, importance, briefingIdx, itemIdx));
      if (importance === '긴급') {
        urgentCount++;
        // 제목 추출 (원본)
        var titleRaw = '';
        for (var i = 0; i < rawItemLines.length; i++) {
          if (/^• /.test(rawItemLines[i])) { titleRaw = rawItemLines[i].replace(/^• /, ''); break; }
        }
        urgentItems.push({ elemId: 'bi-' + briefingIdx + '-' + itemIdx, title: titleRaw });
      }
    } else {
      var escBlock = rawItemLines.map(function(l){ return esc(l); }).join('\n');
      output.push(renderPlainBulletItem(escBlock));
    }
    itemIdx++;
    rawItemLines = [];
  }

  for (var li = 0; li < rawLines.length; li++) {
    var line = rawLines[li];
    var trimmed = line.trim();

    // 섹션 헤더 [주요 뉴스], [주목 포인트], [기술 용어] 등
    if (/^\[.+\]$/.test(trimmed)) {
      flushItem();
      currentSection = /뉴스|news/i.test(trimmed) ? 'news' : 'other';
      output.push('<div style="font-weight:600;font-size:12px;color:var(--text-secondary);margin:14px 0 8px;letter-spacing:0.04em">' + esc(trimmed) + '</div>');
      continue;
    }
    // 제목 헤더 (📡)
    if (/^📡/.test(line)) {
      flushItem();
      output.push('<div style="font-size:15px;font-weight:700;color:var(--accent);margin-bottom:12px">' + esc(line) + '</div>');
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
    // 일반 텍스트
    if (rawItemLines.length > 0) {
      rawItemLines.push(line);
    } else {
      output.push(trimmed ? '<div style="font-size:13px;line-height:1.8">' + esc(line) + '</div>' : '<div style="height:4px"></div>');
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

  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (/^• /.test(l)) {
      titleLine = l.replace(/^• /, '');
    } else if (/^  🔗 /.test(l)) {
      linkUrl = l.replace(/^  🔗 /, '').trim();
    } else if (/^  → /.test(l)) {
      summaryLines.push(l.replace(/^  → /, '').trim());
    }
  }

  var titleHtml = '<span data-news-title="1" style="font-weight:500;font-size:13px;line-height:1.6">' + titleLine + '</span>';
  var summaryHtml = summaryLines.map(function(s) {
    return '<div style="font-size:12px;color:var(--text-secondary);padding-left:4px;margin-top:3px;line-height:1.6">→ ' + s + '</div>';
  }).join('');
  var linkHtml = linkUrl
    ? '<div style="margin-top:6px"><a href="' + linkUrl + '" target="_blank" style="font-size:12px;color:var(--accent);text-decoration:none">🔗 원문 보기</a></div>'
    : '';

  var analysisId = 'bi-' + briefingIdx + '-' + itemIdx;

  if (importance === '긴급') {
    var rule = IMPORTANCE_RULES['긴급'];
    return '<div style="border:2px solid ' + rule.color + ';border-radius:10px;padding:12px 14px;margin-bottom:10px;background:' + rule.bg + '">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
      +   '<span style="background:' + rule.color + ';color:#fff;font-size:10px;font-weight:700;padding:2px 9px;border-radius:5px;flex-shrink:0">' + rule.label + '</span>'
      +   '<span style="font-size:11px;color:' + rule.color + ';font-weight:500">' + rule.desc + '</span>'
      + '</div>'
      + '<div style="margin-bottom:6px">' + titleHtml + '</div>'
      + summaryHtml
      + linkHtml
      + '<div id="' + analysisId + '" data-briefing-analysis="1" style="margin-top:10px;padding:10px 12px;background:rgba(239,68,68,0.06);border-radius:8px;border:1px solid rgba(239,68,68,0.2)">'
      +   '<div style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text-secondary)">'
      +     '<span style="display:inline-block;width:12px;height:12px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></span>'
      +     'AI 영향도 분석 중...'
      +   '</div>'
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
      const isToday = b.briefing_date === new Date().toISOString().slice(0,10);
      const parsed = allParsed[idx];
      const contentHtml = parsed.html;
      const urgentCount = parsed.urgentCount;
      const badgeHtml = isToday ? '<span style="background:var(--accent);color:#fff;font-size:10px;padding:2px 7px;border-radius:10px;margin-left:8px">오늘</span>' : '';
      const urgentBadge = urgentCount > 0
        ? '<span style="background:#ef4444;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;margin-left:6px">🔴 긴급 ' + urgentCount + '건</span>'
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
const ADMIN_PWD = 'skt2026!';  // ← 비밀번호 변경 시 이 값을 수정하세요

function checkAdminPwd() {
  var input = document.getElementById('admin-pwd-input').value;
  var errEl = document.getElementById('admin-pwd-error');
  if (input === ADMIN_PWD) {
    sessionStorage.setItem('admin_auth', '1');
    document.getElementById('settings-locked').style.display = 'none';
    document.getElementById('settings-unlocked').style.display = 'block';
    document.getElementById('system-prompt-display').value = SYSTEM_PROMPT;
    loadSettingsFields();
    if (errEl) errEl.style.display = 'none';
  } else {
    if (errEl) errEl.style.display = 'block';
    document.getElementById('admin-pwd-input').value = '';
  }
}

function lockAdmin() {
  sessionStorage.removeItem('admin_auth');
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
  if (ragStatus) ragStatus.textContent = ragOk ? 'RAG 활성 (키워드 검색)' : 'RAG 키워드 검색';
}

// ════════════════════════════════════════════
//  Navigation
// ════════════════════════════════════════════
function go(page, navEl) {
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  var panel = document.getElementById('panel-' + page);
  if (panel) panel.classList.add('active');
  if (navEl && navEl.classList) navEl.classList.add('active');

  // 상단 바 제목 업데이트
  var titles = {home:'대시보드', chat:'AI 자문', diff:'법령 DIFF 분석', law:'국내 법령·고시', itu:'ITU-R 문서', press:'정부 보도자료', terms:'기술 용어', news:'보도자료·뉴스', briefing:'Daily Briefing', settings:'설정'};
  var ttEl = document.getElementById('topbar-title');
  if (ttEl && titles[page]) ttEl.textContent = titles[page];

  // 모바일 하단 네비 동기화
  var pageTobn = {home:'bn-more', chat:'bn-chat', law:'bn-law', itu:'bn-law', press:'bn-law', custom:'bn-law', terms:'bn-terms', news:'bn-monitor', briefing:'bn-monitor', settings:'bn-more'};
  if (pageTobn[page]) setBottomNav(pageTobn[page]);

  if (page === 'news') loadNews();
  if (page === 'briefing') loadBriefing();
  if (page === 'settings') loadSettingsUI();
  if (page === 'press') loadPressFromSupabase();
  if (page === 'terms') loadTerms();
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
//  보도자료 — 원본 JSON 파일 검색
// ════════════════════════════════════════════
let pressData = null;  // press_releases.json 로드 후 저장

async function loadPressJSON() {
  if (pressData) return;
  try {
    const res = await fetch('press_releases.json');
    pressData = await res.json();
    console.log('보도자료 로드 완료:', pressData.length + '개');
    renderPressList();
  } catch(e) { console.warn('보도자료 JSON 로드 실패:', e); }
}

function renderPressList(filtered) {
  const listEl = document.getElementById('press-list');
  if (!listEl || !pressData) return;

  // 통계 업데이트
  var t2026 = pressData.filter(d => d.date.startsWith('2026')).length;
  var t2025 = pressData.filter(d => d.date.startsWith('2025')).length;
  var tOld  = pressData.filter(d => !d.date.startsWith('2025') && !d.date.startsWith('2026')).length;
  var el;
  el = document.getElementById('ps-total'); if(el) el.textContent = pressData.length;
  el = document.getElementById('ps-2026');  if(el) el.textContent = t2026;
  el = document.getElementById('ps-2025');  if(el) el.textContent = t2025;
  el = document.getElementById('ps-old');   if(el) el.textContent = tOld;

  // 표시할 데이터
  var items = filtered || [...pressData].sort((a, b) => b.date.localeCompare(a.date));
  var label = document.getElementById('press-count-label');
  if (label) label.textContent = filtered ? '검색 결과 ' + items.length + '건' : '전체 보도자료 ' + items.length + '건';

  if (items.length === 0) {
    listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:12px">검색 결과가 없습니다.</div>';
    return;
  }

  listEl.innerHTML = items.map(function(d) {
    var year = d.date ? d.date.slice(0,4) : '';
    var badgeColor = year === '2026' ? 'badge-purple' : year === '2025' ? 'badge-teal' : 'badge-amber';
    var safeTitle = d.title.slice(0,30).replace(/['"&<>]/g,'');
    return '<div class="file-item" style="cursor:pointer" onclick="askQ(&quot;' + safeTitle + ' 보도자료 내용을 알려줘&quot;)">' +
      '<div class="file-icon fi-blue"><i class="ti ti-news"></i></div>' +
      '<div style="flex:1">' +
        '<div class="file-name">' + d.title.slice(0,55) + (d.title.length>55?'…':'') + '</div>' +
        '<div class="file-size">' + d.date + ' · 과기정통부</div>' +
      '</div>' +
      '<span class="badge ' + badgeColor + '">' + year + '</span>' +
      '</div>';
  }).join('');
}

function filterPressList(query) {
  var input = document.getElementById('press-search-input');
  if (input && query === '') input.value = '';
  if (!pressData) return;
  if (!query || query.trim() === '') {
    renderPressList(null);
    return;
  }
  var q = query.toLowerCase();
  var filtered = pressData.filter(function(d) {
    return d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q);
  }).sort((a, b) => b.date.localeCompare(a.date));
  renderPressList(filtered);
}

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
    var items = await loadCustomKnowledgeList();
    if (filterText) {
      var q = filterText.toLowerCase();
      items = items.filter(function(i) {
        return i.title.toLowerCase().includes(q) || (i.tags || []).join(' ').toLowerCase().includes(q);
      });
    }
    if (items.length === 0) {
      listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:12px">저장된 지식이 없습니다.</div>';
      return;
    }
    listEl.innerHTML = items.map(function(item) {
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
//  앱 초기화
// ════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  initSupabase();
  updateStatusDots();
  loadSettingsUI();
  loadPressJSON();
  loadRemoteConfig().then(function() { loadNews(); });
  setTimeout(autoExtractTermsIfNeeded, 60000);
});
