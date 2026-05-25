// ════════════════════════════════════════════
//  시스템 프롬프트
// ════════════════════════════════════════════

// ════════════════════════════════════════════
//  Config (localStorage)
// ════════════════════════════════════════════
const CFG_KEY = 'radio_policy_config';
function getConfig() { try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch(e) { return {}; } }
function saveConfig(c) { localStorage.setItem(CFG_KEY, JSON.stringify(c)); }

// ════════════════════════════════════════════
//  Supabase
// ════════════════════════════════════════════
let sb = null;
function initSupabase() {
  const { sbUrl, sbKey } = getConfig();
  if (sbUrl && sbKey) {
    try {
      sb = window.supabase.createClient(sbUrl, sbKey);
      return true;
    } catch(e) { return false; }
  }
  return false;
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
    var newsResp = await sb.from('news_feed').select('title,source,published_at').gte('published_at', cutoffStr).order('published_at', {ascending:false}).limit(30);
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

function openTermsModal(id) {
  var t = termsData.find(function(x) { return x.id === id; });
  if (!t) return;
  var catColor = {주파수:'badge-purple', 네트워크:'badge-teal', 위성:'badge-blue', 단말:'badge-amber', 규제:'badge-red', 기타:'badge-amber'};
  var cc = catColor[t.category] || 'badge-amber';
  var related = (t.related_terms||[]).map(function(r) {
    return '<span class="badge badge-amber" style="cursor:pointer" onclick="closeTermsModal();document.getElementById(&quot;terms-search-input&quot;).value=&quot;' + r + '&quot;;filterTerms(&quot;' + r + '&quot;)">' + r + '</span>';
  }).join(' ');

  var html = '<div style="margin-bottom:16px">' +
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">' +
      '<span style="font-size:20px;font-weight:700;color:var(--text-primary)">' + t.term + '</span>' +
      (t.term_en ? '<span style="font-size:13px;color:var(--text-secondary)">' + t.term_en + '</span>' : '') +
      '<span class="badge ' + cc + '">' + (t.category||'기타') + '</span>' +
    '</div>' +
    (t.source ? '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:10px">📌 출처: ' + t.source + '</div>' : '') +
  '</div>' +
  (t.definition ? '<div style="font-size:13px;font-weight:500;margin-bottom:12px;padding:10px 14px;background:var(--bg-secondary);border-radius:var(--radius-md)">' + t.definition + '</div>' : '') +
  (t.description ? '<div style="font-size:13px;color:var(--text-primary);line-height:1.7;margin-bottom:16px;white-space:pre-wrap">' + t.description + '</div>' : '') +
  (t.diagram_html ? '<div style="margin-bottom:16px;overflow-x:auto">' + t.diagram_html + '</div>' : '') +
  (related ? '<div style="margin-bottom:12px"><span style="font-size:11px;color:var(--text-secondary);margin-right:6px">관련 용어:</span>' + related + '</div>' : '') +
  '<div style="display:flex;gap:8px;margin-top:16px">' +
    '<button class="btn btn-primary" onclick="generateTermDetail(&quot;' + t.id + '&quot;)" id="gen-btn-' + t.id + '">🤖 Claude로 상세 설명·다이어그램 생성</button>' +
    '<button class="btn" onclick="askQ(&quot;' + t.term + ' 기술에 대해 자세히 설명해줘&quot;)" >AI 자문에서 질문</button>' +
  '</div>';

  document.getElementById('terms-modal-content').innerHTML = html;
  var modal = document.getElementById('terms-modal');
  modal.style.display = 'flex';
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
    var systemMsg = '당신은 이동통신·전파 정책 전문가입니다. 반드시 순수 JSON 객체만 출력하세요. 마크다운 코드블록, 설명 텍스트, 주석을 절대 포함하지 마세요.';
    var userMsg = '기술 용어 [' + termLabel + '] 에 대해 아래 JSON 형식으로만 답변하세요.' +
      ' 분야: ' + (t.category||'기타') + '. 현재 정의: ' + (t.definition||'없음') + '.\n\n' +
      '{"description":"3~5문단 상세 설명(배경/원리/국내외현황/관련표준). 줄바꿈은 \\n 사용.",' +
      '"diagram_html":"<svg viewBox=\"0 0 500 220\" xmlns=\"http://www.w3.org/2000/svg\">...</svg> 형태의 한국어 개념도. 색상 #6366f1/#10b981/#f59e0b 사용.",' +
      '"related_terms":["관련용어1","관련용어2","관련용어3"]}';
    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'x-api-key':claudeKey,'anthropic-version':'2023-06-01','content-type':'application/json','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:2500,system:systemMsg,messages:[{role:'user',content:userMsg}]})
    });
    var data = await res.json();

    // API 오류 응답 체크
    if (data.type === 'error' || !data.content) {
      var errMsg = (data.error && data.error.message) ? data.error.message : JSON.stringify(data);
      throw new Error('Claude API 오류: ' + errMsg);
    }

    // content 배열에서 text 타입 블록 명시적으로 찾기 (thinking 블록 등 무시)
    var textBlock = data.content.find(function(b) { return b.type === 'text'; });
    var text = textBlock ? textBlock.text.trim() : '';
    console.log('[generateTermDetail] 응답 블록 수:', data.content.length,
      '/ text 블록:', !!textBlock, '/ 앞 200자:', text.slice(0,200));

    if (!text) throw new Error('Claude가 텍스트 응답을 반환하지 않았습니다');

    // { } 사이 JSON 추출 (코드블록 제거 후)
    var cleaned = text
      .replace(/```[\w]*\n?/g, '')   // 코드블록 펜스 제거
      .replace(/`/g, '')              // 백틱 제거
      .trim();
    var firstBrace = cleaned.indexOf('{');
    var lastBrace = cleaned.lastIndexOf('}');
    console.log('[generateTermDetail] firstBrace:', firstBrace, 'lastBrace:', lastBrace, 'cleaned 앞 100자:', cleaned.slice(0,100));
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error('JSON 없음. 응답: ' + text.slice(0, 200));
    }
    var jsonStr = cleaned.slice(firstBrace, lastBrace + 1);
    var parsed;
    try { parsed = JSON.parse(jsonStr); }
    catch(e) {
      // SVG 안의 큰따옴표 때문에 실패 시 description/related_terms만 추출 시도
      var descMatch = jsonStr.match(/"description"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      var relMatch = jsonStr.match(/"related_terms"\s*:\s*(\[[^\]]*\])/);
      var svgMatch = jsonStr.match(/(<svg[\s\S]*?<\/svg>)/);
      parsed = {
        description: descMatch ? descMatch[1].replace(/\\n/g,'\n') : '',
        diagram_html: svgMatch ? svgMatch[1] : '',
        related_terms: relMatch ? JSON.parse(relMatch[1]) : []
      };
    }

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
    alert('생성 실패: ' + e.message);
    if(btn){btn.disabled=false;btn.textContent='🤖 Claude로 상세 설명·다이어그램 생성';}
  }
}

// ════════════════════════════════════════════
//  뉴스 컨텍스트 — news_feed 최근 이력 (AI 자문 참조용)
// ════════════════════════════════════════════
async function fetchRecentNewsContext() {
  if (!sb) return '';
  try {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60); // 최근 60일
    var cutoffStr = cutoff.toISOString().split('T')[0];
    var resp = await sb
      .from('news_feed')
      .select('title, source, category, published_at')
      .gte('published_at', cutoffStr)
      .order('published_at', { ascending: false })
      .limit(40);
    var data = resp.data;
    if (!data || data.length === 0) return '';

    // 업데이트 이력과 신규 뉴스 분리
    var updates = data.filter(function(n) { return n.title.startsWith('[업데이트]'); });
    var originals = data.filter(function(n) { return !n.title.startsWith('[업데이트]'); });

    var lines = [];
    if (updates.length > 0) {
      lines.push('[최근 변경·업데이트 이력]');
      updates.forEach(function(n) {
        lines.push('  · [' + (n.published_at||'').slice(0,10) + '] ' + n.title + ' (' + (n.source||'') + ')');
      });
    }
    if (originals.length > 0) {
      lines.push('[최근 뉴스 동향 — 누적 이력]');
      originals.forEach(function(n) {
        lines.push('  · [' + (n.published_at||'').slice(0,10) + '] ' + n.title + ' (' + (n.source||'') + ')');
      });
    }
    return '\n\n' + lines.join('\n') + '\n(위 뉴스 이력을 참고하여, 질문과 관련된 최신 동향이 있으면 언급하세요.)';
  } catch(e) {
    console.warn('뉴스 컨텍스트 로드 실패:', e);
    return '';
  }
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

  // 시스템 프롬프트에 RAG 컨텍스트 추가
  const ragContext = buildRagContext(ragChunks);
  // 최근 수집 뉴스 컨텍스트 추가 (Supabase news_feed)
  const newsContext = await fetchRecentNewsContext();
  const systemWithRag = SYSTEM_PROMPT + ragContext + newsContext;

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
      max_tokens: 2048,
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
//  News
// ════════════════════════════════════════════
let currentNewsFilter = '전체';
async function loadNews() {
  if (!sb) return;
  try {
    let query = sb.from('news_feed').select('*').order('created_at', { ascending: false }).limit(20);
    if (currentNewsFilter !== '전체') query = query.eq('category', currentNewsFilter);
    const { data } = await query;
    if (data && data.length > 0) {
      const list = document.getElementById('news-list');
      list.innerHTML = data.map(n => {
        const date = new Date(n.published_at || n.created_at).toLocaleDateString('ko-KR', {year:'numeric',month:'2-digit',day:'2-digit'});
        return `<div class="news-item">
          <div class="news-dot ${n.is_read ? 'dot-read' : 'dot-new'}"></div>
          <div>
            <div class="news-title" onclick="markRead('${n.id}')">${n.title}</div>
            <div class="news-meta">${n.source || ''} · ${date} · ${n.category || ''}</div>
          </div>
        </div>`;
      }).join('');
    }
  } catch(e) { console.warn('News load error:', e); }
}

async function markRead(id) {
  if (sb) { try { await sb.from('news_feed').update({ is_read: true }).eq('id', id); } catch(e) {} }
}

function filterNews(el, cat) {
  document.querySelectorAll('.tag-list .tag').forEach(t => t.classList.remove('selected'));
  el.classList.add('selected');
  currentNewsFilter = cat;
  loadNews();
}

// ════════════════════════════════════════════
//  Settings
// ════════════════════════════════════════════
function loadSettingsUI() {
  const cfg = getConfig();
  if (cfg.sbUrl) document.getElementById('inp-sb-url').value = cfg.sbUrl;
  if (cfg.sbKey) document.getElementById('inp-sb-key').value = cfg.sbKey;
  if (cfg.claudeKey) document.getElementById('inp-claude-key').value = cfg.claudeKey;
  document.getElementById('system-prompt-display').value = SYSTEM_PROMPT;
}

function saveApiKeys() {
  const sbUrl = document.getElementById('inp-sb-url').value.trim();
  const sbKey = document.getElementById('inp-sb-key').value.trim();
  const claudeKey = document.getElementById('inp-claude-key').value.trim();
  if (!sbUrl || !sbKey || !claudeKey) {
    showApiAlert('warn', 'Supabase URL, Supabase Key, Claude API Key는 필수입니다.');
    return;
  }
  saveConfig({ sbUrl: sbUrl, sbKey: sbKey, claudeKey: claudeKey });
  sb = null;
  initSupabase();
  updateStatusDots();
  showApiAlert('ok', '저장 완료. 연결 테스트를 실행해보세요.');
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
  var titles = {home:'대시보드', chat:'AI 자문', law:'국내 법령·고시', itu:'ITU-R 문서', press:'정부 보도자료', terms:'기술 용어', news:'보도자료·뉴스', settings:'설정'};
  var ttEl = document.getElementById('topbar-title');
  if (ttEl && titles[page]) ttEl.textContent = titles[page];

  // 모바일 하단 네비 동기화
  var pageTobn = {home:'bn-home', chat:'bn-chat', law:'bn-law', itu:'bn-law', press:'bn-press', terms:'bn-press', news:'bn-press', settings:'bn-settings'};
  if (pageTobn[page]) setBottomNav(pageTobn[page]);

  if (page === 'news') loadNews();
  if (page === 'settings') loadSettingsUI();
  if (page === 'press') loadPressFromSupabase();
  if (page === 'terms') loadTerms();
}

function setBottomNav(activeId) {
  document.querySelectorAll('.bottom-nav-item').forEach(function(b) { b.classList.remove('active'); });
  var el = document.getElementById(activeId);
  if (el) el.classList.add('active');
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
  if (lastRun === today) return; // 오늘 이미 실행됨

  if (!sb) return;
  var { claudeKey } = getConfig();
  if (!claudeKey) return;

  console.log('[기술 용어] 자동 추출 시작 (' + today + ')');

  try {
    // 최근 7일 뉴스 가져오기
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    var cutoffStr = cutoff.toISOString().split('T')[0];
    var newsResp = await sb.from('news_feed')
      .select('title,source,published_at')
      .gte('published_at', cutoffStr)
      .order('published_at', { ascending: false })
      .limit(30);
    var newsList = (newsResp.data || []).map(function(n) {
      return '[' + (n.published_at || '').slice(0, 10) + '] ' + n.title + ' (' + (n.source || '') + ')';
    }).join('\n');
    if (!newsList) { console.log('[기술 용어] 최근 뉴스 없음, 스킵'); return; }

    // 기존 용어 목록
    var existingResp = await sb.from('tech_terms').select('term').limit(500);
    var existingTerms = (existingResp.data || []).map(function(t) { return t.term.toLowerCase(); });

    // Claude에 용어 추출 요청
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
        system: '당신은 이동통신·전파 전문가입니다. 반드시 순수 JSON 배열만 출력하세요. 마크다운 코드블록 없이.',
        messages: [{
          role: 'user',
          content: '아래 뉴스 목록에서 이동통신·전파 분야 기술 용어(영문 약어, 표준명, 새 기술명)를 추출하세요.\n' +
            '이미 알려진 용어(' + existingTerms.slice(0, 20).join(', ') + ' 등)는 제외하세요.\n\n' +
            '뉴스 목록:\n' + newsList + '\n\n' +
            '형식: [{"term":"약어","term_en":"영문 전체 이름","category":"주파수|네트워크|위성|단말|규제|기타","definition":"한 줄 정의(50자 이내)","source":"출처"}]\n' +
            '새 용어가 없으면 [] 출력.'
        }]
      })
    });

    var data = await res.json();
    var text = (data.content[0].text || '').trim()
      .replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
    var firstBracket = text.indexOf('[');
    var lastBracket = text.lastIndexOf(']');
    if (firstBracket === -1) { console.log('[기술 용어] 추출 결과 없음'); return; }
    var terms = JSON.parse(text.slice(firstBracket, lastBracket + 1));
    if (!terms.length) { console.log('[기술 용어] 신규 용어 없음'); localStorage.setItem('last_terms_extraction', today); return; }

    // Supabase에 저장
    var saved = 0;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (!t.term || existingTerms.includes(t.term.toLowerCase())) continue;
      var r = await sb.from('tech_terms').insert({
        term: t.term, term_en: t.term_en || '', category: t.category || '기타',
        definition: t.definition || '', source: t.source || '뉴스 자동 추출', is_reviewed: false
      });
      if (!r.error) { saved++; existingTerms.push(t.term.toLowerCase()); }
    }

    localStorage.setItem('last_terms_extraction', today);
    if (saved > 0) {
      console.log('[기술 용어] 자동 추출 완료: ' + saved + '건 저장');
      // 기술 용어 패널이 열려 있으면 새로고침
      var termsPanel = document.getElementById('panel-terms');
      if (termsPanel && termsPanel.style.display !== 'none') loadTerms();
    }
  } catch(e) {
    console.warn('[기술 용어] 자동 추출 오류:', e.message);
  }
}

// ════════════════════════════════════════════
//  Init
// ════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  initSupabase();
  updateStatusDots();
  loadSettingsUI();
  refreshDashboard();
  loadPressJSON();
  // 페이지 로드 후 60초 뒤 백그라운드로 기술 용어 자동 추출 (하루 1회)
  setTimeout(autoExtractTermsIfNeeded, 60000);
});
