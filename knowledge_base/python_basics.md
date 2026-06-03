# Python编程基础

> 来源标注说明：[教材] 表示来自经典教材，[官方] 表示来自Python官方文档，[论文] 表示来自学术论文，[实践] 表示来自行业实践总结

## 变量与数据类型

Python是一种动态类型语言，变量不需要声明类型。Python 3.x中所有类型都是对象，包括基本类型。

### 基本数据类型 [官方-Python Docs]
- **int**: 整数，如 `x = 42`。Python 3的int没有溢出限制，可以表示任意大的整数
- **float**: 浮点数，如 `pi = 3.14`。遵循IEEE 754双精度标准
- **str**: 字符串，如 `name = "Python"`。Python 3默认Unicode编码
- **bool**: 布尔值，`True` 或 `False`，是int的子类（True=1, False=0）
- **list**: 列表，如 `nums = [1, 2, 3]`。有序可变序列
- **dict**: 字典，如 `person = {"name": "Alice", "age": 25}`。键值对映射
- **tuple**: 元组，如 `point = (1, 2)`。有序不可变序列
- **set**: 集合，如 `unique = {1, 2, 3}`。无序不重复元素集

### 类型转换 [教材-《Python编程：从入门到实践》]
```python
x = int("42")      # str → int
y = float("3.14")  # str → float
z = str(42)        # int → str
lst = list((1,2,3))  # tuple → list
```

### 类型判断 [官方-Python Docs]
```python
type(42)           # <class 'int'>
isinstance(42, int)  # True
isinstance(True, int)  # True (bool是int子类)
```

## 控制流

### 条件语句 [教材-《流畅的Python》]
```python
if score >= 90:
    grade = "A"
elif score >= 80:
    grade = "B"
elif score >= 70:
    grade = "C"
else:
    grade = "D"

# 三元表达式
result = "通过" if score >= 60 else "不通过"

# match-case (Python 3.10+)
match command:
    case "start":
        start_engine()
    case "stop":
        stop_engine()
    case _:
        unknown_command()
```

### 循环 [官方-Python Docs]
```python
# for循环
for i in range(5):
    print(i)

# while循环
count = 0
while count < 5:
    count += 1

# 列表推导式
squares = [x**2 for x in range(10)]
evens = [x for x in range(20) if x % 2 == 0]

# 字典推导式
word_len = {w: len(w) for w in ["hello", "world"]}

# enumerate同时获取索引和值
for i, item in enumerate(items):
    print(f"{i}: {item}")
```

### break/continue/else [教材-《Python学习手册》]
```python
# for-else: 循环正常结束（未break）时执行else
for n in range(2, 10):
    for x in range(2, n):
        if n % x == 0:
            break
    else:
        print(f"{n}是质数")
```

## 函数

### 定义函数 [官方-Python Docs]
```python
def greet(name, greeting="Hello"):
    return f"{greeting}, {name}!"

# 位置参数 + 关键字参数 + 可变参数
def func(a, b, *args, key="default", **kwargs):
    pass

# 仅关键字参数 (Python 3)
def func2(a, *, key):  # key必须用关键字传递
    pass

# 调用
greet("World")           # "Hello, World!"
greet("Python", "Hi")    # "Hi, Python!"
greet(name="AI", greeting="Hey")  # 关键字调用
```

### Lambda函数 [教材-《流畅的Python》]
```python
square = lambda x: x ** 2
sorted_items = sorted(items, key=lambda x: x[1])

# 注意：lambda不应过度使用，复杂逻辑请用def
```

### 装饰器 [教材-《流畅的Python》]
```python
import functools

def timer(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        import time
        start = time.time()
        result = func(*args, **kwargs)
        elapsed = time.time() - start
        print(f"{func.__name__} took {elapsed:.2f}s")
        return result
    return wrapper

@timer
def slow_function():
    import time
    time.sleep(1)

slow_function()  # 输出: slow_function took 1.00s
```

### 生成器 [官方-Python Docs]
```python
def fibonacci(n):
    a, b = 0, 1
    for _ in range(n):
        yield a
        a, b = b, a + b

for num in fibonacci(10):
    print(num)

# 生成器表达式
total = sum(x**2 for x in range(1000))
```

## 面向对象编程

### 类的定义 [教材-《Python编程：从入门到实践》]
```python
class Animal:
    species_count = 0  # 类变量
    
    def __init__(self, name, sound):
        self.name = name        # 实例变量
        self.sound = sound
        Animal.species_count += 1
    
    def speak(self):
        return f"{self.name} says {self.sound}!"
    
    def __repr__(self):
        return f"Animal('{self.name}', '{self.sound}')"
    
    def __str__(self):
        return self.speak()

# 继承
class Dog(Animal):
    def __init__(self, name, breed="混血"):
        super().__init__(name, "Woof")
        self.breed = breed
    
    def fetch(self, item):
        return f"{self.name} fetches the {item}!"

dog = Dog("Buddy", "Golden")
print(dog.speak())  # Buddy says Woof!
print(dog.fetch("ball"))  # Buddy fetches the ball!
```

### 数据类 (Python 3.7+) [官方-Python Docs]
```python
from dataclasses import dataclass, field

@dataclass
class Student:
    name: str
    age: int
    grades: list = field(default_factory=list)
    
    @property
    def gpa(self):
        return sum(self.grades) / len(self.grades) if self.grades else 0

s = Student("Alice", 20, [90, 85, 92])
print(s.gpa)  # 89.0
```

### 抽象基类 [教材-《流畅的Python》]
```python
from abc import ABC, abstractmethod

class Shape(ABC):
    @abstractmethod
    def area(self):
        pass
    
    @abstractmethod
    def perimeter(self):
        pass

class Circle(Shape):
    def __init__(self, radius):
        self.radius = radius
    
    def area(self):
        return 3.14159 * self.radius ** 2
    
    def perimeter(self):
        return 2 * 3.14159 * self.radius
```

## 常用标准库 [官方-Python Docs]

### os - 操作系统接口
```python
import os
os.getcwd()           # 当前目录
os.listdir('.')       # 列出目录内容
os.path.join('a', 'b')  # 跨平台路径拼接
os.environ.get('HOME')  # 环境变量
```

### json - JSON数据处理
```python
import json
data = json.loads('{"key": "value"}')     # 解析JSON字符串
text = json.dumps(data, ensure_ascii=False)  # 序列化为JSON
```

### collections - 高级数据结构
```python
from collections import Counter, defaultdict, namedtuple
Counter([1,2,2,3,3,3])  # Counter({3: 3, 2: 2, 1: 1})
d = defaultdict(list)    # 自动初始化缺失键为空列表
Point = namedtuple('Point', ['x', 'y'])
```

### pathlib - 路径操作 (Python 3.4+)
```python
from pathlib import Path
p = Path('data') / 'file.txt'
p.exists()
p.read_text(encoding='utf-8')
```

## 错误处理 [教材-《Python学习手册》]

```python
try:
    result = 10 / 0
except ZeroDivisionError as e:
    print(f"Error: {e}")
except (TypeError, ValueError) as e:
    print(f"Type/Value Error: {e}")
except Exception as e:
    print(f"Unexpected: {e}")
    raise
finally:
    print("Cleanup (always runs)")

# 自定义异常
class InsufficientFundsError(Exception):
    def __init__(self, balance, amount):
        self.balance = balance
        self.amount = amount
        super().__init__(f"余额{balance}不足，需要{amount}")

# 上下文管理器
class DatabaseConnection:
    def __enter__(self):
        self.conn = create_connection()
        return self.conn
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.conn.close()
```

## 文件操作 [官方-Python Docs]

```python
# 读取文件
with open("data.txt", "r", encoding="utf-8") as f:
    content = f.read()
    # 或逐行: for line in f:

# 写入文件
with open("output.txt", "w", encoding="utf-8") as f:
    f.write("Hello, Python!")

# CSV文件
import csv
with open("data.csv", "r") as f:
    reader = csv.DictReader(f)
    for row in reader:
        print(row["name"])
```

## 异步编程 [官方-Python Docs asyncio]

```python
import asyncio

async def fetch_data(url):
    await asyncio.sleep(1)  # 模拟IO操作
    return f"Data from {url}"

async def main():
    # 并发执行多个任务
    results = await asyncio.gather(
        fetch_data("url1"),
        fetch_data("url2"),
        fetch_data("url3"),
    )
    return results

asyncio.run(main())
```

## 类型提示 (Python 3.5+) [官方-PEP 484]

```python
from typing import List, Dict, Optional, Union

def process_data(
    items: List[str],
    config: Dict[str, int],
    timeout: Optional[float] = None,
) -> Union[str, int]:
    """处理数据并返回结果"""
    if timeout is None:
        timeout = 30.0
    return len(items)
```
