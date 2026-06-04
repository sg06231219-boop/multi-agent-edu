import sys, os, json
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, '.')
from evaluate_v2 import evaluate_knowledge_coverage

result = evaluate_knowledge_coverage()
print("Overall:", result["result"], "(target:", result["target"], ")", "PASS" if result["pass"] else "FAIL")
for fname, d in result["details"].items():
    status = "PASS" if d["rate"] >= 90 else "WARN" if d["rate"] >= 75 else "FAIL"
    missing = ", ".join(d.get("missing_list", [])[:8])
    print(f"  [{status}] {fname}: {d['covered']}/{d['total']} = {d['rate']}%  missing: {missing}")
