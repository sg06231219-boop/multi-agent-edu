"""Agent基类"""
import os
import json
from abc import ABC, abstractmethod
from typing import Any, Optional


class BaseAgent(ABC):
    """所有Agent的基类"""
    
    # 默认API Key（开发用，正式部署走环境变量）
    _DEFAULT_API_KEY = "a3a3123abff546999aeb4547885c4ae8.PocEri894pv9APeu"
    
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
    
    def _call_llm(self, system_prompt: str, user_prompt: str, temperature: float = 0.7) -> str:
        """调用智谱GLM-4-flash"""
        from zhipuai import ZhipuAI
        api_key = os.environ.get("ZHIPUAI_API_KEY", "") or self._DEFAULT_API_KEY
        
        client = ZhipuAI(api_key=api_key)
        response = client.chat.completions.create(
            model="glm-4-flash",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
        )
        return response.choices[0].message.content
