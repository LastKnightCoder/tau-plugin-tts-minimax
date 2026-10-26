import { definePlugin } from "@tau/plugins";
import { createMinimaxInstance, parseConfig } from "./provider";
import { MINIMAX_SPEECH_MODELS } from "./speech";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

export default definePlugin({
  ...__PLUGIN_META__,
  create: () => ({
    activate(context) {
      context.tts.register({
        id: context.pluginId,
        name: __PLUGIN_META__.name,
        create: (config, model) =>
          createMinimaxInstance(context.fetch, config, model),
      });
      context.settings.register({
        id: "tts",
        title: __PLUGIN_META__.name,
        target: "tts",
        models: MINIMAX_SPEECH_MODELS.map(id => ({ id })),
        form: {
          groups: [{
            title: "账号",
            description: "合成的文本会发送到 MiniMax 语音服务。",
            fields: [
              { key: "apiKey", label: "API Key", type: "secret", description: "在 MiniMax 开放平台获取" },
              { key: "baseUrl", label: "服务地址", type: "url", optional: true, placeholder: "https://api.minimaxi.com", description: "留空使用官方地址；使用代理或海外站点时填写", summary: true },
            ],
          }],
          beforeSave: async values => parseConfig(values),
        },
      });
    },
  }),
});
