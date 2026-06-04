"""
多智能体协同学习平台 - 应用入口
面向AI/编程领域技能培训的个性化学习资源生成系统
7个Agent协同：诊断→生成→审核→实操→测试→迭代→导学
v2.2.0 - 新增管理后台 + 会话记录 + Rate Limiting
"""
import os
import json
import time
import asyncio
import hashlib
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException, Depends, Cookie, Response
from pydantic import BaseModel, Field
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware

from agents.orchestrator import Orchestrator
from agents.diagnosis import DiagnosisAgent
from agents.knowledge_gen import KnowledgeGenAgent
from agents.practice_guide import PracticeGuideAgent
from agents.reviewer import ReviewerAgent
from agents.quiz import QuizAgent
from agents.iteration import IterationAgent
from agents.socratic import SocraticAgent

# ============================================================
# 配置
# ============================================================
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")
ADMIN_COOKIE_NAME = "mae_admin_token"
CST = timezone(timedelta(hours=8))

# ============================================================
# 会话存储（内存，Render重启后清空）
# ============================================================
class SessionStore:
    def __init__(self, max_sessions=500):
        self.sessions = {}  # id -> session data
        self.max = max_sessions
    
    def create(self, profile: dict) -> str:
        sid = uuid.uuid4().hex[:12]
        self.sessions[sid] = {
            "id": sid,
            "profile": profile,
            "created_at": datetime.now(CST).isoformat(),
            "status": "pending",
            "results": {},
            "agent_count": 0,
            "total_seconds": 0,
            "error": None,
        }
        # 淘汰最旧的
        if len(self.sessions) > self.max:
            oldest = min(self.sessions, key=lambda k: self.sessions[k]["created_at"])
            del self.sessions[oldest]
        return sid
    
    def update(self, sid: str, **kwargs):
        if sid in self.sessions:
            self.sessions[sid].update(kwargs)
    
    def get(self, sid: str) -> Optional[dict]:
        return self.sessions.get(sid)
    
    def list_recent(self, limit=50) -> list:
        items = sorted(self.sessions.values(), key=lambda x: x.get("created_at", ""), reverse=True)
        return items[:limit]
    
    def stats(self) -> dict:
        total = len(self.sessions)
        completed = sum(1 for s in self.sessions.values() if s.get("status") == "completed")
        failed = sum(1 for s in self.sessions.values() if s.get("status") == "error")
        running = sum(1 for s in self.sessions.values() if s.get("status") == "running")
        return {"total": total, "completed": completed, "failed": failed, "running": running}

store = SessionStore()

# ============================================================
# Rate Limiter（滑动窗口，每IP每分钟10次）
# ============================================================
class RateLimiter:
    def __init__(self, max_requests=10, window_seconds=60):
        self.max = max_requests
        self.window = window_seconds
        self.requests = defaultdict(list)
    
    def check(self, key: str) -> bool:
        now = time.time()
        cutoff = now - self.window
        self.requests[key] = [t for t in self.requests[key] if t > cutoff]
        if len(self.requests[key]) >= self.max:
            return False
        self.requests[key].append(now)
        return True

rate_limiter = RateLimiter(max_requests=10, window_seconds=60)

# ============================================================
# 全局调度器
# ============================================================
orchestrator = None

@asynccontextmanager
async def lifespan(app):
    global orchestrator
    import sys; sys.stdout.reconfigure(encoding='utf-8')
    orchestrator = Orchestrator()
    orchestrator.register("diagnosis", DiagnosisAgent())
    orchestrator.register("knowledge_gen", KnowledgeGenAgent())
    orchestrator.register("practice_guide", PracticeGuideAgent())
    orchestrator.register("reviewer", ReviewerAgent())
    orchestrator.register("quiz", QuizAgent())
    orchestrator.register("iteration", IterationAgent())
    orchestrator.register("socratic", SocraticAgent())
    print("7 agents registered, system ready")
    yield

app = FastAPI(title="多智能体协同学习平台", version="2.2.0", lifespan=lifespan)

# CORS
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# 请求模型
# ============================================================
class LearnerProfile(BaseModel):
    background: str = Field(default="", max_length=500)
    experience: str = Field(default="无")
    goal: str = Field(default="", max_length=200)
    level: str = Field(default="beginner", pattern="^(beginner|intermediate|advanced)$")

class StartRequest(BaseModel):
    profile: LearnerProfile = Field(default_factory=LearnerProfile)

class StreamRequest(BaseModel):
    profile: LearnerProfile = Field(default_factory=LearnerProfile)

class FeedbackRequest(BaseModel):
    quiz_result: dict = Field(default_factory=dict)
    diagnosis: dict = Field(default_factory=dict)
    knowledge: dict = Field(default_factory=dict)

class SocraticChatRequest(BaseModel):
    knowledge: dict = Field(default_factory=dict)
    conversation_history: list = Field(default_factory=list, max_length=50)

class ReviewRequest(BaseModel):
    content: str = Field(default="", max_length=10000)
    source_refs: list = Field(default_factory=list)

class GenerateRequest(BaseModel):
    diagnosis: dict = Field(default_factory=dict)

class QuizRequest(BaseModel):
    knowledge: dict = Field(default_factory=dict)
    difficulty: str = Field(default="medium", pattern="^(easy|medium|hard|beginner|intermediate|advanced)$")

class PracticeRequest(BaseModel):
    topic: str = Field(default="", max_length=200)
    level: str = Field(default="beginner", pattern="^(beginner|intermediate|advanced)$")

class SocraticEmbedRequest(BaseModel):
    knowledge: dict = Field(default_factory=dict)

class AdminLoginRequest(BaseModel):
    password: str = Field(default="", max_length=100)

# ============================================================
# 工具函数
# ============================================================
def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"

def _check_rate(request: Request):
    ip = _get_client_ip(request)
    if not rate_limiter.check(ip):
        raise HTTPException(status_code=429, detail="请求过于频繁，请稍后再试")

def _check_admin(request: Request) -> bool:
    token = request.cookies.get(ADMIN_COOKIE_NAME, "")
    expected = hashlib.sha256(ADMIN_PASSWORD.encode()).hexdigest()[:32]
    return token == expected

# ============================================================
# 页面路由
# ============================================================
@app.get("/", response_class=HTMLResponse)
async def index():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.get("/admin", response_class=HTMLResponse)
async def admin_page(request: Request):
    if not _check_admin(request):
        with open("static/admin_login.html", "r", encoding="utf-8") as f:
            return f.read()
    with open("static/admin.html", "r", encoding="utf-8") as f:
        return f.read()

# ============================================================
# Health
# ============================================================
@app.get("/api/health")
async def health():
    agents_list = orchestrator.list_agents() if orchestrator else []
    has_api_key = bool(os.environ.get("ZHIPUAI_API_KEY", ""))
    return {
        "status": "ok" if has_api_key else "degraded",
        "agents": agents_list,
        "api_key_configured": has_api_key,
        "version": "2.2.0",
    }

# ============================================================
# 全流程API
# ============================================================
@app.post("/api/start")
async def start_session(body: StartRequest, request: Request):
    _check_rate(request)
    learner_profile = body.profile.model_dump()
    sid = store.create(learner_profile)
    store.update(sid, status="running")
    try:
        result = await orchestrator.run_full_pipeline(learner_profile)
        store.update(sid, status="completed", results=result, 
                     agent_count=len([k for k in result if k.startswith("agent_") or k in ("diagnosis","knowledge","review","practice","quiz","iteration","socratic")]),
                     total_seconds=result.get("_meta", {}).get("total_seconds", 0))
        result["session_id"] = sid
    except RuntimeError as e:
        store.update(sid, status="error", error=str(e))
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        store.update(sid, status="error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
    return result

@app.post("/api/stream")
async def stream_pipeline(body: StreamRequest, request: Request):
    _check_rate(request)
    profile = body.profile.model_dump()
    sid = store.create(profile)
    store.update(sid, status="running")
    start_time = time.time()
    
    async def event_generator():
        try:
            yield f"data: {json.dumps({'type': 'start', 'session_id': sid, 'profile': profile}, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0)
            async for event in orchestrator.run_streaming(profile):
                # 记录Agent完成事件
                if event.get("type") == "agent_done":
                    agent = event.get("agent", "")
                    results = store.get(sid).get("results", {}) if store.get(sid) else {}
                    results[agent] = event.get("result", {})
                    store.update(sid, results=results, agent_count=len(results))
                
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0)
            
            elapsed = round(time.time() - start_time, 1)
            store.update(sid, status="completed", total_seconds=elapsed)
            yield f"data: {json.dumps({'type': 'complete', 'message': '全流程完成', 'session_id': sid}, ensure_ascii=False)}\n\n"
        except asyncio.CancelledError:
            store.update(sid, status="cancelled")
            yield f"data: {json.dumps({'type': 'cancelled', 'message': '用户取消'}, ensure_ascii=False)}\n\n"
        except Exception as e:
            store.update(sid, status="error", error=str(e))
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

# ============================================================
# 单步Agent API
# ============================================================
@app.post("/api/diagnosis")
async def run_diagnosis(body: StartRequest, request: Request):
    _check_rate(request)
    try:
        return await orchestrator.run_agent("diagnosis", profile=body.profile.model_dump())
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/generate")
async def run_generate(body: GenerateRequest, request: Request):
    _check_rate(request)
    try:
        return await orchestrator.run_agent("knowledge_gen", diagnosis=body.diagnosis)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/review")
async def run_review(body: ReviewRequest, request: Request):
    _check_rate(request)
    try:
        return await orchestrator.run_agent("reviewer", content=body.content, source_refs=body.source_refs)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/quiz")
async def run_quiz(body: QuizRequest, request: Request):
    _check_rate(request)
    try:
        return await orchestrator.run_agent("quiz", knowledge=body.knowledge, difficulty=body.difficulty)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/practice")
async def run_practice(body: PracticeRequest, request: Request):
    _check_rate(request)
    try:
        return await orchestrator.run_agent("practice_guide", topic=body.topic, level=body.level)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/feedback")
async def submit_feedback(body: FeedbackRequest, request: Request):
    _check_rate(request)
    try:
        iteration = await orchestrator.run_agent("iteration", quiz_result=body.quiz_result, diagnosis=body.diagnosis, knowledge=body.knowledge)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    
    decision = iteration.get("decision", "consolidate")
    adjustments = iteration.get("adjustments", {})
    
    new_content = None
    try:
        if decision == "simplify":
            new_content = await orchestrator.run_agent("knowledge_gen", diagnosis={**body.diagnosis, "learner_level": "beginner"}, revision_hints=["请大幅简化内容，用最通俗的语言讲解"])
        elif decision == "advance":
            new_content = await orchestrator.run_agent("knowledge_gen", diagnosis={**body.diagnosis, "learner_level": "advanced"}, revision_hints=["请提供更高难度的进阶内容"])
        else:
            new_content = await orchestrator.run_agent("knowledge_gen", diagnosis=body.diagnosis, revision_hints=adjustments.get("focus_topics", []))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    
    return {"iteration_decision": iteration, "new_content": new_content}

@app.post("/api/socratic/embed")
async def embed_socratic(body: SocraticEmbedRequest, request: Request):
    _check_rate(request)
    try:
        return await orchestrator.run_agent("socratic", knowledge=body.knowledge, mode="embed_questions")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/socratic/chat")
async def socratic_chat(body: SocraticChatRequest, request: Request):
    _check_rate(request)
    try:
        return await orchestrator.run_agent("socratic", knowledge=body.knowledge, conversation_history=body.conversation_history, mode="respond")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

# ============================================================
# 管理员 API
# ============================================================
@app.post("/api/admin/login")
async def admin_login(body: AdminLoginRequest, response: Response):
    if body.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="密码错误")
    token = hashlib.sha256(ADMIN_PASSWORD.encode()).hexdigest()[:32]
    response = JSONResponse({"ok": True})
    response.set_cookie(ADMIN_COOKIE_NAME, token, httponly=True, max_age=86400 * 7, samesite="lax")
    return response

@app.post("/api/admin/logout")
async def admin_logout():
    response = JSONResponse({"ok": True})
    response.delete_cookie(ADMIN_COOKIE_NAME)
    return response

@app.get("/api/admin/stats")
async def admin_stats(request: Request):
    if not _check_admin(request):
        raise HTTPException(status_code=401, detail="未登录")
    return {
        "version": "2.2.0",
        "sessions": store.stats(),
        "agents": orchestrator.list_agents() if orchestrator else [],
        "api_key_configured": bool(os.environ.get("ZHIPUAI_API_KEY", "")),
        "rate_limiter": {
            "tracked_ips": len(rate_limiter.requests),
            "max_per_minute": rate_limiter.max,
        },
        "uptime_note": "内存存储，Render重启后清空",
    }

@app.get("/api/admin/sessions")
async def admin_sessions(request: Request, limit: int = 50):
    if not _check_admin(request):
        raise HTTPException(status_code=401, detail="未登录")
    limit = min(limit, 200)
    sessions = store.list_recent(limit)
    # 脱敏：不返回完整results（可能很大）
    for s in sessions:
        s.pop("results", None)
    return {"sessions": sessions, "count": len(sessions)}

@app.get("/api/admin/sessions/{sid}")
async def admin_session_detail(sid: str, request: Request):
    if not _check_admin(request):
        raise HTTPException(status_code=401, detail="未登录")
    session = store.get(sid)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return session

@app.delete("/api/admin/sessions/{sid}")
async def admin_delete_session(sid: str, request: Request):
    if not _check_admin(request):
        raise HTTPException(status_code=401, detail="未登录")
    if sid in store.sessions:
        del store.sessions[sid]
        return {"ok": True}
    raise HTTPException(status_code=404, detail="会话不存在")

@app.get("/api/admin/agents")
async def admin_agents(request: Request):
    if not _check_admin(request):
        raise HTTPException(status_code=401, detail="未登录")
    agents_info = []
    if orchestrator:
        for name, agent in orchestrator.agents.items():
            agents_info.append({
                "name": agent.name,
                "role": agent.role,
                "description": agent.description,
                "has_result": bool(agent.last_result),
            })
    return {"agents": agents_info}

# ============================================================
# WebSocket（保留兼容）
# ============================================================
@app.websocket("/ws/pipeline")
async def ws_pipeline(websocket: WebSocket):
    await websocket.accept()
    try:
        data = await websocket.receive_json()
        profile = data.get("profile", {}) if isinstance(data, dict) else {}
        await websocket.send_json({"type": "start", "message": "开始多智能体协同调度", "profile": profile})
        async for event in orchestrator.run_streaming(profile):
            await websocket.send_json(event)
        await websocket.send_json({"type": "complete", "message": "全流程完成"})
    except WebSocketDisconnect:
        pass
    except RuntimeError as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except:
            pass

app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
