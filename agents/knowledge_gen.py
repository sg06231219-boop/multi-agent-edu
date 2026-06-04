"""
领域知识生成Agent
基于学情诊断结果，从知识库检索相关知识，生成个性化学习内容
输出：定制化学习资源、知识溯源引用
"""
import json
import os
from agents.base import BaseAgent


class KnowledgeGenAgent(BaseAgent):
    def __init__(self):
        super().__init__(
            name="knowledge_gen",
            role="领域知识生成专家",
            description="基于学情诊断和知识库，生成个性化学习内容，标注知识溯源"
        )
        self.kb_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "knowledge_base"
        )
    
    async def execute(self, diagnosis: dict = None, revision_hints: list = None, **kwargs) -> dict:
        diagnosis = diagnosis or {}
        focus_topic = diagnosis.get("focus_topic", "Python编程基础")
        level = diagnosis.get("learner_level", "beginner")
        blind_spots = diagnosis.get("blind_spots", [])
        
        # 从知识库加载相关内容
        kb_content = self._load_knowledge(focus_topic)
        
        revision_note = ""
        if revision_hints:
            revision_note = f"\n\n⚠️ 审核Agent指出以下问题需要修正：{json.dumps(revision_hints, ensure_ascii=False)}\n请针对这些问题重新生成内容。"
        
        system_prompt = """你是一位AI/编程领域的资深技术教育专家。
你的任务是基于学习者的学情诊断和知识库素材，生成个性化的学习内容。

要求：
1. 内容必须基于提供的知识库素材，不得编造
2. 每个知识点必须标注来源（source_refs）
3. 内容难度要匹配学习者的水平
4. 生成3种形态的内容：概念讲解、实操示例、扩展阅读

以JSON格式输出：
{
    "title": "内容标题",
    "content": "完整的学习内容（Markdown格式）",
    "source_refs": [{"id": "引用编号", "title": "来源标题", "relevance": "相关性说明"}],
    "concepts": ["核心概念列表"],
    "examples": ["实操示例列表"],
    "extensions": ["扩展阅读列表"],
    "summary": "50字内容摘要"
}"""
        
        kb_summary = kb_content[:1500] if kb_content else '暂无'
        user_prompt = f"""请为以下学习者生成个性化学习内容：

学情诊断：
- 学习水平：{level}
- 重点主题：{focus_topic}
- 知识盲区：{blind_spots}

参考素材：
{kb_summary}
{revision_note}"""
        
        try:
            raw = self._call_llm(system_prompt, user_prompt, temperature=0.6)
            if "```" in raw:
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            result = json.loads(raw.strip())
        except (json.JSONDecodeError, Exception) as e:
            result = self._fallback_knowledge(focus_topic, level, str(e))
        
        result["agent"] = self.name
        return result
    
    def _load_knowledge(self, topic: str) -> str:
        """从知识库加载相关内容，关键词+内容双匹配"""
        results = []
        topic_lower = topic.lower()
        topic_keywords = set(topic_lower.replace('_', ' ').replace('-', ' ').split())
        try:
            files = sorted(f for f in os.listdir(self.kb_path) if f.endswith(".md"))
        except Exception:
            return ""
        
        for fname in files:
            fpath = os.path.join(self.kb_path, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    content = f.read()
            except Exception:
                continue
            # 文件名匹配
            fname_base = fname.replace('.md', '').replace('_', ' ').lower()
            name_match = any(kw in fname_base for kw in topic_keywords)
            # 内容匹配
            content_lower = content[:3000].lower()
            content_match = sum(1 for kw in topic_keywords if kw in content_lower)
            
            if name_match or content_match >= 1:
                results.append((name_match * 10 + content_match, content))
        
        if results:
            results.sort(key=lambda x: -x[0])
            return results[0][1][:3000]  # 最相关的，截取前3000字
        
        # 没找到则返回所有知识库摘要
        all_summaries = []
        for fname in files[:3]:
            fpath = os.path.join(self.kb_path, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    all_summaries.append(f"[{fname}]\n" + f.read()[:500])
            except Exception:
                continue
        return "\n---\n".join(all_summaries) if all_summaries else ""
    
    def _fallback_knowledge(self, topic: str, level: str, error: str) -> dict:
        """兜底生成"""
        return {
            "title": f"{topic} - {level}级学习内容",
            "content": f"## {topic}\n\n这是为{level}级学习者生成的关于{topic}的学习内容。\n\n### 核心概念\n{topic}的基本原理和关键要点。\n\n### 实操示例\n通过动手练习加深理解。\n\n### 扩展阅读\n更多深入资料。",
            "source_refs": [{"id": "KB001", "title": "基础知识库", "relevance": "核心参考"}],
            "concepts": [f"{topic}基本概念", f"{topic}核心原理"],
            "examples": [f"{topic}入门示例"],
            "extensions": [f"{topic}进阶资料"],
            "summary": f"面向{level}级学习者的{topic}个性化内容",
            "fallback": True,
            "error": error,
        }
