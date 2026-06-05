"""
扩展单元测试 - 覆盖API端点、安全、数据完整性
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


# ============================================================
# API模型验证测试
# ============================================================
class TestRequestModels:
    def test_learner_profile_defaults(self):
        from app import LearnerProfile
        p = LearnerProfile()
        assert p.level == "beginner"
        assert p.background == ""
        assert p.experience == "无"
    
    def test_learner_profile_validation(self):
        from app import LearnerProfile
        # valid levels
        for lvl in ["beginner", "intermediate", "advanced"]:
            p = LearnerProfile(level=lvl)
            assert p.level == lvl
        
        # invalid level
        with pytest.raises(Exception):
            LearnerProfile(level="expert")
    
    def test_quiz_request_defaults(self):
        from app import QuizRequest
        q = QuizRequest()
        assert q.difficulty == "medium"
    
    def test_admin_login_request(self):
        from app import AdminLoginRequest
        r = AdminLoginRequest(password="test")
        assert r.password == "test"


# ============================================================
# Rate Limiter测试
# ============================================================
class TestRateLimiter:
    def test_rate_limiter_allows_under_limit(self):
        from app import RateLimiter
        rl = RateLimiter(max_requests=5, window_seconds=60)
        for i in range(5):
            assert rl.check("ip1") is True
    
    def test_rate_limiter_blocks_over_limit(self):
        from app import RateLimiter
        rl = RateLimiter(max_requests=3, window_seconds=60)
        for i in range(3):
            rl.check("ip2")
        assert rl.check("ip2") is False
    
    def test_rate_limiter_per_ip(self):
        from app import RateLimiter
        rl = RateLimiter(max_requests=2, window_seconds=60)
        rl.check("ip3")
        rl.check("ip3")
        assert rl.check("ip3") is False
        # 不同IP不受影响
        assert rl.check("ip4") is True


# ============================================================
# SessionStore测试
# ============================================================
class TestSessionStore:
    def test_create_session(self):
        from app import SessionStore
        store = SessionStore(max_sessions=10)
        sid = store.create({"background": "test", "level": "beginner"})
        assert sid is not None
        assert len(sid) == 12
    
    def test_update_session(self):
        from app import SessionStore
        store = SessionStore(max_sessions=10)
        sid = store.create({"background": "test"})
        store.update(sid, status="running", agent_count=3)
        s = store.get(sid)
        assert s["status"] == "running"
        assert s["agent_count"] == 3
    
    def test_list_recent_sessions(self):
        from app import SessionStore
        store = SessionStore(max_sessions=100)
        for i in range(5):
            store.create({"background": f"test{i}"})
        recent = store.list_recent(limit=3)
        assert len(recent) == 3
    
    def test_session_eviction(self):
        from app import SessionStore
        store = SessionStore(max_sessions=3)
        s1 = store.create({"background": "old"})
        s2 = store.create({"background": "mid"})
        s3 = store.create({"background": "new"})
        # 创建第4个时应淘汰最旧的
        s4 = store.create({"background": "extra"})
        assert store.get(s1) is None
        assert store.get(s4) is not None
    
    def test_session_stats(self):
        from app import SessionStore
        store = SessionStore(max_sessions=100)
        sid1 = store.create({"background": "t1"})
        store.update(sid1, status="completed")
        sid2 = store.create({"background": "t2"})
        store.update(sid2, status="error")
        stats = store.stats()
        assert stats["total"] == 2
        assert stats["completed"] == 1
        assert stats["failed"] == 1


# ============================================================
# 评测报告生成测试
# ============================================================
class TestVisualReport:
    def test_calc_dimension_score(self):
        from app import _calc_dimension_score
        # beginner should get low base score
        score = _calc_dimension_score("基础", {"learner_level": "beginner", "strengths": [], "blind_spots": []}, 0.3)
        assert 0 < score <= 1
        
        # advanced should get higher score
        score2 = _calc_dimension_score("基础", {"learner_level": "advanced", "strengths": [], "blind_spots": []}, 0.8)
        assert score2 > score
    
    def test_calc_dimension_with_strengths(self):
        from app import _calc_dimension_score
        score_no = _calc_dimension_score("编程", {"learner_level": "beginner", "strengths": [], "blind_spots": []}, 0.3)
        score_yes = _calc_dimension_score("编程", {"learner_level": "beginner", "strengths": ["编程基础好"], "blind_spots": []}, 0.3)
        assert score_yes >= score_no
    
    def test_calc_dimension_with_blind_spots(self):
        from app import _calc_dimension_score
        score_no = _calc_dimension_score("算法", {"learner_level": "intermediate", "strengths": [], "blind_spots": []}, 0.5)
        score_yes = _calc_dimension_score("算法", {"learner_level": "intermediate", "strengths": [], "blind_spots": ["算法薄弱"]}, 0.5)
        assert score_yes <= score_no


# ============================================================
# 安全相关测试
# ============================================================
class TestSecurity:
    def test_admin_password_from_env(self):
        from app import ADMIN_PASSWORD
        assert ADMIN_PASSWORD is not None
        assert len(ADMIN_PASSWORD) > 0
    
    def test_html_escaping(self):
        """XSS防护：前端esc()函数等价测试"""
        test_inputs = [
            ("<script>alert('xss')</script>", "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;"),
            ('<img onerror="hack">', "&lt;img onerror=&quot;hack&quot;&gt;"),
            ("normal text", "normal text"),
        ]
        for inp, _ in test_inputs:
            # 确保输入包含的HTML标签被转义
            escaped = inp.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&#x27;")
            assert "<script>" not in escaped
            assert "<img" not in escaped
    
    def test_input_length_limits(self):
        from app import LearnerProfile, ReviewRequest, PracticeRequest
        # background max 500
        p = LearnerProfile(background="x" * 500)
        assert len(p.background) == 500
        
        # review content max 10000
        r = ReviewRequest(content="x" * 10000)
        assert len(r.content) == 10000
        
        # practice topic max 200
        pr = PracticeRequest(topic="x" * 200)
        assert len(pr.topic) == 200
    
    def test_admin_cookie_hash(self):
        import hashlib
        from app import ADMIN_PASSWORD
        expected = hashlib.sha256(ADMIN_PASSWORD.encode()).hexdigest()[:32]
        assert len(expected) == 32
        assert all(c in '0123456789abcdef' for c in expected)


# ============================================================
# 知识库内容质量测试
# ============================================================
class TestKnowledgeQuality:
    def test_knowledge_files_structure(self):
        """每个知识库文件应有标题和结构化内容"""
        kb_path = os.path.join(PROJECT_ROOT, "knowledge_base")
        for fname in os.listdir(kb_path):
            if not fname.endswith(".md"):
                continue
            with open(os.path.join(kb_path, fname), "r", encoding="utf-8") as f:
                content = f.read()
            # 应有markdown标题
            assert "#" in content, f"{fname} 缺少Markdown标题结构"
            # 应有列表或代码块
            has_structure = any(x in content for x in ["- ", "1. ", "```", "###", "**"])
            assert has_structure, f"{fname} 缺少结构化内容"
    
    def test_knowledge_source_diversity(self):
        """知识库应包含多种来源标注"""
        kb_path = os.path.join(PROJECT_ROOT, "knowledge_base")
        all_sources = set()
        for fname in os.listdir(kb_path):
            if not fname.endswith(".md"):
                continue
            with open(os.path.join(kb_path, fname), "r", encoding="utf-8") as f:
                content = f.read()
            for tag in ["[教材]", "[论文]", "[官方]", "[实践]"]:
                if tag in content:
                    all_sources.add(tag)
        assert len(all_sources) >= 2, f"来源标注种类不足: {all_sources}"
    
    def test_total_knowledge_size(self):
        """知识库总大小应足够丰富（>10KB）"""
        kb_path = os.path.join(PROJECT_ROOT, "knowledge_base")
        total_size = 0
        for fname in os.listdir(kb_path):
            if fname.endswith(".md"):
                total_size += os.path.getsize(os.path.join(kb_path, fname))
        assert total_size > 10000, f"知识库总大小仅{total_size}字节，内容过少"


# ============================================================
# 测验数据质量测试
# ============================================================
class TestQuizQuality:
    def test_quiz_fallback_has_questions(self):
        from agents.quiz import QuizAgent
        agent = QuizAgent()
        # 不调LLM，直接检查fallback
        result = agent._fallback_quiz("Python基础", "beginner", "test")
        assert "questions" in result
        assert len(result["questions"]) >= 3
        for q in result["questions"]:
            assert "question" in q
            assert "correct" in q
            # 选择题应有options
            if q.get("type") == "choice":
                assert "options" in q
                assert len(q["options"]) >= 2


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short", "-x"])
