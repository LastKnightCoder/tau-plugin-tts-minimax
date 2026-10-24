import { afterEach, expect, it, vi } from "vitest";
import { createMinimaxInstance } from "./provider";
const signal = () => new AbortController().signal;
const response = (data: object) =>
  new Response(
    JSON.stringify({ base_resp: { status_code: 0, status_msg: "" }, ...data }),
  );
afterEach(() => vi.useRealTimers());

it("多个实例分别使用账号、地址、模型，保留合成参数及MP3字节", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => response({ data: { audio: "00ff10" } }));
  const first = createMinimaxInstance(
    fetch,
    { apiKey: "account-a", baseUrl: "https://a.test" },
    "speech-2.8-hd",
  );
  const second = createMinimaxInstance(
    fetch,
    { apiKey: "account-b", baseUrl: "https://b.test" },
    "speech-2.6-hd",
  );
  expect(
    await first.synthesize({ text: "你好", voiceId: "v-a" }, signal()),
  ).toEqual({ audio: new Uint8Array([0, 255, 16]), mime: "audio/mpeg" });
  await second.synthesize({ text: "你好(laughs)", voiceId: "v-b" }, signal());
  expect(fetch.mock.calls.map((call) => String(call[0]))).toEqual([
    "https://a.test/v1/t2a_v2",
    "https://b.test/v1/t2a_v2",
  ]);
  const bodies = fetch.mock.calls.map((call) =>
    JSON.parse(call[1]!.body as string),
  );
  expect(bodies[0]).toMatchObject({
    model: "speech-2.8-hd",
    stream: false,
    voice_setting: { speed: 1.1, vol: 1, pitch: 0 },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      channel: 1,
      format: "mp3",
    },
  });
  expect(bodies[1].text).not.toContain("(laughs)");
  expect(
    new Headers(fetch.mock.calls[1][1]!.headers).get("authorization"),
  ).toBe("Bearer account-b");
});
it("音色列表保留系统、复刻和自定义类型", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(
      response({
        system_voice: [{ voice_id: "system" }],
        voice_cloning: [{ voice_id: "clone", voice_name: "音色" }],
        voice_generation: [{ voice_id: "custom" }],
      }),
    );
  const provider = createMinimaxInstance(
    fetch,
    { apiKey: "test" },
    "speech-2.8-hd",
  );
  expect(
    (await provider.getVoices(signal())).map((voice) => [voice.id, voice.type]),
  ).toEqual([
    ["clone", "cloned"],
    ["custom", "custom"],
    ["system", "system"],
  ]);
});
it("复刻直传一个文件，同一账号baseUrl贯穿上传与复刻", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(response({ file: { file_id: 123 } }))
    .mockResolvedValueOnce(response({}));
  const provider = createMinimaxInstance(
    fetch,
    { apiKey: "test", baseUrl: "https://proxy.test" },
    "speech-2.8-hd",
  );
  const voice = await provider.cloneVoice!(
    {
      file: {
        name: "a.wav",
        mimeType: "audio/wav",
        content: new Uint8Array([0, 255]),
      },
      requestedId: "my_voice",
      name: "我的声音",
    },
    signal(),
  );
  expect(voice).toEqual({ id: "my_voice", name: "我的声音", type: "cloned" });
  expect(fetch.mock.calls.map((call) => String(call[0]))).toEqual([
    "https://proxy.test/v1/files/upload",
    "https://proxy.test/v1/voice_clone",
  ]);
  const form = fetch.mock.calls[0][1]!.body as FormData;
  expect(
    new Uint8Array(await (form.get("file") as Blob).arrayBuffer()),
  ).toEqual(new Uint8Array([0, 255]));
  expect(JSON.parse(fetch.mock.calls[1][1]!.body as string)).toEqual({
    file_id: 123,
    voice_id: "my_voice",
  });
});
it("永久失败不重试，取消重试等待后不再发送请求", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response("", { status: 401 }));
  const provider = createMinimaxInstance(
    fetch,
    { apiKey: "test" },
    "speech-2.8-hd",
  );
  await expect(
    provider.synthesize({ text: "a", voiceId: "v" }, signal()),
  ).rejects.toThrow("401");
  expect(fetch).toHaveBeenCalledTimes(1);
  vi.useFakeTimers();
  const controller = new AbortController();
  fetch
    .mockClear()
    .mockImplementation(async () => new Response("", { status: 429 }));
  const pending = provider.synthesize(
    { text: "a", voiceId: "v" },
    controller.signal,
  );
  const assertion = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  await vi.advanceTimersByTimeAsync(1);
  controller.abort();
  await assertion;
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("中文原生连接 TypeError 不依赖错误消息即可重试", async () => {
  vi.useFakeTimers();
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockRejectedValueOnce(new TypeError("网络连接失败"))
    .mockResolvedValueOnce(response({ data: { audio: "00ff10" } }));
  const provider = createMinimaxInstance(
    fetch,
    { apiKey: "test" },
    "speech-2.8-hd",
  );
  const pending = provider.synthesize({ text: "a", voiceId: "v" }, signal());
  const assertion = expect(pending).resolves.toEqual({
    audio: new Uint8Array([0, 255, 16]),
    mime: "audio/mpeg",
  });
  await vi.runAllTimersAsync();
  await assertion;
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("响应业务处理的 TypeError 不作为宿主网络错误重试", async () => {
  const invalidResponse = response({ data: { audio: "00ff10" } });
  vi.spyOn(invalidResponse, "json").mockRejectedValue(
    new TypeError("业务数据类型错误"),
  );
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(invalidResponse);
  const provider = createMinimaxInstance(
    fetch,
    { apiKey: "test" },
    "speech-2.8-hd",
  );
  await expect(
    provider.synthesize({ text: "a", voiceId: "v" }, signal()),
  ).rejects.toThrow("业务数据类型错误");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("宿主 fetch 的 AbortError 不进入网络重试", async () => {
  const controller = new AbortController();
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => {
    controller.abort();
    throw controller.signal.reason;
  });
  const provider = createMinimaxInstance(
    fetch,
    { apiKey: "test" },
    "speech-2.8-hd",
  );
  await expect(
    provider.synthesize({ text: "a", voiceId: "v" }, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(fetch).toHaveBeenCalledTimes(1);
});
