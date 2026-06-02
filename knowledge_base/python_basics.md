# Python编程基础

## 变量与数据类型
Python是一种动态类型语言，变量不需要声明类型。

### 基本数据类型
- **int**: 整数，如 `x = 42`
- **float**: 浮点数，如 `pi = 3.14`
- **str**: 字符串，如 `name = "Python"`
- **bool**: 布尔值，`True` 或 `False`
- **list**: 列表，如 `nums = [1, 2, 3]`
- **dict**: 字典，如 `person = {"name": "Alice", "age": 25}`
- **tuple**: 元组，如 `point = (1, 2)`
- **set**: 集合，如 `unique = {1, 2, 3}`

### 类型转换
```python
x = int("42")      # str → int
y = float("3.14")  # str → float
z = str(42)        # int → str
```

## 控制流

### 条件语句
```python
if score >= 90:
    grade = "A"
elif score >= 80:
    grade = "B"
else:
    grade = "C"
```

### 循环
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
```

## 函数

### 定义函数
```python
def greet(name, greeting="Hello"):
    return f"{greeting}, {name}!"

# 调用
greet("World")           # "Hello, World!"
greet("Python", "Hi")    # "Hi, Python!"
```

### Lambda函数
```python
square = lambda x: x ** 2
```

## 面向对象编程

### 类的定义
```python
class Animal:
    def __init__(self, name, sound):
        self.name = name
        self.sound = sound
    
    def speak(self):
        return f"{self.name} says {self.sound}!"

# 继承
class Dog(Animal):
    def __init__(self, name):
        super().__init__(name, "Woof")

dog = Dog("Buddy")
print(dog.speak())  # Buddy says Woof!
```

## 常用标准库
- **os**: 操作系统接口
- **json**: JSON数据处理
- **requests**: HTTP请求（第三方库）
- **datetime**: 日期时间处理
- **collections**: 高级数据结构

## 错误处理
```python
try:
    result = 10 / 0
except ZeroDivisionError as e:
    print(f"Error: {e}")
finally:
    print("Cleanup")
```

## 文件操作
```python
# 读取文件
with open("data.txt", "r") as f:
    content = f.read()

# 写入文件
with open("output.txt", "w") as f:
    f.write("Hello, Python!")
```
