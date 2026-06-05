# 多智能体协同学习平台

> XH-202630「领域知识个性化生成与多智能体协同决策系统研究」参赛项目

## 简介

基于7个AI Agent协同决策的个性化学习资源生成系统，面向AI/编程领域技能培训。

**7个Agent协同流程：**
1. 🔍 学情诊断Agent — 分析学习背景与知识盲区
2. 📚 知识生成Agent — 生成个性化领域知识内容
3. 🛡️ 审核辩论Agent — 双视角审核+幻觉防控
4. 🔧 实操指南Agent — 生成实践操作指南
5. 📝 分阶测试Agent — 生成分级测验题
6. 🔄 动态迭代Agent — 根据测试结果调整策略
7. 💡 苏格拉底导学Agent — 启发式互动教学

## 线上地址

- **平台首页**: https://multi-agent-edu.onrender.com
- **管理后台**: https://multi-agent-edu.onrender.com/admin (密码: admin123)

## 技术栈

- **后端**: Python 3.12 + FastAPI + Uvicorn
- **AI引擎**: 智谱GLM-4-flash（支持JWT认证）
- **实时推送**: SSE (Server-Sent Events)
- **前端**: 原生HTML/CSS/JS
- **部署**: GitHub + Render (Python runtime)
- **知识库**: 5个Markdown文件，覆盖80+知识点

## 核心API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/stream` | POST | SSE全流程流式输出 |
| `/api/start` | POST | 全流程同步执行 |
| `/api/diagnosis` | POST | 单步学情诊断 |
| `/api/generate` | POST | 单步知识生成 |
| `/api/review` | POST | 单步审核辩论 |
| `/api/quiz` | POST | 单步分阶测试 |
| `/api/practice` | POST | 单步实操指南 |
| `/api/socratic/chat` | POST | 苏格拉底问答 |
| `/api/report` | POST | 学情可视化报告 |
| `/api/test-data` | GET | 测试数据（输入输出示例） |
| `/api/health` | GET | 健康检查 |

## 管理后台

- 数据概览（会话统计/Agent状态）
- 会话记录（查看/删除）
- Agent状态监控
- 系统信息
- 访客统计（PV/UV/趋势/设备分布）

## 安全措施

- Rate Limiting: 10次/分/IP（滑动窗口）
- 输入验证: Pydantic模型+字段长度限制
- XSS防护: 前端内容转义
- 管理员认证: Cookie + SHA256 token
- CORS配置: 白名单控制

## 知识库

5个领域知识文件：
- `python_basics.md` — Python编程基础
- `ai_basics.md` — AI基础概念
- `data_science.md` — 数据科学
- `web_dev.md` — Web开发
- `llm_engineering.md` — 大模型工程

所有知识点标注来源：[教材]/[论文]/[官方]/[实践]

## 本地开发

```bash
pip install fastapi uvicorn httpx pydantic
export ZHIPUAI_API_KEY=your_key
uvicorn app:app --host 0.0.0.0 --port 8000
```
