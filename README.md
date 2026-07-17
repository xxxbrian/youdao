# Youdao API

## 仓库结构

```text
apps/
  api/          # 主服务（Hono）
  bob-plugin/   # Bob 薄客户端
```

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 存活检查 |
| POST | `/v1/translate` | 文本翻译 |
| POST | `/v1/lookup` | 词典查询（音标/释义/发音 URL） |
| POST | `/v1/query` | 智能入口：`mode=auto\|translate\|lookup` |

### 示例

```bash
# 翻译
curl -s http://127.0.0.1:8787/v1/translate \
  -H 'content-type: application/json' \
  -d '{"text":"hello","from":"auto","to":"zh-CHS"}'

# 查词
curl -s http://127.0.0.1:8787/v1/lookup \
  -H 'content-type: application/json' \
  -d '{"q":"apple"}'

# 智能
curl -s http://127.0.0.1:8787/v1/query \
  -H 'content-type: application/json' \
  -d '{"text":"apple","mode":"auto"}'
```

若配置了 `API_KEY`：

```bash
curl -s http://127.0.0.1:8787/v1/query \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer your-key' \
  -d '{"text":"hello"}'
```

## 本地开发（Bun）

```bash
bun install
bun run dev
# → http://127.0.0.1:8787
```

```bash
bun test                 # 单元测试
RUN_LIVE=1 bun test      # 含有道实网集成测试
bun run typecheck
bun run check            # Biome format + lint
bun run check:fix        # 自动修复
```

## Cloudflare Workers

```bash
cd apps/api
# 可选：开启鉴权
# bunx wrangler secret put API_KEY
bun run deploy
```

本地模拟 Workers：

```bash
bun run dev:cf
```

## Bob 插件

1. 启动 API 服务
2. 将 `apps/bob-plugin/src` 打成 `.bobplugin`（zip 内容为 src 内文件）并安装
3. 在插件设置中填写服务地址，例如 `http://127.0.0.1:8787`

## 环境变量

| 变量 | 说明 |
|------|------|
| `PORT` | Bun 监听端口，默认 `8787` |
| `API_KEY` | 可选；设置后需 Bearer / `X-API-Key`；未设置则开放 |
| `YOUDAO_COOKIE` | 可选；有道请求 Cookie 覆盖 |
