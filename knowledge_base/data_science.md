# 数据科学基础

> 来源标注：[官方]表示官方文档，[教材]表示经典教材，[实践]表示行业经验

## NumPy数值计算 [官方-NumPy文档]

### 核心数据结构
```python
import numpy as np

# 创建数组
a = np.array([1, 2, 3])           # 1维
b = np.array([[1,2],[3,4]])        # 2维
c = np.zeros((3, 4))               # 全零
d = np.ones((2, 3))                # 全一
e = np.arange(0, 10, 2)           # [0,2,4,6,8]
f = np.linspace(0, 1, 5)          # [0, 0.25, 0.5, 0.75, 1.0]

# 属性
a.shape      # (3,)
b.ndim       # 2
b.dtype      # int64
b.size       # 4
```

### 向量化运算 [教材-《Python数据科学手册》]
```python
# 逐元素运算（比Python循环快100倍+）
a = np.array([1, 2, 3, 4])
a * 2           # [2, 4, 6, 8]
a + 10          # [11, 12, 13, 14]
a ** 2          # [1, 4, 9, 16]
np.sqrt(a)      # [1., 1.414, 1.732, 2.]

# 矩阵运算
A = np.array([[1,2],[3,4]])
B = np.array([[5,6],[7,8]])
A @ B           # 矩阵乘法
A.T             # 转置
np.linalg.inv(A)  # 逆矩阵

# 广播机制 [官方-NumPy Broadcasting Rules]
a = np.array([[1],[2],[3]])  # shape (3,1)
b = np.array([10, 20, 30])  # shape (3,)
a + b  # shape (3,3) 自动广播
```

### 索引与切片 [官方-NumPy文档]
```python
arr = np.arange(12).reshape(3, 4)
arr[0, :]       # 第0行
arr[:, 1]       # 第1列
arr[0:2, 1:3]   # 子矩阵
arr[arr > 5]    # 布尔索引
```

## Pandas数据处理 [官方-Pandas文档]

### 数据结构
```python
import pandas as pd

# Series
s = pd.Series([10, 20, 30], index=['a', 'b', 'c'])

# DataFrame
df = pd.DataFrame({
    'name': ['Alice', 'Bob', 'Charlie'],
    'age': [25, 30, 35],
    'score': [90, 85, 92]
})
```

### 数据清洗 [教材-《Python for Data Analysis》]
```python
# 缺失值处理
df.isnull().sum()              # 统计缺失
df.fillna(0)                   # 填充
df.dropna()                    # 删除

# 数据类型转换
df['age'] = df['age'].astype(float)

# 重复值
df.duplicated().sum()
df.drop_duplicates()
```

### 分组聚合 [官方-Pandas GroupBy]
```python
# 分组统计
df.groupby('department').agg({
    'salary': ['mean', 'median', 'std'],
    'name': 'count'
})

# 透视表
pd.pivot_table(df, values='score', index='class', columns='gender', aggfunc='mean')
```

### 合并与拼接 [官方-Pandas Merge]
```python
pd.merge(df1, df2, on='id', how='left')     # 左连接
pd.concat([df1, df2], axis=0)                # 纵向拼接
pd.concat([df1, df2], axis=1)                # 横向拼接
```

## Matplotlib可视化 [官方-Matplotlib文档]

```python
import matplotlib.pyplot as plt

# 折线图
plt.plot(x, y, label='sin(x)')
plt.xlabel('x')
plt.ylabel('y')
plt.title('正弦函数')
plt.legend()
plt.savefig('plot.png', dpi=150)

# 子图
fig, axes = plt.subplots(2, 2)
axes[0,0].plot(x, y1)
axes[0,1].bar(categories, values)
axes[1,0].scatter(x, y2)
axes[1,1].hist(data, bins=20)

# Seaborn高级可视化 [官方-Seaborn文档]
import seaborn as sns
sns.heatmap(corr_matrix, annot=True, cmap='coolwarm')
sns.boxplot(x='group', y='value', data=df)
sns.pairplot(df, hue='label')
```

## 数据科学工作流 [实践]

### 典型流程
1. **数据获取**：CSV/Excel/数据库/API爬取
2. **数据探索(EDA)**：df.describe()、分布图、相关性分析
3. **数据清洗**：缺失值、异常值、类型转换
4. **特征工程**：标准化、编码、特征选择/构造
5. **模型训练**：交叉验证、超参搜索
6. **模型评估**：测试集评估、混淆矩阵
7. **模型部署**：API封装、监控

### 常用特征工程方法 [教材-《Feature Engineering for Machine Learning》]
```python
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer

# 标准化
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# 类别编码
encoder = OneHotEncoder(sparse=False)
X_encoded = encoder.fit_transform(categorical_cols)

# 管道
from sklearn.pipeline import Pipeline
pipe = Pipeline([
    ('preprocess', ColumnTransformer([...])) ,
    ('model', RandomForestClassifier())
])
```
