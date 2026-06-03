"""
苏格拉底式导学Agent
在知识内容中嵌入追问节点，实现启发式交互导学
打破静态资源单向输入局限
"""
import json
from agents.base import BaseAgent


class SocraticAgent(BaseAgent):
    def __init__(self):
        super().__init__(
            name="socratic",
            role="启发式导学专家",
            description="通过动态追问与启发式交互，引导学习者主动思考，打破单向知识灌输"
        )
    
    async def execute(
        self,
        knowledge: dict = None,
        conversation_history: list = None,
        mode: str = "embed_questions",
        **kwargs
    ) -> dict:
        knowledge = knowledge or {}
        conversation_history = conversation_history or []
        
        if mode == "embed_questions":
            return await self._embed_questions(knowledge)
        elif mode == "respond":
            return await self._respond_to_learner(knowledge, conversation_history)
        else:
            return await self._embed_questions(knowledge)
    
    async def _embed_questions(self, knowledge: dict) -> dict:
        """在知识内容中嵌入追问节点"""
        title = knowledge.get("title", "编程基础")
        content = knowledge.get("content", "")
        concepts = knowledge.get("concepts", [])
        
        system_prompt = """你是一位苏格拉底式教学专家。你的任务是在学习内容中嵌入启发式追问节点。

要求：
1. 在关键概念处插入追问，引导学习者主动思考
2. 追问要有层次：从理解→应用→分析→评价
3. 每个追问提供思考提示，但不直接给答案
4. 追问风格要自然，像一位耐心的导师在对话

以JSON格式输出：
{
    "title": "带追问的学习内容标题",
    "sections": [
        {
            "content": "知识点内容",
            "question": "启发式追问",
            "hint": "思考提示（不直接给答案）",
            "depth": "understanding/application/analysis/evaluation",
            "follow_ups": ["可能的追问方向1", "可能的追问方向2"]
        }
    ],
    "reflection_prompts": ["反思性问题1", "反思性问题2"],
    "summary": "50字导学设计总结"
}"""
        
        concepts_str = "、".join(concepts[:5]) if concepts else "基础概念"
        user_prompt = f"""请为以下学习内容设计启发式追问节点：

主题：{title}
核心概念：{concepts_str}
内容摘要：{content[:1000]}

请设计5-8个追问节点，覆盖不同思维层次。"""
        
        try:
            raw = self._call_llm(system_prompt, user_prompt, temperature=0.6)
            if "```" in raw:
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            result = json.loads(raw.strip())
        except (json.JSONDecodeError, Exception) as e:
            result = self._fallback_embed(title, concepts, str(e))
        
        result["agent"] = self.name
        result["mode"] = "embed_questions"
        return result
    
    async def _respond_to_learner(self, knowledge: dict, conversation_history: list) -> dict:
        """根据学习者回答进行动态追问"""
        title = knowledge.get("title", "编程基础")
        concepts = knowledge.get("concepts", [])
        
        system_prompt = """你是一位苏格拉底式导学导师。你正在与学习者进行对话式导学。

规则：
1. 不要直接给答案，通过追问引导学习者自己思考
2. 根据学习者的回答质量调整追问深度
3. 如果学习者理解正确，给予肯定并引入更深层的思考
4. 如果学习者理解有误，不直接纠正，而是用反例或类比引导发现错误
5. 保持对话自然流畅，像朋友间的交流

以JSON格式输出：
{
    "response": "你的回复",
    "assessment": "understood/partially_understood/misunderstood/needs_deeper",
    "next_question": "下一个追问（如有）",
    "encouragement": "一句鼓励的话",
    "hint_if_needed": "提示（仅在需要时给出）",
    "summary": "当前对话状态总结"
}"""
        
        history_str = ""
        for msg in conversation_history[-6:]:  # 最近6轮对话
            role = msg.get("role", "learner")
            text = msg.get("text", "")
            history_str += f"{'🎓导师' if role == 'tutor' else '🙋学习者'}：{text}\n"
        
        user_prompt = f"""当前学习主题：{title}
核心概念：{'、'.join(concepts[:5]) if concepts else '基础概念'}

对话历史：
{history_str if history_str else '（对话刚开始）'}

请根据学习者的回答给出导学回应。"""
        
        try:
            raw = self._call_llm(system_prompt, user_prompt, temperature=0.7)
            if "```" in raw:
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            result = json.loads(raw.strip())
        except (json.JSONDecodeError, Exception) as e:
            result = self._fallback_respond(conversation_history, str(e))
        
        result["agent"] = self.name
        result["mode"] = "respond"
        return result
    
    def _fallback_embed(self, title, concepts, error):
        return {
            "title": f"{title} — 启发式导学",
            "sections": [
                {"content": f"{title}的基本概念", "question": "你能用自己的话解释这个概念吗？", "hint": "想想你日常生活中的类似例子", "depth": "understanding", "follow_ups": ["如果改变条件会怎样？", "这和之前学的概念有什么联系？"]},
                {"content": "核心原理", "question": "为什么这样设计？有什么优势？", "hint": "对比其他可能的方案", "depth": "analysis", "follow_ups": ["有没有例外情况？", "在更大规模下还成立吗？"]},
                {"content": "实际应用", "question": "你能想到一个实际应用场景吗？", "hint": "回忆你见过的相关产品或工具", "depth": "application", "follow_ups": ["如果要改进这个应用，你会怎么做？"]},
                {"content": "进阶思考", "question": "如果让你来设计一个更好的方案，你会怎么改？", "hint": "结合你学过的其他知识", "depth": "evaluation", "follow_ups": ["这个改进可能带来什么新问题？"]},
            ],
            "reflection_prompts": ["回顾整个学习过程，你最大的收获是什么？", "还有哪些问题你想进一步探索？"],
            "summary": f"为{title}设计了4个层次的启发式追问",
            "fallback": True,
            "error": error,
        }
    
    def _fallback_respond(self, history, error):
        last_msg = history[-1].get("text", "") if history else ""
        return {
            "response": f"你提到了一个很好的点——'{last_msg[:20]}'。能更详细地解释一下你的理解吗？我想听听你是怎么思考这个问题的。",
            "assessment": "partially_understood",
            "next_question": "你能不能举个例子来说明你的想法？",
            "encouragement": "思考的方向很好，继续深入！",
            "hint_if_needed": "试着从不同角度来看这个问题",
            "summary": "学习者正在思考中，需要进一步引导",
            "fallback": True,
            "error": error,
        }
