# AI与机器学习基础

> 来源标注：[教材]表示经典教材，[论文]表示学术论文，[官方]表示官方文档，[实践]表示行业经验

## 什么是人工智能 [教材-《人工智能：现代方法》第4版]

人工智能(AI)是计算机科学的一个分支，旨在创建能够模拟人类智能行为的系统。主要分为：
- **弱AI/窄AI**: 针对特定任务（如图像识别、语音助手、推荐系统）
- **强AI/通用AI(AGI)**: 具备人类水平的通用智能（尚未实现）

### AI发展关键节点 [实践]
1. 1950年：图灵测试提出
2. 1956年：达特茅斯会议，"人工智能"一词诞生
3. 2012年：AlexNet大幅提升ImageNet识别率，深度学习爆发
4. 2017年：Transformer架构问世（论文《Attention is All You Need》）
5. 2020年至今：GPT系列等大语言模型快速发展

## 机器学习三大范式 [教材-《统计学习方法》]

### 1. 监督学习 (Supervised Learning)
使用标注数据训练模型，预测未知数据的标签。
- **分类**: 预测离散标签（如垃圾邮件检测）
  - 逻辑回归：使用sigmoid函数将线性输出映射到0-1概率
  - 支持向量机(SVM)：寻找最大间隔超平面，仅依赖支持向量
  - 决策树：基于信息增益或Gini指数递归分裂
  - 随机森林：多棵决策树投票，Bagging+随机特征选择
- **回归**: 预测连续值（如房价预测）
  - 线性回归：最小二乘法，解析解存在条件是矩阵可逆
  - 岭回归/Lasso：L2/L1正则化防过拟合
- 常用算法复杂度对比 [论文-Scikit-learn Benchmarks]：
  - 线性回归：训练O(p^2n)，预测O(p)
  - SVM(RBF核)：训练O(n^3)，预测O(n_sv * p)
  - 随机森林：训练O(trees * n * log(n) * p)，预测O(depth)

### 2. 无监督学习 (Unsupervised Learning)
从无标注数据中发现模式。
- **聚类**: K-Means（迭代更新质心）、DBSCAN（基于密度，无需预设k）
- **降维**: PCA（最大方差方向）、t-SNE（可视化用，非线性降维）
- **关联规则**: Apriori算法（频繁项集挖掘）

### 3. 强化学习 (Reinforcement Learning)
通过与环境交互获得奖励信号来学习策略。
- 核心概念：状态(State)、动作(Action)、奖励(Reward)、策略(Policy)
- Q-Learning：通过Q表记录状态-动作价值，更新公式Q(s,a) = Q(s,a) + alpha(r + gamma*max Q(s',a') - Q(s,a))
- PPO：近端策略优化，GPT系列RLHF阶段使用的算法 [官方-OpenAI]
- SAC：软演员-评论家算法，连续控制任务SOTA

## 深度学习基础 [教材-《深度学习》(Goodfellow等)]

### 神经网络
```
输入层 → 隐藏层(s) → 输出层
```
- **激活函数** [官方-PyTorch Docs]:
  - ReLU: f(x) = max(0, x)，计算快但存在"死亡ReLU"问题
  - GELU: 高斯误差线性单元，Transformer中使用
  - Sigmoid: 输出0-1，用于二分类输出层
  - Tanh: 输出-1到1，用于需要归一化的场景
- **损失函数**:
  - MSE(均方误差)：回归任务
  - Cross-Entropy(交叉熵)：分类任务
- **优化器** [论文-Kingma & Ba, 2015]:
  - SGD：随机梯度下降，最基础
  - Adam：自适应学习率，结合Momentum和RMSprop，最常用
  - AdamW：Adam的改进版，解耦权重衰减

### 常见架构 [教材-《深度学习》]
- **CNN(卷积神经网络)**：图像处理，核心操作为卷积→池化→全连接
  - 经典模型：ResNet(残差连接)、EfficientNet(复合缩放)
- **RNN/LSTM**：序列数据（时间序列、文本），LSTM通过门控机制解决长程依赖
- **Transformer**：自注意力机制，GPT/BERT的基础 [论文-Vaswani et al., 2017]
  - 自注意力：Q*K^T/√d_k * V
  - 多头注意力：h个并行的注意力头，捕获不同子空间的信息
  - 位置编码：正弦/余弦或可学习位置向量

## 大语言模型 (LLM) [官方-OpenAI/Anthropic文档]

### 核心概念
- **预训练**: 在大规模文本上学习语言表示（下一个词预测）
- **微调(SFT)**: 在特定任务数据上进一步训练
- **RLHF**: 基于人类反馈的强化学习，使模型输出更符合人类偏好
- **RAG(检索增强生成)**: 结合外部知识库，减少幻觉 [论文-Lewis et al., 2020]
- **Agent**: 大模型驱动的智能体，能调用工具完成复杂任务
- **CoT(思维链)**: 让模型逐步推理，提升复杂任务准确率

### Prompt Engineering技巧 [实践-Kaggle/行业经验]
- **Zero-shot**: 不给示例直接提问
- **Few-shot**: 提供少量示例引导输出格式
- **Chain-of-Thought**: 让模型"一步步思考"
- **ReAct**: 推理(Reasoning)+行动(Acting)交替执行
- **Self-Consistency**: 多次采样取多数答案，提升可靠性

### 主流模型对比 [实践-2025年行业调研]
|模型|参数量|训练方式|特点|
|---|---|---|---|
|GPT-4o|未公开|RLHF|多模态，综合能力强|
|Claude 3.5|未公开|Constitutional AI|安全对齐，长上下文|
|GLM-4|未公开|RLHF|中文能力突出，开放API|
|Llama 3|8B/70B/405B|开源|社区生态丰富，可本地部署|

## Python AI工具栈 [官方-PyTorch/Scikit-learn文档]

### 数据处理
- **NumPy**: n维数组(ndarray)，向量化运算，比纯Python快100倍+
- **Pandas**: DataFrame/Series，数据清洗、分组、聚合、时间序列
- **Matplotlib/Seaborn**: 数据可视化，折线图/热力图/散点图

### 机器学习
- **Scikit-learn**: 传统ML一站式工具，API统一fit/predict/transform
- **XGBoost/LightGBM**: 梯度提升树，表格数据竞赛常胜算法

### 深度学习
- **PyTorch**: 动态计算图，学术界主流，Python风格API
- **TensorFlow**: 静态/动态图，工业界广泛使用
- **Hugging Face**: 预训练模型库，transformers/pipelines一行调用

### LLM应用开发
- **LangChain**: LLM应用开发框架，链/Agent/记忆/RAG
- **LlamaIndex**: RAG专用框架，文档索引+检索+生成
- **vLLM**: 高性能推理引擎，PagedAttention技术

## 评估指标 [教材-《统计学习方法》]

### 分类指标
- **准确率(Accuracy)**: 正确预测/总数，不均衡数据下有误导性
- **精确率(Precision)**: 预测为正中实际为正的比例，关注"误报率"
- **召回率(Recall)**: 实际为正中被正确预测的比例，关注"漏报率"
- **F1-Score**: 精确率和召回率的调和平均，2*P*R/(P+R)
- **AUC-ROC**: 分类阈值变化下整体性能，越接近1越好

### 回归指标
- **MSE/RMSE**: 均方误差/均方根误差，对异常值敏感
- **MAE**: 平均绝对误差，对异常值鲁棒
- **R²**: 决定系数，1表示完美拟合

### LLM专项指标
- **BLEU**: 机器翻译质量，基于n-gram重叠度
- **ROUGE**: 文本摘要质量，基于召回率
- **Perplexity**: 语言模型困惑度，越低越好
