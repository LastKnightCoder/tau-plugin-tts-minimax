# 开发指南

使用 Node.js 22、pnpm 11.9.0 和公共 SDK 0.13.0。运行代码全部在 src 中，build.mjs 仅负责打包。

克隆后运行 `pnpm install --frozen-lockfile`、`pnpm test`、`pnpm build`，产物为 `dist/tau.tts-minimax-0.1.0.zip`。调整版本时同步修改 package.json 和 manifest.json；推送对应版本 tag 后，GitHub Action 自动构建并发布 ZIP 到 Release。

业务参数与现有MiniMax实现对齐：默认speed 1.1，MP3、32kHz、128kbps、单声道；保留模型文本规则、服务错误分类和最多三次重试。请求和退避均接受任务取消信号，账号配置固定到每个任务实例。合成、音色和复刻使用同一个账号baseUrl。

provider.test.ts使用模拟fetch，不需要密钥、不访问真实服务。真实账号合成和复刻可能收费，另行按用户指定样本验收。
