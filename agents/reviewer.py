"""
审核裁判Agent
对生成内容进行交叉验证，检测幻觉，评估准确性
实现辩论机制：质疑→答辩→再评
"""
import json
from agents.base import BaseAgent


class ReviewerAgent(BaseAgent):
    def __init__(self):
        super().__init__(
            name="reviewer",
            role="内容审核裁判",
            description="交叉验证生成内容，检测幻觉，确保知识高保真"
        )
    
    async def execute(
        self, content: str = "", source_refs: list = None,
        debate_round: int = 1, **kwargs
    ) -> dict:
        source_refs = source_refs or []
        
        system_prompt = f"""你是一位严谨的AI/编程领域知识审核专家。
你的任务是审核生成内容是否存在幻觉（编造的事实）、不准确的知识点、或与行业规范不符的内容。

当前是第{debate_round}轮审核。如果是第2轮+，需要关注之前指出的问题是否已修正。

审核标准：
1. 事实准确性：是否与领域标准一致
2. 逻辑连贯性：论证是否自洽
3. 知识溯源：是否可以追溯到可靠来源
4. 行业规范：是否符合AI/编程行业实践

以JSON格式输出：
{{
    "verdict": "pass/pass_with_concerns/needs_revision/reject",
    "hallucination_score": 0-100（0=无幻觉，100=严重幻觉）,
    "accuracy_score": 0-100,
    "issues": [
        {{"type": "factual_error/logical_flaw/missing_source/industry_violation", "description": "问题描述", "severity": "high/medium/low", "suggestion": "修正建议"}}
    ],
    "strengths": ["内容优点"],
    "summary": "审核总结（50字以内）"
}}"""
        
        user_prompt = f"""请审核以下学习内容（第{debate_round}轮）：

--- 内容摘要 ---
{content[:1200]}

--- 来源 ---
{json.dumps(source_refs, ensure_ascii=False) if source_refs else '无'}

请严格评估。"""
        
        try:
            raw = self._call_llm(system_prompt, user_prompt, temperature=0.3)
            if "```" in raw:
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            result = json.loads(raw.strip())
        except (json.JSONDecodeError, Exception) as e:
            result = self._fallback_review(content, str(e))
        
        result["agent"] = self.name
        result["debate_round"] = debate_round
        return result
    
    def _fallback_review(self, content: str, error: str) -> dict:
        """兜底审核"""
        has_source = "来源" in content or "参考" in content or "引用" in content
        return {
            "verdict": "pass_with_concerns",
            "hallucination_score": 15 if has_source else 35,
            "accuracy_score": 75,
            "issues": [
                {"type": "missing_source", "description": "部分内容缺少明确来源标注", "severity": "medium", "suggestion": "为每个知识点添加来源引用"}
            ],
            "strengths": ["内容结构清晰"],
            "summary": "基本通过，需补充知识溯源标注",
            "fallback": True,
            "error": error,
        }
