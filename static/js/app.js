/* Multi-Agent Edu v4.1 - Main Application */
// ============================================================
// 全局状态
// ============================================================
const AGENTS = ['diagnosis','knowledge_gen','reviewer','practice_guide','quiz','iteration','socratic'];
const AGENT_LABELS = {diagnosis:'学情诊断',knowledge_gen:'知识生成',reviewer:'审核裁判',practice_guide:'实操指南',quiz:'分阶测试',iteration:'迭代优化',socratic:'苏格拉底'};
const AGENT_ICONS = {diagnosis:'🔍',knowledge_gen:'📚',reviewer:'🔎',practice_guide:'🔧',quiz:'📝',iteration:'🔄',socratic:'💬'};

let agentResults = {};
let timerInterval = null;
let startTime = 0;
let abortController = null;
let quizData = null;

// 模型配置
let currentModel = localStorage.getItem('selected_model') || 'zhipu';
let currentApiKey = localStorage.getItem('api_key_'+currentModel) || '';

// ============================================================
// 模型弹窗
// ============================================================
function showModelModal(){ document.getElementById('modelModal').classList.add('show'); document.getElementById('modelSelect').value = currentModel; }
function closeModelModal(){ document.getElementById('modelModal').classList.remove('show'); }
function confirmModel(){
  currentModel = document.getElementById('modelSelect').value;
  localStorage.setItem('selected_model', currentModel);
  document.getElementById('btnModel').textContent = '🤖 '+ {deepseek:'DeepSeek-V3',zhipu:'GLM-4-Flash','openai-compat':'OpenAI兼容'}[currentModel];
  closeModelModal();
  log('🤖 模型切换为：'+currentModel, 'info');
  // 清除当前Key，要求重新输入
  currentApiKey = '';
  localStorage.removeItem('api_key_'+currentModel);
}

// ============================================================
// API Key 弹窗
// ============================================================
function showApiKeyModal(){ 
  document.getElementById('apiKeyModal').classList.add('show');
  document.getElementById('apiKeyInput').value = currentApiKey ? '••••••••' : '';
  document.getElementById('apiKeyError').style.display = 'none';
  // 更新提示
  const hints = {
    deepseek: 'DeepSeek：在 platform.deepseek.com 获取API Key（sk-开头）',
    zhipu: '智谱：Key格式为 {id}.{secret}',
    'openai-compat': '请输入OpenAI兼容接口的API Key和Base URL'
  };
  document.getElementById('apiKeyHint').innerHTML = hints[currentModel] || hints['deepseek'];
}
function closeApiKeyModal(){ document.getElementById('apiKeyModal').classList.remove('show'); }
function skipApiKey(){
  currentApiKey = '';
  localStorage.removeItem('api_key_'+currentModel);
  closeApiKeyModal();
  log('⚠️ 进入Demo模式，将使用预置数据展示','warn');
}
async function confirmApiKey(){
  const input = document.getElementById('apiKeyInput').value.trim();
  const errEl = document.getElementById('apiKeyError');
  if(!input || input === '••••••••'){
    errEl.textContent = '请输入有效的API Key';
    errEl.style.display = 'block';
    return;
  }
  currentApiKey = input;
  localStorage.setItem('api_key_'+currentModel, input);
  // 测试Key
  log('🔑 验证API Key...','info');
  try {
    const ok = await testApiKey();
    if(ok){
      log('✅ API Key验证成功！','success');
      closeApiKeyModal();
    } else {
      errEl.textContent = 'API Key验证失败，请检查后重试';
      errEl.style.display = 'block';
    }
  } catch(e){
    errEl.textContent = '验证失败：'+e.message;
    errEl.style.display = 'block';
  }
}

async function testApiKey(){
  if(currentModel === 'deepseek'){
    return await callDeepSeek('hi', false);
  } else if(currentModel === 'zhipu'){
    return await callZhipu('hi', false);
  }
  return false;
}

// ============================================================
// 核心：调用LLM（多模型统一入口）
// ============================================================
async function callLLM(systemPrompt, userPrompt, onChunk){
  if(!currentApiKey){
    throw new Error('未配置API Key，请点击右上角「Key」配置，或进入Demo模式');
  }
  if(currentModel === 'deepseek'){
    return await callDeepSeekStream(systemPrompt, userPrompt, onChunk);
  } else if(currentModel === 'zhipu'){
    return await callZhipuStream(systemPrompt, userPrompt, onChunk);
  } else {
    // OpenAI兼容
    return await callOpenAICompat(systemPrompt, userPrompt, onChunk);
  }
}

// --- DeepSeek-V3 实现 ---
async function callDeepSeekStream(systemPrompt, userPrompt, onChunk){
  abortController = new AbortController();
  const body = {
    model: 'deepseek-chat',
    messages: [
      {role:'system', content: systemPrompt},
      {role:'user', content: userPrompt}
    ],
    temperature: parseFloat(document.getElementById('vTemp').textContent),
    stream: true
  };
  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {'Content-Type':'application/json','Authorization':'Bearer '+currentApiKey},
    body: JSON.stringify(body),
    signal: abortController.signal
  });
  if(!resp.ok){
    const errText = await resp.text();
    throw new Error('DeepSeek API失败('+resp.status+')：'+errText.slice(0,200));
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  while(true){
    const {done, value} = await reader.read();
    if(done) break;
    buffer += decoder.decode(value, {stream:true});
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for(const line of lines){
      if(line.startsWith('data: ')){
        const data = line.slice(6);
        if(data === '[DONE]') return fullText;
        try {
          const json = JSON.parse(data);
          const chunk = (json.choices&&json.choices[0]&&json.choices[0].delta&&json.choices[0].delta.content)||'';
          fullText += chunk;
          if(onChunk && chunk) onChunk(chunk);
        } catch(e){}
      }
    }
  }
  return fullText;
}

async function callDeepSeek(userPrompt, testMode){
  // 测试用，非流式
  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {'Content-Type':'application/json','Authorization':'Bearer '+currentApiKey},
      body: JSON.stringify({model:'deepseek-chat',messages:[{role:'user',content:userPrompt}],max_tokens:5})
    });
    return resp.ok;
  } catch(e){ return false; }
}

async function callZhipu(userPrompt, testMode){
  // 测试用，非流式
  try {
    const parts = currentApiKey.split('.');
    if(parts.length < 2) return false;
    const token = await generateJwt(parts[0], parts.slice(1).join('.'));
    const resp = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {'Content-Type':'application/json','Authorization':'Bearer '+token},
      body: JSON.stringify({model:'glm-4-flash',messages:[{role:'user',content:userPrompt}],max_tokens:5})
    });
    return resp.ok;
  } catch(e){ return false; }
}

// --- 智谱 GLM-4-Flash 实现（JWT签名） ---
async function callZhipuStream(systemPrompt, userPrompt, onChunk){
  // 解析Key：格式为 {id}.{secret}
  const parts = currentApiKey.split('.');
  if(parts.length < 2) throw new Error('智谱Key格式错误，应为 {id}.{secret}');
  const id = parts[0];
  const secret = parts.slice(1).join('.');
  const token = await generateJwt(id, secret);
  
  abortController = new AbortController();
  const body = {
    model: 'glm-4-flash',
    messages: [
      {role:'system', content: systemPrompt},
      {role:'user', content: userPrompt}
    ],
    temperature: parseFloat(document.getElementById('vTemp').textContent),
    stream: true
  };
  const resp = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {'Content-Type':'application/json','Authorization':'Bearer '+token},
    body: JSON.stringify(body),
    signal: abortController.signal
  });
  if(!resp.ok) throw new Error('智谱API失败('+resp.status+')');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  while(true){
    const {done, value} = await reader.read();
    if(done) break;
    buffer += decoder.decode(value, {stream:true});
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for(const line of lines){
      if(line.startsWith('data: ')){
        const data = line.slice(6);
        if(data === '[DONE]') return fullText;
        try {
          const json = JSON.parse(data);
          const chunk = (json.choices&&json.choices[0]&&json.choices[0].delta&&json.choices[0].delta.content)||'';
          fullText += chunk;
          if(onChunk && chunk) onChunk(chunk);
        } catch(e){}
      }
    }
  }
  return fullText;
}

async function generateJwt(apiKeyId, apiKeySecret){
  const header = btoa(JSON.stringify({alg:'HS256',sign_type:'SIGN'})).replace(/=+$/,'');
  const now = Math.floor(Date.now()/1000);
  const payload = btoa(JSON.stringify({api_key:apiKeyId,exp:now+3600,timestamp:now})).replace(/=+$/,'');
  const signStr = header + '.' + payload;
  const sig = await hmacSha256(signStr, apiKeySecret);
  return signStr + '.' + sig;
}
async function hmacSha256(message, secret){
  const enc = new TextEncoder();
  const keyData = enc.encode(secret);
  const msgData = enc.encode(message);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

// --- OpenAI兼容接口 ---
async function callOpenAICompat(systemPrompt, userPrompt, onChunk){
  // base URL 从localStorage获取，或弹窗要求输入
  const baseUrl = localStorage.getItem('openai_compat_base_url') || 'https://api.openai.com/v1';
  abortController = new AbortController();
  const body = {
    model: localStorage.getItem('openai_compat_model') || 'gpt-3.5-turbo',
    messages: [
      {role:'system', content: systemPrompt},
      {role:'user', content: userPrompt}
    ],
    temperature: parseFloat(document.getElementById('vTemp').textContent),
    stream: true
  };
  const resp = await fetch(baseUrl+'/chat/completions', {
    method: 'POST',
    headers: {'Content-Type':'application/json','Authorization':'Bearer '+currentApiKey},
    body: JSON.stringify(body),
    signal: abortController.signal
  });
  if(!resp.ok) throw new Error('OpenAI兼容API失败('+resp.status+')');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  while(true){
    const {done, value} = await reader.read();
    if(done) break;
    buffer += decoder.decode(value, {stream:true});
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for(const line of lines){
      if(line.startsWith('data: ')){
        const data = line.slice(6);
        if(data === '[DONE]') return fullText;
        try {
          const json = JSON.parse(data);
          const chunk = (json.choices&&json.choices[0]&&json.choices[0].delta&&json.choices[0].delta.content)||'';
          fullText += chunk;
          if(onChunk && chunk) onChunk(chunk);
        } catch(e){}
      }
    }
  }
  return fullText;
}

// ============================================================
// 高质量Prompt模板（Few-shot示例）
// ============================================================
function buildPrompts(agentName, context){
  const profile = getProfile();
  let system = '';
  let user = '';
  
  if(agentName === 'diagnosis'){
    system = `你是专业的学情诊断专家。根据学习者的背景描述，输出严格的JSON格式诊断结果。

【输出格式要求】
必须输出以下JSON（不要有任何其他文字）：
{
  "learner_level": "beginner|intermediate|advanced",
  "level_score": <0-100的整数>,
  "strengths": ["优势1", "优势2", ...],
  "blind_spots": ["知识盲区1", "知识盲区2", ...],
  "focus_topic": "建议重点学习的主题",
  "learning_path": [
    {"phase": "阶段名称", "topics": ["知识点1", ...], "estimated_hours": <整数>}
  ]
}

【示例】
输入：我学过C语言，想学Python做数据分析
输出：
{
  "learner_level": "intermediate",
  "level_score": 58,
  "strengths": ["有C语言基础，理解变量/函数/控制流", "掌握基本数据结构"],
  "blind_spots": ["Python生态不熟悉（NumPy/Pandas等）", "没有机器学习实战经验", "数据可视化工具未接触"],
  "focus_topic": "Python数据分析",
  "learning_path": [
    {"phase": "Python基础巩固", "topics": ["Python语法特性", "列表/字典/集合", "函数与模块"], "estimated_hours": 15},
    {"phase": "数据分析核心库", "topics": ["NumPy数组操作", "Pandas数据清洗", "Matplotlib可视化"], "estimated_hours": 25},
    {"phase": "实战项目", "topics": ["Kaggle入门案例", "特征工程基础", "模型评估"], "estimated_hours": 30}
  ]
}`;
    user = `请诊断以下学习者：
背景：${profile.background}
编程经验：${profile.experience}
学习目标：${profile.goal}
自评水平：${profile.level}

输出JSON：`;
  }
  
  else if(agentName === 'knowledge_gen'){
    system = `你是个性化知识生成专家，擅长根据学情诊断结果生成高质量、结构化的学习内容。

【要求】
1. 内容必须准确、专业，面向${profile.level === 'beginner' ? '零基础' : profile.level === 'intermediate' ? '有一定基础' : '进阶'}的学习者
2. 使用Markdown格式，包含代码示例（带语法高亮）
3. 每个重要概念必须有清晰解释和示例
4. 内容长度：800-1500字
5. 输出严格JSON格式

【输出JSON格式】
{
  "title": "内容标题",
  "content": "Markdown格式的详细学习内容（含代码块、示例、重点标注）",
  "concepts": ["核心概念1", "核心概念2", ...],
  "source_refs": [
    {"source": "文件名或资料名", "type": "[教材]|[官方文档]|[论文]|[实践]"}
  ]
}

【内容质量要求】
- 概念解释清晰，避免模糊表述
- 代码示例必须有注释，展示典型用法
- 对比相似概念的异同（如list vs tuple）
- 指出常见错误和最佳实践`;
    user = `诊断结果：${JSON.stringify(context.diagnosis || {})}
学习者画像：${JSON.stringify(profile)}
请生成个性化学习内容（JSON格式）：`;
  }
  
  else if(agentName === 'reviewer'){
    system = `你是严格的内容审核专家，负责检测知识内容中的事实性错误（幻觉）。

【评分标准】
- hallucination_score: 0-100，分数越高幻觉越多（0=完全准确，100=大量幻觉）
  - 0-15：内容准确，来源可追溯 → 通过
  - 16-35：少量不精确，但无重大错误 → 有条件通过
  - 36-60：有明显错误或不准确 → 需要修订
  - 61-100：严重幻觉或完全错误 → 驳回
- accuracy_score: 0-100，内容准确度评分

【输出JSON】
{
  "verdict": "pass|pass_with_concerns|needs_revision|reject",
  "hallucination_score": <0-100>,
  "accuracy_score": <0-100>,
  "issues": [
    {"severity": "high|medium|low", "description": "问题描述", "correct_info": "正确信息"}
  ],
  "debate_rounds": <实际辩论轮数>,
  "debate_log": [{"round": 1, "reviewer_verdict": "...", "hallucination_score": <n>}]
}`;
    user = `待审核内容：\n${(context.content || '').slice(0,2000)}\n\n来源标注：${JSON.stringify(context.source_refs || [])}\n\n请审核并输出JSON：`;
  }
  
  else if(agentName === 'practice_guide'){
    system = `你是实操指导专家，生成可执行的步骤指南。

【输出JSON】
{
  "difficulty": "easy|medium|hard",
  "estimated_time": "时间估算（如'2-3小时'）",
  "prerequisites": ["前置要求1", ...],
  "steps": [
    {
      "title": "步骤标题",
      "description": "详细说明",
      "code": "可选的代码（带注释）",
      "expected_output": "预期输出或结果"
    }
  ],
  "tips": ["实用技巧1", ...]
}`;
    user = `主题：${context.topic || 'Python基础'}\n水平：${profile.level}\n请生成实操指南（JSON格式）：`;
  }
  
  else if(agentName === 'quiz'){
    system = `你是测试题目生成专家。

【要求】
- 题目难度匹配学习者水平
- 选择题4个选项，只有1个正确答案
- 解析要详细，解释为什么正确/错误
- 生成3-5道题

【输出JSON】
{
  "questions": [
    {
      "type": "choice",
      "question": "题目内容",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correct": 0,
      "explanation": "详细解析"
    }
  ],
  "total_score": 100,
  "passing_score": 60
}`;
    user = `知识内容：${(context.knowledge && context.knowledge.content || '').slice(0,1500)}\n难度：${profile.level}\n请生成分阶测试题（JSON格式）：`;
  }
  
  else if(agentName === 'iteration'){
    system = `你是学习迭代优化专家。

【输出JSON】
{
  "decision": "simplify|advance|consolidate",
  "adjustments": {
    "focus_topics": ["需要加强的主题1", ...],
    "remove_topics": ["可以跳过的内容", ...],
    "add_topics": ["需要补充的内容", ...]
  },
  "suggestion": "给学习者的建议（中文，100字以内）",
  "next_steps": ["下一步1", "下一步2", ...]
}`;
    user = `测验结果：${JSON.stringify(context.quiz_result || {})}\n诊断：${JSON.stringify(context.diagnosis || {})}\n请输出迭代决策（JSON格式）：`;
  }
  
  else if(agentName === 'socratic'){
    system = `你是苏格拉底式导学专家，通过提问引导学习者主动思考。

【要求】
- 不要直接给答案，用问题引导
- 问题要有层次：先简单再深入
- 鼓励学习者表达自己的理解

【输出JSON】
{
  "response": "对学习者说的引导性回复（中文，亲切专业）",
  "questions": [
    {"question": "引导问题", "purpose": "这个问题想引导学习者思考什么"}
  ],
  "hint": "如果学习者答不出，可以给的提示"
}`;
    user = `知识内容：${(context.knowledge && context.knowledge.content || '').slice(0,1000)}\n请生成苏格拉底导学内容（JSON格式）：`;
  }
  
  return {system, user};
}

// ============================================================
// 解析LLM输出（5种策略）
// ============================================================
function parseLLMOutput(text){
  if(!text) return {_parse_error: 'empty input'};
  let cleaned = text.trim();
  // 1. 去掉```json ... ``` 
  const codeBlock = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if(codeBlock) cleaned = codeBlock[1].trim();
  // 2. 直接解析
  try { return JSON.parse(cleaned); } catch(e){}
  // 3. 找第一个{到最后一个}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if(start >= 0 && end > start){
    try { return JSON.parse(cleaned.slice(start, end+1)); } catch(e){}
  }
  // 4. 尝试修复常见JSON错误（单引号、trailing comma）
  try {
    const fixed = cleaned
      .replace(/'/g, '"')
      .replace(/,\s*}/g, '}')
      .replace(/,\s*\]/g, ']');
    return JSON.parse(fixed);
  } catch(e){}
  // 5. 实在不行，返回文本
  return {content: text, _parse_error: '无法解析为JSON'};
}

// ============================================================
// 获取画像
// ============================================================
function getProfile(){
  return {
    background: document.getElementById('inpBg').value,
    experience: document.getElementById('inpExp').value,
    goal: document.getElementById('inpGoal').value,
    level: document.getElementById('inpLvl').value
  };
}

// ============================================================
// Agent节点状态
// ============================================================
function setNode(name, state){
  const el = document.getElementById('nd-'+name);
  if(!el) return;
  el.classList.remove('active','running','done');
  const s = el.querySelector('.status');
  if(state==='running'){ el.classList.add('running','active'); if(s) s.textContent='运行中...'; }
  else if(state==='done'){ el.classList.add('done'); if(s) s.textContent='✓ 完成'; }
  else if(state==='error'){ el.classList.add('active'); if(s){ s.style.color='var(--danger)'; s.textContent='✗ 出错'; }}
  else { if(s){ s.textContent='等待中'; s.style.color=''; }}
}
function setPipe(step, state){
  const el = document.querySelector(`.pipe-step[data-s="${step}"]`);
  if(!el) return;
  el.classList.remove('active','done','error');
  if(state==='active') el.classList.add('active');
  if(state==='done') el.classList.add('done');
  if(state==='error') el.classList.add('error');
  const ar = document.querySelector(`.pipe-arrow[data-a="${step}"]`);
  if(ar) ar.classList.toggle('lit', state==='done');
}

// ============================================================
// 计时器
// ============================================================
timerInterval = null; startTime = 0;
function startTimer2(){
  startTime = Date.now();
  document.getElementById('liveBadge').style.display = 'inline';
  timerInterval = setInterval(()=>{
    const s = Math.floor((Date.now()-startTime)/1000);
    document.getElementById('timerDisplay').textContent = Math.floor(s/60).toString().padStart(2,'0')+':'+(s%60).toString().padStart(2,'0');
    document.getElementById('mTime').textContent = s+'s';
  }, 1000);
}
function stopTimer2(){
  clearInterval(timerInterval);
  document.getElementById('liveBadge').style.display = 'none';
}

// ============================================================
// 启动全流程
// ============================================================
async function startPipeline(){
  const p = getProfile();
  if(!p.background.trim()){ alert('请填写背景描述'); return; }

  agentResults = {};
  document.getElementById('resultsArea').innerHTML = '<div id="rg"></div>';
  document.getElementById('metricsRow').style.display = 'flex';
  document.getElementById('emptyState')?.remove();
  document.getElementById('btnStart').disabled = true;
  document.getElementById('btnStop').style.display = 'block';

  AGENTS.forEach((n,i) => { setNode(n,''); setPipe(i+1,null); });
  ['mHalluc','mAcc','mQuiz'].forEach(id=>{document.getElementById(id).textContent='-';});
  document.getElementById('mAgents').textContent='0/7';

  // 显示骨架屏
  showSkeletons();
  // 显示进度条
  const pw = document.getElementById('progressWrap'); pw.style.display='block';
  updateProgress(0, '启动中...');
  log('🚀 7个Agent协同启动（'+currentModel+'）...','info');
  startTimer2();

  try {
    await runStep('diagnosis', 1, p);
    await runStep('knowledge_gen', 2, {diagnosis:agentResults.diagnosis, profile:p});
    await runStep('reviewer', 3, {content:agentResults.knowledge_gen?.content||'', source_refs:agentResults.knowledge_gen?.source_refs||[]});
    await runStep('practice_guide', 4, {topic:agentResults.diagnosis?.focus_topic||'Python基础', level:p.level});
    await runStep('quiz', 5, {knowledge:agentResults.knowledge_gen||{}, level:p.level});
    await runStep('iteration', 6, {quiz_result:agentResults.quiz||{}, diagnosis:agentResults.diagnosis||{}, knowledge:agentResults.knowledge_gen||{}});
    await runStep('socratic', 7, {knowledge:agentResults.knowledge_gen||{}});
    log('🎉 全流程完成！','success');
  } catch(e){
    log('❌ 出错：'+e.message,'error');
  } finally {
    stopTimer2();
    document.getElementById('btnStart').disabled = false;
    document.getElementById('btnStop').style.display = 'none';
    updateProgress(100, '完成');
    // 清理剩余骨架屏
    AGENTS.forEach(n=>removeSkeleton(n));
  }
}

async function runStep(name, stepNum, ctx){
  setNode(name,'running');
  setPipe(stepNum,'active');
  log(`${AGENT_ICONS[name]} ${AGENT_LABELS[name]} 运行中...`,'info');

  const data = await runAgent(name, ctx);

  setNode(name,'done');
  setPipe(stepNum,'done');
  agentResults[name] = data;
  removeSkeleton(name);  // 移除骨架屏

  const done = Object.keys(agentResults).length;
  document.getElementById('mAgents').textContent = done+'/7';

  renderCard(name, data);
  // 更新进度
  const pct = Math.round(done / 7 * 100);
  updateProgress(pct, `${AGENT_LABELS[name]}完成 · ${done}/7`);
  log(`✅ ${AGENT_LABELS[name]} 完成`,'success');

  if(name==='reviewer'){
    document.getElementById('mHalluc').textContent = data.hallucination_score??'-';
    document.getElementById('mAcc').textContent = data.accuracy_score??'-';
  }
}

function stopPipeline(){
  if(abortController) abortController.abort();
  stopTimer2();
  document.getElementById('btnStart').disabled = false;
  document.getElementById('btnStop').style.display = 'none';
  log('⏹ 已停止','warn');
}

// ============================================================
// 运行单个Agent
// ============================================================
async function runAgent(name, ctx){
  const {system, user} = buildPrompts(name, ctx);
  if(!currentApiKey){
    log('⚠️ 无API Key，使用Demo数据','warn');
    return getDemo(name);
  }
  try {
    let buf = '';
    const fullText = await callLLM(system, user, ch => { buf += ch; });
    const parsed = parseLLMOutput(fullText || buf);
    parsed._meta = {agent: name, src: 'llm', model: currentModel};
    return parsed;
  } catch(e){
    log(`⚠️ ${AGENT_LABELS[name]} 失败(${e.message})，使用Demo数据`,'warn');
    return getDemo(name);
  }
}

// 单步调试
async function runSingle(name){
  const p = getProfile();
  const ctxs = {
    diagnosis: p,
    knowledge_gen: {diagnosis:agentResults.diagnosis||{}, profile:p},
    reviewer: {content:agentResults.knowledge_gen?.content||'', source_refs:[]},
    practice_guide: {topic:agentResults.diagnosis?.focus_topic||'Python基础', level:p.level},
    quiz: {knowledge:agentResults.knowledge_gen||{}, level:p.level},
    iteration: {quiz_result:agentResults.quiz||{}, diagnosis:agentResults.diagnosis||{}, knowledge:agentResults.knowledge_gen||{}},
    socratic: {knowledge:agentResults.knowledge_gen||{}}
  };
  setNode(name,'running');
  log(`${AGENT_ICONS[name]} ${AGENT_LABELS[name]} 单步运行中...`,'info');
  try {
    const data = await runAgent(name, ctxs[name]||{});
    setNode(name,'done');
    agentResults[name] = data;
    renderCard(name, data);
    log(`✅ ${AGENT_LABELS[name]} 单步完成`,'success');
  } catch(e){
    setNode(name,'error');
    log(`❌ ${AGENT_LABELS[name]} 失败: ${e.message}`,'error');
  }
}

// ============================================================
// Demo数据
// ============================================================
function getDemo(name){
  if(name==='diagnosis') return {learner_level:'intermediate',level_score:65,strengths:['C语言基础','数据结构理解'],blind_spots:['Python生态不熟悉','AI框架未接触','数据可视化工具缺失'],focus_topic:'Python与AI开发',learning_path:[{phase:'Python基础夯实',topics:['Python语法特性','列表/字典/集合','函数与模块'],estimated_hours:20},{phase:'数据分析核心库',topics:['NumPy数组操作','Pandas数据清洗','Matplotlib可视化'],estimated_hours:30},{phase:'AI实战项目',topics:['Kaggle入门案例','特征工程基础','模型评估方法'],estimated_hours:40}],_demo:true};
  if(name==='knowledge_gen') return {title:'Python与AI开发基础',content:'## Python基础\n\nPython是一种面向对象的高级语言，以简洁易读著称。\n\n### 核心概念\n\n- **变量与类型**：Python为动态类型语言，无需声明变量类型\n- **函数**：使用`def`关键字定义函数\n- **列表推导式**：`[x*2 for x in range(10)]`\n\n```python\ndef greet(name):\n    return f"Hello, {name}!"\n\n# 列表推导式示例\nsquares = [x**2 for x in range(10)]\n```\n\n### AI开发入门\n\n学习NumPy进行数值计算，Pandas处理数据，Scikit-learn构建模型...',concepts:['Python语法','面向对象编程','NumPy','Pandas','机器学习基础'],source_refs:[{source:'python_basics.md',type:'[教材]'},{source:'ai_basics.md',type:'[实践]'},{source:'web_dev.md',type:'[官方文档]'}],_demo:true};
  if(name==='reviewer') return {verdict:'pass',hallucination_score:8,accuracy_score:92,issues:[],debate_rounds:2,debate_log:[{round:1,reviewer_verdict:'pass',hallucination_score:10},{round:2,reviewer_verdict:'pass',hallucination_score:8}],_demo:true};
  if(name==='practice_guide') return {difficulty:'medium',estimated_time:'3-4小时',prerequisites:['Python 3.10+','VS Code','pip包管理器'],steps:[{title:'环境搭建',description:'安装Python和开发环境',code:'# macOS\nbrew install python3\n# 验证安装\npython3 --version',expected_output:'Python 3.12.x'},{title:'第一个程序',description:'编写Hello World并运行',code:"print('Hello, AI World!')",expected_output:'Hello, AI World!'},{title:'数据类型练习',description:'掌握Python基本数据类型',code:`# 列表操作\nfruits = ['apple', 'banana', 'cherry']\nfruits.append('date')\nprint(fruits)\n\n# 字典操作\nscores = {'math': 95, 'english': 88}\nprint(scores['math'])`,expected_output:`['apple', 'banana', 'cherry', 'date']\n95`}],tips:['使用虚拟环境隔离项目依赖','善用type hints提高代码可读性','多写单元测试养成好习惯'],_demo:true};
  if(name==='quiz') return {questions:[{type:'choice',question:'Python中使用哪个关键字定义函数？',options:['function','def','func','lambda'],correct:1,explanation:'Python使用def关键字定义函数。lambda用于定义匿名函数（单行函数），不是常规函数定义方式。'},{type:'choice',question:'以下哪种数据结构是可变的？',options:['tuple','str','list','int'],correct:2,explanation:'list（列表）是可变类型，可以增删改元素。tuple、str、int都是不可变类型，修改操作会创建新对象。'},{type:'choice',question:'NumPy中创建全0数组的函数是？',options:['np.ones()','np.zeros()','np.empty()','np.arange()'],correct:1,explanation:'np.zeros(shape)创建全0数组，np.ones()创建全1数组，np.empty()创建未初始化数组，np.arange()创建等差数组。'},{type:'choice',question:'Pandas中读取CSV文件的函数是？',options:['pd.read_csv()','pd.load_csv()','pd.open_csv()','pd.import_csv()'],correct:0,explanation:'pd.read_csv()是Pandas读取CSV文件的标准函数。'},{type:'choice',question:'机器学习中，过拟合(Overfitting)指的是？',options:['训练集和测试集表现都差','训练集表现好但测试集表现差','训练集和测试集表现都好','模型太简单无法学习规律'],correct:1,explanation:'过拟合指模型在训练数据上表现很好，但在新数据（测试集）上泛化能力差，通常是因为模型过于复杂，记住了训练数据的噪声。'}],total_score:100,passing_score:60,_demo:true};
  if(name==='iteration') return {decision:'consolidate',adjustments:{focus_topics:['Python基础练习','数据处理实战'],remove_topics:['高级装饰器'],add_topics:['更多NumPy实战','数据清洗案例']},suggestion:'建议先巩固Python基础再进入AI框架学习。当前Python语法基础尚可，但数据处理能力需要加强，预计需要2-3周扎实练习。',next_steps:['完成NumPy 10个基础练习','用Pandas清洗一个真实数据集','参加Kaggle入门竞赛'],_demo:true};
  if(name==='socratic') return {response:'你对Python已有初步了解。让我通过几个问题来帮你深入思考：如果要把一个列表中的所有偶数找出来并翻倍，你会怎么写代码？',questions:[{question:'列表推导式 [x*2 for x in lst if x%2==0] 的执行顺序是什么？先过滤还是先计算？',purpose:'理解列表推导式的执行逻辑和内部机制'},{question:'Python中的生成器(Generator)和列表有什么区别？什么场景下应该用生成器？',purpose:'引导思考惰性求值和内存效率的权衡'},{question:'如果把上面的列表推导式改写为map+filter，代码会变成什么样？哪种更Pythonic？',purpose:'对比不同编程范式，培养Pythonic思维'}],hint:'列表推导式的执行顺序是：先for迭代，再if过滤，最后计算表达式值。',_demo:true};
  return {_demo:true};
}

// ============================================================
// 渲染卡片
// ============================================================
function renderCard(name, data){
  const rg = document.getElementById('rg') || document.getElementById('resultsArea');
  const old = document.getElementById('card-'+name);
  if(old) old.remove();

  let body = '';
  const isDemo = data._demo;

  if(name==='diagnosis'){
    body = `
      <div style="margin-bottom:8px"><strong>能力评分</strong>：<span style="font-size:22px;color:${sc2(data.level_score||0)}">${data.level_score||0}</span>/100</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
        <span style="background:rgba(0,212,170,.15);color:#00d4aa;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:700">✅ 优势</span>
        ${(data.strengths||[]).map(s=>`<span style="font-size:11px;color:var(--muted)">${esc(s)}</span>`).join('·')}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        <span style="background:rgba(255,107,107,.15);color:#ff6b6b;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:700">⚠️ 盲区</span>
        ${(data.blind_spots||[]).map(s=>`<span style="font-size:11px;color:var(--muted)">${esc(s)}</span>`).join('·')}
      </div>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:9px;padding:10px">
        <div style="font-size:10px;color:var(--accent);font-weight:700;margin-bottom:6px">📍 学习路径</div>
        ${(data.learning_path||[]).map((lp,i)=>`
          <div style="display:flex;gap:8px;margin-bottom:4px">
            <span style="min-width:18px;height:18px;border-radius:50%;background:var(--accent2);color:#fff;font-size:9px;display:flex;align-items:center;justify-content:center;font-weight:700">${i+1}</span>
            <div><div style="font-size:11px;font-weight:700">${esc(lp.phase)} <span style="color:var(--muted);font-weight:400;font-size:10px">(${lp.estimated_hours||0}h)</span></div>
            <div style="font-size:10px;color:var(--muted)">${(lp.topics||[]).join(' · ')}</div></div>
          </div>
        `).join('')}
      </div>`;
  } else if(name==='knowledge_gen'){
    body = `
      <div style="margin-bottom:6px">${(data.concepts||[]).map((c,i)=>`<span style="background:${i%2===0?'rgba(0,212,170,.15)':'rgba(108,92,231,.15)'};color:${i%2===0?'#00d4aa':'#7c5cfc'};padding:3px 10px;border-radius:12px;font-size:10px;font-weight:700;margin-right:4px">${esc(c)}</span>`).join('')}</div>
      <div style="font-size:12px;line-height:1.7;margin-top:6px">${md2html(data.content||'')}</div>
      <div style="margin-top:8px;font-size:10px;color:var(--muted)">📚 来源：${(data.source_refs||[]).map(r=>`<span style="background:var(--bg);border:1px solid var(--border);padding:2px 8px;border-radius:8px;margin-right:4px">${esc(r.source)} <span style="color:${r.type==='[教材]'?'#00d4aa':r.type==='[实践]'?'#ffb347':r.type==='[论文]'?'#7c5cfc':'#89d4c8'}">${r.type}</span></span>`).join('')}</div>`;
  } else if(name==='reviewer'){
    const h = data.hallucination_score||0, a = data.accuracy_score||0;
    body = `
      <div style="display:flex;gap:12px;margin-bottom:8px">
        <div><span style="font-size:10px;color:var(--muted)">幻觉分数</span><br><span style="font-size:20px;font-weight:800;color:${h<20?'var(--success)':h<50?'var(--warn)':'var(--danger)'}">${h}</span></div>
        <div><span style="font-size:10px;color:var(--muted)">准确度</span><br><span style="font-size:20px;font-weight:800;color:${sc2(a)}">${a}%</span></div>
        <div><span style="font-size:10px;color:var(--muted)">判定</span><br><span style="font-size:13px;font-weight:800;color:${data.verdict==='pass'?'var(--success)':'var(--warn)'}">${vl2(data.verdict)}</span></div>
      </div>
      ${(data.issues||[]).length>0?`<div style="font-size:10px;color:var(--danger);background:rgba(255,107,107,.1);padding:6px 10px;border-radius:7px;margin-bottom:6px">⚠ ${esc(data.issues[0].description||'')}</div>`:''}
      <div style="background:var(--bg);border-radius:8px;padding:8px;font-size:10px">
        <div style="font-weight:700;color:var(--accent2);margin-bottom:4px">辩论过程 (${data.debate_rounds||1}轮)</div>
        ${(data.debate_log||[]).map((rd,i)=>`<div style="padding:3px 0;border-bottom:1px solid var(--border)">第${i+1}轮：${vl2(rd.reviewer_verdict||rd.v)} · 幻觉${rd.hallucination_score||rd.h||0}</div>`).join('')}
      </div>`;
  } else if(name==='practice_guide'){
    body = `
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <span style="background:rgba(0,212,170,.15);color:#00d4aa;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:700">难度：${data.difficulty||'-'}</span>
        <span style="background:rgba(108,92,231,.15);color:#7c5cfc;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:700">⏱ ${data.estimated_time||'-'}</span>
      </div>
      ${(data.steps||[]).map((s,i)=>`
        <div style="display:flex;gap:10px;background:var(--bg);border:1px solid var(--border);border-radius:9px;padding:10px;margin-bottom:6px">
          <div style="min-width:24px;height:24px;border-radius:50%;background:rgba(108,92,231,.2);border:1px solid var(--accent2);color:var(--accent2);font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center">${i+1}</div>
          <div style="flex:1">
            <div style="font-size:12px;font-weight:700;margin-bottom:3px">${esc(s.title||'')}</div>
            <div style="font-size:11px;color:var(--muted);line-height:1.5">${esc(s.description||s.desc||'')}</div>
            ${s.code?`<pre style="margin-top:6px;background:#06101e;border:1px solid var(--border);border-radius:7px;padding:8px 10px;font-size:10px;font-family:'Cascadia Code',monospace;color:#89d4c8;overflow-x:auto">${esc(s.code)}</pre>`:''}
          </div>
        </div>
      `).join('')}
      ${(data.tips||[]).length>0?`<div style="font-size:10px;color:var(--warn);margin-top:4px">💡 ${(data.tips||[]).join(' | ')}</div>`:''}`;
  } else if(name==='quiz'){
    quizData = data;
    body = `<p style="font-size:11px;margin-bottom:8px;color:var(--muted)">共${(data.questions||[]).length}题 · 及格${data.passing_score||60}分</p>`;
    body += renderQuizHTML(data.questions||[]);
  } else if(name==='iteration'){
    const opts = [{v:'simplify',l:'简化内容',c:'var(--warn)'},{v:'advance',l:'进阶学习',c:'var(--success)'},{v:'consolidate',l:'巩固基础',c:'var(--accent)'}];
    body = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        ${opts.map(o=>`<div style="padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;border:1px solid ${data.decision===o.v?o.c:'var(--border)'};color:${data.decision===o.v?o.c:'var(--muted)'};background:${data.decision===o.v?o.c+'22':'transparent'}">${o.l}</div>`).join('')}
      </div>
      <p style="font-size:12px;color:var(--muted);line-height:1.6">${esc(data.suggestion||'')}</p>
      ${(data.next_steps||[]).length>0?`<div style="margin-top:6px;font-size:10px;color:var(--accent)">📌 ${(data.next_steps||[]).join(' → ')}</div>`:''}`;
  } else if(name==='socratic'){
    body = `
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px">
        <div style="font-size:10px;color:var(--accent2);font-weight:700;margin-bottom:6px">💬 引导对话</div>
        <p style="font-size:12px;line-height:1.7">${esc(data.response||'')}</p>
      </div>
      <ul style="list-style:none;padding:0">
        ${(data.questions||[]).map(q=>`<li style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:11px">
          <span style="min-width:16px;height:16px;background:rgba(108,92,231,.2);border-radius:50%;color:var(--accent2);font-size:9px;display:flex;align-items:center;justify-content:center;font-weight:900">?</span>
          <span>${esc(q.question||q.q||'')}</span>
        </li>`).join('')}
      </ul>
      ${data.hint?`<div style="font-size:10px;color:var(--warn);margin-top:4px">💡 提示：${esc(data.hint)}</div>`:''}`;
  }

  const card = document.createElement('div');
  card.className = 'result-card';
  card.id = 'card-'+name;
  card.innerHTML = `
    <h4 data-action="toggleCard" data-args="${name}">${AGENT_ICONS[name]||''} ${AGENT_LABELS[name]||name} ${isDemo?'<span style="font-size:9px;background:var(--warn);color:#000;padding:2px 8px;border-radius:8px;margin-left:6px">DEMO</span>':''} <span style="font-size:10px;color:var(--muted)">${data._meta?.model||''}</span><span class="toggle-icon">▼</span></h4>
    <div class="card-body">
    <div>${body}</div>
    <div class="card-actions">
      <button data-action="copyResult" data-args="${name}">📋 复制JSON</button>
      ${name==='socratic'?'<button data-action="exportAllResults">📦 导出全部</button>':''}
      ${name==='knowledge_gen'?'<button data-action="copyCardContent" data-args="card-${name}">📄 复制内容</button>':''}
    </div>
    ${name==='socratic'?'<div id="socraticChat" style="margin-top:10px;max-height:300px;overflow-y:auto"></div><div class="chat-input-row"><input id="socraticInput" placeholder="输入你的回答，继续对话..." onkeydown="if(event.key===\'Enter\')sendSocraticChat()"><button data-action="sendSocraticChat">发送</button></div>':''}
    </div>
  `;
  const rg2 = document.getElementById('rg');
  if(rg2) rg2.appendChild(card);
  else document.getElementById('resultsArea').appendChild(card);
  card.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function renderQuizHTML(qs){
  let h = '<div>';
  qs.forEach((q,i)=>{
    h += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:9px;padding:10px;margin-bottom:8px" id="qc-${i}">
      <div style="font-size:10px;color:var(--accent);font-weight:700;margin-bottom:4px">题目 ${i+1}/${qs.length}</div>
      <div style="font-size:12px;margin-bottom:8px">${esc(q.question||q.q||'')}</div>
      <div>${(q.options||q.opts||[]).map((o,j)=>
        `<div data-action="pickOpt" data-args="${i},${j}" style="padding:7px 10px;border:1px solid var(--border);border-radius:7px;margin-bottom:4px;font-size:11px;cursor:pointer;transition:all .2s" class="qopt-${i}">${'ABCD'[j]}. ${esc(o)}</div>`
      ).join('')}</div>
      <div id="qe-${i}" style="display:none;margin-top:6px;font-size:10px;color:var(--accent);background:rgba(0,212,170,.08);padding:6px 10px;border-radius:7px">💡 ${esc(q.explanation||q.exp||'')}</div>
    </div>`;
  });
  h += `<button class="btn btn-primary" style="margin-top:8px" data-action="gradeQuiz">📊 批改评分</button><div id="quizScore"></div></div>`;
  return h;
}

// ============================================================
// 测验交互
// ============================================================
let userAnswers = {};
function pickOpt(qi, oi){
  document.querySelectorAll(`.qopt-${qi}`).forEach(o=>{o.style.borderColor='var(--border)';o.style.background='';});
  const els = document.querySelectorAll(`.qopt-${qi}`);
  if(els[oi]){ els[oi].style.borderColor='var(--accent)'; els[oi].style.background='rgba(0,212,170,.1)'; }
  userAnswers[qi] = oi;
}
function gradeQuiz(){
  if(!quizData) return;
  const qs = quizData.questions||[];
  let correct = 0;
  qs.forEach((q,i)=>{
    const exp = document.getElementById('qe-'+i);
    if(exp) exp.style.display = 'block';
    const opts = document.querySelectorAll(`.qopt-${i}`);
    const ci = q.correct;
    if(opts[ci]){ opts[ci].style.borderColor='var(--success)'; opts[ci].style.background='rgba(0,212,170,.15)'; }
    const ua = userAnswers[i];
    if(ua !== undefined && ua !== ci && opts[ua]){ opts[ua].style.borderColor='var(--danger)'; opts[ua].style.background='rgba(255,107,107,.1)'; }
    if(ua === ci) correct++;
  });
  const score = Math.round(correct/qs.length*100);
  document.getElementById('quizScore').innerHTML = `<div style="text-align:center;font-size:20px;font-weight:900;padding:14px;border-radius:12px;margin-top:8px;background:${score>=60?'rgba(0,212,170,.1)':'rgba(255,107,107,.1)'};color:${score>=60?'var(--success)':'var(--danger)'};border:1px solid ${score>=60?'var(--success)':'var(--danger)'}55">🎯 ${score}/100 · 正确${correct}/${qs.length}</div>`;
  document.getElementById('mQuiz').textContent = score;
}

// ============================================================
// 工具函数
// ============================================================
function sc2(s){ return s>=80?'var(--success)':s>=50?'var(--warn)':'var(--danger)'; }
function vl2(v){ return {pass:'✅ 通过',pass_with_concerns:'⚠ 有顾虑',needs_revision:'❌ 需修订',reject:'🚫 驳回'}[v]||v; }
function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function md2html(md){
  if(!md) return '';
  return md
    .replace(/```(\w*)\n?([\s\S]*?)```/g,'<pre style="background:#06101e;border:1px solid var(--border);border-radius:7px;padding:8px 10px;font-size:10px;font-family:Cascadia Code,monospace;color:#89d4c8;overflow-x:auto;margin:6px 0"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g,'<code style="background:var(--bg);padding:1px 4px;border-radius:3px;font-size:11px">$1</code>')
    .replace(/^### (.+)$/gm,'<h4 style="font-size:13px;font-weight:700;margin:8px 0 4px">$1</h4>')
    .replace(/^## (.+)$/gm,'<h3 style="font-size:14px;font-weight:800;margin:10px 0 6px">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/^[\-\*] (.+)$/gm,'<li style="font-size:11px;margin-left:16px">$1</li>')
    .replace(/\n{2,}/g,'<br><br>')
    .replace(/\n/g,'<br>');
}

// ============================================================
// 移动端
// ============================================================
function toggleSidebar(){ document.getElementById('sidebar').classList.toggle('mobile-show'); }

// ============================================================
// 进度条
// ============================================================
function updateProgress(pct, label){
  const fill = document.getElementById('progressFill');
  const lbl = document.getElementById('progressLabel');
  const pc = document.getElementById('progressPct');
  if(fill) fill.style.width = pct+'%';
  if(lbl) lbl.textContent = label||'';
  if(pc) pc.textContent = pct+'%';
}

// ============================================================
// Toast提示
// ============================================================
function showToast(msg, dur=2000){
  const t = document.createElement('div'); t.className='toast'; t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), dur);
}

// ============================================================
// 结果复制 & 导出
// ============================================================
function copyResult(name){
  const data = agentResults[name];
  if(!data) return;
  const clean = {...data}; delete clean._demo; delete clean._meta;
  navigator.clipboard.writeText(JSON.stringify(clean, null, 2)).then(()=>showToast('✅ 已复制到剪贴板')).catch(()=>showToast('复制失败'));
}
function copyCardContent(cardId){
  const card = document.getElementById(cardId);
  if(!card) return;
  const text = card.innerText;
  navigator.clipboard.writeText(text).then(()=>showToast('✅ 已复制内容')).catch(()=>showToast('复制失败'));
}
function exportAllResults(){
  if(!Object.keys(agentResults).length){ showToast('暂无结果'); return; }
  const clean = {};
  for(const [k,v] of Object.entries(agentResults)){
    clean[k] = {...v}; delete clean[k]._demo; delete clean[k]._meta;
  }
  const blob = new Blob([JSON.stringify(clean, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='multi-agent-results-'+new Date().toISOString().slice(0,10)+'.json';
  a.click();
  showToast('✅ 已导出JSON');
}

// ============================================================
// 卡片折叠
// ============================================================
function toggleCard(name){
  const card = document.getElementById('card-'+name);
  if(card) card.classList.toggle('collapsed');
}

// ============================================================
// 骨架屏
// ============================================================
function showSkeletons(){
  const rg = document.getElementById('rg') || document.getElementById('resultsArea');
  AGENTS.forEach(name => {
    const sk = document.createElement('div');
    sk.className = 'skeleton-card';
    sk.id = 'sk-'+name;
    sk.innerHTML = `
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:10px">
        <span class="skeleton skeleton-line w40" style="height:16px;width:120px"></span>
      </div>
      <div class="skeleton skeleton-line w80"></div>
      <div class="skeleton skeleton-line w60"></div>
      <div class="skeleton skeleton-line w80"></div>
    `;
    rg.appendChild(sk);
  });
}
function removeSkeleton(name){
  const sk = document.getElementById('sk-'+name);
  if(sk) sk.remove();
}

// ============================================================
// 知识库搜索
// ============================================================
async function searchKB(){
  const q = document.getElementById('kbSearchInput').value.trim();
  if(!q) return;
  log('🔍 搜索知识库：'+q, 'info');
  try {
    const resp = await fetch('/api/knowledge/search?q='+encodeURIComponent(q));
    if(!resp.ok) throw new Error('搜索失败');
    const data = await resp.json();
    const results = data.results || [];
    if(!results.length){ showToast('未找到相关内容'); return; }
    // 在结果区域渲染
    const rg = document.getElementById('rg') || document.getElementById('resultsArea');
    document.getElementById('emptyState')?.remove();
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <h4>🔍 知识库搜索「${esc(q)}」<span style="font-size:10px;color:var(--muted);margin-left:auto">${results.length}条结果</span><span class="toggle-icon">▼</span></h4>
      <div class="card-body">
      ${results.map(r=>`
        <div class="kb-result">
          <div>${esc(r.content||r.text||'').slice(0,300)}${(r.content||r.text||'').length>300?'...':''}</div>
          <div class="kb-source">📄 ${esc(r.source||r.file||'')} · 相关度 ${((r.score||0)*100).toFixed(0)}% ${r.type?'· '+esc(r.type):''}</div>
        </div>
      `).join('')}
      </div>
    `;
    card.querySelector('h4').onclick = ()=>card.classList.toggle('collapsed');
    rg.appendChild(card);
    card.scrollIntoView({behavior:'smooth',block:'nearest'});
    log(`✅ 找到${results.length}条相关知识`, 'success');
  } catch(e){
    log('❌ 搜索失败：'+e.message, 'error');
  }
}

// ============================================================
// 学情可视化报告
// ============================================================
async function generateReport(){
  if(!Object.keys(agentResults).length){ showToast('请先完成全流程再生成报告'); return; }
  log('📊 生成学情报告...', 'info');
  // 直接用前端已有数据渲染，无需调后端
  renderReport({});
  log('✅ 学情报告生成完成', 'success');
}
function renderReport(data){
  const rg = document.getElementById('rg') || document.getElementById('resultsArea');
  const card = document.createElement('div');
  card.className = 'result-card';
  const diag = agentResults.diagnosis || {};
  const rev = agentResults.reviewer || {};
  card.innerHTML = `
    <h4>📊 学情可视化报告<span class="toggle-icon">▼</span></h4>
    <div class="card-body">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div style="background:var(--bg);border-radius:9px;padding:12px;text-align:center">
        <div style="font-size:9px;color:var(--muted)">能力评分</div>
        <div style="font-size:28px;font-weight:900;color:var(--accent)">${diag.level_score||'-'}</div>
        <div style="font-size:9px;color:var(--muted)">/100</div>
      </div>
      <div style="background:var(--bg);border-radius:9px;padding:12px;text-align:center">
        <div style="font-size:9px;color:var(--muted)">幻觉分数</div>
        <div style="font-size:28px;font-weight:900;color:${(rev.hallucination_score||0)<20?'var(--success)':'var(--warn)'}">${rev.hallucination_score||'-'}</div>
        <div style="font-size:9px;color:var(--muted)">/100</div>
      </div>
      <div style="background:var(--bg);border-radius:9px;padding:12px;text-align:center">
        <div style="font-size:9px;color:var(--muted)">准确度</div>
        <div style="font-size:28px;font-weight:900;color:var(--accent)">${rev.accuracy_score||'-'}</div>
        <div style="font-size:9px;color:var(--muted)">%</div>
      </div>
      <div style="background:var(--bg);border-radius:9px;padding:12px;text-align:center">
        <div style="font-size:9px;color:var(--muted)">知识盲区</div>
        <div style="font-size:28px;font-weight:900;color:var(--danger)">${(diag.blind_spots||[]).length}</div>
        <div style="font-size:9px;color:var(--muted)">项需补强</div>
      </div>
    </div>
    <div style="margin-top:10px;background:var(--bg);border-radius:9px;padding:10px">
      <div style="font-size:10px;color:var(--accent2);font-weight:700;margin-bottom:4px">📍 学习路径规划</div>
      ${(diag.learning_path||[]).map((lp,i)=>`<div style="font-size:10px;padding:2px 0">${i+1}. ${esc(lp.phase)} (${lp.estimated_hours||0}h) - ${(lp.topics||[]).join(', ')}</div>`).join('')}
    </div>
    </div>
  `;
  card.querySelector('h4').onclick = ()=>card.classList.toggle('collapsed');
  rg.appendChild(card);
  card.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function renderLocalReport(){
  renderReport({});
}

// ============================================================
// 苏格拉底对话
// ============================================================
let socraticHistory = [];
async function sendSocraticChat(){
  const input = document.getElementById('socraticInput');
  if(!input) return;
  const msg = input.value.trim();
  if(!msg) return;
  input.value = '';
  socraticHistory.push({role:'learner', text:msg});
  renderSocraticChat();
  
  // 调用LLM
  const knowledge = agentResults.knowledge_gen || {};
  const sysPrompt = `你是苏格拉底式导学导师。不要直接给答案，通过追问引导学习者思考。当前学习主题：${knowledge.title||'编程基础'}。知识要点：${(knowledge.concepts||[]).join('、')}。输出JSON：{"response":"回复","next_question":"下一个追问","assessment":"understood/partially_understood/misunderstood"}`;
  try {
    const fullText = await callLLM(sysPrompt, `对话历史：${JSON.stringify(socraticHistory.slice(-6))}\n学习者说：${msg}\n请回应（JSON）：`);
    const parsed = parseLLMOutput(fullText);
    socraticHistory.push({role:'tutor', text:parsed.response||parsed.reply||'你能更详细地解释一下吗？'});
    renderSocraticChat();
  } catch(e){
    socraticHistory.push({role:'tutor', text:'继续思考——你能举个例子说明吗？'});
    renderSocraticChat();
  }
}
function renderSocraticChat(){
  const chatEl = document.getElementById('socraticChat');
  if(!chatEl) return;
  chatEl.innerHTML = socraticHistory.map(m=>`<div class="chat-bubble ${m.role==='tutor'?'tutor':'learner'}">${esc(m.text)}</div>`).join('');
  chatEl.scrollTop = chatEl.scrollHeight;
}

// ============================================================
// 初始化
// ============================================================
document.getElementById('btnModel').textContent = '🤖 '+{deepseek:'DeepSeek-V3',zhipu:'GLM-4-Flash','openai-compat':'OpenAI兼容'}[currentModel];
if(currentApiKey){ log('🔑 已加载'+currentModel+'的API Key','info'); }
else { 
  log('⚠️ 点击右上角「Key」配置API Key，或「模型」选择AI引擎','warn');
  // 首次打开自动弹出Key配置
  setTimeout(()=>showApiKeyModal(), 800);
}

fetch('/api/health').then(r=>r.json()).then(d=>{
  const n = (d.agents||[]).length;
  log(`后端就绪：${n}个Agent | 版本 ${d.version||'?'}`,'success');
}).catch(()=>log('⚠️ 后端未连接（可使用前端直调模式）','warn'));

// Ctrl+Enter 快捷启动
document.addEventListener('keydown', e=>{
  if(e.ctrlKey && e.key==='Enter' && !document.getElementById('btnStart').disabled){
    startPipeline();
  }
});

// ============ Event Delegation ============
document.addEventListener('click', function(e) {
  var el = e.target.closest('[data-action]');
  if (!el) return;
  var action = el.dataset.action;
  var args = el.dataset.args || '';
  switch(action) {
    case 'stopPipeline': stopPipeline(); break;
    case 'singleStep': singleStep(args); break;
    case 'toggleCard': toggleCard(el); break;
    case 'copyResult': copyResult(args); break;
    case 'toggleCard': toggleCard(el); break;
    case 'exportAll': exportAll(); break;
    case 'switchModel': switchModel(); break;
    case 'showApiConfig': showApiConfig(); break;
    case 'saveApiKey': saveApiKey(); break;
    case 'closeModal': closeModal(); break;
    case 'runSocratic': runSocratic(args); break;
    case 'runIteration': runIteration(args); break;
    case 'sendSocraticReply': sendSocraticReply(); break;
    case 'toggleSidebar': toggleSidebar(); break;
    case 'showModelModal': showModelModal(); break;
    case 'showApiKeyModal': showApiKeyModal(); break;
    case 'startPipeline': startPipeline(); break;
    case 'searchKB': searchKB(); break;
    case 'generateReport': generateReport(); break;
    case 'runSingle': runSingle(args); break;
    case 'closeModelModal': closeModelModal(); break;
    case 'confirmModel': confirmModel(); break;
    case 'skipApiKey': skipApiKey(); break;
    case 'confirmApiKey': confirmApiKey(); break;
    case 'exportAllResults': exportAllResults(); break;
    case 'copyCardContent': { var cardEl = document.getElementById(args); if(cardEl) copyCardContent(cardEl); break; }
    case 'sendSocraticChat': sendSocraticChat(); break;
    case 'pickOpt': { var parts = args.split(','); pickOpt(parseInt(parts[0]), parseInt(parts[1])); break; }
    case 'gradeQuiz': gradeQuiz(); break;
  }
});
