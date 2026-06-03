"""
多智能体协同学习平台 - 应用入口
面向AI/编程领域技能培训的个性化学习资源生成系统
6个Agent协同：诊断→生成→审核→测试→迭代
"""
import os
import json
import asyncio
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
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

app = FastAPI(title="多智能体协同学习平台", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 页面路由 ---
@app.get("/", response_class=HTMLResponse)
async def index():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()

# --- API路由 ---
@app.get("/api/health")
async def health():
    return {"status": "ok", "agents": orchestrator.list_agents() if orchestrator else []}

@app.post("/api/start")
async def start_session(body: dict):
    """启动学习会话（全流程，等待完成后返回）"""
    learner_profile = body.get("profile", {})
    result = await orchestrator.run_full_pipeline(learner_profile)
    return result

# --- SSE 流式接口 ---
@app.post("/api/stream")
async def stream_pipeline(body: dict):
    """SSE流式接口：逐步推送每个Agent的执行状态和结果"""
    profile = body.get("profile", {})
    
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
async def run_diagnosis(body: dict):
    profile = body.get("profile", {})
    return await orchestrator.run_agent("diagnosis", profile=profile)

@app.post("/api/generate")
async def run_generate(body: dict):
    diagnosis = body.get("diagnosis", {})
    return await orchestrator.run_agent("knowledge_gen", diagnosis=diagnosis)

@app.post("/api/review")
async def run_review(body: dict):
    content = body.get("content", "")
    source_refs = body.get("source_refs", [])
    return await orchestrator.run_agent("reviewer", content=content, source_refs=source_refs)

@app.post("/api/quiz")
async def run_quiz(body: dict):
    knowledge = body.get("knowledge", {})
    difficulty = body.get("difficulty", "medium")
    return await orchestrator.run_agent("quiz", knowledge=knowledge, difficulty=difficulty)

@app.post("/api/practice")
async def run_practice(body: dict):
    topic = body.get("topic", "")
    level = body.get("level", "beginner")
    return await orchestrator.run_agent("practice_guide", topic=topic, level=level)

# --- 动态迭代接口 ---
@app.post("/api/feedback")
async def submit_feedback(body: dict):
    """提交测试结果，触发动态迭代决策"""
    quiz_result = body.get("quiz_result", {})
    diagnosis = body.get("diagnosis", {})
    knowledge = body.get("knowledge", {})
    
    # 1. 迭代决策
    iteration = await orchestrator.run_agent("iteration", quiz_result=quiz_result, diagnosis=diagnosis, knowledge=knowledge)
    
    # 2. 根据决策生成新内容
    decision = iteration.get("decision", "consolidate")
    adjustments = iteration.get("adjustments", {})
    
    new_content = None
    if decision == "simplify":
        new_content = await orchestrator.run_agent("knowledge_gen", diagnosis={**diagnosis, "learner_level": "beginner"}, revision_hints=["请大幅简化内容，用最通俗的语言讲解"])
    elif decision == "advance":
        new_content = await orchestrator.run_agent("knowledge_gen", diagnosis={**diagnosis, "learner_level": "advanced"}, revision_hints=["请提供更高难度的进阶内容"])
    else:
        new_content = await orchestrator.run_agent("knowledge_gen", diagnosis=diagnosis, revision_hints=adjustments.get("focus_topics", []))
    
    return {
        "iteration_decision": iteration,
        "new_content": new_content,
    }

# --- 启发式导学接口 ---
@app.post("/api/socratic/embed")
async def embed_socratic(body: dict):
    """在知识内容中嵌入追问节点"""
    knowledge = body.get("knowledge", {})
    return await orchestrator.run_agent("socratic", knowledge=knowledge, mode="embed_questions")

@app.post("/api/socratic/chat")
async def socratic_chat(body: dict):
    """导学对话：根据学习者回答进行动态追问"""
    knowledge = body.get("knowledge", {})
    conversation_history = body.get("conversation_history", [])
    return await orchestrator.run_agent("socratic", knowledge=knowledge, conversation_history=conversation_history, mode="respond")

# --- WebSocket（保留兼容） ---
@app.websocket("/ws/pipeline")
async def ws_pipeline(websocket: WebSocket):
    await websocket.accept()
    try:
        data = await websocket.receive_json()
        profile = data.get("profile", {})
        await websocket.send_json({"type": "start", "message": "开始多智能体协同调度", "profile": profile})
        async for event in orchestrator.run_streaming(profile):
            await websocket.send_json(event)
        await websocket.send_json({"type": "complete", "message": "全流程完成"})
    except WebSocketDisconnect:
        pass

app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
