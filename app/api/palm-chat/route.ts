import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_QUESTION_LENGTH = 240;
const MODEL_TIMEOUT_MS = 30000;

function logPalmChat(event: string, detail: Record<string, unknown>) {
  console.info(
    JSON.stringify({
      scope: "palm-chat",
      event,
      at: new Date().toISOString(),
      ...detail
    })
  );
}

type PalmChatResponse = {
  answer: string;
  tips: string[];
  disclaimer: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function coerceString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Model response did not contain JSON.");
  }

  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchModel(url: string, init: RequestInit) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const startedAt = Date.now();
    try {
      const response = await fetchWithTimeout(url, init, MODEL_TIMEOUT_MS);
      logPalmChat("model_attempt", {
        attempt: attempt + 1,
        status: response.status,
        ok: response.ok,
        durationMs: Date.now() - startedAt
      });
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }
      lastError = new Error(`Model returned ${response.status}.`);
    } catch (error) {
      logPalmChat("model_attempt_error", {
        attempt: attempt + 1,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error)
      });
      lastError = error;
    }
  }

  throw lastError;
}

function validateChatResponse(input: unknown): PalmChatResponse {
  const source = input as Partial<PalmChatResponse>;
  const answer = coerceString(source.answer);
  const tips = Array.isArray(source.tips)
    ? source.tips.map((tip) => coerceString(tip)).filter(Boolean).slice(0, 3)
    : [];

  if (!answer || tips.length === 0) {
    throw new Error("Incomplete chat response.");
  }

  return {
    answer,
    tips,
    disclaimer:
      coerceString(source.disclaimer) ||
      "本回答仅供娱乐和自我反思，不代表科学判断、医学诊断、法律建议、财务建议或确定性预测。"
  };
}

export async function POST(request: Request) {
  const baseUrl = process.env.OPENAI_COMPAT_BASE_URL;
  const apiKey = process.env.OPENAI_COMPAT_API_KEY;
  const model = process.env.OPENAI_COMPAT_MODEL;

  if (!baseUrl || !apiKey || !model) {
    return jsonError("服务端模型配置不完整，请检查环境变量。", 500);
  }

  const body = await request.json().catch(() => null);
  const question = coerceString(body?.question).slice(0, MAX_QUESTION_LENGTH);
  const report = body?.report;
  const focusAreas = Array.isArray(body?.focusAreas)
    ? body.focusAreas.map((item: unknown) => coerceString(item)).filter(Boolean).slice(0, 3)
    : [];
  const handPreference = coerceString(body?.handPreference, "不确定");
  const currentSituation = coerceString(body?.currentSituation, "探索方向");
  const readingStyle = coerceString(body?.readingStyle, "温柔鼓励");

  if (!question) {
    return jsonError("请输入想追问的问题。", 400);
  }

  if (!report || typeof report !== "object") {
    return jsonError("缺少当前掌心报告，无法继续追问。", 400);
  }

  logPalmChat("request_received", {
    questionLength: question.length,
    focusAreas,
    handPreference,
    currentSituation,
    readingStyle
  });

  let response: Response;

  try {
    response = await fetchModel(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.76,
        max_tokens: 900,
        response_format: { type: "json_object" },
        enable_thinking: false,
        extra_body: { enable_thinking: false },
        messages: [
          {
            role: "system",
            content:
              "你是掌心小读的追问助手。你只能基于用户已有的娱乐向手相报告回答，不要声称能重新看图或确定预测命运。禁止医学诊断、法律建议、投资建议、寿命/疾病/婚姻/财富确定性断言。语气温暖、具体、可执行。只输出合法 JSON。"
          },
          {
            role: "user",
            content: `用户关注点：${focusAreas.join("、") || "未选择"}
用户选择的手：${handPreference}
用户当前状态：${currentSituation}
用户喜欢的解析风格：${readingStyle}

当前报告 JSON：
${JSON.stringify(report)}

用户追问：
${question}

请输出 JSON：
{
  "answer": "围绕问题的温暖回答，基于报告内容，不超过 450 字",
  "tips": ["1-3 条具体可执行小建议"],
  "disclaimer": "本回答仅供娱乐和自我反思，不代表科学判断、医学诊断、法律建议、财务建议或确定性预测。"
}`
          }
        ]
      })
    });
  } catch (error) {
    logPalmChat("model_request_failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    return jsonError("追问模型连接超时或网络不稳定，请稍后重试。", 504);
  }

  if (!response.ok) {
    logPalmChat("model_bad_status", {
      status: response.status,
      statusText: response.statusText
    });
    return jsonError("追问服务暂时没有返回有效结果，请稍后重试。", 502);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    logPalmChat("model_missing_content", {
      choiceCount: Array.isArray(payload?.choices) ? payload.choices.length : 0
    });
    return jsonError("追问结果格式异常，请稍后重试。", 502);
  }

  try {
    const validated = validateChatResponse(extractJson(content));
    logPalmChat("request_succeeded", {
      answerLength: validated.answer.length,
      tipCount: validated.tips.length
    });
    return NextResponse.json(validated);
  } catch (error) {
    logPalmChat("model_parse_failed", {
      error: error instanceof Error ? error.message : String(error),
      contentPreview: content.slice(0, 240)
    });
    return jsonError("追问结果解析失败，请换个问法再试。", 502);
  }
}
