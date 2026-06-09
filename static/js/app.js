/* ============================================================
   Multi-Agent Edu v5.0 - 核心应用逻辑
   挑战杯 XH-202630 · 7-Agent协同决策可视化
   ============================================================ */

// ============ 全局状态 ============
const AGENTS = ['diagnosis','knowledge_gen','reviewer','practice_guide','quiz','iteration','socratic'];
const AGENT_LABELS = {diagnosis:'学情诊断',knowledge_gen:'知识生成',reviewer:'审核裁判',practice_guide:'实操指南',quiz:'分阶测试',iteration:'迭代优化',socratic:'苏格拉底'};
const AGENT_ICONS = {diagnosis:'🔍',knowledge_gen:'📚',reviewer:'🔎',practice_guide:'🔧',quiz:'📝',iteration:'🔄',socratic:'💬'};
const AGENT_COLORS = {diagnosis:'#00e8b0',knowledge_gen:'#4da6ff',reviewer:'#ff6b6b',practice_guide:'#7c5cfc',quiz:'#ffb347',iteration:'#ff9cf5',socratic:'#00d4ff'};

let agentResults = {};
let quizData = null;
let timerInterval = null;
let startTime = 0;
let abortController = null;
let currentModel = localStorage.getItem('selected_model') || 'zhipu';
let currentApiKey = localStorage.getItem('api_key_'+currentModel) || '';

// SSE流式状态
let streamRunning = false;
let typewriterTimers = {}; // agent -> setTimeout id

// 辩论状态
let debateState = {round:0, maxRounds:2, scores:[], showing:false};
let debateAnimFrame = null;

// 拓扑Canvas状态
let topoNodes = [];       // {id, x, y, state:'idle'|'running'|'done', label}
let topoParticles = [];   // {from, to, progress, speed, color}
let topoAnimFrame = null;
let topoCtx = null;

// 对话历史
let globalChatHistory = [];

// ============ 欢迎引导 ============
(function initOnboarding(){
  const overlay = document.getElementById('onboarding');
  if(!overlay) return;
  const steps = overlay.querySelectorAll('.ob-step');
  const dots = overlay.querySelectorAll('.ob-dots span');
  const btn = document.getElementById('obNext');
  if(!btn) return;
  let cur = 0;
  btn.onclick = () => {
    cur++;
    if(cur >= steps.length){ overlay.classList.add('hidden'); return; }
    steps.forEach((s,i)=>s.classList.toggle('active',i===cur));
    dots.forEach((d,i)=>d.classList.toggle('active',i===cur));
    if(cur === steps.length-1) btn.textContent = '开始体验 →';
  };
  // 5秒无操作自动进入
  setTimeout(()=>{ if(!overlay.classList.contains('hidden')) overlay.classList.add('hidden'); }, 8000);
})();

// ============ 拓扑Canvas ============
function initTopology(){
  const canvas = document.getElementById('topoCanvas');
  if(!canvas) return;
  topoCtx = canvas.getContext('2d');
  resizeTopology();
  window.addEventListener('resize', resizeTopology);
  // 定义7个节点的U型布局
  const nodes = [
    {id:'diagnosis',     label:'诊断'},
    {id:'knowledge_gen', label:'生成'},
    {id:'reviewer',      label:'审核'},
    {id:'practice_guide',label:'实操'},
    {id:'quiz',          label:'测试'},
    {id:'iteration',     label:'迭代'},
    {id:'socratic',      label:'导学'},
  ];
  topoNodes = nodes.map((n,i) => ({
    ...n,
    x: 0, y: 0,
    state: 'idle',
    icon: AGENT_ICONS[n.id],
  }));
  drawTopology();
  startTopologyAnim();
}

function resizeTopology(){
  const canvas = document.getElementById('topoCanvas');
  if(!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  repositionNodes();
  drawTopology();
}

function repositionNodes(){
  const canvas = document.getElementById('topoCanvas');
  if(!canvas || !topoNodes.length) return;
  const w = canvas.width, h = canvas.height;
  const cx = w/2;
  // 7节点: 3上(诊断/生成/审核) + 1中间(实操) + 3下(测试/迭代/导学)
  const positions = [
    {x: cx - 180, y: h * 0.25},  // diagnosis
    {x: cx,       y: h * 0.15},  // knowledge_gen (center top)
    {x: cx + 180, y: h * 0.25},  // reviewer
    {x: cx,       y: h * 0.5},   // practice_guide (center)
    {x: cx - 150, y: h * 0.75},  // quiz
    {x: cx,       y: h * 0.88},  // iteration (center bottom)
    {x: cx + 150, y: h * 0.75},  // socratic
  ];
  topoNodes.forEach((n,i) => {
    n.x = positions[i].x;
    n.y = positions[i].y;
  });
}

function startTopologyAnim(){
  if(topoAnimFrame) cancelAnimationFrame(topoAnimFrame);
  let lastTime = 0;
  function loop(ts){
    const dt = ts - lastTime;
    lastTime = ts;
    // 更新粒子
    updateParticles(dt);
    // 绘制
    drawTopology();
    topoAnimFrame = requestAnimationFrame(loop);
  }
  topoAnimFrame = requestAnimationFrame(loop);
}

function updateParticles(dt){
  // 更新辩论粒子（知识生成<->审核之间的双向粒子）
  const debateNode1 = topoNodes.find(n=>n.id==='knowledge_gen');
  const debateNode2 = topoNodes.find(n=>n.id==='reviewer');
  if(!debateNode1 || !debateNode2) return;
  // 辩论时：增加双向红色粒子
  if(debateState.showing && debateState.round > 0){
    // 添加新粒子（随机方向）
    if(Math.random() < 0.08){
      topoParticles.push({
        from: Math.random()<0.5 ? 'knowledge_gen' : 'reviewer',
        to:   Math.random()<0.5 ? 'reviewer' : 'knowledge_gen',
        progress: Math.random(),
        speed: 0.003 + Math.random()*0.002,
        color: '#ff6b6b',
        size: 2 + Math.random()*2,
      });
    }
  }
  // 移动粒子
  topoParticles = topoParticles.filter(p => {
    const dir = p.from === 'knowledge_gen' ? 1 : -1;
    p.progress += p.speed * dir;
    return p.progress >= 0 && p.progress <= 1;
  });
}

function drawTopology(){
  if(!topoCtx) return;
  const canvas = topoCtx.canvas;
  const w = canvas.width, h = canvas.height;
  topoCtx.clearRect(0, 0, w, h);

  // 背景网格
  topoCtx.strokeStyle = 'rgba(30,40,70,0.3)';
  topoCtx.lineWidth = 0.5;
  const gridSize = 30;
  for(let x=0; x<w; x+=gridSize){ topoCtx.beginPath(); topoCtx.moveTo(x,0); topoCtx.lineTo(x,h); topoCtx.stroke(); }
  for(let y=0; y<h; y+=gridSize){ topoCtx.beginPath(); topoCtx.moveTo(0,y); topoCtx.lineTo(w,y); topoCtx.stroke(); }

  // 连接线：顺序流程
  const flowOrder = ['diagnosis','knowledge_gen','reviewer','practice_guide','quiz','iteration','socratic'];
  topoCtx.lineWidth = 1.5;
  for(let i=0; i<flowOrder.length-1; i++){
    const from = topoNodes.find(n=>n.id===flowOrder[i]);
    const to   = topoNodes.find(n=>n.id===flowOrder[i+1]);
    if(!from || !to) continue;
    const isActive = from.state==='running' || from.state==='done';
    const lit = from.state==='done';
    topoCtx.strokeStyle = lit ? 'rgba(0,232,176,0.4)' : 'rgba(26,39,68,0.8)';
    topoCtx.beginPath();
    topoCtx.moveTo(from.x, from.y);
    topoCtx.lineTo(to.x, to.y);
    topoCtx.stroke();
  }

  // 辩论双向连线（知识生成 ↔ 审核）
  const n1 = topoNodes.find(n=>n.id==='knowledge_gen');
  const n2 = topoNodes.find(n=>n.id==='reviewer');
  if(n1 && n2){
    topoCtx.strokeStyle = debateState.showing ? 'rgba(255,107,107,0.6)' : 'rgba(255,107,107,0.15)';
    topoCtx.lineWidth = debateState.showing ? 2 : 1;
    topoCtx.setLineDash([5,5]);
    topoCtx.beginPath();
    topoCtx.moveTo(n1.x, n1.y);
    topoCtx.lineTo(n2.x, n2.y);
    topoCtx.stroke();
    topoCtx.setLineDash([]);

    // 辩论粒子
    topoParticles.forEach(p => {
      const pf = topoNodes.find(n=>n.id===p.from);
      const pt = topoNodes.find(n=>n.id===p.to);
      if(!pf || !pt) return;
      const x = pf.x + (pt.x - pf.x) * p.progress;
      const y = pf.y + (pt.y - pf.y) * p.progress;
      topoCtx.beginPath();
      topoCtx.arc(x, y, p.size, 0, Math.PI*2);
      topoCtx.fillStyle = p.color + 'cc';
      topoCtx.fill();
    });
  }

  // 绘制节点
  topoNodes.forEach(node => {
    const isRunning = node.state === 'running';
    const isDone = node.state === 'done';
    const isDebate = (node.id==='knowledge_gen' || node.id==='reviewer') && debateState.showing;
    const color = AGENT_COLORS[node.id] || '#00e8b0';
    const r = 28;

    // 发光效果
    if(isRunning || isDebate){
      topoCtx.shadowBlur = 20;
      topoCtx.shadowColor = color;
    } else if(isDone){
      topoCtx.shadowBlur = 12;
      topoCtx.shadowColor = '#00e8b0';
    } else {
      topoCtx.shadowBlur = 0;
    }

    // 节点圆
    topoCtx.beginPath();
    topoCtx.arc(node.x, node.y, r, 0, Math.PI*2);
    topoCtx.fillStyle = isDone ? 'rgba(0,232,176,0.15)' : isRunning ? color+'22' : 'rgba(13,20,36,0.9)';
    topoCtx.fill();
    topoCtx.strokeStyle = isDone ? '#00e8b0' : isRunning ? color : 'rgba(26,39,68,0.8)';
    topoCtx.lineWidth = isRunning ? 2 : 1.5;
    topoCtx.stroke();

    // 脉冲环（运行中）
    if(isRunning){
      const pulse = (Date.now() % 1500) / 1500;
      topoCtx.beginPath();
      topoCtx.arc(node.x, node.y, r + pulse*15, 0, Math.PI*2);
      topoCtx.strokeStyle = color+'44';
      topoCtx.lineWidth = 1.5;
      topoCtx.stroke();
    }

    topoCtx.shadowBlur = 0;

    // 节点图标
    topoCtx.font = '14px serif';
    topoCtx.textAlign = 'center';
    topoCtx.textBaseline = 'middle';
    topoCtx.fillText(node.icon, node.x, node.y - 2);

    // 节点标签
    topoCtx.font = '9px -apple-system,Segoe UI,sans-serif';
    topoCtx.fillStyle = isRunning ? color : isDone ? '#00e8b0' : '#7a869e';
    topoCtx.fillText(node.label, node.x, node.y + 18);

    // 状态小点
    if(isRunning){
      topoCtx.beginPath();
      topoCtx.arc(node.x+r-4, node.y-r+4, 4, 0, Math.PI*2);
      topoCtx.fillStyle = color;
      topoCtx.fill();
    } else if(isDone){
      topoCtx.beginPath();
      topoCtx.arc(node.x+r-4, node.y-r+4, 4, 0, Math.PI*2);
      topoCtx.fillStyle = '#00e8b0';
      topoCtx.fill();
      topoCtx.font = '7px sans-serif';
      topoCtx.fillStyle = '#060b18';
      topoCtx.fillText('✓', node.x+r-4, node.y-r+5);
    }
  });
}

function setTopoNode(id, state){
  const n = topoNodes.find(n=>n.id===id);
  if(n) n.state = state;
  drawTopology();
}

// ============ 模型 & API Key ============
function showModelModal(){ document.getElementById('modelModal').classList.add('show'); document.getElementById('modelSelect').value = currentModel; }
function closeModelModal(){ document.getElementById('modelModal').classList.remove('show'); }
function confirmModel(){
  currentModel = document.getElementById('modelSelect').value;
  localStorage.setItem('selected_model', currentModel);
  document.getElementById('btnModel').textContent = '🤖 '+{deepseek:'DeepSeek',zhipu:'GLM','openai-compat':'OpenAI'}[currentModel];
  closeModelModal();
  log('🤖 模型：'+currentModel,'info');
  currentApiKey = '';
  localStorage.removeItem('api_key_'+currentModel);
}

function showApiKeyModal(){
  document.getElementById('apiKeyModal').classList.add('show');
  document.getElementById('apiKeyInput').value = currentApiKey ? '••••••••' : '';
  document.getElementById('apiKeyError').style.display = 'none';
  const hints = {
    deepseek: 'DeepSeek Key（sk-开头）<br>platform.deepseek.com获取，免费额度充足',
    zhipu: '智谱Key格式：{id}.{secret}<br>open.bigmodel.cn获取',
    'openai-compat': '输入API Key+Base URL'
  };
  document.getElementById('apiKeyHint').innerHTML = hints[currentModel] || '';
}
function closeApiKeyModal(){ document.getElementById('apiKeyModal').classList.remove('show'); }
function skipApiKey(){
  currentApiKey = '';
  closeApiKeyModal();
  log('⚠️ Demo模式（无真实AI）','warn');
}
async function confirmApiKey(){
  const input = document.getElementById('apiKeyInput').value.trim();
  const errEl = document.getElementById('apiKeyError');
  if(!input || input==='••••••••'){ errEl.textContent='请输入Key'; errEl.style.display='block'; return; }
  currentApiKey = input;
  localStorage.setItem('api_key_'+currentModel, input);
  try {
    const ok = await testApiKey();
    if(ok){ log('✅ Key有效','success'); closeApiKeyModal(); }
    else { errEl.textContent='Key验证失败'; errEl.style.display='block'; }
  } catch(e){ errEl.textContent=e.message; errEl.style.display='block'; }
}
async function testApiKey(){
  if(currentModel==='deepseek') return await callDeepSeek('hi', true);
  if(currentModel==='zhipu') return await callZhipu('hi', true);
  return false;
}

// ============ LLM调用（保留所有模型） ============
async function callLLM(sys, user, onChunk){
  if(!currentApiKey) throw new Error('NoKey');
  if(currentModel==='deepseek') return await callDeepSeekStream(sys, user, onChunk);
  if(currentModel==='zhipu') return await callZhipuStream(sys, user, onChunk);
  return await callOpenAICompatStream(sys, user, onChunk);
}

async function callDeepSeekStream(sys, user, onChunk){
  abortController = new AbortController();
  const resp = await fetch('https://api.deepseek.com/chat/completions',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+currentApiKey},
    body: JSON.stringify({model:'deepseek-chat',messages:[{role:'system',content:sys},{role:'user',content:user}],temperature:parseFloat(document.getElementById('vTemp')?.textContent||'0.3'),stream:true}),
    signal: abortController.signal
  });
  if(!resp.ok) throw new Error('DeepSeek '+resp.status);
  return streamRead(resp, onChunk);
}

async function callZhipuStream(sys, user, onChunk){
  abortController = new AbortController();
  const parts = currentApiKey.split('.');
  if(parts.length<2) throw new Error('Zhipu Key格式错误');
  const token = await genJwt(parts[0], parts.slice(1).join('.'));
  const resp = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
    body: JSON.stringify({model:'glm-4-flash',messages:[{role:'system',content:sys},{role:'user',content:user}],temperature:parseFloat(document.getElementById('vTemp')?.textContent||'0.3'),stream:true}),
    signal: abortController.signal
  });
  if(!resp.ok) throw new Error('Zhipu '+resp.status);
  return streamRead(resp, onChunk);
}

async function callOpenAICompatStream(sys, user, onChunk){
  abortController = new AbortController();
  const baseUrl = localStorage.getItem('openai_compat_base_url')||'https://api.openai.com/v1';
  const model = localStorage.getItem('openai_compat_model')||'gpt-3.5-turbo';
  const resp = await fetch(baseUrl+'/chat/completions',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+currentApiKey},
    body: JSON.stringify({model,messages:[{role:'system',content:sys},{role:'user',content:user}],stream:true}),
    signal: abortController.signal
  });
  if(!resp.ok) throw new Error('OpenAI '+resp.status);
  return streamRead(resp, onChunk);
}

async function streamRead(resp, onChunk){
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf='', full='';
  while(true){
    const {done,value} = await reader.read();
    if(done) break;
    buf += dec.decode(value,{stream:true});
    const lines = buf.split('\n');
    buf = lines.pop()||'';
    for(const line of lines){
      if(line.startsWith('data: ')){
        const d = line.slice(6);
        if(d==='[DONE]') continue;
        try {
          const j = JSON.parse(d);
          const ch = (j.choices?.[0]?.delta?.content)||'';
          full += ch;
          if(ch && onChunk) onChunk(ch);
        }catch(e){}
      }
    }
  }
  return full;
}

async function genJwt(id, sec){
  const h = btoa(JSON.stringify({alg:'HS256',sign_type:'SIGN'})).replace(/=+$/,'');
  const t = Math.floor(Date.now()/1000);
  const p = btoa(JSON.stringify({api_key:id,exp:t+3600,timestamp:t})).replace(/=+$/,'');
  const sig = await hmacSha256(h+'.'+p, sec);
  return h+'.'+p+'.'+sig;
}
async function hmacSha256(msg, key){
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig = await crypto.subtle.sign('HMAC',k,enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function callDeepSeek(prompt, test){
  try{const r=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+currentApiKey},body:JSON.stringify({model:'deepseek-chat',messages:[{role:'user',content:prompt}],max_tokens:5})});return r.ok;}catch(e){return false;}
}
async function callZhipu(prompt, test){
  try{const p=currentApiKey.split('.');if(p.length<2)return false;const t=await genJwt(p[0],p.slice(1).join('.'));const r=await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+t},body:JSON.stringify({model:'glm-4-flash',messages:[{role:'user',content:prompt}],max_tokens:5})});return r.ok;}catch(e){return false;}
}

// ============ Prompt构建 ============
function buildPrompts(agentName, context){
  const p = getProfile();
  if(agentName==='diagnosis') return {
    system:`你是学情诊断专家。输入学习者背景，输出JSON：
{"learner_level":"beginner|intermediate|advanced","level_score":<0-100>,"strengths":[""],"blind_spots":[""],"focus_topic":"","learning_path":[{"phase":"","topics":[""],"estimated_hours":<int>}]}`,
    user:`背景：${p.background}\n经验：${p.experience}\n目标：${p.goal}\n自评：${p.level}\n诊断（JSON）：`
  };
  if(agentName==='knowledge_gen') return {
    system:`你是知识生成专家。诊断：${JSON.stringify(context.diagnosis||{})}\n生成800-1500字Markdown内容，输出JSON：
{"title":"","content":"Markdown","concepts":[""],"source_refs":[{"source":"","type":"[教材]|[官方文档]|[论文]|[实践]"}]}`,
    user:`请生成个性化学习内容（JSON）：`
  };
  if(agentName==='reviewer') return {
    system:`你是内容审核专家。评分：hallucination_score 0-100，accuracy_score 0-100。输出JSON：
{"verdict":"pass|pass_with_concerns|needs_revision|reject","hallucination_score":<int>,"accuracy_score":<int>,"issues":[{"severity":"high|medium|low","description":"","correct_info":""}],"debate_rounds":<int>,"debate_log":[{"round":1,"reviewer_verdict":"","hallucination_score":<int>}]}`,
    user:`内容：${(context.content||'').slice(0,2000)}\n来源：${JSON.stringify(context.source_refs||[])}\n审核（JSON）：`
  };
  if(agentName==='practice_guide') return {
    system:`你是实操指导专家。输出JSON：
{"difficulty":"easy|medium|hard","estimated_time":"","prerequisites":[""],"steps":[{"title":"","description":"","code":"可选代码","expected_output":""}],"tips":[""]}`,
    user:`主题：${context.topic||'Python基础'}\n水平：${p.level}\n生成实操指南（JSON）：`
  };
  if(agentName==='quiz') return {
    system:`你是测试专家。3-5题选择题，输出JSON：
{"questions":[{"type":"choice","question":"","options":["A","B","C","D"],"correct":0,"explanation":""}],"total_score":100,"passing_score":60}`,
    user:`知识：${(context.knowledge?.content||'').slice(0,1500)}\n难度：${p.level}\n生成测试（JSON）：`
  };
  if(agentName==='iteration') return {
    system:`你是迭代优化专家。输出JSON：
{"decision":"simplify|advance|consolidate","adjustments":{"focus_topics":[""],"remove_topics":[""],"add_topics":[""]},"suggestion":"","next_steps":[""]}`,
    user:`测验：${JSON.stringify(context.quiz_result||{})}\n诊断：${JSON.stringify(context.diagnosis||{})}\n迭代决策（JSON）：`
  };
  if(agentName==='socratic') return {
    system:`你是苏格拉底导师。输出JSON：
{"response":"","questions":[{"question":"","purpose":""}],"hint":""}`,
    user:`知识：${(context.knowledge?.content||'').slice(0,1000)}\n苏格拉底导学（JSON）：`
  };
  return {system:'',user:''};
}

function parseLLMOutput(text){
  if(!text) return {};
  let c = text.trim();
  const m = c.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if(m) c = m[1].trim();
  try{return JSON.parse(c);}catch(e){}
  const s = c.indexOf('{'), e = c.lastIndexOf('}');
  if(s>=0 && e>s){try{return JSON.parse(c.slice(s,e+1));}catch(e){}}
  try{return JSON.parse(c.replace(/'/g,'"').replace(/,\s*\}/g,'}').replace(/,\s*\]/g,']'));}catch(e){}
  return {content:text,_parse_error:'解析失败'};
}

// ============ 获取画像 ============
function getProfile(){
  return{
    background: document.getElementById('inpBg')?.value||'',
    experience: document.getElementById('inpExp')?.value||'',
    goal: document.getElementById('inpGoal')?.value||'',
    level: document.getElementById('inpLvl')?.value||'intermediate'
  };
}

// ============ 全流程启动（SSE优先，回退逐Agent） ============
async function startPipeline(){
  const p = getProfile();
  if(!p.background.trim()){ alert('请填写背景描述'); return; }
  if(!currentApiKey){
    log('⚠️ 无Key，进入Demo模式','warn');
    return runDemoPipeline();
  }

  agentResults = {};
  resetUI();
  startTimer();
  log('🚀 7个Agent协同启动...','info');

  try {
    // 优先尝试SSE后端流
    await runSSEPipeline();
  } catch(e){
    if(e.message !== 'NoKey') log('⚠️ SSE失败，改用直调：'+e.message,'warn');
    await runDirectPipeline();
  }

  stopTimer();
}

async function runSSEPipeline(){
  const p = getProfile();
  streamRunning = true;
  document.getElementById('btnStart').disabled = true;
  document.getElementById('btnStop').style.display = 'block';

  const resp = await fetch('/api/stream',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({profile:p, debate_rounds:parseInt(document.getElementById('vRounds')?.textContent||'2')}),
  });
  if(!resp.ok) throw new Error('SSE '+resp.status);

  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf='';

  while(true){
    const {done, value} = await reader.read();
    if(done) break;
    buf += dec.decode(value,{stream:true});
    const lines = buf.split('\n');
    buf = lines.pop()||'';
    for(const line of lines){
      if(line.startsWith('data: ')){
        const raw = line.slice(6);
        if(raw==='[DONE]'){ streamRunning=false; break; }
        try {
          const evt = JSON.parse(raw);
          handleSSEEvent(evt);
        }catch(e){}
      }
    }
    if(!streamRunning) break;
  }

  streamRunning = false;
  document.getElementById('btnStart').disabled = false;
  document.getElementById('btnStop').style.display = 'none';
  log('✅ 全流程完成','success');
}

function handleSSEEvent(evt){
  const {step, agent, status, chunk, result, stream_text} = evt;

  if(status==='running'){
    // 流式文字输出
    if(stream_text){
      appendStreamingText(agent, stream_text);
    }
    // 更新拓扑
    if(step && agent){
      setTopoNode(agent, 'running');
      setPipe(step, 'active');
      log(`${AGENT_ICONS[agent]} ${AGENT_LABELS[agent]} 运行中...`,'info');
    }
    // 辩论开始
    if(evt.type==='debate_start'){
      debateState.showing = true;
      debateState.round = 0;
      showDebatePanel();
      log('⚔️ 辩论开始','warn');
    }
    // 辩论轮次
    if(evt.type==='debate_round'){
      debateState.round = evt.round;
      debateState.current_gen = evt.gen_text || '';
      debateState.current_rev = evt.rev_text || '';
      debateState.current_score = evt.hallucination_score;
      updateDebatePanel();
    }
    // 辩论结束
    if(evt.type==='debate_end'){
      debateState.verdict = evt.verdict;
      debateState.final_score = evt.hallucination_score;
      closeDebatePanel();
      log('⚔️ 辩论结束：'+vl2(evt.verdict),'success');
    }
  }

  if(status==='completed' && result){
    // Agent完成
    agentResults[agent] = result;
    setTopoNode(agent, 'done');
    const done = Object.keys(agentResults).length;
    document.getElementById('mAgents').textContent = done+'/7';
    const pct = Math.round(done/7*100);
    updateProgress(pct, `${AGENT_LABELS[agent]}完成 · ${done}/7`);
    log(`✅ ${AGENT_LABELS[agent]} 完成`,'success');
    // 渲染卡片（带打字机效果）
    if(!document.getElementById('card-'+agent)){
      renderCard(agent, result);
    }
    if(agent==='reviewer'){
      document.getElementById('mHalluc').textContent = result.hallucination_score??'-';
      document.getElementById('mAcc').textContent = result.accuracy_score??'-';
    }
  }
}

// 直接调API的全流程（回退方案）
async function runDirectPipeline(){
  const p = getProfile();
  document.getElementById('btnStart').disabled = true;
  document.getElementById('btnStop').style.display = 'block';

  const steps = [
    {name:'diagnosis',     step:1, ctx:p},
    {name:'knowledge_gen',  step:2, ctx:{diagnosis:agentResults.diagnosis, profile:p}},
    {name:'reviewer',      step:3, ctx:{content:agentResults.knowledge_gen?.content||'', source_refs:agentResults.knowledge_gen?.source_refs||[]}},
    {name:'practice_guide', step:4, ctx:{topic:agentResults.diagnosis?.focus_topic||'Python基础', level:p.level}},
    {name:'quiz',           step:5, ctx:{knowledge:agentResults.knowledge_gen||{}, level:p.level}},
    {name:'iteration',      step:6, ctx:{quiz_result:agentResults.quiz||{}, diagnosis:agentResults.diagnosis||{}, knowledge:agentResults.knowledge_gen||{}}},
    {name:'socratic',       step:7, ctx:{knowledge:agentResults.knowledge_gen||{}}},
  ];

  for(const s of steps){
    setTopoNode(s.name, 'running');
    setPipe(s.step, 'active');
    log(`${AGENT_ICONS[s.name]} ${AGENT_LABELS[s.name]} 运行中...`,'info');
    showSkeleton(s.name);

    // 实时流式渲染
    let buf = '';
    const {system, user} = buildPrompts(s.name, s.ctx);
    try {
      const fullText = await callLLM(system, user, ch => { buf += ch; });
      const parsed = parseLLMOutput(fullText || buf);
      agentResults[s.name] = parsed;
      parsed._meta = {agent:s.name, src:'llm', model:currentModel};
    } catch(e){
      log(`⚠️ ${AGENT_LABELS[s.name]} 失败，使用Demo`,'warn');
      agentResults[s.name] = getDemo(s.name);
    }

    setTopoNode(s.name, 'done');
    setPipe(s.step, 'done');
    removeSkeleton(s.name);
    const done = Object.keys(agentResults).length;
    document.getElementById('mAgents').textContent = done+'/7';
    const pct = Math.round(done/7*100);
    updateProgress(pct, `${AGENT_LABELS[s.name]}完成 · ${done}/7`);
    log(`✅ ${AGENT_LABELS[s.name]} 完成`,'success');
    renderCard(s.name, agentResults[s.name]);

    if(s.name==='reviewer'){
      document.getElementById('mHalluc').textContent = agentResults.reviewer.hallucination_score??'-';
      document.getElementById('mAcc').textContent = agentResults.reviewer.accuracy_score??'-';
    }
  }

  document.getElementById('btnStart').disabled = false;
  document.getElementById('btnStop').style.display = 'none';
  log('🎉 全流程完成！','success');
}

// Demo模式全流程
function runDemoPipeline(){
  resetUI();
  startTimer();
  const p = getProfile();
  const steps = [
    {name:'diagnosis',step:1},{name:'knowledge_gen',step:2},{name:'reviewer',step:3},
    {name:'practice_guide',step:4},{name:'quiz',step:5},{name:'iteration',step:6},{name:'socratic',step:7}
  ];
  let delay = 300;
  steps.forEach(s => {
    setTimeout(()=>{
      setTopoNode(s.name,'running');
      setPipe(s.step,'active');
      showSkeleton(s.name);
    }, delay);
    delay += 600;
    setTimeout(()=>{
      setTopoNode(s.name,'done');
      setPipe(s.step,'done');
      removeSkeleton(s.name);
      agentResults[s.name] = getDemo(s.name);
      const done = Object.keys(agentResults).length;
      document.getElementById('mAgents').textContent = done+'/7';
      const pct = Math.round(done/7*100);
      updateProgress(pct, `${AGENT_LABELS[s.name]}完成 · ${done}/7`);
      renderCard(s.name, agentResults[s.name]);
      if(s.name==='reviewer'){
        document.getElementById('mHalluc').textContent = '8';
        document.getElementById('mAcc').textContent = '92';
      }
      if(s.name==='socratic') log('✅ Demo全流程完成','success');
    }, delay);
    delay += 300;
  });
  stopTimer();
}

// ============ 单Agent运行 ============
async function runSingle(name){
  const p = getProfile();
  const ctxs = {
    diagnosis:{...p},
    knowledge_gen:{diagnosis:agentResults.diagnosis||{},profile:p},
    reviewer:{content:agentResults.knowledge_gen?.content||'',source_refs:[]},
    practice_guide:{topic:agentResults.diagnosis?.focus_topic||'Python基础',level:p.level},
    quiz:{knowledge:agentResults.knowledge_gen||{},level:p.level},
    iteration:{quiz_result:agentResults.quiz||{},diagnosis:agentResults.diagnosis||{},knowledge:agentResults.knowledge_gen||{}},
    socratic:{knowledge:agentResults.knowledge_gen||{}}
  };
  setTopoNode(name,'running');
  log(`${AGENT_ICONS[name]} ${AGENT_LABELS[name]} 单步运行...`,'info');
  try {
    const {system,user} = buildPrompts(name,ctxs[name]||{});
    let buf='';
    const fullText = await callLLM(system,user,ch=>{buf+=ch;});
    const parsed = parseLLMOutput(fullText||buf);
    agentResults[name] = parsed;
    parsed._meta={agent:name,src:'llm',model:currentModel};
    setTopoNode(name,'done');
    renderCard(name,parsed);
    log(`✅ ${AGENT_LABELS[name]} 完成`,'success');
  } catch(e){
    setTopoNode(name,'idle');
    log(`❌ ${AGENT_LABELS[name]} 失败`,'error');
  }
}

// ============ Demo数据 ============
function getDemo(name){
  const demos = {
    diagnosis:{learner_level:'intermediate',level_score:65,strengths:['C语言基础','数据结构理解'],blind_spots:['Python生态不熟悉','AI框架未接触'],focus_topic:'Python与AI开发',learning_path:[{phase:'Python基础',topics:['语法','函数','模块'],estimated_hours:20},{phase:'AI实战',topics:['NumPy','Pandas','ML'],estimated_hours:40}],_demo:true},
    knowledge_gen:{title:'Python与AI开发基础',content:'## Python基础\n\nPython是高级语言，以简洁著称。\n\n### 核心概念\n- **变量与类型**：动态类型\n- **函数**：`def`关键字\n- **列表推导式**：`[x*2 for x in lst]`\n\n```python\ndef greet(name):\n    return f"Hello, {name}!"\n```\n\n### AI开发入门\nNumPy→Pandas→Scikit-learn循序渐进...',concepts:['Python语法','NumPy','Pandas','机器学习'],source_refs:[{source:'python_basics.md',type:'[教材]'},{source:'ai_basics.md',type:'[实践]'}],_demo:true},
    reviewer:{verdict:'pass',hallucination_score:8,accuracy_score:92,issues:[],debate_rounds:2,debate_log:[{round:1,reviewer_verdict:'pass',hallucination_score:10},{round:2,reviewer_verdict:'pass',hallucination_score:8}],_demo:true},
    practice_guide:{difficulty:'medium',estimated_time:'3-4小时',prerequisites:['Python 3.10+','VS Code'],steps:[{title:'环境搭建',description:'安装Python环境',code:'# macOS\nbrew install python3',expected_output:'Python 3.12.x'},{title:'第一个程序',description:'Hello World',code:"print('Hello!')",expected_output:'Hello!'}],tips:['用虚拟环境隔离依赖','善用type hints'],_demo:true},
    quiz:{questions:[{type:'choice',question:'Python中定义函数的关键字是？',options:['function','def','func','lambda'],correct:1,explanation:'Python用def定义函数。lambda用于匿名函数。'},{type:'choice',question:'哪个是Python可变数据结构？',options:['tuple','str','list','int'],correct:2,explanation:'list是可变类型。'},{type:'choice',question:'NumPy创建全0数组的函数是？',options:['np.ones()','np.zeros()','np.empty()','np.arange()'],correct:1,explanation:'np.zeros()创建全0数组。'},{type:'choice',question:'过拟合指？',options:['训练差/测试差','训练好/测试差','训练好/测试好','模型太简单'],correct:1,explanation:'过拟合=训练好但泛化差。'}],total_score:100,passing_score:60,_demo:true},
    iteration:{decision:'consolidate',adjustments:{focus_topics:['Python基础练习'],remove_topics:['高级装饰器'],add_topics:['NumPy实战']},suggestion:'建议先巩固Python基础再进入AI学习',next_steps:['完成NumPy基础练习','用Pandas清洗数据'],_demo:true},
    socratic:{response:'你对Python已有初步了解。让我通过问题引导思考：如果要把列表中的偶数翻倍，你会怎么写？',questions:[{question:'列表推导式[x*2 for x in lst if x%2==0]的执行顺序是什么？',purpose:'理解列表推导式内部机制'},{question:'生成器和列表有什么区别？',purpose:'引导思考惰性求值'}],hint:'先for迭代，再if过滤，最后计算表达式值',_demo:true},
  };
  return demos[name] || {_demo:true};
}

// ============ 实时流式文字（辩论用） ============
function appendStreamingText(agent, chunk){
  // 用于辩论阶段实时显示生成/审核的文字
  if(agent==='knowledge_gen' && debateState.showing){
    const el = document.getElementById('debateGenContent');
    if(el) el.textContent = (debateState.current_gen||'') + chunk;
  }
  if(agent==='reviewer' && debateState.showing){
    const el = document.getElementById('debateRevContent');
    if(el) el.textContent = (debateState.current_rev||'') + chunk;
  }
}

// ============ 辩论可视化 ============
function showDebatePanel(){
  debateState.showing = true;
  const overlay = document.getElementById('debateOverlay');
  if(!overlay) return;
  overlay.classList.add('show');
  debateState.current_gen = '';
  debateState.current_rev = '';
  debateState.current_score = 50;
  debateState.verdict = '';
  document.getElementById('debateRoundLabel').textContent = '第 1 轮';
  document.getElementById('debateGenContent').innerHTML = '<div class="debate-placeholder">生成中...</div>';
  document.getElementById('debateRevContent').innerHTML = '<div class="debate-placeholder">等待审核...</div>';
  document.getElementById('debateScoreNum').textContent = '--';
  document.getElementById('debateVerdict').textContent = '';
  document.getElementById('debateFooter').style.display = 'none';
  // 开始分数动画
  animateDebateScore(50);
}

function updateDebatePanel(){
  const r = debateState.round;
  document.getElementById('debateRoundLabel').textContent = '第 ' + r + ' 轮';
  document.getElementById('debateGenContent').innerHTML = `<div style="font-size:11px;line-height:1.7">${esc(debateState.current_gen||'生成中...')}</div>`;
  document.getElementById('debateRevContent').innerHTML = `<div style="font-size:11px;line-height:1.7">${esc(debateState.current_rev||'审核中...')}</div>`;
  if(debateState.current_score){
    animateDebateScore(debateState.current_score);
  }
}

function animateDebateScore(targetScore){
  const el = document.getElementById('debateScoreNum');
  if(!el) return;
  const current = parseInt(el.textContent)||0;
  if(current === targetScore) return;
  const step = targetScore > current ? 1 : -1;
  let now = current;
  function tick(){
    now += step;
    if((step>0 && now>=targetScore)||(step<0 && now<=targetScore)){ now = targetScore; }
    el.textContent = now;
    el.style.color = now < 20 ? '#00e8b0' : now < 50 ? '#ffb347' : '#ff6b6b';
    if(now !== targetScore) setTimeout(tick, 30);
  }
  tick();
}

function closeDebatePanel(){
  const overlay = document.getElementById('debateOverlay');
  if(!overlay) return;
  document.getElementById('debateFooter').style.display = 'block';
  const verdictEl = document.getElementById('debateVerdict');
  if(debateState.verdict){
    const color = debateState.verdict==='pass' ? '#00e8b0' : '#ff6b6b';
    verdictEl.innerHTML = `<span style="font-size:16px;font-weight:900;color:${color}">${vl2(debateState.verdict)}</span> · 幻觉分数：${debateState.final_score||'--'}`;
  }
  // 3秒后自动关闭
  setTimeout(()=>{ overlay.classList.remove('show'); debateState.showing=false; }, 3000);
}

function closeDebate(){
  document.getElementById('debateOverlay')?.classList.remove('show');
  debateState.showing = false;
}

// ============ Pipeline Bar状态 ============
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

// ============ 计时器 ============
function startTimer(){
  startTime = Date.now();
  document.getElementById('liveBadge').style.display = 'inline';
  timerInterval = setInterval(()=>{
    const s = Math.floor((Date.now()-startTime)/1000);
    document.getElementById('timerDisplay').textContent = Math.floor(s/60).toString().padStart(2,'0')+':'+(s%60).toString().padStart(2,'0');
    document.getElementById('mTime').textContent = s+'s';
  }, 1000);
}
function stopTimer(){
  clearInterval(timerInterval);
  document.getElementById('liveBadge').style.display = 'none';
}

// ============ 停止 ============
function stopPipeline(){
  if(abortController) abortController.abort();
  streamRunning = false;
  stopTimer();
  document.getElementById('btnStart').disabled = false;
  document.getElementById('btnStop').style.display = 'none';
  log('⏹ 已停止','warn');
}

// ============ UI重置 ============
function resetUI(){
  agentResults = {};
  document.getElementById('resultsArea').innerHTML = '';
  document.getElementById('emptyState')?.remove();
  document.getElementById('resultsArea').innerHTML = '<div class="empty-state" id="emptyState" style="display:none"><div class="icon">🧠</div><h3>多智能体协同中...</h3></div>';
  document.getElementById('metricsRow').style.display = 'flex';
  AGENTS.forEach((n,i)=>{ setNode(n,''); setPipe(i+1,null); setTopoNode(n,'idle'); });
  topoParticles = [];
  ['mHalluc','mAcc','mQuiz'].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent='-'; });
  document.getElementById('mAgents').textContent='0/7';
  document.getElementById('progressWrap').style.display='block';
  updateProgress(0,'启动中...');
  Object.keys(typewriterTimers).forEach(k=>{ clearTimeout(typewriterTimers[k]); typewriterTimers[k]=null; });
}

function setNode(name, state){
  const el = document.getElementById('nd-'+name);
  if(!el) return;
  el.classList.remove('active','running','done');
  const s = el.querySelector('.status');
  if(state==='running'){ el.classList.add('running','active'); if(s) s.textContent='运行中'; }
  else if(state==='done'){ el.classList.add('done'); if(s) s.textContent='✓ 完成'; }
  else if(state==='error'){ el.classList.add('active'); if(s){s.style.color='var(--danger)'; s.textContent='✗ 出错';}}
  else { if(s){s.textContent='等待中'; s.style.color='';}}
}

// ============ 骨架屏 ============
function showSkeleton(name){
  const rg = document.getElementById('resultsArea');
  if(!rg) return;
  const sk = document.createElement('div');
  sk.className='skeleton-card';
  sk.id='sk-'+name;
  sk.innerHTML=`<div style="display:flex;align-items:center;gap:7px;margin-bottom:10px"><span class="skeleton" style="height:14px;width:120px"></span></div><div class="skeleton skeleton-line w80"></div><div class="skeleton skeleton-line w60"></div><div class="skeleton skeleton-line w80"></div>`;
  rg.appendChild(sk);
}
function removeSkeleton(name){
  const sk = document.getElementById('sk-'+name);
  if(sk) sk.remove();
}

// ============ 进度条 ============
function updateProgress(pct, label){
  const fill = document.getElementById('progressFill');
  const lbl = document.getElementById('progressLabel');
  const pc = document.getElementById('progressPct');
  if(fill) fill.style.width = pct+'%';
  if(lbl) lbl.textContent = label||'';
  if(pc) pc.textContent = pct+'%';
}

// ============ 渲染结果卡片（带打字机效果） ============
function renderCard(name, data){
  const rg = document.getElementById('resultsArea');
  if(!rg) return;
  removeSkeleton(name);
  const old = document.getElementById('card-'+name);
  if(old) old.remove();

  const isDemo = !!data._demo;
  let body = buildCardBody(name, data);
  const card = document.createElement('div');
  card.className = 'result-card streaming';
  card.id = 'card-'+name;
  card.dataset.agent = name;
  card.innerHTML = `
    <h4 data-action="toggleCard" data-args="${name}">
      ${AGENT_ICONS[name]||''} ${AGENT_LABELS[name]||name}
      ${isDemo?'<span style="font-size:8px;background:var(--warn);color:#000;padding:1px 7px;border-radius:7px;margin-left:4px">DEMO</span>':''}
      <span class="toggle-icon">▼</span>
    </h4>
    <div class="card-body" id="cb-'+name+'">${body}</div>
    <div class="card-actions">
      <button data-action="copyResult" data-args="${name}">📋 复制JSON</button>
      ${name==='knowledge_gen'?'<button data-action="copyCardContent" data-args="card-'+name+'">📄 复制内容</button>':''}
      ${name==='socratic'?'<button data-action="exportAllResults">📦 导出全部</button>':''}
    </div>
    ${name==='socratic'?'<div id="socraticChat" style="margin-top:8px;max-height:240px;overflow-y:auto"></div><div class="chat-input-row"><input id="socraticInput" placeholder="输入回答继续对话..." onkeydown="if(event.key===\'Enter\')sendSocraticChat()"><button data-action="sendSocraticChat">发送</button></div>':''}
  `;
  card.querySelector('h4').onclick = (e)=>{
    if(e.target.tagName!=='BUTTON') card.classList.toggle('collapsed');
  };
  rg.appendChild(card);
  card.scrollIntoView({behavior:'smooth',block:'nearest'});

  // 打字机效果
  setTimeout(()=>{ card.classList.remove('streaming'); }, 2000);
}

function buildCardBody(name, data){
  if(name==='diagnosis'){
    return `
      <div style="margin-bottom:6px"><strong>能力评分</strong>：<span style="font-size:20px;font-weight:900;color:${sc2(data.level_score||0)}">${data.level_score||0}</span>/100</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:5px">
        <span style="font-size:9px;color:var(--success);padding:2px 8px;border-radius:10px;background:rgba(0,232,176,.1);border:1px solid rgba(0,232,176,.2)">✅优势</span>
        ${(data.strengths||[]).map(s=>`<span style="font-size:10px;color:var(--muted)">${esc(s)}</span>`).join('·')}
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px">
        <span style="font-size:9px;color:var(--danger);padding:2px 8px;border-radius:10px;background:rgba(255,85,85,.1);border:1px solid rgba(255,85,85,.2)">⚠️盲区</span>
        ${(data.blind_spots||[]).map(s=>`<span style="font-size:10px;color:var(--muted)">${esc(s)}</span>`).join('·')}
      </div>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px">
        <div style="font-size:9px;color:var(--accent2);font-weight:700;margin-bottom:4px">📍 学习路径</div>
        ${(data.learning_path||[]).map((lp,i)=>`<div style="display:flex;gap:6px;margin-bottom:3px;font-size:10px">
          <span style="min-width:16px;height:16px;border-radius:50%;background:var(--accent2);color:#fff;font-size:8px;display:flex;align-items:center;justify-content:center;font-weight:800">${i+1}</span>
          <div><span style="font-weight:700">${esc(lp.phase)}</span> <span style="color:var(--muted)">(${lp.estimated_hours||0}h)</span>
          <div style="color:var(--muted);font-size:9px">${(lp.topics||[]).join(' · ')}</div></div>
        </div>`).join('')}
      </div>`;
  }
  if(name==='knowledge_gen'){
    return `
      <div style="margin-bottom:5px">${(data.concepts||[]).map((c,i)=>`<span style="background:${i%2===0?'rgba(77,166,255,.1)':'rgba(124,92,252,.1)'};color:${i%2===0?'#4da6ff':'#7c5cfc'};padding:2px 9px;border-radius:9px;font-size:9px;font-weight:700;margin-right:3px">${esc(c)}</span>`).join('')}</div>
      <div style="font-size:11px;line-height:1.7;margin-top:5px">${md2html(data.content||'')}</div>
      <div style="margin-top:6px;font-size:9px;color:var(--muted)">📚 来源：${(data.source_refs||[]).map(r=>`<span style="background:var(--bg);border:1px solid var(--border);padding:1px 7px;border-radius:7px;margin-right:3px">${esc(r.source||'')} ${esc(r.type||'')}</span>`).join('')}</div>`;
  }
  if(name==='reviewer'){
    const h=data.hallucination_score||0, a=data.accuracy_score||0;
    return `
      <div style="display:flex;gap:10px;margin-bottom:6px">
        <div><span style="font-size:9px;color:var(--muted)">幻觉分数</span><br><span style="font-size:18px;font-weight:900;color:${h<20?'var(--success)':h<50?'var(--warn)':'var(--danger)'}">${h}</span></div>
        <div><span style="font-size:9px;color:var(--muted)">准确度</span><br><span style="font-size:18px;font-weight:900;color:${sc2(a)}">${a}%</span></div>
        <div><span style="font-size:9px;color:var(--muted)">判定</span><br><span style="font-size:12px;font-weight:800;color:${data.verdict==='pass'?'var(--success)':'var(--warn)'}">${vl2(data.verdict)}</span></div>
      </div>
      ${(data.issues||[]).length>0?`<div style="font-size:9px;color:var(--danger);background:rgba(255,85,85,.08);padding:5px 8px;border-radius:6px;margin-bottom:5px">⚠ ${esc(data.issues[0].description||'')}</div>`:''}
      <div style="background:var(--bg);border-radius:7px;padding:7px;font-size:9px">
        <div style="font-weight:700;color:var(--accent2);margin-bottom:3px">辩论过程 (${data.debate_rounds||1}轮)</div>
        ${(data.debate_log||[]).map((rd,i)=>`<div style="padding:2px 0;border-bottom:1px solid var(--border)">第${i+1}轮：${vl2(rd.reviewer_verdict||rd.v||'')} · 幻觉${rd.hallucination_score||rd.h||0}</div>`).join('')}
      </div>`;
  }
  if(name==='practice_guide'){
    return `
      <div style="display:flex;gap:5px;margin-bottom:6px">
        <span style="font-size:9px;color:var(--prac-color);padding:2px 9px;border-radius:9px;background:rgba(124,92,252,.1);border:1px solid rgba(124,92,252,.2)">难度：${data.difficulty||'-'}</span>
        <span style="font-size:9px;color:var(--warn);padding:2px 9px;border-radius:9px;background:rgba(255,179,71,.1);border:1px solid rgba(255,179,71,.2)">⏱ ${data.estimated_time||'-'}</span>
      </div>
      ${(data.steps||[]).map((s,i)=>`<div style="display:flex;gap:8px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:5px">
        <div style="min-width:20px;height:20px;border-radius:50%;background:rgba(124,92,252,.2);border:1px solid var(--accent2);color:var(--accent2);font-size:8px;font-weight:800;display:flex;align-items:center;justify-content:center">${i+1}</div>
        <div style="flex:1;font-size:10px">
          <div style="font-weight:700;margin-bottom:2px">${esc(s.title||'')}</div>
          <div style="color:var(--muted);line-height:1.5">${esc(s.description||'')}</div>
          ${s.code?`<pre style="margin-top:4px;background:#060b18;border:1px solid var(--border);border-radius:5px;padding:6px 8px;font-size:9px;font-family:'Cascadia Code',monospace;color:#00d4ff;overflow-x:auto">${esc(s.code||'')}</pre>`:''}
        </div>
      </div>`).join('')}
      ${(data.tips||[]).length>0?`<div style="font-size:9px;color:var(--warn);margin-top:4px">💡 ${(data.tips||[]).join(' | ')}</div>`:''}`;
  }
  if(name==='quiz'){
    quizData = data;
    let h = `<p style="font-size:10px;margin-bottom:6px;color:var(--muted)">共${(data.questions||[]).length}题 · 及格${data.passing_score||60}分</p>`;
    h += renderQuizHTML(data.questions||[]);
    return h;
  }
  if(name==='iteration'){
    const opts=[{v:'simplify',l:'简化',c:'var(--warn)'},{v:'advance',l:'进阶',c:'var(--success)'},{v:'consolidate',l:'巩固',c:'var(--accent)'}];
    return `
      <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
        ${opts.map(o=>`<div style="padding:4px 12px;border-radius:18px;font-size:10px;font-weight:700;border:1px solid ${data.decision===o.v?o.c:'var(--border)'};color:${data.decision===o.v?o.c:'var(--muted)'};background:${data.decision===o.v?o.c+'18':'transparent'}">${o.l}</div>`).join('')}
      </div>
      <p style="font-size:11px;color:var(--muted);line-height:1.6">${esc(data.suggestion||'')}</p>
      ${(data.next_steps||[]).length>0?`<div style="margin-top:5px;font-size:9px;color:var(--accent)">📌 ${(data.next_steps||[]).join(' → ')}</div>`:''}`;
  }
  if(name==='socratic'){
    return `
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:9px;padding:10px;margin-bottom:6px">
        <div style="font-size:9px;color:var(--soc-color);font-weight:700;margin-bottom:4px">💬 苏格拉底导学</div>
        <p style="font-size:11px;line-height:1.7">${esc(data.response||'')}</p>
      </div>
      <ul style="list-style:none;padding:0">
        ${(data.questions||[]).map(q=>`<li style="display:flex;align-items:flex-start;gap:6px;padding:5px 0;border-bottom:1px solid var(--border);font-size:10px">
          <span style="min-width:14px;height:14px;border-radius:50%;background:rgba(0,212,255,.15);color:var(--soc-color);font-size:8px;display:flex;align-items:center;justify-content:center;font-weight:900">?</span>
          <span>${esc(q.question||q.q||'')}</span>
        </li>`).join('')}
      </ul>
      ${data.hint?`<div style="font-size:9px;color:var(--warn);margin-top:4px">💡 提示：${esc(data.hint)}</div>`:''}`;
  }
  return '<div style="color:var(--muted);font-size:11px">无数据</div>';
}

// ============ 测验 ============
function renderQuizHTML(qs){
  let h = '';
  qs.forEach((q,i)=>{
    h += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:9px;margin-bottom:7px" id="qc-${i}">
      <div style="font-size:9px;color:var(--accent);font-weight:700;margin-bottom:3px">题目 ${i+1}/${qs.length}</div>
      <div style="font-size:11px;margin-bottom:6px">${esc(q.question||q.q||'')}</div>
      <div>${(q.options||q.opts||[]).map((o,j)=>`<div data-action="pickOpt" data-args="${i},${j}" style="padding:6px 9px;border:1px solid var(--border);border-radius:6px;margin-bottom:3px;font-size:10px;cursor:pointer;transition:all .2s" class="qopt-${i}">${'ABCD'[j]}. ${esc(o)}</div>`).join('')}</div>
      <div id="qe-${i}" style="display:none;margin-top:5px;font-size:9px;color:var(--accent);background:rgba(0,232,176,.06);padding:5px 8px;border-radius:5px">💡 ${esc(q.explanation||q.exp||'')}</div>
    </div>`;
  });
  h += `<button class="btn btn-primary" style="margin-top:8px" data-action="gradeQuiz">📊 批改评分</button><div id="quizScore"></div>`;
  return h;
}

let userAnswers = {};
function pickOpt(qi, oi){
  document.querySelectorAll(`.qopt-${qi}`).forEach(o=>{o.style.borderColor='var(--border)';o.style.background='';});
  const els = document.querySelectorAll(`.qopt-${qi}`);
  if(els[oi]){ els[oi].style.borderColor='var(--accent)'; els[oi].style.background='rgba(0,232,176,.08)'; }
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
    if(opts[ci]){ opts[ci].style.borderColor='var(--success)'; opts[ci].style.background='rgba(0,232,176,.12)'; }
    const ua = userAnswers[i];
    if(ua !== undefined && ua !== ci && opts[ua]){ opts[ua].style.borderColor='var(--danger)'; opts[ua].style.background='rgba(255,85,85,.08)'; }
    if(ua === ci) correct++;
  });
  const score = Math.round(correct/qs.length*100);
  document.getElementById('quizScore').innerHTML = `<div style="text-align:center;font-size:18px;font-weight:900;padding:12px;border-radius:10px;margin-top:6px;background:${score>=60?'rgba(0,232,176,.08)':'rgba(255,85,85,.08)'};color:${score>=60?'var(--success)':'var(--danger)'};border:1px solid ${score>=60?'rgba(0,232,176,.2)':'rgba(255,85,85,.2)'}">🎯 ${score}/100 · 正确${correct}/${qs.length}</div>`;
  document.getElementById('mQuiz').textContent = score;
}

// ============ 工具函数 ============
function sc2(s){ return s>=80?'var(--success)':s>=50?'var(--warn)':'var(--danger)'; }
function vl2(v){ return {pass:'✅ 通过',pass_with_concerns:'⚠ 有顾虑',needs_revision:'❌ 需修订',reject:'🚫 驳回'}[v]||v||''; }
function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function md2html(md){
  if(!md) return '';
  return md
    .replace(/```(\w*)\n?([\s\S]*?)```/g,'<pre style="background:#060b18;border:1px solid var(--border);border-radius:6px;padding:7px 9px;font-size:10px;font-family:Cascadia Code,monospace;color:#00d4ff;overflow-x:auto;margin:5px 0"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g,'<code style="background:var(--bg);padding:1px 4px;border-radius:3px;font-size:10px">$1</code>')
    .replace(/^### (.+)$/gm,'<h4 style="font-size:12px;font-weight:700;margin:7px 0 3px">$1</h4>')
    .replace(/^## (.+)$/gm,'<h3 style="font-size:13px;font-weight:800;margin:9px 0 5px">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/^[\-\*] (.+)$/gm,'<li style="font-size:10px;margin-left:14px">$1</li>')
    .replace(/\n{2,}/g,'<br><br>')
    .replace(/\n/g,'<br>');
}

function log(msg, level){
  const panel = document.getElementById('logPanel');
  if(!panel) return;
  const t = new Date().toLocaleTimeString('zh-CN',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const div = document.createElement('div');
  div.className='log-line';
  div.innerHTML=`<span class="log-time">${t}</span><span class="log-msg ${level||''}">${esc(msg)}</span>`;
  panel.appendChild(div);
  panel.scrollTop = panel.scrollHeight;
}

// ============ 知识库搜索 ============
async function searchKB(){
  const q = document.getElementById('kbSearchInput')?.value.trim();
  if(!q) return;
  const domain = document.querySelector('.kb-filter.active')?.dataset.domain || 'all';
  log('🔍 搜索：'+q+' ['+domain+']','info');
  try {
    const url = '/api/knowledge/search?q='+encodeURIComponent(q)+(domain!=='all'?'&domain='+domain:'');
    const resp = await fetch(url);
    if(!resp.ok) throw new Error('搜索失败');
    const data = await resp.json();
    const results = data.results||[];
    if(!results.length){ showToast('未找到相关内容'); return; }
    const rg = document.getElementById('resultsArea');
    document.getElementById('emptyState')?.remove();
    const card = document.createElement('div');
    card.className='result-card';
    card.innerHTML=`
      <h4>🔍 知识库搜索「${esc(q)}」<span style="font-size:9px;color:var(--muted);margin-left:auto">${results.length}条</span><span class="toggle-icon">▼</span></h4>
      <div class="card-body">
      ${results.map(r=>`
        <div class="kb-result" onclick="this.classList.toggle('expanded')">
          <div style="font-size:10px;line-height:1.6">${esc((r.content||r.text||'').slice(0,200))}${(r.content||r.text||'').length>200?'...':''}</div>
          <div class="kb-source">📄 ${esc(r.source||'')} · ${((r.score||0)*100).toFixed(0)}%相关 ${r.type?'· '+esc(r.type):''}</div>
        </div>
      `).join('')}
      </div>`;
    card.querySelector('h4').onclick = ()=>card.classList.toggle('collapsed');
    rg.appendChild(card);
    card.scrollIntoView({behavior:'smooth',block:'nearest'});
    log('✅ 找到'+results.length+'条','success');
  } catch(e){ log('❌ 搜索失败：'+e.message,'error'); }
}

// ============ 学情可视化报告（Canvas雷达图） ============
async function generateReport(){
  if(!Object.keys(agentResults).length){ showToast('请先完成全流程'); return; }
  log('📊 生成可视化报告...','info');
  renderReportCards();
  renderRadarChart();
  log('✅ 报告生成完成','success');
}

function renderReportCards(){
  const rg = document.getElementById('resultsArea');
  const diag = agentResults.diagnosis||{};
  const rev = agentResults.reviewer||{};
  const card = document.createElement('div');
  card.className='result-card';
  card.dataset.agent='report';
  card.innerHTML=`
    <h4>📊 学情可视化报告<span class="toggle-icon">▼</span></h4>
    <div class="card-body">
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:8px">
      <div style="background:var(--bg);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:8px;color:var(--muted)">能力评分</div>
        <div style="font-size:26px;font-weight:900;background:linear-gradient(90deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent">${diag.level_score||'-'}</div>
        <div style="font-size:8px;color:var(--muted)">/100</div>
      </div>
      <div style="background:var(--bg);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:8px;color:var(--muted)">幻觉分数</div>
        <div style="font-size:26px;font-weight:900;color:${(rev.hallucination_score||0)<20?'var(--success)':'var(--warn)'}">${rev.hallucination_score||'-'}</div>
        <div style="font-size:8px;color:var(--muted)">/100</div>
      </div>
      <div style="background:var(--bg);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:8px;color:var(--muted)">准确度</div>
        <div style="font-size:26px;font-weight:900;color:var(--accent)">${rev.accuracy_score||'-'}%</div>
        <div style="font-size:8px;color:var(--muted)">/100</div>
      </div>
      <div style="background:var(--bg);border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:8px;color:var(--muted)">知识盲区</div>
        <div style="font-size:26px;font-weight:900;color:var(--danger)">${(diag.blind_spots||[]).length}</div>
        <div style="font-size:8px;color:var(--muted)">项需补强</div>
      </div>
    </div>
    <div style="background:var(--bg);border-radius:8px;padding:8px">
      <div style="font-size:9px;color:var(--accent2);font-weight:700;margin-bottom:4px">📍 学习路径</div>
      ${(diag.learning_path||[]).map((lp,i)=>`<div style="font-size:9px;padding:2px 0">${i+1}. ${esc(lp.phase)} (${lp.estimated_hours||0}h) - ${(lp.topics||[]).join(', ')}</div>`).join('')}
    </div>
    </div>`;
  card.querySelector('h4').onclick = ()=>card.classList.toggle('collapsed');
  rg.appendChild(card);
}

function renderRadarChart(){
  const rg = document.getElementById('resultsArea');
  const diag = agentResults.diagnosis||{};
  const score = diag.level_score||50;
  // 6维雷达图数据
  const dimensions = [
    {label:'编程基础', value: Math.min(100, score + 10)},
    {label:'算法思维', value: Math.min(100, score - 5)},
    {label:'工程实践', value: Math.min(100, score + 5)},
    {label:'AI应用',   value: Math.min(100, score - 15)},
    {label:'安全意识', value: Math.min(100, score + 8)},
    {label:'创新思维', value: Math.min(100, score - 8)},
  ];

  const card = document.createElement('div');
  card.className='result-card';
  card.innerHTML=`
    <h4>🎯 能力雷达图<span class="toggle-icon">▼</span></h4>
    <div class="card-body" style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
      <canvas id="radarCanvas" width="260" height="260" style="border-radius:8px;background:var(--bg)"></canvas>
      <div style="flex:1;min-width:140px">
        ${dimensions.map((d,i)=>`<div style="margin-bottom:6px">
          <div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:2px">
            <span style="color:var(--text)">${d.label}</span>
            <span style="color:${sc2(d.value)};font-weight:700">${d.value}</span>
          </div>
          <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${d.value}%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:2px;transition:width 1s ease"></div>
          </div>
        </div>`).join('')}
        <div style="margin-top:10px;font-size:9px;color:var(--muted);background:var(--bg);border-radius:7px;padding:6px;line-height:1.5">
          <strong style="color:var(--accent2)">诊断结论</strong><br>
          ${score>=70?'你的基础扎实，建议向AI应用和算法深度方向发展':'建议系统学习Python基础，配合项目实战提升工程能力'}
        </div>
      </div>
    </div>`;
  card.querySelector('h4').onclick = ()=>card.classList.toggle('collapsed');
  rg.appendChild(card);

  // 绘制雷达图
  setTimeout(()=>drawRadar(dimensions), 50);
}

function drawRadar(dims){
  const canvas = document.getElementById('radarCanvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const w=canvas.width, h=canvas.height, cx=w/2, cy=h/2;
  const r = Math.min(w,h)*0.38;
  const n = dims.length;
  const step = (Math.PI*2)/n;

  ctx.clearRect(0,0,w,h);

  // 背景同心多边形
  [1,0.75,0.5,0.25].forEach(f=>{
    ctx.beginPath();
    dims.forEach((_,i)=>{
      const a = i*step - Math.PI/2;
      const px = cx + Math.cos(a)*r*f, py = cy + Math.sin(a)*r*f;
      if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    });
    ctx.closePath();
    ctx.strokeStyle='rgba(26,39,68,0.6)';
    ctx.lineWidth=0.5;
    ctx.stroke();
  });

  // 轴线
  dims.forEach((_,i)=>{
    const a = i*step - Math.PI/2;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.lineTo(cx+Math.cos(a)*r, cy+Math.sin(a)*r);
    ctx.strokeStyle='rgba(26,39,68,0.5)';
    ctx.lineWidth=0.5;
    ctx.stroke();
  });

  // 数据填充
  ctx.beginPath();
  dims.forEach((d,i)=>{
    const a = i*step - Math.PI/2;
    const v = d.value/100 * r;
    const px = cx + Math.cos(a)*v, py = cy + Math.sin(a)*v;
    if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  });
  ctx.closePath();
  ctx.fillStyle='rgba(0,232,176,0.12)';
  ctx.fill();
  ctx.strokeStyle='rgba(0,232,176,0.7)';
  ctx.lineWidth=1.5;
  ctx.stroke();

  // 数据点
  dims.forEach((d,i)=>{
    const a = i*step - Math.PI/2;
    const v = d.value/100 * r;
    ctx.beginPath();
    ctx.arc(cx+Math.cos(a)*v, cy+Math.sin(a)*v, 3, 0, Math.PI*2);
    ctx.fillStyle='#00e8b0';
    ctx.fill();
  });

  // 标签
  dims.forEach((d,i)=>{
    const a = i*step - Math.PI/2;
    const lx = cx + Math.cos(a)*(r+18), ly = cy + Math.sin(a)*(r+18);
    ctx.font='8px -apple-system,Segoe UI,sans-serif';
    ctx.textAlign=Math.abs(Math.cos(a))>0.5?(Math.cos(a)>0?'left':'right'):'center';
    ctx.textBaseline='middle';
    ctx.fillStyle='#7a869e';
    ctx.fillText(d.label, lx, ly);
  });
}

// ============ 苏格拉底对话（卡片内） ============
let socraticHistory = [];
async function sendSocraticChat(){
  const input = document.getElementById('socraticInput');
  if(!input) return;
  const msg = input.value.trim();
  if(!msg) return;
  input.value='';
  socraticHistory.push({role:'learner',text:msg});
  renderSocraticChat();
  const knowledge = agentResults.knowledge_gen||{};
  const sysPrompt = `你是苏格拉底导师。主题：${knowledge.title||'编程'}。知识点：${(knowledge.concepts||[]).join('、')}。输出JSON：{"response":"","next_question":"追问","assessment":"understood/partially_understood/misunderstood"}`;
  try {
    const fullText = await callLLM(sysPrompt, `历史：${JSON.stringify(socraticHistory.slice(-6))}\n学习者：${msg}\n回应（JSON）：`);
    const p = parseLLMOutput(fullText);
    socraticHistory.push({role:'tutor',text:p.response||'继续思考——能否举个例子？'});
  } catch(e){
    socraticHistory.push({role:'tutor',text:'继续思考——能换个角度说明吗？'});
  }
  renderSocraticChat();
}
function renderSocraticChat(){
  const el = document.getElementById('socraticChat');
  if(!el) return;
  el.innerHTML = socraticHistory.map(m=>`<div class="chat-bubble ${m.role==='tutor'?'tutor':'learner'}">${esc(m.text)}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

// ============ 全局对话FAB ============
function toggleChat(){
  const panel = document.getElementById('chatPanel');
  if(!panel) return;
  panel.classList.toggle('show');
}
async function sendGlobalChat(){
  const input = document.getElementById('chatInput');
  if(!input) return;
  const msg = input.value.trim();
  if(!msg) return;
  input.value='';
  const msgs = document.getElementById('chatMessages');
  // 用户消息
  const ub = document.createElement('div');
  ub.className='chat-bubble-user';
  ub.textContent = msg;
  msgs.appendChild(ub);
  msgs.scrollTop = msgs.scrollHeight;

  // AI回复
  const ab = document.createElement('div');
  ab.className='chat-bubble-ai';
  ab.textContent = '正在思考...';
  msgs.appendChild(ab);
  msgs.scrollTop = msgs.scrollHeight;

  try {
    const knowledge = agentResults.knowledge_gen||{};
    const sysPrompt = `你是AI学习助手。${Object.keys(agentResults).length?'当前学习主题：'+(knowledge.title||'编程'):'你可以回答各类学习问题'}。知识点：${(knowledge.concepts||[]).join('、')}。简洁专业，中文回答。`;
    const fullText = await callLLM(sysPrompt, msg);
    ab.textContent = fullText.slice(0,500)||'这个问题比较复杂，建议先完成学情诊断和知识生成流程，我会给出更精准的回答。';
  } catch(e){
    ab.textContent = '我还在学习中，建议先填写学习者画像并启动全流程，这样可以给你更个性化的回答~ 🧠';
  }
  msgs.scrollTop = msgs.scrollHeight;
}
async function quickChat(question){
  document.getElementById('chatInput').value = question;
  sendGlobalChat();
}

// ============ 结果复制 & 导出 ============
function copyResult(name){
  const data = agentResults[name];
  if(!data) return;
  const clean = {...data}; delete clean._demo; delete clean._meta;
  navigator.clipboard.writeText(JSON.stringify(clean,null,2)).then(()=>showToast('✅ 已复制')).catch(()=>showToast('复制失败'));
}
function copyCardContent(cardId){
  const card = document.getElementById(cardId);
  if(!card) return;
  navigator.clipboard.writeText(card.innerText).then(()=>showToast('✅ 已复制')).catch(()=>showToast('复制失败'));
}
function exportAllResults(){
  if(!Object.keys(agentResults).length){ showToast('暂无结果'); return; }
  const clean={};
  for(const [k,v] of Object.entries(agentResults)){ clean[k]={...v}; delete clean[k]._demo; delete clean[k]._meta; }
  const blob=new Blob([JSON.stringify(clean,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='multi-agent-results-'+new Date().toISOString().slice(0,10)+'.json';
  a.click();
  showToast('✅ 已导出JSON');
}

// ============ 卡片折叠 ============
function toggleCard(name){
  const card = document.getElementById('card-'+name);
  if(card) card.classList.toggle('collapsed');
}

// ============ Toast ============
function showToast(msg,dur=2000){
  const t=document.createElement('div'); t.className='toast'; t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),dur);
}

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', ()=>{
  initTopology();
  document.getElementById('btnModel').textContent = '🤖 '+{deepseek:'DeepSeek',zhipu:'GLM','openai-compat':'OpenAI'}[currentModel]||'🤖 模型';
  if(currentApiKey) log('🔑 Key已加载','info');
  else { log('⚠️ 无Key，点击右上角配置','warn'); setTimeout(()=>showApiKeyModal(), 1000); }

  // 后端健康检查
  fetch('/api/health').then(r=>r.json()).then(d=>{
    const n=(d.agents||[]).length;
    log(`后端：${n}个Agent · v${d.version||'?'} · ${d.api_key?'✅ Key已配':'⚠️ 无Key'}`,'success');
  }).catch(()=>log('⚠️ 后端离线（可用前端直调）','warn'));

  // Ctrl+Enter快捷启动
  document.addEventListener('keydown', e=>{
    if(e.ctrlKey && e.key==='Enter' && !document.getElementById('btnStart').disabled){
      startPipeline();
    }
  });
});

// ============ 事件委托 ============
document.addEventListener('click', e=>{
  const el = e.target.closest('[data-action]');
  if(!el) return;
  const action = el.dataset.action;
  const args = el.dataset.args||'';
  switch(action){
    case 'startPipeline': startPipeline(); break;
    case 'stopPipeline': stopPipeline(); break;
    case 'runSingle': runSingle(args); break;
    case 'toggleCard': toggleCard(args); break;
    case 'copyResult': copyResult(args); break;
    case 'copyCardContent': copyCardContent(args); break;
    case 'exportAllResults': exportAllResults(); break;
    case 'toggleSidebar': document.getElementById('sidebar').classList.toggle('mobile-show'); break;
    case 'showModelModal': showModelModal(); break;
    case 'showApiKeyModal': showApiKeyModal(); break;
    case 'closeModelModal': closeModelModal(); break;
    case 'confirmModel': confirmModel(); break;
    case 'skipApiKey': skipApiKey(); break;
    case 'confirmApiKey': confirmApiKey(); break;
    case 'searchKB': searchKB(); break;
    case 'generateReport': generateReport(); break;
    case 'pickOpt': { const [a,b]=args.split(','); pickOpt(parseInt(a),parseInt(b)); break; }
    case 'gradeQuiz': gradeQuiz(); break;
    case 'sendSocraticChat': sendSocraticChat(); break;
    case 'toggleChat': toggleChat(); break;
    case 'sendGlobalChat': sendGlobalChat(); break;
    case 'quickChat': quickChat(args); break;
    case 'closeDebate': closeDebate(); break;
  }
});
