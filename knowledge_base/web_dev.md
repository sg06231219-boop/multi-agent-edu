# Web开发入门

## 前端基础

### HTML结构
```html
<!DOCTYPE html>
<html>
<head><title>页面标题</title></head>
<body>
  <h1>标题</h1>
  <p>段落</p>
  <div class="container">容器</div>
</body>
</html>
```

### CSS样式
```css
.container {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  gap: 20px;
}
```

### JavaScript
```javascript
// DOM操作
document.getElementById('btn').addEventListener('click', () => {
  alert('Hello!');
});

// 异步请求
fetch('/api/data')
  .then(res => res.json())
  .then(data => console.log(data));
```

## 后端开发

### Python Web框架
- **FastAPI**: 现代、快速、异步
- **Flask**: 轻量灵活
- **Django**: 全功能框架

### FastAPI示例
```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/api/hello")
async def hello():
    return {"message": "Hello, World!"}
```

### RESTful API设计
- GET: 获取资源
- POST: 创建资源
- PUT: 更新资源
- DELETE: 删除资源

## 数据库

### SQL基础
```sql
-- 创建表
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE
);

-- 查询
SELECT * FROM users WHERE name LIKE '%Python%';
```

### ORM（对象关系映射）
```python
# SQLAlchemy示例
from sqlalchemy import Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    name = Column(String(50))
```

## 部署
- **Render**: 免费Python托管
- **Vercel**: 前端+Serverless
- **Docker**: 容器化部署
- **Nginx**: 反向代理

## 常见安全注意事项
- 永远不要信任用户输入（SQL注入、XSS）
- 使用HTTPS
- 密码必须哈希存储
- API需要认证和限流
