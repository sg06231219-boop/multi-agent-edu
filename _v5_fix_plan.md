# Multi-Agent Edu v5.0 → v5.1 修复计划

## 审查日期：2026-06-10

## P0 致命问题（必须修复）

### 1. 辩论机制虚假
**问题**：reviewer.py 的 _fallback_review() 返回 hallucination_score=3（极低），导致 orchestrator 的 _debate_loop 在第1轮就 break 退出，永远没有2轮辩论。线上智谱API调用不稳定，大量走fallback。
**修复**：
- `_fallback_review()` 应返回 `hallucination_score=25-40`，让辩论至少2轮
- orchestrator `_debate_loop` 增加 `min_rounds=2` 参数，强制至少跑完2轮
- reviewer prompt 增加明确指令：第1轮不应直接pass，需发现至少1-2个问题

### 2. 前端Prompt与后端Prompt严重不一致
**问题**：前端 buildPrompts() 生成的 prompt 非常简化，且缺少关键上下文（如知识库内容、前序Agent结果等），导致LLM输出质量远低于后端调用。
**修复**：统一前后端prompt模板，前端直调时也传入完整上下文

### 3. SSE事件格式不匹配
**问题**：后端 run_streaming() yield 的事件格式为 `{type, agent, step, result}`，前端 handleSSEEvent() 期望 `{status, agent, step, result, stream_text}`。status 字段从未被后端设置。
**修复**：在 handleSSEEvent 中兼容后端格式，根据 type 字段推断 status

### 4. 测验批改-迭代闭环断裂
**问题**：用户答题后 gradeQuiz() 只更新 UI，不将 userAnswers 写入 agentResults.quiz，导致 iteration Agent 收到空的 user_answers，正确率永远是 0%。
**修复**：gradeQuiz() 完成后将 userAnswers 合并回 agentResults.quiz.user_answers

## P1 重要问题

### 5. 兜底数据太假
**问题**：fallback 函数返回的内容过于模板化，用户一眼看出是"假数据"
**修复**：增加 fallback 数据的丰富度和真实感，从知识库中提取真实内容片段

### 6. 雷达图维度硬编码
**问题**：renderRadarChart() 的6个维度值是从 level_score 简单加减得到，与实际诊断结果无关
**修复**：从 diagnosis.blind_spots 和 strengths 动态映射到6维

### 7. 移动端体验差
**问题**：sidebar 隐藏后无打开按钮（mobile-toggle 存在但缺 onclick），chat-fab 遮挡内容
**修复**：添加 mobile-toggle 按钮事件绑定，chat-fab 在小屏下缩小

### 8. md2html 转换脆弱
**问题**：正则替换可能破坏代码块内的 markdown 符号
**修复**：先提取代码块保护，再转换markdown，最后还原

## P2 改进项

### 9. 知识库搜索结果渲染无高亮
### 10. 进度条在SSE模式下不精确
### 11. 缺少键盘导航支持
### 12. 打字机效果在快速模式下卡顿

## 实施顺序

1. 修复 P0 #1-4（核心功能断裂）
2. 修复 P1 #5-8（体验提升）
3. 部署到 Render 验证
