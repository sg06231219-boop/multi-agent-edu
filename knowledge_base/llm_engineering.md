# 大模型应用开发

> 来源标注：[论文]表示学术论文，[官方]表示官方文档，[实践]表示行业经验

## RAG系统 (Retrieval-Augmented Generation) [论文-Lewis et al., 2020]

### 核心原理
RAG通过检索外部知识库来增强大模型的回答质量，有效减少幻觉（hallucination）。
```
用户问题 → 编码器 → 向量检索 → Top-K相关文档 → 上下文注入 → LLM生成
```

### 向量数据库对比 [实践-2025年行业调研]
|数据库|特点|适用场景|
|---|---|---|
|Milvus|开源、可扩展、生产级|大规模向量检索|
|ChromaDB|轻量、本地运行、快速|原型开发|
|Pinecone|云原生、托管服务|快速上线|
|Weaviate|原生混合检索(向量+关键词)|需要全文检索|

### 向量检索核心 [官方-ChromaDB文档]
```python
import chromadb
from chromadb.utils.embedding_functions import DefaultEmbeddingFunction

# 创建客户端
client = chromadb.Client()
collection = client.create_collection(
    name="knowledge_base",
    embedding_function=DefaultEmbeddingFunction()
)

# 添加文档
collection.add(
    documents=["Python是一种高级编程语言...", "深度学习是机器学习的子领域..."],
    ids=["doc1", "doc2"],
    metadatas=[{"source": "教材"}, {"source": "论文"}]
)

# 检索
results = collection.query(
    query_texts=["什么是机器学习？"],
    n_results=3
)
```

### 分块策略(Chunking) [实践]
```python
# 固定大小分块（简单但可能切断语义）
def chunk_text(text, chunk_size=500, overlap=50):
    chunks = []
    for i in range(0, len(text), chunk_size - overlap):
        chunks.append(text[i:i+chunk_size])
    return chunks

# 语义分块（按段落/句子，更精准但复杂）
# 使用 spaCy/NLTK 进行句子分割
```

## Agent开发 [官方-LangChain/官方-CrewAI]

### 什么是Agent [实践]
Agent = LLM + 工具(Tools) + 规划(Planning) + 记忆(Memory)
- LLM：决策引擎，理解指令
- Tools：执行具体操作（搜索、计算、代码执行）
- Planning：分解复杂任务为子步骤
- Memory：跨对话保持上下文

### 简单Agent实现
```python
# 伪代码示例
class SimpleAgent:
    def __init__(self, llm, tools):
        self.llm = llm
        self.tools = {t.name: t for t in tools}
    
    def run(self, task):
        # 1. LLM决定使用哪个工具
        prompt = f"任务: {task}\n可用工具: {list(self.tools.keys())}"
        decision = self.llm.decide(prompt)
        
        # 2. 执行工具
        if decision.tool in self.tools:
            result = self.tools[decision.tool].execute(decision.args)
        
        # 3. LLM基于结果生成最终回答
        return self.llm.generate(f"任务: {task}\n结果: {result}")
```

### 常用Agent框架对比 [实践]
|框架|特点|学习曲线|
|---|---|---|
|LangChain|生态最全、最灵活|较陡|
|LlamaIndex|RAG专用、索引能力强|中等|
|CrewAI|多Agent协作框架|较平缓|
|AutoGen|Microsoft出品，多Agent对话|中等|

### ReAct模式 (Reasoning + Acting) [论文-Yao et al., 2022]
```python
# ReAct循环
def react_agent(task):
    history = []
    observation = ""
    
    for step in range(5):
        # 推理
        reasoning = llm.think(f"任务: {task}\n观察: {observation}\n历史: {history}")
        
        # 决定行动
        if "搜索" in reasoning:
            action = "search"
            args = extract_search_query(reasoning)
            observation = search_tools[args]
        elif "计算" in reasoning:
            action = "calculate"
            args = extract_expression(reasoning)
            observation = calculate(args)
        else:
            # 最终回答
            return llm.generate(f"任务: {task}\n推理: {reasoning}")
        
        history.append({"reasoning": reasoning, "action": action})
```

## Prompt Engineering [官方-OpenAI CookBook]

### 基础技巧
```python
# Zero-shot（无示例）
prompt = "把以下句子翻译成英文：今天天气真好"

# Few-shot（少样本示例）
prompt = """翻译任务示例：
中文：我爱编程 → 英文：I love coding
中文：机器学习很有趣 → 英文：
"""

# Chain-of-Thought（思维链）
prompt = """问题：小明有10个苹果，送给小红3个，又买了5个，现在有几个？
让我们一步步思考：
1. 小明原有10个苹果
2. 送给小红3个：10-3=7个
3. 又买了5个：7+5=12个
答案：12个

问题：小红有5本书，小明给她2本后，小红有几本？
"""
```

### 结构化Prompt [实践]
```python
prompt = """# 角色
你是一位资深Python后端工程师，擅长FastAPI和数据库设计。

# 任务
根据用户需求设计API接口。

# 要求
1. 遵循RESTful规范
2. 使用Pydantic进行数据验证
3. 返回完整的代码示例

# 输入
{user_input}

# 输出格式
## 接口设计
[代码]
## 数据库表结构
[SQL]
"""
```

### Temperature与Top-P采样 [官方-OpenAI API]
```python
# temperature: 0=最确定性, 0.7=平衡, 1.2=创意
# - 生成代码/事实回答：temperature=0.1~0.3
# - 创意写作/头脑风暴：temperature=0.7~0.9

# top_p: 控制采样池大小
# top_p=0.9: 考虑累计概率90%内的词
# 低top_p配合低temperature：高度确定性
# 高top_p配合高temperature：高度创意
```

## 模型微调 (Fine-tuning) [官方-OpenAI/HuggingFace]

### 什么时候微调 [实践]
- 需要模型学习特定格式/风格
- API调用成本太高
- 需要本地部署（隐私/离线）

### SFT (Supervised Fine-Tuning) [论文]
```python
# 伪代码 - SFT流程
training_data = [
    {"messages": [{"role": "user", "content": "写一个Hello World"}, {"role": "assistant", "content": "print('Hello, World!')"}]},
    ...
]

# 使用LoRA进行高效微调
from peft import LoraConfig, get_peft_model
config = LoraConfig(
    r=8,                      # 秩，越大越强但越慢
    lora_alpha=16,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05,
    task_type="CAUSAL_LM"
)
model = get_peft_model(base_model, config)
```

### RLHF流程 [论文-Ouyang et al., 2022 (InstructGPT)]
1. **SFT**：用人工标注的问答数据微调
2. **奖励模型(RM)**：训练一个模型预测人类偏好
3. **PPO强化学习**：用RM作为奖励信号优化SFT模型
- ChatGPT/Claude/SGPT都使用了RLHF

## LangChain核心组件 [官方-LangChain文档]

```python
from langchain_openai import ChatOpenAI
from langchain.chains import LLMChain
from langchain.prompts import PromptTemplate

# LLM调用
llm = ChatOpenAI(model="gpt-4", temperature=0.3)

# Prompt模板
prompt = PromptTemplate.from_template(
    "请用{style}风格解释{concept}是什么？"
)

# 链
chain = LLMChain(llm=llm, prompt=prompt)
result = chain.run({"concept": "机器学习", "style": "通俗易懂"})
```

## 幻觉(Hallucination)防控策略 [实践]

1. **RAG约束**：强制LLM基于检索结果回答
2. **Chain-of-Verification**：生成后逐一验证每个声明
3. **多Agent交叉验证**：不同Agent互相审核（本项目使用此方案）
4. **置信度阈值**：低置信度回答标注"不确定"
5. **知识溯源**：每个答案标注来源文档
6. **Self-Consistency**：多次采样取一致性高的答案
