# DeepSeek API 接入与使用完整指南

> 本文档基于 [DeepSeek 官方 API 文档](https://api-docs.deepseek.com/zh-cn/) 整理，供 NEXUS 项目 RAG 知识库测试使用。

---

## 1. 概述

DeepSeek API 使用与 OpenAI / Anthropic 兼容的 API 格式。通过修改 `base_url` 和 `api_key`，可以直接使用 OpenAI SDK 或任何兼容 OpenAI API 的工具来调用 DeepSeek 模型。

### 1.1 基础配置

| 参数 | 值 |
|------|------|
| Base URL (OpenAI 格式) | `https://api.deepseek.com` |
| Base URL (Anthropic 格式) | `https://api.deepseek.com/anthropic` |
| Base URL (Beta 功能) | `https://api.deepseek.com/beta` |
| API Key | 在 [DeepSeek Platform](https://platform.deepseek.com/api_keys) 申请 |

### 1.2 可用模型

| 模型名称 | 说明 |
|---------|------|
| `deepseek-v4-flash` | 轻量快速模型，支持思考与非思考模式切换 |
| `deepseek-v4-pro` | 高性能模型，支持思考与非思考模式切换 |
| `deepseek-chat` | **即将弃用**（2026/07/24），对应 `deepseek-v4-flash` 非思考模式 |
| `deepseek-reasoner` | **即将弃用**（2026/07/24），对应 `deepseek-v4-flash` 思考模式 |

### 1.3 模型能力矩阵

| 功能 | deepseek-v4-flash | deepseek-v4-pro |
|------|-------------------|-----------------|
| 上下文长度 | 1M tokens | 1M tokens |
| 最大输出长度 | 384K tokens | 384K tokens |
| JSON Output | 支持 | 支持 |
| Tool Calls | 支持 | 支持 |
| 对话前缀续写 (Beta) | 支持 | 支持 |
| FIM 补全 (Beta) | 仅非思考模式 | 仅非思考模式 |
| 思考模式 | 支持 | 支持 |

---

## 2. 快速开始

### 2.1 安装 SDK

```bash
# Python
pip3 install -U openai

# Node.js
npm install openai
```

### 2.2 第一次调用

#### cURL

```bash
curl https://api.deepseek.com/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${DEEPSEEK_API_KEY}" \
  -d '{
        "model": "deepseek-v4-pro",
        "messages": [
          {"role": "system", "content": "You are a helpful assistant."},
          {"role": "user", "content": "Hello!"}
        ],
        "stream": false
      }'
```

#### Python

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get('DEEPSEEK_API_KEY'),
    base_url="https://api.deepseek.com"
)

response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=[
        {"role": "system", "content": "You are a helpful assistant"},
        {"role": "user", "content": "Hello"},
    ],
    stream=False
)

print(response.choices[0].message.content)
```

#### Node.js

```javascript
import OpenAI from "openai";

const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
});

async function main() {
    const completion = await openai.chat.completions.create({
        messages: [{ role: "system", content: "You are a helpful assistant." }],
        model: "deepseek-v4-pro",
        stream: false,
    });

    console.log(completion.choices[0].message.content);
}

main();
```

---

## 3. 思考模式（Thinking Mode）

DeepSeek 模型支持思考模式：在输出最终回答之前，模型会先输出一段思维链（Chain of Thought）内容，以提升最终答案的准确性。

### 3.1 开关与强度控制

| 控制参数 (OpenAI 格式) | 说明 |
|------------------------|------|
| `thinking.type` | `"enabled"` 开启（默认），`"disabled"` 关闭 |
| `reasoning_effort` | `"high"` 默认强度，`"max"` 最大强度 |

> `low` 和 `medium` 会映射为 `high`，`xhigh` 会映射为 `max`。

### 3.2 不支持的参数

思考模式下，以下参数设置不会生效（但也不会报错）：

- `temperature`
- `top_p`
- `presence_penalty`
- `frequency_penalty`

### 3.3 输出字段

| 字段 | 说明 |
|------|------|
| `reasoning_content` | 思维链内容（与 `content` 同级） |
| `content` | 最终回答内容 |

### 3.4 使用示例

```python
from openai import OpenAI

client = OpenAI(
    api_key="<your-api-key>",
    base_url="https://api.deepseek.com"
)

response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=[
        {"role": "user", "content": "9.11 and 9.8, which is greater?"}
    ],
    reasoning_effort="high",
    extra_body={"thinking": {"type": "enabled"}}
)

# 访问思维链
reasoning = response.choices[0].message.reasoning_content
# 访问最终回答
answer = response.choices[0].message.content

print(f"思维链: {reasoning}")
print(f"回答: {answer}")
```

### 3.5 多轮对话中的上下文拼接

在**没有工具调用**的多轮对话中，之前轮次的 `reasoning_content` 不需要拼接到上下文中：

```python
# 第一轮
messages = [{"role": "user", "content": "9.11 and 9.8, which is greater?"}]
response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=messages,
    reasoning_effort="high",
    extra_body={"thinking": {"type": "enabled"}}
)

content = response.choices[0].message.content

# 第二轮：只拼接 content，不拼接 reasoning_content
messages.append({"role": "assistant", "content": content})
messages.append({"role": "user", "content": "How many Rs in 'strawberry'?"})

response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=messages,
    reasoning_effort="high",
    extra_body={"thinking": {"type": "enabled"}}
)
```

> **注意**：如果在多轮对话中涉及了工具调用，则 `reasoning_content` **必须**参与上下文拼接。详见第 5 节。

---

## 4. JSON Output

在需要模型输出结构化数据时，可以使用 JSON Output 功能确保模型输出合法 JSON。

### 4.1 使用要点

1. 设置 `response_format` 为 `{"type": "json_object"}`
2. system 或 user prompt 中**必须**包含 `json` 字样
3. prompt 中需提供 JSON 格式样例
4. 合理设置 `max_tokens` 防止 JSON 被截断

### 4.2 完整示例

```python
import json
from openai import OpenAI

client = OpenAI(
    api_key="<your-api-key>",
    base_url="https://api.deepseek.com",
)

system_prompt = """The user will provide some exam text. Please parse the "question" and "answer" and output them in JSON format.

EXAMPLE INPUT:
Which is the highest mountain in the world? Mount Everest.

EXAMPLE JSON OUTPUT:
{
    "question": "Which is the highest mountain in the world?",
    "answer": "Mount Everest"
}"""

user_prompt = "Which is the longest river in the world? The Nile River."

response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ],
    response_format={"type": "json_object"}
)

result = json.loads(response.choices[0].message.content)
print(result)
# 输出: {"question": "Which is the longest river in the world?", "answer": "The Nile River"}
```

---

## 5. Tool Calls（函数调用）

Tool Calls 让模型能够调用外部工具来增强自身能力，例如查询天气、搜索数据库、执行计算等。

### 5.1 非思考模式下的工具调用

```python
from openai import OpenAI

client = OpenAI(
    api_key="<your-api-key>",
    base_url="https://api.deepseek.com",
)

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get weather of a location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The city, e.g. Hangzhou",
                    }
                },
                "required": ["location"]
            },
        }
    },
]

messages = [
    {"role": "user", "content": "How's the weather in Hangzhou?"}
]

# 第一次调用：模型决定要调用工具
response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=messages,
    tools=tools
)

message = response.choices[0].message
tool_call = message.tool_calls[0]

# 将模型的回复和工具结果拼入消息列表
messages.append(message)
messages.append({
    "role": "tool",
    "tool_call_id": tool_call.id,
    "content": "24℃, 晴天"
})

# 第二次调用：模型基于工具结果生成最终回答
response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=messages,
    tools=tools
)

print(response.choices[0].message.content)
```

### 5.2 思考模式下的工具调用

思考模式同样支持工具调用。区别在于：

- 模型在工具调用之间会输出 `reasoning_content`
- **工具调用轮次中的 `reasoning_content` 必须完整回传给 API**

```python
import json
from openai import OpenAI

client = OpenAI(
    api_key="<your-api-key>",
    base_url="https://api.deepseek.com",
)

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_date",
            "description": "Get the current date",
            "parameters": {"type": "object", "properties": {}},
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get weather of a location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string"},
                    "date": {"type": "string", "description": "Format: YYYY-mm-dd"},
                },
                "required": ["location", "date"]
            },
        }
    },
]

messages = [{"role": "user", "content": "How's the weather in Hangzhou tomorrow?"}]

while True:
    response = client.chat.completions.create(
        model="deepseek-v4-pro",
        messages=messages,
        tools=tools,
        reasoning_effort="high",
        extra_body={"thinking": {"type": "enabled"}},
    )

    # 直接 append response message，包含 reasoning_content / content / tool_calls
    messages.append(response.choices[0].message)

    tool_calls = response.choices[0].message.tool_calls

    if tool_calls is None:
        print(response.choices[0].message.content)
        break

    for tool in tool_calls:
        # 执行工具调用并返回结果
        tool_result = execute_tool(tool.function.name, json.loads(tool.function.arguments))
        messages.append({
            "role": "tool",
            "tool_call_id": tool.id,
            "content": tool_result,
        })
```

### 5.3 strict 模式（Beta）

strict 模式确保模型输出的 Function 调用严格遵循 JSON Schema 格式定义。

```python
# 需要使用 Beta base_url
client = OpenAI(
    api_key="<your-api-key>",
    base_url="https://api.deepseek.com/beta",
)

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "strict": True,  # 开启 strict 模式
            "description": "Get weather of a location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The city, e.g. Hangzhou",
                    }
                },
                "required": ["location"],
                "additionalProperties": False  # strict 模式必须设置
            },
        }
    },
]
```

strict 模式支持的 JSON Schema 类型：

| 类型 | 说明 |
|------|------|
| `object` | 必须设置所有属性为 `required`，`additionalProperties` 为 `false` |
| `string` | 支持 `format`（email/hostname/ipv4/ipv6/uuid） |
| `number` / `integer` | 支持 `minimum`/`maximum`/`const`/`default`/`multipleOf` |
| `boolean` | 布尔值 |
| `array` | 数组类型 |
| `enum` | 枚举值 |
| `anyOf` | 匹配多个 schema 之一 |
| `$ref` / `$def` | 引用/递归结构 |

---

## 6. 对话前缀续写（Beta）

让模型从一段 assistant 消息的开头继续续写，适用于强制模型以特定格式开头输出。

### 6.1 注意事项

- `messages` 最后一条消息的 `role` 必须为 `assistant`
- 设置最后一条消息的 `prefix` 参数为 `True`
- 需要使用 Beta base_url：`https://api.deepseek.com/beta`

### 6.2 示例：强制输出 Python 代码

```python
from openai import OpenAI

client = OpenAI(
    api_key="<your-api-key>",
    base_url="https://api.deepseek.com/beta",
)

messages = [
    {"role": "user", "content": "Please write quick sort code"},
    {"role": "assistant", "content": "```python\n", "prefix": True}
]

response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=messages,
    stop=["```"],
)

print(response.choices[0].message.content)
```

---

## 7. FIM 补全（Beta）

FIM (Fill In the Middle) 让模型根据前缀和后缀补全中间内容，常用于代码补全。

### 7.1 注意事项

- 最大补全长度为 4K tokens
- 需要使用 Beta base_url

### 7.2 示例

```python
from openai import OpenAI

client = OpenAI(
    api_key="<your-api-key>",
    base_url="https://api.deepseek.com/beta",
)

response = client.completions.create(
    model="deepseek-v4-pro",
    prompt="def fib(a):",
    suffix="    return fib(a-1) + fib(a-2)",
    max_tokens=128
)

print(response.choices[0].text)
```

---

## 8. 价格与计费

### 8.1 Token 换算

- 1 个英文字符 ≈ 0.3 个 token
- 1 个中文字符 ≈ 0.6 个 token
- 实际用量以 API 返回的 `usage` 字段为准

### 8.2 价格表（单位：元/百万 tokens）

| 计费项 | deepseek-v4-flash | deepseek-v4-pro |
|-------|-------------------|-----------------|
| 输入（缓存命中） | 0.02 | 0.1（限时 2.5 折: 0.025） |
| 输入（缓存未命中） | 1 | 12（限时 2.5 折: 3） |
| 输出 | 2 | 24（限时 2.5 折: 6） |

> `deepseek-v4-pro` 限时 2.5 折优惠至北京时间 2026/05/05 23:59。

### 8.3 扣费规则

- 扣减费用 = token 消耗量 × 模型单价
- 优先扣减赠送余额，再扣充值余额

---

## 9. 限速与错误处理

### 9.1 限速机制

DeepSeek API 根据负载情况动态限制并发量。触发限速时返回 HTTP 429。

等待期间的行为：

- **非流式请求**：持续返回空行
- **流式请求**：持续返回 SSE keep-alive 注释 `: keep-alive`
- 超过 10 分钟未开始推理，服务器将关闭连接

### 9.2 错误码速查表

| 错误码 | 描述 | 解决方法 |
|--------|------|----------|
| **400** | 请求体格式错误 | 检查请求 JSON 格式 |
| **401** | 认证失败 | 检查 API Key 是否正确 |
| **402** | 余额不足 | 前往 [充值页面](https://platform.deepseek.com/top_up) 充值 |
| **422** | 参数错误 | 根据错误信息修改参数 |
| **429** | 请求速率达到上限 | 降低请求频率，添加重试逻辑 |
| **500** | 服务器内部故障 | 等待后重试 |
| **503** | 服务器繁忙 | 稍后重试 |

### 9.3 推荐重试策略

```python
import time
from openai import OpenAI

client = OpenAI(api_key="<key>", base_url="https://api.deepseek.com")

def call_with_retry(messages, max_retries=3):
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model="deepseek-v4-pro",
                messages=messages,
            )
            return response
        except Exception as e:
            if "429" in str(e) and attempt < max_retries - 1:
                wait_time = 2 ** attempt
                print(f"Rate limited, retrying in {wait_time}s...")
                time.sleep(wait_time)
            else:
                raise
```

---

## 10. 流式输出

所有对话 API 都支持流式输出，适用于聊天场景实时展示。

### 10.1 Python 流式示例

```python
from openai import OpenAI

client = OpenAI(
    api_key="<your-api-key>",
    base_url="https://api.deepseek.com"
)

response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "写一首关于春天的诗"}
    ],
    stream=True
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

### 10.2 Node.js 流式示例

```javascript
import OpenAI from "openai";

const client = new OpenAI({
    baseURL: "https://api.deepseek.com",
    apiKey: process.env.DEEPSEEK_API_KEY,
});

async function main() {
    const stream = await client.chat.completions.create({
        model: "deepseek-v4-pro",
        messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: "写一首关于春天的诗" }
        ],
        stream: true,
    });

    for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        process.stdout.write(content);
    }
}

main();
```

### 10.3 思考模式的流式输出

思考模式下，流式返回中会包含 `reasoning_content` 字段：

```python
response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=[{"role": "user", "content": "解释量子纠缠"}],
    stream=True,
    reasoning_effort="high",
    extra_body={"thinking": {"type": "enabled"}}
)

for chunk in response:
    delta = chunk.choices[0].delta
    # 思维链内容
    if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
        print(f"[思考] {delta.reasoning_content}", end="")
    # 最终回答
    if delta.content:
        print(delta.content, end="")
```

---

## 11. 在 NEXUS 项目中接入 DeepSeek

### 11.1 后端配置

NEXUS 后端使用 NestJS + OpenAI SDK 调用 LLM。在 LLM Provider 管理中添加 DeepSeek 供应商：

| 配置项 | 值 |
|--------|------|
| 供应商名称 | DeepSeek |
| API Base URL | `https://api.deepseek.com` |
| API Key | 你的 DeepSeek API Key |
| 模型列表 | `deepseek-v4-flash`, `deepseek-v4-pro` |

### 11.2 工作流中使用

1. 在 LLM 节点中选择 DeepSeek 供应商
2. 选择对应模型（推荐 `deepseek-v4-flash` 用于快速响应，`deepseek-v4-pro` 用于复杂推理）
3. 配置 System Prompt
4. 连接 Knowledge 节点实现 RAG 知识库问答

### 11.3 RAG 场景推荐配置

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| 模型 | `deepseek-v4-flash` | 快速响应，适合问答场景 |
| temperature | `0.3` | 保持回答稳定性 |
| max_tokens | `2048` | 足够的回答空间 |
| System Prompt | 包含"基于以下知识库内容回答" | 引导模型使用检索到的上下文 |

---

## 12. 常见问题

### Q: deepseek-chat 和 deepseek-v4-flash 有什么区别？

`deepseek-chat` 将于 2026/07/24 弃用，它等价于 `deepseek-v4-flash` 的非思考模式。建议尽早迁移到新模型名称。

### Q: 思考模式下的 reasoning_content 需要在多轮对话中回传吗？

- 没有工具调用时：**不需要**，API 会自动忽略
- 有工具调用时：**必须回传**，否则 API 返回 400 错误

### Q: JSON Output 时有时返回空 content？

这是已知问题，可以通过优化 prompt 缓解。确保 prompt 中明确包含 `json` 关键词和格式样例。

### Q: 如何计算 Token 用量？

API 每次响应的 `usage` 字段会返回实际用量：

```json
{
    "usage": {
        "prompt_tokens": 125,
        "completion_tokens": 350,
        "total_tokens": 475
    }
}
```

### Q: 缓存命中是什么？

DeepSeek 提供上下文硬盘缓存功能。相同的 prompt 前缀会被缓存，后续请求命中缓存时输入价格降至 1/10。无需手动配置，系统自动管理。

---

## 13. 参考链接

| 资源 | 链接 |
|------|------|
| 官方 API 文档 | https://api-docs.deepseek.com/zh-cn/ |
| API Key 管理 | https://platform.deepseek.com/api_keys |
| 充值 | https://platform.deepseek.com/top_up |
| 模型与价格 | https://api-docs.deepseek.com/zh-cn/quick_start/pricing |
| 思考模式指南 | https://api-docs.deepseek.com/zh-cn/guides/thinking_mode |
| Tool Calls 指南 | https://api-docs.deepseek.com/zh-cn/guides/tool_calls |
| JSON Output 指南 | https://api-docs.deepseek.com/zh-cn/guides/json_mode |
| FIM 补全指南 | https://api-docs.deepseek.com/zh-cn/guides/fim_completion |
| 对话前缀续写指南 | https://api-docs.deepseek.com/zh-cn/guides/chat_prefix_completion |
| 错误码 | https://api-docs.deepseek.com/zh-cn/quick_start/error_codes |

---

*文档最后更新：2026-04-27*
