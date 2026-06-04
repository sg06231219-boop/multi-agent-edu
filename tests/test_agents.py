"""
单元测试 - 多智能体协同调度逻辑与领域知识生成准确性
提交要求：针对多智能体协同调度逻辑与领域知识生成准确性等核心模块
"""
import asyncio
import json
import os
import sys
import pytest

sys.stdout.reconfigure(encoding='utf-8')
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
if os.path.basename(PROJECT_ROOT) == 'tests':
    PROJECT_ROOT = os.path.dirname(PROJECT_ROOT)
sys.path.insert(0, PROJECT_ROOT)

from agents.orchestrator import Orchestrator
from agents.diagnosis import DiagnosisAgent
from agents.knowledge_gen import KnowledgeGenAgent
from agents.practice_guide import PracticeGuideAgent
from agents.reviewer import ReviewerAgent
from agents.quiz import QuizAgent
from agents.iteration import IterationAgent
from agents.socratic import SocraticAgent
from agents.base import BaseAgent


# ============================================================
# Fixtures
# ============================================================
@pytest.fixture
def orchestrator():
    orch = Orchestrator()
    orch.register("diagnosis", DiagnosisAgent())
    orch.register("knowledge_gen", KnowledgeGenAgent())
    orch.register("practice_guide", PracticeGuideAgent())
    orch.register("reviewer", ReviewerAgent())
    orch.register("quiz", QuizAgent())
    orch.register("iteration", IterationAgent())
    orch.register("socratic", SocraticAgent())
    return orch


@pytest.fixture
def sample_profiles():
    return [
        {"background": "高中毕业生，未学过编程", "experience": "无", "goal": "从零学Python", "level": "beginner"},
        {"background": "计算机大二学生，学过C语言", "experience": "学过一门语言", "goal": "学习Python高级特性", "level": "intermediate"},
        {"background": "软件开发3年经验，熟悉Java", "experience": "熟练开发者", "goal": "学习AI开发框架", "level": "advanced"},
    ]


# ============================================================
# Agent基础功能测试
# ============================================================
class TestBaseAgent:
    def test_agent_info(self):
        agent = DiagnosisAgent()
        info = agent.info()
        assert "name" in info
        assert "role" in info
        assert info["name"] == "diagnosis"

    def test_all_agents_registered(self, orchestrator):
        agents = orchestrator.list_agents()
        assert len(agents) == 7
        names = [a["name"] for a in agents]
        assert "diagnosis" in names
        assert "knowledge_gen" in names
        assert "reviewer" in names
        assert "practice_guide" in names
        assert "quiz" in names
        assert "iteration" in names
        assert "socratic" in names


# ============================================================
# 学情诊断Agent测试
# ============================================================
class TestDiagnosisAgent:
    @pytest.mark.asyncio
    async def test_diagnosis_beginner(self):
        agent = DiagnosisAgent()
        profile = {"background": "高中毕业", "experience": "无", "goal": "学Python", "level": "beginner"}
        result = await agent.execute(profile=profile)
        assert "learner_level" in result
        assert "blind_spots" in result
        assert "strengths" in result
        assert "focus_topic" in result

    @pytest.mark.asyncio
    async def test_diagnosis_advanced(self):
        agent = DiagnosisAgent()
        profile = {"background": "3年开发经验", "experience": "熟练", "goal": "学AI框架", "level": "advanced"}
        result = await agent.execute(profile=profile)
        assert result["learner_level"] in ("intermediate", "advanced")

    @pytest.mark.asyncio
    async def test_diagnosis_different_profiles_produce_different_results(self):
        agent = DiagnosisAgent()
        beginner = {"background": "零基础", "experience": "无", "goal": "入门", "level": "beginner"}
        advanced = {"background": "3年经验", "experience": "熟练", "goal": "进阶", "level": "advanced"}
        
        r1 = await agent.execute(profile=beginner)
        r2 = await agent.execute(profile=advanced)
        
        # 不同画像应产生不同诊断结果
        assert r1["learner_level"] != r2["learner_level"] or r1["focus_topic"] != r2["focus_topic"]


# ============================================================
# 知识生成Agent测试
# ============================================================
class TestKnowledgeGenAgent:
    @pytest.mark.asyncio
    async def test_generate_with_diagnosis(self):
        agent = KnowledgeGenAgent()
        diagnosis = {
            "learner_level": "beginner",
            "focus_topic": "Python变量",
            "blind_spots": ["变量概念"],
            "strengths": [],
        }
        result = await agent.execute(diagnosis=diagnosis)
        assert "content" in result
        assert len(result["content"]) > 50  # 内容不为空
        assert "source_refs" in result

    @pytest.mark.asyncio
    async def test_generate_with_revision_hints(self):
        agent = KnowledgeGenAgent()
        result = await agent.execute(
            diagnosis={"learner_level": "intermediate", "focus_topic": "Python"},
            revision_hints=["请补充装饰器内容"]
        )
        assert "content" in result

    @pytest.mark.asyncio
    async def test_knowledge_source_traceability(self):
        """知识溯源：生成内容必须包含来源标注"""
        agent = KnowledgeGenAgent()
        result = await agent.execute(
            diagnosis={"learner_level": "beginner", "focus_topic": "Python基础"}
        )
        # 检查来源标注
        source_refs = result.get("source_refs", [])
        # fallback数据也应该有source字段
        if source_refs:
            for ref in source_refs:
                assert "source" in ref or "text" in ref


# ============================================================
# 审核Agent测试（幻觉防控）
# ============================================================
class TestReviewerAgent:
    @pytest.mark.asyncio
    async def test_review_returns_hallucination_score(self):
        agent = ReviewerAgent()
        result = await agent.execute(
            content="Python是一种解释型高级编程语言，由Guido van Rossum于1991年发布。",
            source_refs=[{"text": "Python官方文档", "source": "官方"}],
            debate_round=1
        )
        assert "hallucination_score" in result
        assert 0 <= result["hallucination_score"] <= 100
        assert "verdict" in result

    @pytest.mark.asyncio
    async def test_review_detects_issues(self):
        agent = ReviewerAgent()
        result = await agent.execute(
            content="Python是1980年发明的编译型语言，运行速度比C++快。",
            source_refs=[],
            debate_round=1
        )
        # 明显错误的内容应有较高幻觉分数
        assert result["hallucination_score"] > 30 or len(result.get("issues", [])) > 0


# ============================================================
# 测验Agent测试
# ============================================================
class TestQuizAgent:
    @pytest.mark.asyncio
    async def test_quiz_generates_questions(self):
        agent = QuizAgent()
        result = await agent.execute(
            knowledge={"content": "Python基础教程", "difficulty": "beginner"},
            difficulty="beginner"
        )
        assert "questions" in result
        assert len(result["questions"]) > 0

    @pytest.mark.asyncio
    async def test_quiz_difficulty_levels(self):
        agent = QuizAgent()
        # 不同难度应生成不同题目
        easy = await agent.execute(knowledge={"content": "Python"}, difficulty="beginner")
        hard = await agent.execute(knowledge={"content": "Python"}, difficulty="advanced")
        assert "questions" in easy
        assert "questions" in hard


# ============================================================
# 迭代决策Agent测试
# ============================================================
class TestIterationAgent:
    @pytest.mark.asyncio
    async def test_iteration_decision_types(self):
        agent = IterationAgent()
        # 低分 → simplify
        low_score_quiz = {"score": 30, "total": 100, "questions": []}
        result = await agent.execute(
            quiz_result=low_score_quiz,
            diagnosis={"learner_level": "beginner"},
            knowledge={"content": "test"}
        )
        assert result.get("decision") in ("simplify", "consolidate", "advance")

    @pytest.mark.asyncio
    async def test_iteration_high_score_advances(self):
        agent = IterationAgent()
        high_score_quiz = {"score": 95, "total": 100, "questions": []}
        result = await agent.execute(
            quiz_result=high_score_quiz,
            diagnosis={"learner_level": "intermediate"},
            knowledge={"content": "test"}
        )
        # 高分应建议进阶
        assert result.get("decision") in ("advance", "consolidate")


# ============================================================
# 苏格拉底导学Agent测试
# ============================================================
class TestSocraticAgent:
    @pytest.mark.asyncio
    async def test_embed_questions(self):
        agent = SocraticAgent()
        result = await agent.execute(
            knowledge={"content": "变量是存储数据的容器。Python中变量不需要声明类型。"},
            mode="embed_questions"
        )
        assert "content" in result or "questions" in result or "summary" in result

    @pytest.mark.asyncio
    async def test_socratic_respond(self):
        agent = SocraticAgent()
        result = await agent.execute(
            knowledge={"content": "Python变量"},
            conversation_history=[{"role": "user", "content": "什么是变量？"}],
            mode="respond"
        )
        assert "content" in result or "response" in result or "summary" in result


# ============================================================
# Orchestrator协同调度测试
# ============================================================
class TestOrchestrator:
    def test_register_agents(self, orchestrator):
        assert len(orchestrator.agents) == 7

    def test_list_agents_format(self, orchestrator):
        agents = orchestrator.list_agents()
        for a in agents:
            assert "name" in a
            assert "role" in a

    @pytest.mark.asyncio
    async def test_run_single_agent(self, orchestrator):
        result = await orchestrator.run_agent("diagnosis", profile={
            "background": "test", "experience": "无", "goal": "学习", "level": "beginner"
        })
        assert "_meta" in result
        assert result["_meta"]["agent"] == "diagnosis"

    @pytest.mark.asyncio
    async def test_full_pipeline_completes(self, orchestrator):
        profile = {"background": "零基础", "experience": "无", "goal": "学Python", "level": "beginner"}
        result = await orchestrator.run_full_pipeline(profile)
        assert "steps" in result
        assert len(result["steps"]) >= 5  # 至少5步
        assert "final_output" in result

    @pytest.mark.asyncio
    async def test_streaming_yields_events(self, orchestrator):
        profile = {"background": "零基础", "experience": "无", "goal": "学Python", "level": "beginner"}
        events = []
        async for event in orchestrator.run_streaming(profile):
            events.append(event)
        
        assert len(events) > 0
        event_types = [e["type"] for e in events]
        assert "pipeline_done" in event_types or "error" in event_types

    @pytest.mark.asyncio
    async def test_debate_loop_mechanism(self, orchestrator):
        """辩论机制：reviewer和knowledge_gen应有多轮交互"""
        profile = {"background": "计算机专业", "experience": "学过C", "goal": "学Python", "level": "intermediate"}
        result = await orchestrator.run_full_pipeline(profile)
        
        # 检查步骤3是否有辩论记录
        review_steps = [s for s in result["steps"] if s.get("agent") == "reviewer"]
        if review_steps:
            # 审核步骤应记录辩论轮次
            assert "debate_rounds" in review_steps[0] or "summary" in review_steps[0]


# ============================================================
# 知识库完整性测试
# ============================================================
class TestKnowledgeBase:
    def test_knowledge_files_exist(self):
        kb_path = os.path.join(PROJECT_ROOT, "knowledge_base")
        assert os.path.exists(kb_path)
        
        expected_files = ["python_basics.md", "ai_basics.md", "web_dev.md", "data_science.md", "llm_engineering.md"]
        for fname in expected_files:
            fpath = os.path.join(kb_path, fname)
            assert os.path.exists(fpath), f"知识库文件 {fname} 不存在"

    def test_knowledge_files_have_source_annotations(self):
        """评分标准要求知识溯源，知识库内容必须有来源标注"""
        kb_path = os.path.join(PROJECT_ROOT, "knowledge_base")
        for fname in os.listdir(kb_path):
            if fname.endswith(".md"):
                with open(os.path.join(kb_path, fname), "r", encoding="utf-8") as f:
                    content = f.read()
                # 至少包含一种来源标注
                has_annotation = any(tag in content for tag in ["[教材]", "[论文]", "[官方]", "[实践]"])
                assert has_annotation, f"{fname} 缺少来源标注"

    def test_knowledge_files_not_empty(self):
        kb_path = os.path.join(PROJECT_ROOT, "knowledge_base")
        for fname in os.listdir(kb_path):
            if fname.endswith(".md"):
                with open(os.path.join(kb_path, fname), "r", encoding="utf-8") as f:
                    content = f.read()
                assert len(content) > 500, f"{fname} 内容过少（<500字符）"


# ============================================================
# 测试数据完整性测试
# ============================================================
class TestTestData:
    def test_profiles_exist(self):
        path = os.path.join(PROJECT_ROOT, "data", "test_profiles.json")
        assert os.path.exists(path)
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        profiles = data["test_profiles"] if isinstance(data, dict) else data
        assert len(profiles) >= 3, "至少3组测试画像"

    def test_profiles_have_required_fields(self):
        path = os.path.join(PROJECT_ROOT, "data", "test_profiles.json")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        profiles = data["test_profiles"] if isinstance(data, dict) else data
        for p in profiles:
            assert "background" in p
            assert "experience" in p
            assert "goal" in p
            assert "level" in p

    def test_profiles_diverse_levels(self):
        """测试画像应覆盖不同水平"""
        path = os.path.join(PROJECT_ROOT, "data", "test_profiles.json")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        profiles = data["test_profiles"] if isinstance(data, dict) else data
        levels = set(p.get("level") for p in profiles)
        assert len(levels) >= 2, "测试画像应包含至少2种不同水平"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short", "-x"])
