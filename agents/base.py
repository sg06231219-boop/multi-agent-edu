"""Agent基类"""
import os
import json
from abc import ABC, abstractmethod
from typing import Any, Optional


class BaseAgent(ABC):
    """所有Agent的基类"""
    
    
    def __init__(self, name: str, role: str, description: str):
        self.name = name
        self.role = role
        self.description = description
        self.last_result: Optional[dict] = None
    
    @abstractmethod
    async def execute(self, **kwargs) -> dict:
        """执行Agent的核心逻辑"""
        pass
    
    def info(self) -> dict:
        return {
            "name": self.name,
            "role": self.role,
            "description": self.description,
        }
    
    # 默认LLM超时（秒）
    LLM_TIMEOUT = 30

    def _call_llm(self, system_prompt: str, user_prompt: str, temperature: float = 0.7) -> str:
        """调用智谱GLM-4-flash，带超时和重试"""
        from zhipuai import ZhipuAI
        api_key = os.environ.get("ZHIPUAI_API_KEY", "")
        if not api_key:
            raise RuntimeError("ZHIPUAI_API_KEY环境变量未设置，请在Render环境变量中配置")
        
        client = ZhipuAI(api_key=api_key, timeout=self.LLM_TIMEOUT)
        last_err = None
        for attempt in range(2):
            try:
                response = client.chat.completions.create(
                    model="glm-4-flash",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=temperature,
                )
                return response.choices[0].message.content
            except Exception as e:
                last_err = e
                if attempt == 0 and ("timeout" in str(e).lower() or "connection" in str(e).lower()):
                    continue  # 重试一次
                raise
        raise last_err
