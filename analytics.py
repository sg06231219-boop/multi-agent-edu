"""职慧Agent 轻量访客统计"""
import json, time, threading
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict
from fastapi import APIRouter, Request, Query
from pydantic import BaseModel

router = APIRouter(prefix="/analytics", tags=["访问统计"])

ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)
ANALYTICS_FILE = DATA_DIR / "analytics.json"

_cache_lock = threading.Lock()
_cache = None
_cache_ts = 0

class PageView(BaseModel):
    path: str = ""
    title: str = ""
    referrer: str = ""
    duration: int = 0

class TrackReq(BaseModel):
    page: PageView = PageView()
    device: dict = {}
    event: str = "pageview"

def _load():
    global _cache, _cache_ts
    if _cache and time.time() - _cache_ts < 5:
        return _cache
    if ANALYTICS_FILE.exists():
        try:
            with open(ANALYTICS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except:
            data = _empty()
    else:
        data = _empty()
    _cache, _cache_ts = data, time.time()
    return data

def _save(data):
    global _cache, _cache_ts
    DATA_DIR.mkdir(exist_ok=True)
    with open(ANALYTICS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    _cache, _cache_ts = data, time.time()

def _empty():
    return {"daily": {}, "pages": {}, "devices": {}, "browsers": {}, "referrers": {}, "recent": []}

def _today():
    return datetime.now().strftime("%Y-%m-%d")

@router.post("/track")
async def track(request: Request, body: TrackReq):
    ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or (request.client.host if request.client else "unknown")
    ua = request.headers.get("user-agent", "")
    device = body.device.get("type") or ("mobile" if any(x in ua.lower() for x in ["mobile","android","iphone"]) else "desktop")
    browser = "Chrome" if "chrome" in ua.lower() else ("Edge" if "edg" in ua.lower() else ("Firefox" if "firefox" in ua.lower() else ("Safari" if "safari" in ua.lower() else "Other")))
    ref = body.page.referrer or ""
    if ref:
        try:
            from urllib.parse import urlparse
            ref = urlparse(ref).netloc or ref[:50]
        except:
            ref = ref[:50]
    today = _today()
    with _cache_lock:
        data = _load()
        d = data["daily"].setdefault(today, {"pv": 0, "uv_ips": [], "sessions": 0, "pages": {}})
        d["pv"] += 1
        if ip not in d.get("uv_ips", []):
            d.setdefault("uv_ips", []).append(ip)
        path = body.page.path or "/"
        if body.event == "pageview":
            d["sessions"] = d.get("sessions", 0) + 1
            d["pages"][path] = d["pages"].get(path, 0) + 1
            p = data["pages"].setdefault(path, {"pv": 0, "title": body.page.title or path, "last_visit": ""})
            p["pv"] += 1
            p["title"] = body.page.title or p.get("title", path)
            p["last_visit"] = datetime.now().strftime("%Y-%m-%d %H:%M")
        data["devices"][device] = data["devices"].get(device, 0) + 1
        data["browsers"][browser] = data["browsers"].get(browser, 0) + 1
        if ref:
            data["referrers"][ref] = data["referrers"].get(ref, 0) + 1
        data["recent"].append({"time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "path": path, "title": body.page.title or path, "device": device, "browser": browser, "referrer": ref, "ip": ip[-8:].rjust(8, '*'), "event": body.event})
        if len(data["recent"]) > 100:
            data["recent"] = data["recent"][-100:]
        # cleanup >90 days
        cutoff = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")
        for k in [k for k in data["daily"] if k < cutoff]:
            del data["daily"][k]
        _save(data)
    return {"ok": True}

@router.get("/dashboard")
async def dashboard(days: int = Query(7, ge=1, le=90)):
    data = _load()
    today = _today()
    total_pv = total_uv = total_sessions = 0
    daily_trend = []
    for i in range(days - 1, -1, -1):
        d = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
        dd = data.get("daily", {}).get(d, {})
        pv = dd.get("pv", 0); uv = len(dd.get("uv_ips", [])); ss = dd.get("sessions", 0)
        total_pv += pv; total_uv += uv; total_sessions += ss
        daily_trend.append({"date": d, "pv": pv, "uv": uv, "sessions": ss})
    td = data.get("daily", {}).get(today, {})
    pages_sorted = sorted(data.get("pages", {}).items(), key=lambda x: x[1].get("pv", 0), reverse=True)[:10]
    return {"today": {"pv": td.get("pv", 0), "uv": len(td.get("uv_ips", [])), "sessions": td.get("sessions", 0)}, "total_pv": total_pv, "total_uv": total_uv, "total_sessions": total_sessions, "daily_trend": daily_trend, "top_pages": [{"path": p, "pv": v.get("pv", 0), "title": v.get("title", p)} for p, v in pages_sorted], "devices": data.get("devices", {}), "browsers": data.get("browsers", {}), "referrers": data.get("referrers", {}), "recent": data.get("recent", [])[-20:]}

@router.get("/realtime")
async def realtime():
    data = _load()
    now = datetime.now()
    cutoff = (now - timedelta(minutes=5)).strftime("%Y-%m-%d %H:%M")
    active = [r for r in data.get("recent", []) if r.get("time", "") >= cutoff]
    return {"online_users": len(set(r.get("ip", "") for r in active)), "recent_actions": len(active), "last_5min": active[-10:]}
