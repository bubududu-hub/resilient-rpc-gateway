# Resilient RPC Gateway

一个面向生产思维设计的 Stellar JSON-RPC 多上游网关。它通过超时、跨节点重试、熔断、健康评分和可观测性，在部分 RPC 服务异常时维持只读请求可用，同时明确禁止自动重试 `sendTransaction`。

## 它证明什么

- TypeScript 后端与网络编程；
- 分布式系统中的超时、退避、熔断和故障恢复；
- Prometheus 指标、OpenTelemetry Trace 和结构化日志；
- 非幂等操作的安全边界；
- Docker、CI、测试、ADR 与 Runbook；
- 用英文异步文档解释工程取舍的能力。

完整说明请阅读 [英文 README](README.md)。

## 一键演示

```bash
make demo
```

它会启动一个快速模拟 RPC、一个每三次请求失败一次的 RPC，以及监听 `8080` 端口的网关。

```bash
curl -s http://localhost:8080/rpc \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger"}'
```

## 本地质量检查

```bash
npm ci
npm run check
```

项目包含严格 TypeScript、Lint、格式检查、覆盖率门槛、集成测试、依赖审计与 Docker 构建。
