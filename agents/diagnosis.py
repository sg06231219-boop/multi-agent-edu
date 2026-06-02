"""
学情诊断Agent
分析学习者背景，生成知识画像，定位知识盲区
输出：学习水平评估、知识盲区列表、推荐学习路径
"""
import json
from agents.base import BaseAgent


class DiagnosisAgent(BaseAgent):
    def __init__(self):
        super().__init__(
            name="diagnosis",
            role="学情诊断专家",
            description="分析学习者背景，生成知识画像，精准定位知识盲区"
        )
    
    async def execute(self, profile: dict = None, **kwargs) -> dict:
        profile = profile or {}
        background = profile.get("background", "未说明")
        experience = profile.get("experience", "无")
        goal = profile.get("goal", "学习AI/编程技能")
        level = profile.get("level", "beginner")
        
        system_prompt = """你是一位资深的AI与编程教育学情诊断专家。
你的任务是：根据学习者的背景信息，精准分析其知识水平、定位知识盲区、并推荐个性化学习路径。

你必须以JSON格式输出，包含以下字段：
{
    "learner_level": "beginner/intermediate/advanced",
    "level_score": 0-100的分数,
    "strengths": ["已有优势列表"],
    "blind_spots": ["知识盲区列表"],
    "focus_topic": "最需要优先学习的主题",
    "learning_path": [
        {"phase": "阶段名", "topics": ["主题列表"], "estimated_hours": 预计学时}
    ],
    "summary": "一段50字以内的诊断总结"
}"""
        
        user_prompt = f"""请诊断以下学习者的学情：
- 背景：{background}
- 编程经验：{experience}
- 学习目标：{goal}
- 自评水平：{level}

请给出详细的学情诊断报告（JSON格式）。"""
        
        try:
            raw = self._call_llm(system_prompt, user_prompt, temperature=0.5)
            # 尝试解析JSON
            if "```" in raw:
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            result = json.loads(raw.strip())
        except (json.JSONDecodeError, Exception) as e:
            result = self._fallback_diagnosis(profile, str(e))
        
        result["agent"] = self.name
        return result
    
    def _fallback_diagnosis(self, profile: dict, error: str) -> dict:
        """LLM失败时的兜底诊断"""
        level = profile.get("level", "beginner")
        level_map = {
            "beginner": {"level_score": 25, "strengths": ["学习热情"], "blind_spots": ["编程基础", "算法思维", "数据结构"]},
            "intermediate": {"level_score": 55, "strengths": ["编程基础", "逻辑思维"], "blind_spots": ["系统设计", "性能优化", "AI算法"]},
            "advanced": {"level_score": 80, "strengths": ["项目经验", "系统设计"], "blind_spots": ["前沿AI技术", "大规模系统"]},
        }
        info = level_map.get(level, level_map["beginner"])
        return {
            "learner_level": level,
            "level_score": info["level_score"],
            "strengths": info["strengths"],
            "blind_spots": info["blind_spots"],
            "focus_topic": info["blind_spots"][0] if info["blind_spots"] else "编程基础",
            "learning_path": [
                {"phase": "基础入门", "topics": info["blind_spots"][:2], "estimated_hours": 20},
                {"phase": "进阶提升", "topics": ["项目实践", "代码优化"], "estimated_hours": 30},
            ],
            "summary": f"学习者自评{level}级，建议从{info['blind_spots'][0]}开始系统学习",
            "fallback": True,
            "error": error,
        }
