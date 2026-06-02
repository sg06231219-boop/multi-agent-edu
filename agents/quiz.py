"""
分阶测试Agent
生成测试题、评估掌握度、动态调整难度
"""
import json
from agents.base import BaseAgent


class QuizAgent(BaseAgent):
    def __init__(self):
        super().__init__(
            name="quiz",
            role="分阶测试专家",
            description="生成分阶测试题，评估掌握度，支持动态难度调整"
        )
    
    async def execute(self, knowledge: dict = None, difficulty: str = "medium", **kwargs) -> dict:
        knowledge = knowledge or {}
        title = knowledge.get("title", "编程基础")
        concepts = knowledge.get("concepts", [])
        
        system_prompt = """你是一位AI/编程领域的测试题设计专家。
你的任务是根据学习内容，生成分阶测试题，覆盖不同难度和题型。

以JSON格式输出：
{
    "quiz_title": "测试标题",
    "difficulty": "easy/medium/hard",
    "questions": [
        {
            "id": 1,
            "type": "choice/coding/short_answer",
            "difficulty": "easy/medium/hard",
            "question": "题目内容",
            "options": ["A选项", "B选项", "C选项", "D选项"],
            "correct": "A",
            "explanation": "答案解析",
            "knowledge_point": "考察的知识点"
        }
    ],
    "total_score": 100,
    "passing_score": 60,
    "summary": "50字测试总结"
}"""
        
        concepts_str = "、".join(concepts) if concepts else "编程基础知识"
        user_prompt = f"""请基于以下学习内容生成分阶测试题：
- 主题：{title}
- 核心概念：{concepts_str}
- 难度级别：{difficulty}

要求：
1. 生成5道题目（2道easy + 2道medium + 1道hard）
2. 包含选择题和简答题
3. 每题标注考察的知识点
4. 提供答案解析"""
        
        try:
            raw = self._call_llm(system_prompt, user_prompt, temperature=0.4)
            if "```" in raw:
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            result = json.loads(raw.strip())
        except (json.JSONDecodeError, Exception) as e:
            result = self._fallback_quiz(title, difficulty, str(e))
        
        result["agent"] = self.name
        return result
    
    def _fallback_quiz(self, title: str, difficulty: str, error: str) -> dict:
        return {
            "quiz_title": f"{title}测试题（{difficulty}级）",
            "difficulty": difficulty,
            "questions": [
                {"id": 1, "type": "choice", "difficulty": "easy", "question": "Python中用什么关键字定义函数？", "options": ["function", "def", "func", "define"], "correct": "B", "explanation": "Python使用def关键字定义函数", "knowledge_point": "函数定义"},
                {"id": 2, "type": "choice", "difficulty": "easy", "question": "以下哪个是Python的列表？", "options": ["(1,2,3)", "[1,2,3]", "{1,2,3}", "<1,2,3>"], "correct": "B", "explanation": "Python列表使用方括号[]", "knowledge_point": "数据类型"},
                {"id": 3, "type": "short_answer", "difficulty": "medium", "question": "请解释什么是变量作用域", "options": [], "correct": "变量作用域指变量可被访问的代码范围", "explanation": "包括局部变量和全局变量", "knowledge_point": "作用域"},
                {"id": 4, "type": "choice", "difficulty": "medium", "question": "Python中__init__方法的作用是？", "options": ["销毁对象", "初始化对象", "继承父类", "重载运算符"], "correct": "B", "explanation": "__init__是构造方法，用于初始化对象", "knowledge_point": "面向对象"},
                {"id": 5, "type": "coding", "difficulty": "hard", "question": "写一个函数，接收列表，返回其中所有偶数的平方", "options": [], "correct": "[x**2 for x in lst if x%2==0]", "explanation": "使用列表推导式筛选偶数并求平方", "knowledge_point": "列表推导式+条件筛选"},
            ],
            "total_score": 100,
            "passing_score": 60,
            "summary": f"共5题，覆盖{title}的基础到进阶知识点",
            "fallback": True,
            "error": error,
        }
