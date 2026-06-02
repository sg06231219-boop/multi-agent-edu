# AI与机器学习基础

## 什么是人工智能
人工智能(AI)是计算机科学的一个分支，旨在创建能够模拟人类智能行为的系统。包括：
- **弱AI/窄AI**: 针对特定任务（如图像识别、语音助手）
- **强AI/通用AI**: 具备人类水平的通用智能（尚未实现）

## 机器学习三大范式

### 1. 监督学习 (Supervised Learning)
使用标注数据训练模型，预测未知数据的标签。
- **分类**: 预测离散标签（如垃圾邮件检测）
- **回归**: 预测连续值（如房价预测）
- 常用算法：线性回归、决策树、SVM、随机森林

### 2. 无监督学习 (Unsupervised Learning)
从无标注数据中发现模式。
- **聚类**: K-Means、DBSCAN
- **降维**: PCA、t-SNE
- **关联规则**: Apriori

### 3. 强化学习 (Reinforcement Learning)
通过与环境交互获得奖励信号来学习策略。
- 核心概念：状态(State)、动作(Action)、奖励(Reward)
- 算法：Q-Learning、PPO、SAC

## 深度学习基础

### 神经网络
```
输入层 → 隐藏层(s) → 输出层
```
- **激活函数**: ReLU、Sigmoid、Tanh
- **损失函数**: MSE、Cross-Entropy
- **优化器**: SGD、Adam、AdamW

### 常见架构
- **CNN**: 图像处理（卷积→池化→全连接）
- **RNN/LSTM**: 序列数据（时间序列、文本）
- **Transformer**: 自注意力机制（GPT/BERT的基础）

## 大语言模型 (LLM)

### 核心概念
- **预训练**: 在大规模文本上学习语言表示
- **微调(SFT)**: 在特定任务数据上进一步训练
- **RLHF**: 基于人类反馈的强化学习
- **RAG**: 检索增强生成，结合外部知识库
- **Agent**: 大模型驱动的智能体，能调用工具完成复杂任务

### Prompt Engineering
- **Zero-shot**: 不给示例直接提问
- **Few-shot**: 提供少量示例
- **Chain-of-Thought**: 让模型逐步推理
- **ReAct**: 推理+行动交替

## Python AI工具栈
- **NumPy**: 数值计算
- **Pandas**: 数据处理
- **Scikit-learn**: 传统机器学习
- **PyTorch/TensorFlow**: 深度学习
- **Hugging Face**: 预训练模型库
- **LangChain**: LLM应用开发框架

## 评估指标
- **准确率(Accuracy)**: 正确预测比例
- **精确率(Precision)**: 预测为正中实际为正的比例
- **召回率(Recall)**: 实际为正中被正确预测的比例
- **F1-Score**: 精确率和召回率的调和平均
- **AUC-ROC**: 分类模型整体性能
