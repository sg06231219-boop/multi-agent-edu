"""
动态迭代Agent
根据学习者反馈（如答题正确率），协同决策是否"降维解释"或"进阶挑战"
实现"交互反馈→动态决策更新"闭环
"""
import json
from agents.base import BaseAgent


class IterationAgent(BaseAgent):
    def __init__(self):
        super().__init__(
            name="iteration",
            role="动态迭代决策专家",
            description="根据学习反馈动态调整内容难度，实现降维解释或进阶挑战"
        )
    
    async def execute(
        self,
        quiz_result: dict = None,
        diagnosis: dict = None,
        knowledge: dict = None,
        **kwargs
    ) -> dict:
        quiz_result = quiz_result or {}
        diagnosis = diagnosis or {}
        knowledge = knowledge or {}
        
        # 计算正确率
        questions = quiz_result.get("questions", [])
        user_answers = quiz_result.get("user_answers", {})
        correct_count = 0
        total = len(questions)
        
        for q in questions:
            qid = str(q.get("id", ""))
            if qid in user_answers:
                if user_answers[qid] == q.get("correct", ""):
                    correct_count += 1
        
        accuracy = (correct_count / total * 100) if total > 0 else 0
        
        # 根据正确率决定策略
        if accuracy < 60:
            strategy = "simplify"
            strategy_label = "降维解释"
            reason = f"正确率仅{accuracy:.0f}%，需大幅降低难度，补充基础知识"
        elif accuracy < 80:
            strategy = "consolidate"
            strategy_label = "巩固强化"
            reason = f"正确率{accuracy:.0f}%，基本掌握但存在薄弱点，针对性巩固"
        else:
            strategy = "advance"
            strategy_label = "进阶挑战"
            reason = f"正确率{accuracy:.0f}%，掌握良好，可进入更高难度内容"
        
        # 调用LLM生成具体的迭代建议
        system_prompt = """你是一位智能教育决策专家。根据学习者的测试反馈，你需要给出具体的迭代学习建议。

以JSON格式输出：
{
    "decision": "simplify/consolidate/advance",
    "decision_label": "降维解释/巩固强化/进阶挑战",
    "reason": "决策理由",
    "adjustments": {
        "difficulty_shift": -2到+2的难度调整值,
        "focus_topics": ["需要重点关注的主题"],
        "skip_topics": ["可以跳过的主题"],
        "new_approach": "建议的教学方式调整"
    },
    "next_steps": [
        {"step": 1, "action": "具体行动", "agent": "负责的Agent", "description": "详细说明"}
    ],
    "summary": "50字迭代决策总结"
}"""
        
        user_prompt = f"""请根据以下测试结果做出迭代决策：

学情诊断：
- 学习水平：{diagnosis.get('learner_level', 'unknown')}
- 知识盲区：{diagnosis.get('blind_spots', [])}

测试结果：
- 总题数：{total}
- 答对题数：{correct_count}
- 正确率：{accuracy:.1f}%
- 当前策略：{strategy_label}

已学内容主题：{knowledge.get('title', '未知')}
核心概念：{knowledge.get('concepts', [])}

请给出精准的迭代学习建议。"""
        
        try:
            raw = self._call_llm(system_prompt, user_prompt, temperature=0.4)
            if "```" in raw:
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            result = json.loads(raw.strip())
        except (json.JSONDecodeError, Exception) as e:
            result = self._fallback_iteration(accuracy, strategy, strategy_label, reason, str(e))
        
        result["agent"] = self.name
        result["accuracy"] = round(accuracy, 1)
        result["correct_count"] = correct_count
        result["total_questions"] = total
        return result
    
    def _fallback_iteration(self, accuracy, strategy, label, reason, error):
        adjustments = {
            "simplify": {"difficulty_shift": -2, "focus_topics": ["基础概念复习", "关键知识点重讲"], "skip_topics": ["高级特性"], "new_approach": "用更通俗的语言和更多示例讲解"},
            "consolidate": {"difficulty_shift": 0, "focus_topics": ["薄弱环节强化"], "skip_topics": [], "new_approach": "针对性补充练习和讲解"},
            "advance": {"difficulty_shift": +2, "focus_topics": ["进阶技术", "实战项目"], "skip_topics": ["已掌握的基础知识"], "new_approach": "引入更高难度的概念和项目实践"},
        }
        return {
            "decision": strategy,
            "decision_label": label,
            "reason": reason,
            "adjustments": adjustments.get(strategy, adjustments["consolidate"]),
            "next_steps": [
                {"step": 1, "action": f"执行{label}策略", "agent": "knowledge_gen", "description": reason}
            ],
            "summary": f"正确率{accuracy:.0f}%，建议{label}",
            "fallback": True,
            "error": error,
        }
