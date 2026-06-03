# Web开发入门

> 来源标注：[官方]表示官方文档，[教材]表示经典教材，[实践]表示行业经验

## 前端基础

### HTML5结构 [官方-MDN Web Docs]
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>页面标题</title>
</head>
<body>
    <header>导航栏</header>
    <main>
        <section>内容区域</section>
    </main>
    <footer>页脚</footer>
</body>
</html>
```

### 语义化标签 [官方-MDN]
- `<header>/<nav>/<main>/<section>/<article>/<aside>/<footer>`：提升可访问性和SEO
- `<form>/<input>/<button>`：表单元素，配合label使用

### CSS3样式 [官方-MDN CSS Reference]
```css
/* Flexbox布局 */
.container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
}

/* Grid布局 */
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1rem;
}

/* 响应式设计 */
@media (max-width: 768px) {
    .container { flex-direction: column; }
}

/* CSS变量 */
:root {
    --primary: #0066cc;
    --bg: #ffffff;
}
.btn { background: var(--primary); }
```

### JavaScript ES6+ [官方-MDN/ECMAScript Spec]
```javascript
// 箭头函数
const greet = name => `Hello, ${name}!`;

// 解构赋值
const { name, age } = person;
const [first, ...rest] = array;

// async/await异步
async function fetchData(url) {
    const res = await fetch(url);
    const data = await res.json();
    return data;
}

// 模块化
export const API_URL = '/api';
export default class App { ... }
import App, { API_URL } from './app.js';
```

## 后端开发

### Python Web框架对比 [实践]
|框架|特点|适用场景|
|---|---|---|
|FastAPI|异步、自动文档、类型提示|API服务、微服务|
|Flask|轻量灵活、生态丰富|小型项目、原型|
|Django|全功能、ORM、Admin|内容管理、企业应用|

### FastAPI核心用法 [官方-FastAPI文档]
```python
from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel

app = FastAPI(title="My API", version="1.0.0")

class Item(BaseModel):
    name: str
    price: float
    description: str | None = None

@app.get("/items/{item_id}")
async def get_item(item_id: int):
    item = await db.get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item

@app.post("/items")
async def create_item(item: Item):
    return await db.create(item)

# 依赖注入
async def get_db():
    db = Database()
    try:
        yield db
    finally:
        await db.close()

@app.get("/items")
async def list_items(db: Database = Depends(get_db)):
    return await db.list_all()
```

### RESTful API设计原则 [实践-行业最佳实践]
- GET: 获取资源（幂等）
- POST: 创建资源
- PUT: 全量更新资源（幂等）
- PATCH: 部分更新
- DELETE: 删除资源（幂等）
- 状态码：200成功/201创建/400请求错误/401未认证/403禁止/404不存在/500服务器错误

### SSE (Server-Sent Events) [官方-MDN]
```python
# 后端 - FastAPI SSE
from fastapi.responses import StreamingResponse

@app.get("/api/stream")
async def stream():
    async def generate():
        for i in range(10):
            yield f"data: {json.dumps({'count': i})}\n\n"
            await asyncio.sleep(1)
    return StreamingResponse(generate(), media_type="text/event-stream")

# 前端 - 浏览器原生EventSource
const es = new EventSource('/api/stream');
es.onmessage = (e) => console.log(JSON.parse(e.data));
```

## 数据库

### SQL基础 [教材-《SQL必知必会》]
```sql
-- 创建表
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 查询
SELECT * FROM users WHERE name LIKE '%Python%' ORDER BY created_at DESC;

-- 聚合
SELECT department, COUNT(*), AVG(salary) 
FROM employees 
GROUP BY department 
HAVING COUNT(*) > 5;

-- JOIN
SELECT u.name, o.total FROM users u 
JOIN orders o ON u.id = o.user_id;
```

### ORM对比 [实践]
|ORM|语言|特点|
|---|---|---|
|SQLAlchemy|Python|功能强大，异步支持|
|Django ORM|Python|与Django深度集成|
|Prisma|TypeScript|类型安全，Schema-first|

## 部署 [实践]

### Render部署 [官方-Render文档]
- 免费Web Service：512MB内存，自动休眠
- render.yaml声明式配置
- healthCheckPath健康检查
- 环境变量管理

### Docker基础 [官方-Docker文档]
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Nginx反向代理 [官方-Nginx文档]
```nginx
server {
    listen 80;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }
    location /api/stream {
        proxy_pass http://127.0.0.1:8000;
        proxy_buffering off;  # SSE必须关闭缓冲
    }
}
```

## 安全注意事项 [实践-OWASP Top 10]

1. **永远不要信任用户输入**：防SQL注入(参数化查询)、防XSS(输出编码)、防CSRF(Token)
2. **使用HTTPS**：所有生产环境必须加密传输
3. **密码哈希存储**：使用bcrypt/argon2，不要用MD5/SHA1
4. **API认证和限流**：JWT/OAuth2 + Rate Limiting
5. **CORS配置**：不要用`allow_origins=["*"]`暴露所有源
6. **敏感信息保护**：环境变量管理密钥，不硬编码
