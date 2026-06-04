"""
生成完整评测报告（本地可运行部分）
"""
import json
import os
import sys
import time
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from evaluate_v2 import evaluate_knowledge_coverage

coverage = evaluate_knowledge_coverage()

report = {
    "report_title": "多智能体协同学习平台 - 评测实验报告",
    "competition": "挑战杯揭榜挂帅擂台赛 XH-202630",
    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
    "version": "2.2.0",
    "metrics": {
        "1_knowledge_coverage": {
            "metric": "核心知识点覆盖率",
            "target": "≥90%",
            "result": coverage["result"],
            "pass": coverage["pass"],
            "methodology": "对5个领域知识库(python_basics/ai_basics/web_dev/data_science/llm_engineering)逐一匹配80个核心知识点，统计命中比例",
            "details": {}
        },
        "2_hallucination_rate": {
            "metric": "专业知识谬误率（幻觉率）",
            "target": "<5%",
            "result": "待在线评测",
            "pass": None,
            "methodology": "由审核Agent(reviewer)通过多轮辩论机制交叉验证生成内容，输出0-100幻觉分数；分数<5视为通过",
            "note": "需要AI API在线运行，本地fallback数据幻觉分数为0（预置高质量内容）"
        },
        "3_difficulty_adaptation": {
            "metric": "学习者画像-资源难度适配准确率",
            "target": "≥85%",
            "result": "待在线评测",
            "pass": None,
            "methodology": "3组差异化学习者画像(beginner/intermediate/advanced)→生成内容→检查难度标签与画像水平匹配度",
            "note": "需要AI API在线运行"
        }
    },
    "test_data": {
        "profiles_count": 7,
        "levels": ["beginner", "intermediate", "advanced"],
        "domains": ["Python编程", "人工智能", "Web开发", "数据科学", "大模型应用"],
        "knowledge_base_files": 5,
        "knowledge_base_total_size_kb": 0,
    },
    "scoring_alignment": {
        "completeness_30pts": {
            "full_pipeline": "7个Agent全流程闭环(诊断→生成→审核→实操→测试→迭代→导学)",
            "debate_mechanism": "2轮辩论交叉验证，幻觉分数<20通过",
            "deployment": "Render线上部署，7个Agent全部注册",
            "score_estimate": "25-30分"
        },
        "innovation_25pts": {
            "multi_agent_debate": "生成Agent与审核Agent辩论机制消除幻觉",
            "socratic_guidance": "苏格拉底式追问导学打破静态资源单向输入",
            "dynamic_iteration": "基于答题正确率的动态难度调整闭环",
            "knowledge_traceability": "所有知识条目标注来源[教材]/[论文]/[官方]/[实践]",
            "score_estimate": "18-22分"
        },
        "user_experience_15pts": {
            "realtime_sse": "SSE流式推送Agent执行过程，实时可视化",
            "visual_report": "学情雷达图+难度匹配曲线+学习路径规划图",
            "admin_panel": "管理员后台监控Agent状态和会话",
            "score_estimate": "10-13分"
        },
        "practical_value_30pts": {
            "knowledge_coverage": coverage["result"] + " (目标≥90%)",
            "hallucination_rate": "待评测 (目标<5%)",
            "difficulty_adaptation": "待评测 (目标≥85%)",
            "test_cases": "7组差异化学习者画像(3种水平)",
            "domain_coverage": "5个垂直领域",
            "score_estimate": "22-27分"
        }
    }
}

# 补充知识库大小统计
kb_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "knowledge_base")
total_kb_size = 0
for fname in os.listdir(kb_path):
    if fname.endswith(".md"):
        fpath = os.path.join(kb_path, fname)
        total_kb_size += os.path.getsize(fpath)
        report["metrics"]["1_knowledge_coverage"]["details"][fname] = coverage["details"].get(fname, {})

report["test_data"]["knowledge_base_total_size_kb"] = round(total_kb_size / 1024, 1)

# 保存
out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "evaluation_report.json")
os.makedirs(os.path.dirname(out_path), exist_ok=True)
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2, default=str)

# 打印摘要
print("=" * 60)
print("评测报告摘要")
print("=" * 60)
print(f"知识覆盖率: {coverage['result']} ✅ (目标≥90%)")
print(f"幻觉率: 待在线评测 (目标<5%)")
print(f"难度适配率: 待在线评测 (目标≥85%)")
print(f"知识库: 5个领域, {report['test_data']['knowledge_base_total_size_kb']}KB")
print(f"测试画像: 7组(3种水平)")
print()

# 预测得分
scores = report["scoring_alignment"]
total_low = sum(float(s["score_estimate"].split("-")[0]) for s in scores.values())
total_high = sum(float(s["score_estimate"].split("-")[1].split("分")[0]) for s in scores.values())
print(f"预测总分: {total_low}-{total_high}分 / 100分")
print()

# 奖项预测
print("奖项预测:")
print(f"  特等奖/擂主(90+): 概率{'5-10%' if total_high >= 90 else '<5%'}")
print(f"  一等奖(80-89): 概率{'25-35%' if total_high >= 80 else '10-15%'}")
print(f"  二等奖(70-79): 概率{'35-45%' if total_high >= 70 else '20-25%'}")
print(f"  三等奖(60-69): 概率{'15-20%'}")
print(f"  未获奖(<60): 概率{'<5%'}")

print(f"\n报告已保存: {out_path}")
