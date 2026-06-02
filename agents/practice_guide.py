"""
实操指南Agent
生成动手练习、项目脚手架、代码示例
"""
import json
from agents.base import BaseAgent


class PracticeGuideAgent(BaseAgent):
    def __init__(self):
        super().__init__(
            name="practice_guide",
            role="实操指南生成专家",
            description="生成代码练习、项目脚手架、分步实操指南"
        )
    
    async def execute(self, topic: str = "", level: str = "beginner", **kwargs) -> dict:
        system_prompt = """你是一位AI/编程领域的实操教学专家。
你的任务是根据学习主题和水平，生成分步实操指南和代码练习。

以JSON格式输出：
{
    "title": "实操指南标题",
    "difficulty": "beginner/intermediate/advanced",
    "estimated_time": "预计完成时间（分钟）",
    "steps": [
        {"step": 1, "title": "步骤标题", "description": "详细说明", "code": "示例代码（如有）", "tip": "注意事项"}
    ],
    "project_idea": "一个完整的项目建议，用于巩固所学",
    "common_mistakes": ["常见错误列表"],
    "summary": "50字实操总结"
}"""
        
        user_prompt = f"""请为{level}级学习者生成关于「{topic}」的实操指南：
- 包含3-5个递进式步骤
- 每步附代码示例
- 包含一个综合项目建议
- 标注常见易错点"""
        
        try:
            raw = self._call_llm(system_prompt, user_prompt, temperature=0.5)
            if "```" in raw:
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            result = json.loads(raw.strip())
        except (json.JSONDecodeError, Exception) as e:
            result = self._fallback_practice(topic, level, str(e))
        
        result["agent"] = self.name
        return result
    
    def _fallback_practice(self, topic: str, level: str, error: str) -> dict:
        return {
            "title": f"{topic}实操指南（{level}级）",
            "difficulty": level,
            "estimated_time": "30-60分钟",
            "steps": [
                {"step": 1, "title": "环境准备", "description": f"安装{topic}所需的开发环境和工具", "code": "# 安装示例\npip install python", "tip": "确保Python版本≥3.8"},
                {"step": 2, "title": "基础练习", "description": f"完成{topic}的基本功能实现", "code": "# 基础代码示例\nprint('Hello, World!')", "tip": "注意缩进和语法"},
                {"step": 3, "title": "进阶挑战", "description": "扩展功能，加深理解", "code": "# 进阶代码\n# TODO: 实现更多功能", "tip": "尝试自己思考和实现"},
            ],
            "project_idea": f"构建一个完整的{topic}项目，整合所有学到的知识",
            "common_mistakes": ["忽略异常处理", "变量命名不规范", "缺少注释"],
            "summary": f"面向{level}级学习者的{topic}实操指南",
            "fallback": True,
            "error": error,
        }
