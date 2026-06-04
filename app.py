"""
多智能体协同学习平台 - 应用入口
面向AI/编程领域技能培训的个性化学习资源生成系统
7个Agent协同：诊断→生成→审核→实操→测试→迭代→导学
"""
import os
import json
import asyncio
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from agents.orchestrator import Orchestrator
from agents.diagnosis import DiagnosisAgent
from agents.knowledge_gen import KnowledgeGenAgent
from agents.practice_guide import PracticeGuideAgent
from agents.reviewer import ReviewerAgent
from agents.quiz import QuizAgent
from agents.iteration import IterationAgent
from agents.socratic import SocraticAgent

# 全局调度器
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

app = FastAPI(title="多智能体协同学习平台", version="2.1.0", lifespan=lifespan)

# CORS - 生产环境应限制域名
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 页面路由 ---
@app.get("/", response_class=HTMLResponse)
async def index():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()

# --- 请求模型 ---
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

# --- API路由 ---
@app.get("/api/health")
async def health():
    agents_list = orchestrator.list_agents() if orchestrator else []
    has_api_key = bool(os.environ.get("ZHIPUAI_API_KEY", ""))
    return {
        "status": "ok" if has_api_key else "degraded",
        "agents": agents_list,
        "api_key_configured": has_api_key,
        "version": "2.1.0",
    }

@app.post("/api/start")
async def start_session(body: StartRequest):
    """启动学习会话（全流程，等待完成后返回）"""
    learner_profile = body.profile.model_dump()
    try:
        result = await orchestrator.run_full_pipeline(learner_profile)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return result

# --- SSE 流式接口 ---
@app.post("/api/stream")
async def stream_pipeline(body: StreamRequest):
    """SSE流式接口：逐步推送每个Agent的执行状态和结果"""
    profile = body.profile.model_dump()
    
    async def event_generator():
        try:
            yield f"data: {json.dumps({'type': 'start', 'profile': profile}, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0)  # 强制flush到客户端
            async for event in orchestrator.run_streaming(profile):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0)  # 每条事件后强制flush
            yield f"data: {json.dumps({'type': 'complete', 'message': '全流程完成'}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Transfer-Encoding": "chunked",
        }
    )

# --- 单步Agent API ---
@app.post("/api/diagnosis")
async def run_diagnosis(body: StartRequest):
    profile = body.profile.model_dump()
    try:
        return await orchestrator.run_agent("diagnosis", profile=profile)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/generate")
async def run_generate(body: dict):
    diagnosis = body.get("diagnosis", {})
    if not isinstance(diagnosis, dict):
        raise HTTPException(status_code=422, detail="diagnosis must be a dict")
    try:
        return await orchestrator.run_agent("knowledge_gen", diagnosis=diagnosis)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/review")
async def run_review(body: ReviewRequest):
    try:
        return await orchestrator.run_agent("reviewer", content=body.content, source_refs=body.source_refs)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/quiz")
async def run_quiz(body: dict):
    knowledge = body.get("knowledge", {})
    difficulty = body.get("difficulty", "medium")
    if difficulty not in ("easy", "medium", "hard", "beginner", "intermediate", "advanced"):
        difficulty = "medium"
    try:
        return await orchestrator.run_agent("quiz", knowledge=knowledge, difficulty=difficulty)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/practice")
async def run_practice(body: dict):
    topic = str(body.get("topic", ""))[:200]
    level = body.get("level", "beginner")
    if level not in ("beginner", "intermediate", "advanced"):
        level = "beginner"
    try:
        return await orchestrator.run_agent("practice_guide", topic=topic, level=level)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

# --- 动态迭代接口 ---
@app.post("/api/feedback")
async def submit_feedback(body: FeedbackRequest):
    """提交测试结果，触发动态迭代决策"""
    try:
        iteration = await orchestrator.run_agent("iteration", quiz_result=body.quiz_result, diagnosis=body.diagnosis, knowledge=body.knowledge)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    
    # 2. 根据决策生成新内容
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
    
    return {
        "iteration_decision": iteration,
        "new_content": new_content,
    }

# --- 启发式导学接口 ---
@app.post("/api/socratic/embed")
async def embed_socratic(body: dict):
    """在知识内容中嵌入追问节点"""
    knowledge = body.get("knowledge", {})
    if not isinstance(knowledge, dict):
        raise HTTPException(status_code=422, detail="knowledge must be a dict")
    try:
        return await orchestrator.run_agent("socratic", knowledge=knowledge, mode="embed_questions")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/socratic/chat")
async def socratic_chat(body: SocraticChatRequest):
    """导学对话：根据学习者回答进行动态追问"""
    try:
        return await orchestrator.run_agent("socratic", knowledge=body.knowledge, conversation_history=body.conversation_history, mode="respond")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

# --- WebSocket（保留兼容） ---
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
