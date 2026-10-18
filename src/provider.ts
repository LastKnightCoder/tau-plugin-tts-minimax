import type {
  JsonValue,
  TTSInstance,
  TTSCloneRequest,
  TTSVoice,
} from "@tau/plugins";
import { minimaxGetVoiceList, minimaxSynthesize } from "./synthesis";
import { buildMinimaxSpeechPromptRules } from "./speech";

export function parseConfig(value: JsonValue) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.apiKey !== "string" ||
    !value.apiKey.trim()
  )
    throw new Error("请填写 MiniMax API Key");
  const baseUrl =
    typeof value.baseUrl === "string"
      ? value.baseUrl.trim().replace(/\/+$/, "")
      : "";
  if (baseUrl && !["http:", "https:"].includes(new URL(baseUrl).protocol))
    throw new Error("服务地址必须为 HTTP(S) 地址");
  return { apiKey: value.apiKey.trim(), baseUrl };
}
export function createMinimaxInstance(
  fetch: typeof globalThis.fetch,
  value: JsonValue,
  model: string,
): TTSInstance {
  const config = parseConfig(value);
  if (!model.trim()) throw new Error("请先选择语音模型");
  const base = config.baseUrl || "https://api.minimaxi.com";
  const request = async (
    endpoint: string,
    init: RequestInit,
    signal: AbortSignal,
  ) => {
    signal.throwIfAborted();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${config.apiKey}`);
    const response = await fetch(base + endpoint, {
      ...init,
      headers,
      signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`MiniMax请求失败（HTTP ${response.status}）`);
    }
    const data = (await response.json()) as {
      base_resp?: { status_code: number; status_msg: string };
      file?: { file_id: string | number };
    };
    signal.throwIfAborted();
    if (data.base_resp?.status_code !== 0)
      throw new Error(data.base_resp?.status_msg || "MiniMax返回无效结果");
    return data;
  };
  const cloneVoice = async (
    input: TTSCloneRequest,
    signal: AbortSignal,
  ): Promise<TTSVoice> => {
    if (input.file.content.byteLength > 20 * 1024 * 1024)
      throw new Error("参考音频不能超过20MB");
    if (
      !["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav"].includes(
        input.file.mimeType,
      )
    )
      throw new Error("请选择mp3、m4a或wav参考音频");
    const id =
      input.requestedId?.trim() ||
      "tau_" + crypto.randomUUID().replaceAll("-", "");
    if (id.length > 100) throw new Error("音色ID不能超过100个字符");
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(input.file.content)], {
        type: input.file.mimeType,
      }),
      input.file.name,
    );
    form.append("purpose", "voice_clone");
    const uploaded = await request(
      "/v1/files/upload",
      { method: "POST", body: form },
      signal,
    );
    if (uploaded.file?.file_id === undefined)
      throw new Error("MiniMax未返回参考文件ID");
    await request(
      "/v1/voice_clone",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: uploaded.file.file_id, voice_id: id }),
      },
      signal,
    );
    return { id, name: input.name || id, type: "cloned" };
  };
  return {
    textInstructions: buildMinimaxSpeechPromptRules(true, model),
    getVoices: (signal) => minimaxGetVoiceList({ ...config, fetch, signal }),
    synthesize: (input, signal) =>
      minimaxSynthesize(
        { ...config, model, fetch, signal },
        input.text,
        input.voiceId,
        input.options,
      ),
    cloneVoice,
  };
}
