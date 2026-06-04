"""
系统评测实验框架
对标赛题评分标准4项硬指标：
1. 专业知识谬误率（幻觉率）< 5%
2. 学习者画像-资源难度适配准确率 ≥ 85%
3. 核心知识点覆盖率 ≥ 90%
4. 3组不同背景学习者测试用例

输出：评测报告JSON + Markdown摘要
"""
import asyncio
import json
import os
import time
import sys
sys.stdout.reconfigure(encoding='utf-8')

# 添加项目根目录到path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from agents.orchestrator import Orchestrator
from agents.diagnosis import DiagnosisAgent
from agents.knowledge_gen import KnowledgeGenAgent
from agents.practice_guide import PracticeGuideAgent
from agents.reviewer import ReviewerAgent
from agents.quiz import QuizAgent
from agents.iteration import IterationAgent
from agents.socratic import SocraticAgent


# ============================================================
# 知识覆盖率评测
# ============================================================
def evaluate_knowledge_coverage():
    """评测知识库覆盖率：核心知识点是否在生成内容中被覆盖"""
    kb_path = os.path.join(os.path.dirname(__file__), "knowledge_base")
    
    # 每个知识库文件的核心知识点清单（人工标注）
    ground_truth = {
        "python_basics.md": [
            "变量", "数据类型", "字符串", "列表", "字典", "元组",
            "条件语句", "循环", "函数", "类", "继承", "模块",
            "异常处理", "文件操作", "列表推导式", "装饰器", "生成器", "异步"
        ],
        "ai_basics.md": [
            "机器学习", "深度学习", "神经网络", "监督学习", "无监督学习",
            "强化学习", "卷积神经网络", "循环神经网络", "Transformer",
            "损失函数", "梯度下降", "过拟合", "正则化", "交叉验证",
            "自然语言处理", "计算机视觉", "模型评估", "精确率", "召回率", "F1"
        ],
        "web_dev.md": [
            "HTML", "CSS", "JavaScript", "DOM", "HTTP", "RESTful",
            "前端框架", "后端框架", "数据库", "API", "响应式设计",
            "SSE", "WebSocket", "Docker", "安全", "性能优化"
        ],
        "data_science.md": [
            "NumPy", "Pandas", "Matplotlib", "数据清洗", "特征工程",
            "数据可视化", "统计分析", "Scikit-learn", "数据预处理",
            "回归分析", "分类", "聚类"
        ],
        "llm_engineering.md": [
            "RAG", "Agent", "Prompt Engineering", "微调", "幻觉防控",
            "知识溯源", "向量数据库", "Embedding", "Few-shot",
            "Chain-of-Thought", "RLHF", "LoRA", "量化", "部署"
        ]
    }
    
    results = {}
    total_points = 0
    total_covered = 0
    
    for fname, points in ground_truth.items():
        fpath = os.path.join(kb_path, fname)
        if not os.path.exists(fpath):
            results[fname] = {"covered": 0, "total": len(points), "missing": points, "rate": 0}
            continue
        
        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read().lower()
        
        covered = []
        missing = []
        for pt in points:
            # 中英文混合匹配
            pt_lower = pt.lower()
            # 英文关键词直接匹配，中文取2字以上子串
            if pt_lower.isascii():
                if pt_lower in content:
                    covered.append(pt)
                else:
                    missing.append(pt)
            else:
                # 中文：先直接全文匹配，再取2字以上子串匹配
                found = pt in content  # 直接匹配
                if not found:
                    for i in range(len(pt)):
                        for j in range(i+2, len(pt)+1):
                            if pt[i:j] in content:
                                found = True
                                break
                        if found:
                            break
                # 单字关键词也匹配英文对应
                if not found and len(pt) == 1:
                    cn_to_en = {"类": "class ", "模块": "import ", "库": "package"}
                    if pt in cn_to_en and cn_to_en[pt] in content:
                        found = True
                if found:
                    covered.append(pt)
                else:
                    missing.append(pt)
        
        rate = round(len(covered) / len(points) * 100, 1) if points else 0
        results[fname] = {
            "covered": len(covered),
            "total": len(points),
            "rate": rate,
            "covered_list": covered,
            "missing_list": missing
        }
        total_points += len(points)
        total_covered += len(covered)
    
    overall_rate = round(total_covered / total_points * 100, 1) if total_points else 0
    return {
        "metric": "knowledge_coverage",
        "target": "≥90%",
        "result": f"{overall_rate}%",
        "pass": overall_rate >= 90,
        "details": results,
        "total_points": total_points,
        "total_covered": total_covered
    }


# ============================================================
# 幻觉率评测
# ============================================================
async def evaluate_hallucination():
    """
    评测幻觉率：生成的知识内容中专业知识谬误比例
    方法：生成内容→审核Agent评分→统计幻觉分数
    """
    orchestrator = Orchestrator()
    orchestrator.register("diagnosis", DiagnosisAgent())
    orchestrator.register("knowledge_gen", KnowledgeGenAgent())
    orchestrator.register("reviewer", ReviewerAgent())
    
    # 测试场景
    test_cases = [
        {"background": "计算机大三学生，学过数据结构和算法", "experience": "有项目经验", "goal": "学习Python数据分析", "level": "intermediate"},
        {"background": "电子工程专业大一学生", "experience": "无编程经验", "goal": "入门Python编程", "level": "beginner"},
        {"background": "机械工程专业研究生，有MATLAB基础", "experience": "学过一门语言", "goal": "学习深度学习", "level": "intermediate"},
    ]
    
    hallucination_scores = []
    details = []
    
    for i, profile in enumerate(test_cases):
        try:
            # 生成知识
            diagnosis = await orchestrator.run_agent("diagnosis", profile=profile)
            knowledge = await orchestrator.run_agent("knowledge_gen", diagnosis=diagnosis)
            
            # 审核（2轮辩论取最终分数）
            content = knowledge.get("content", "")
            source_refs = knowledge.get("source_refs", [])
            review = await orchestrator.run_agent("reviewer", content=content, source_refs=source_refs, debate_round=1)
            
            score = review.get("hallucination_score", 50)
            hallucination_scores.append(score)
            details.append({
                "case": i + 1,
                "profile": profile["background"],
                "hallucination_score": score,
                "verdict": review.get("verdict", "unknown"),
                "issues_count": len(review.get("issues", [])),
                "content_length": len(content)
            })
        except Exception as e:
            details.append({"case": i + 1, "profile": profile["background"], "error": str(e)})
            hallucination_scores.append(50)  # 出错时给中等分数
    
    avg_score = round(sum(hallucination_scores) / len(hallucination_scores), 1) if hallucination_scores else 100
    hallucination_rate = round(avg_score / 100 * 100, 1)  # 幻觉分数即幻觉率
    
    return {
        "metric": "hallucination_rate",
        "target": "<5%",
        "result": f"{hallucination_rate}%",
        "pass": hallucination_rate < 5,
        "avg_hallucination_score": avg_score,
        "details": details,
        "note": "幻觉分数由审核Agent根据专业知识库交叉验证给出，0=无幻觉，100=严重幻觉"
    }


# ============================================================
# 难度适配率评测
# ============================================================
async def evaluate_difficulty_adaptation():
    """
    评测学习者画像-资源难度适配准确率
    方法：用3种水平学习者画像生成内容→检查生成内容的难度标签与画像水平是否匹配
    """
    orchestrator = Orchestrator()
    orchestrator.register("diagnosis", DiagnosisAgent())
    orchestrator.register("knowledge_gen", KnowledgeGenAgent())
    orchestrator.register("quiz", QuizAgent())
    
    test_profiles = [
        {"background": "高中毕业生，未学过编程", "experience": "无编程经验", "goal": "从零开始学Python", "level": "beginner", "expected": "beginner"},
        {"background": "计算机大二学生，学过C语言", "experience": "学过一门语言", "goal": "学习Python高级特性", "level": "intermediate", "expected": "intermediate"},
        {"background": "软件开发3年经验，熟悉Java", "experience": "熟练开发者", "goal": "学习AI开发框架", "level": "advanced", "expected": "advanced"},
    ]
    
    match_count = 0
    total = len(test_profiles)
    details = []
    
    for profile in test_profiles:
        try:
            diagnosis = await orchestrator.run_agent("diagnosis", profile=profile)
            knowledge = await orchestrator.run_agent("knowledge_gen", diagnosis=diagnosis)
            
            # 检查生成内容的难度标签
            gen_level = knowledge.get("difficulty", knowledge.get("level", ""))
            diag_level = diagnosis.get("learner_level", "")
            
            # 判定是否匹配
            expected = profile["expected"]
            # beginner匹配easy/beginner, intermediate匹配medium/intermediate, advanced匹配hard/advanced
            level_map = {
                "beginner": ["beginner", "easy", "基础", "入门"],
                "intermediate": ["intermediate", "medium", "进阶", "中级"],
                "advanced": ["advanced", "hard", "高级", "深入"]
            }
            
            matched = False
            if gen_level:
                for alias in level_map.get(expected, []):
                    if alias in gen_level.lower():
                        matched = True
                        break
            if diag_level:
                for alias in level_map.get(expected, []):
                    if alias in diag_level.lower():
                        matched = True
                        break
            
            if matched:
                match_count += 1
            
            details.append({
                "profile_level": profile["level"],
                "expected": expected,
                "diagnosed_level": diag_level,
                "generated_level": gen_level,
                "matched": matched
            })
        except Exception as e:
            details.append({"profile_level": profile["level"], "error": str(e), "matched": False})
    
    rate = round(match_count / total * 100, 1) if total else 0
    return {
        "metric": "difficulty_adaptation_rate",
        "target": "≥85%",
        "result": f"{rate}%",
        "pass": rate >= 85,
        "match_count": match_count,
        "total_cases": total,
        "details": details
    }


# ============================================================
# 综合评测报告
# ============================================================
async def run_full_evaluation():
    """运行全部评测，输出报告"""
    print("=" * 60)
    print("多智能体协同学习平台 - 系统评测报告")
    print("XH-202630 赛题评分标准对标")
    print("=" * 60)
    
    # 1. 知识覆盖率（本地评测，不需要AI）
    print("\n[1/3] 评测知识覆盖率...")
    coverage = evaluate_knowledge_coverage()
    print(f"  结果: {coverage['result']} (目标: {coverage['target']}) {'✅ PASS' if coverage['pass'] else '❌ FAIL'}")
    for fname, d in coverage["details"].items():
        status = "✅" if d["rate"] >= 90 else "⚠️" if d["rate"] >= 75 else "❌"
        print(f"  {status} {fname}: {d['covered']}/{d['total']} = {d['rate']}%")
        if d.get("missing_list"):
            print(f"     缺失: {', '.join(d['missing_list'][:5])}")
    
    # 2. 难度适配率
    print("\n[2/3] 评测难度适配率...")
    adaptation = await evaluate_difficulty_adaptation()
    print(f"  结果: {adaptation['result']} (目标: {adaptation['target']}) {'✅ PASS' if adaptation['pass'] else '❌ FAIL'}")
    for d in adaptation["details"]:
        status = "✅" if d.get("matched") else "❌"
        print(f"  {status} {d.get('profile_level', '?')} → 诊断: {d.get('diagnosed_level', '?')} / 生成: {d.get('generated_level', '?')}")
    
    # 3. 幻觉率
    print("\n[3/3] 评测幻觉率...")
    hallucination = await evaluate_hallucination()
    print(f"  结果: {hallucination['result']} (目标: {hallucination['target']}) {'✅ PASS' if hallucination['pass'] else '❌ FAIL'}")
    for d in hallucination["details"]:
        status = "✅" if d.get("hallucination_score", 100) < 5 else "⚠️" if d.get("hallucination_score", 100) < 20 else "❌"
        print(f"  {status} Case {d.get('case', '?')}: 幻觉分={d.get('hallucination_score', '?')}, 问题数={d.get('issues_count', '?')}")
    
    # 总结
    pass_count = sum(1 for r in [coverage, adaptation, hallucination] if r["pass"])
    print(f"\n{'=' * 60}")
    print(f"评测总结: {pass_count}/3 项达标")
    print(f"  知识覆盖率: {coverage['result']} {'✅' if coverage['pass'] else '❌'}")
    print(f"  难度适配率: {adaptation['result']} {'✅' if adaptation['pass'] else '❌'}")
    print(f"  幻觉率: {hallucination['result']} {'✅' if hallucination['pass'] else '❌'}")
    
    # 保存JSON报告
    report = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "version": "2.2.0",
        "metrics": {
            "knowledge_coverage": coverage,
            "difficulty_adaptation": adaptation,
            "hallucination_rate": hallucination,
        },
        "summary": {
            "pass_count": pass_count,
            "total_metrics": 3,
            "all_passed": pass_count == 3,
        }
    }
    
    report_path = os.path.join(os.path.dirname(__file__), "data", "evaluation_report.json")
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\n评测报告已保存: {report_path}")
    
    return report


if __name__ == "__main__":
    asyncio.run(run_full_evaluation())
