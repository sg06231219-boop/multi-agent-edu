"""
知识库TF-IDF语义搜索引擎
纯Python实现，无需scikit-learn依赖

功能：
- 对knowledge_base目录下的md文件建立倒排索引
- 支持TF-IDF语义检索，返回最相关的段落
- 每个结果包含：原文、来源文件、相关性分数、来源标注
"""

import os
import re
import math
import json
from typing import List, Dict, Optional, Tuple
from collections import Counter, defaultdict


# ============================================================
# 中文分词（简单实现：基于正则的切分 + 单字补全）
# ============================================================

def _tokenize(text: str) -> List[str]:
    """
    简易中文分词器：
    1. 提取中文连续片段（2-4字滑动窗口生成词组）
    2. 提取英文单词
    3. 提取数字
    返回小写化的token列表
    """
    tokens = []
    
    # 提取中文片段
    chinese_segments = re.findall(r'[\u4e00-\u9fff]+', text)
    for seg in chinese_segments:
        # 单字
        for ch in seg:
            tokens.append(ch)
        # 2-gram
        for i in range(len(seg) - 1):
            tokens.append(seg[i:i+2])
        # 3-gram
        for i in range(len(seg) - 2):
            tokens.append(seg[i:i+3])
        # 4-gram
        for i in range(len(seg) - 3):
            tokens.append(seg[i:i+4])
    
    # 提取英文单词（转小写）
    english_words = re.findall(r'[a-zA-Z][a-zA-Z0-9_]*', text)
    tokens.extend([w.lower() for w in english_words])
    
    # 提取数字
    numbers = re.findall(r'\d+\.?\d*', text)
    tokens.extend(numbers)
    
    return tokens


def _extract_source_tag(text: str) -> str:
    """
    从段落文本中提取来源标注。
    优先匹配方括号标注：[教材], [论文], [官方], [实践]
    如果找到多个，返回第一个；如果没找到，返回[实践]（默认）
    """
    # 匹配 [教材], [论文], [官方], [实践] 及其变体如 [教材-xxx]
    pattern = r'\[(教材|论文|官方|实践)'
    match = re.search(pattern, text)
    if match:
        return f"[{match.group(1)}]"
    return "[实践]"


# ============================================================
# TF-IDF搜索引擎
# ============================================================

class KnowledgeSearchEngine:
    """
    基于TF-IDF的知识库搜索引擎
    
    流程：
    1. 加载md文件，按段落分块
    2. 对每个段落建立TF-IDF向量
    3. 查询时计算query与每个段落的余弦相似度
    4. 返回top_k最相关结果
    """
    
    def __init__(self, knowledge_dir: Optional[str] = None):
        """
        Args:
            knowledge_dir: 知识库md文件所在目录，默认为当前文件所在目录
        """
        self.knowledge_dir = knowledge_dir or os.path.dirname(os.path.abspath(__file__))
        
        # 段落存储
        self.documents: List[Dict] = []  # [{"text": ..., "source": ..., "source_tag": ..., "tokens": [...]}]
        
        # 倒排索引：token -> {doc_idx: tf}
        self.inverted_index: Dict[str, Dict[int, float]] = defaultdict(dict)
        
        # IDF值：token -> idf
        self.idf: Dict[str, float] = {}
        
        # 文档TF-IDF向量（归一化后的模，用于余弦相似度计算）
        self.doc_norms: List[float] = []
        
        # 是否已构建索引
        self._indexed = False
    
    def build_index(self):
        """构建TF-IDF索引"""
        self.documents = []
        self.inverted_index = defaultdict(dict)
        self.idf = {}
        self.doc_norms = []
        
        # 1. 加载所有md文件
        md_files = sorted([
            f for f in os.listdir(self.knowledge_dir)
            if f.endswith('.md')
        ])
        
        for filename in md_files:
            filepath = os.path.join(self.knowledge_dir, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
            except Exception:
                continue
            
            # 2. 按段落分块
            paragraphs = self._split_into_paragraphs(content, filename)
            self.documents.extend(paragraphs)
        
        if not self.documents:
            self._indexed = True
            return
        
        # 3. 分词并建立倒排索引
        doc_count = len(self.documents)
        token_doc_count = Counter()  # 每个token出现在多少个文档中
        
        for idx, doc in enumerate(self.documents):
            tokens = _tokenize(doc["text"])
            # 过滤停用词（简单版）
            tokens = [t for t in tokens if len(t) > 0 and t not in _STOP_WORDS]
            doc["tokens"] = tokens
            
            # 计算TF（词频）
            token_counts = Counter(tokens)
            max_tf = max(token_counts.values()) if token_counts else 1
            
            for token, count in token_counts.items():
                # 增强型TF：0.5 + 0.5 * (tf / max_tf)
                tf = 0.5 + 0.5 * (count / max_tf)
                self.inverted_index[token][idx] = tf
                token_doc_count[token] += 1
        
        # 4. 计算IDF
        for token, dc in token_doc_count.items():
            self.idf[token] = math.log((doc_count + 1) / (dc + 1)) + 1  # 平滑IDF
        
        # 5. 预计算每个文档的TF-IDF向量模（用于余弦相似度）
        for idx in range(doc_count):
            norm = 0.0
            for token, tf in self.inverted_index.items():
                if idx in tf:
                    tfidf = tf[idx] * self.idf.get(token, 1.0)
                    norm += tfidf ** 2
            self.doc_norms.append(math.sqrt(norm) if norm > 0 else 1.0)
        
        self._indexed = True
    
    def search(self, query: str, top_k: int = 5, source_filter: Optional[str] = None) -> List[Dict]:
        """
        执行TF-IDF语义检索
        
        Args:
            query: 查询文本
            top_k: 返回最相关的top_k个结果
            source_filter: 来源过滤，如"[教材]"、"[论文]"等，None表示不过滤
        
        Returns:
            [{"text": 原文, "source": 来源文件, "score": 相关性分数, "source_tag": 来源标注}]
        """
        if not self._indexed:
            self.build_index()
        
        if not self.documents:
            return []
        
        # 对query分词
        query_tokens = _tokenize(query)
        query_tokens = [t for t in query_tokens if len(t) > 0 and t not in _STOP_WORDS]
        
        if not query_tokens:
            return []
        
        # 计算query的TF
        query_token_counts = Counter(query_tokens)
        max_qtf = max(query_token_counts.values()) if query_token_counts else 1
        
        # 计算query的TF-IDF向量
        query_vec = {}
        for token, count in query_token_counts.items():
            tf = 0.5 + 0.5 * (count / max_qtf)
            idf = self.idf.get(token, 1.0)
            query_vec[token] = tf * idf
        
        # query向量模
        query_norm = math.sqrt(sum(v ** 2 for v in query_vec.values())) or 1.0
        
        # 计算余弦相似度
        scores: List[Tuple[int, float]] = []
        
        for idx in range(len(self.documents)):
            # 来源过滤
            if source_filter and self.documents[idx]["source_tag"] != source_filter:
                continue
            
            # 计算点积（只在共有的token上计算）
            dot_product = 0.0
            for token, q_weight in query_vec.items():
                if token in self.inverted_index and idx in self.inverted_index[token]:
                    d_weight = self.inverted_index[token][idx] * self.idf.get(token, 1.0)
                    dot_product += q_weight * d_weight
            
            if dot_product > 0:
                doc_norm = self.doc_norms[idx]
                cosine_sim = dot_product / (query_norm * doc_norm) if doc_norm > 0 else 0
                scores.append((idx, round(cosine_sim, 4)))
        
        # 按分数降序排序，取top_k
        scores.sort(key=lambda x: x[1], reverse=True)
        top_scores = scores[:top_k]
        
        results = []
        for idx, score in top_scores:
            doc = self.documents[idx]
            results.append({
                "text": doc["text"],
                "source": doc["source"],
                "score": score,
                "source_tag": doc["source_tag"],
            })
        
        return results
    
    def _split_into_paragraphs(self, content: str, filename: str) -> List[Dict]:
        """
        将md文件内容按段落分块，保留上下文层级
        
        策略：
        - 以二级标题(##)为主要分块边界
        - 以三级标题(###)为次要分块边界
        - 每个分块保留其标题层级信息
        - 合并过短的段落（<50字符）到上一个段落
        """
        paragraphs = []
        lines = content.split('\n')
        
        current_section = {"title": "", "content_lines": [], "level": 0}
        
        def _flush_section():
            text = "\n".join(current_section["content_lines"]).strip()
            if len(text) < 20:  # 太短的不作为独立段落
                return
            # 提取来源标注
            source_tag = _extract_source_tag(text)
            paragraphs.append({
                "text": text,
                "source": filename,
                "source_tag": source_tag,
            })
        
        for line in lines:
            # 检测标题行
            heading_match = re.match(r'^(#{1,4})\s+(.+)$', line)
            
            if heading_match:
                level = len(heading_match.group(1))
                title = heading_match.group(2).strip()
                
                # 如果当前section有内容，先保存
                if current_section["content_lines"]:
                    _flush_section()
                
                # 开始新section
                current_section = {
                    "title": title,
                    "content_lines": [line],
                    "level": level,
                }
            else:
                # 空行作为段落分隔提示，但不一定分块
                current_section["content_lines"].append(line)
        
        # 保存最后一个section
        if current_section["content_lines"]:
            _flush_section()
        
        # 二次处理：合并过短段落
        merged = []
        for p in paragraphs:
            if merged and len(p["text"]) < 80 and merged[-1]["source"] == p["source"]:
                # 合并到上一个段落
                merged[-1]["text"] += "\n\n" + p["text"]
                # 重新提取来源标注
                merged[-1]["source_tag"] = _extract_source_tag(merged[-1]["text"])
            else:
                merged.append(p)
        
        return merged
    
    def get_stats(self) -> Dict:
        """返回索引统计信息"""
        if not self._indexed:
            self.build_index()
        return {
            "total_documents": len(self.documents),
            "vocabulary_size": len(self.idf),
            "sources": list(set(d["source"] for d in self.documents)),
            "source_tag_distribution": Counter(d["source_tag"] for d in self.documents),
        }


# ============================================================
# 停用词表（简易中文 + 英文）
# ============================================================

_STOP_WORDS = {
    # 中文停用词
    "的", "了", "是", "在", "我", "有", "和", "就", "不", "人", "都",
    "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会",
    "着", "没有", "看", "好", "自己", "这", "他", "她", "它", "们",
    "那", "些", "什么", "怎么", "如果", "因为", "所以", "但是", "而",
    "且", "或", "与", "及", "等", "之", "中", "为", "以", "于",
    "从", "对", "把", "被", "让", "给", "向", "跟", "比", "用",
    # 英文停用词
    "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "shall", "can",
    "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above",
    "below", "between", "out", "off", "over", "under", "again",
    "further", "then", "once", "here", "there", "when", "where",
    "why", "how", "all", "each", "few", "more", "most", "other",
    "some", "such", "no", "nor", "not", "only", "own", "same",
    "so", "than", "too", "very", "just", "because", "but", "and",
    "or", "if", "while", "about", "up", "its", "it", "this",
    "that", "these", "those", "i", "me", "my", "we", "our", "you",
    "your", "he", "him", "his", "she", "her", "they", "them",
    "their", "what", "which", "who", "whom",
}


# ============================================================
# 全局搜索引擎实例（懒加载）
# ============================================================

_global_engine: Optional[KnowledgeSearchEngine] = None


def get_search_engine(knowledge_dir: Optional[str] = None) -> KnowledgeSearchEngine:
    """获取全局搜索引擎实例（单例，懒加载）"""
    global _global_engine
    if _global_engine is None:
        _global_engine = KnowledgeSearchEngine(knowledge_dir)
        _global_engine.build_index()
    return _global_engine


def search_knowledge(query: str, top_k: int = 5, source_filter: Optional[str] = None) -> List[Dict]:
    """
    便捷函数：搜索知识库
    
    Args:
        query: 查询文本
        top_k: 返回结果数
        source_filter: 来源过滤，如"[教材]"
    
    Returns:
        搜索结果列表
    """
    engine = get_search_engine()
    return engine.search(query, top_k, source_filter)
