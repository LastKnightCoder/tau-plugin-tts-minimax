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
          groups: [{ title: "连接", fields: [
            { key: "apiKey", label: "API Key", type: "secret" },
            { key: "baseUrl", label: "服务地址", type: "url", optional: true, placeholder: "留空使用官方地址", summary: true },
          ] }],
          beforeSave: async values => parseConfig(values),
        },
      });
    },
  }),
});
