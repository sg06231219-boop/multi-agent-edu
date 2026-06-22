"""Push v6.2.0 to GitHub - multi-agent-edu Prompt全面重写"""
import json, base64, subprocess, urllib.request, urllib.error, os

REPO = "SG06231219-boop/multi-agent-edu"
BRANCH = "main"
COMMIT_MSG = "v6.2.0: 7-Agent Prompt全面重写→角色人格化+反模板+对抗性指令+温度优化"

ROOT = r"C:\Users\LYS\.qclaw\workspace\multi-agent-edu"
FILES = [
    "app.py", "agents/diagnosis.py", "agents/knowledge_gen.py",
    "agents/reviewer.py", "agents/practice_guide.py",
    "agents/quiz.py", "agents/iteration.py", "agents/socratic.py",
    "static/js/app.js", "static/index.html",
]

def get_token():
    r = subprocess.run(['git', 'credential', 'fill'],
        input=b'protocol=https\nhost=github.com\n',
        capture_output=True)
    for l in r.stdout.decode().strip().split('\n'):
        if l.startswith('password='): return l.split('=',1)[1]
    raise RuntimeError("No GitHub credential found")

token = get_token()
headers = {
    "Authorization": f"token {token}",
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "Push-v62",
}

def push_file(path, content):
    api = f"https://api.github.com/repos/{REPO}/contents/{path}"
    # Get current SHA
    try:
        req = urllib.request.Request(f"{api}?ref={BRANCH}", headers=headers)
        with urllib.request.urlopen(req, timeout=15) as r:
            sha = json.loads(r.read()).get("sha", "")
    except urllib.error.HTTPError as e:
        if e.code == 404: sha = ""
        else: raise
    body = json.dumps({
        "message": COMMIT_MSG,
        "content": base64.b64encode(content.encode('utf-8')).decode(),
        "branch": BRANCH,
        "sha": sha,
    }).encode()
    req = urllib.request.Request(api, data=body, headers=headers,
        method="PUT")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

for f in FILES:
    fpath = os.path.join(ROOT, f)
    content = open(fpath, 'r', encoding='utf-8').read()
    result = push_file(f, content)
    print(f"  OK {f} ({len(content)}b)")

print(f"\nDone! {len(FILES)} files pushed to {REPO}")
print("Render should auto-deploy.")
