import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MODEL_TIMEOUT_MS = 45000;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_FOCUS_AREAS = new Set([
  "感情关系",
  "事业发展",
  "财富观念",
  "学业成长",
  "自我状态",
  "人际贵人"
]);
const ALLOWED_HANDS = new Set(["左手", "右手", "不确定"]);
const ALLOWED_SITUATIONS = new Set(["工作中", "学生", "创业", "情感困惑", "低能量期", "探索方向"]);
const ALLOWED_STYLES = new Set(["温柔鼓励", "直接清醒", "玄学沉浸", "理性分析"]);
const DEFAULT_FOCUS_AREAS = ["自我状态", "事业发展"];

function logPalmReading(event: string, detail: Record<string, unknown>) {
  console.info(
    JSON.stringify({
      scope: "palm-reading",
      event,
      at: new Date().toISOString(),
      ...detail
    })
  );
}

type PalmFeature = {
  label: string;
  fact: string;
  insight: string;
};

type RadarItem = {
  label: string;
  score: number;
  note: string;
};

type WeeklyPlanItem = {
  day: string;
  task: string;
};

type PalmScores = {
  emotionalEnergy: number;
  actionPower: number;
  relationshipSensitivity: number;
  stability: number;
  creativity: number;
};

type PalmReading = {
  summary: string;
  keywords: string[];
  dailyQuote: string;
  observations: string[];
  palmFeatures: PalmFeature[];
  scores: PalmScores;
  strengthRadar: RadarItem[];
  avoidPitfalls: string[];
  reading: {
    personality: string;
    relationships: string;
    career: string;
    wealthMindset: string;
    currentState: string;
    focus: string;
  };
  timeline: {
    sevenDays: string;
    thirtyDays: string;
    ninetyDays: string;
  };
  weeklyPlan: WeeklyPlanItem[];
  luckyTips: {
    color: string;
    action: string;
    keyword: string;
  };
  actionPlan: string[];
  comfort: string;
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

function coerceAllowed(value: unknown, allowed: Set<string>, fallback: string) {
  const text = coerceString(value);
  return allowed.has(text) ? text : fallback;
}

function coerceStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => coerceString(item))
    .filter(Boolean)
    .slice(0, limit);
}

function coerceScore(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 66;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function parseFocusAreas(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string") return DEFAULT_FOCUS_AREAS;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_FOCUS_AREAS;

    const focusAreas = parsed
      .map((item) => coerceString(item))
      .filter((item) => ALLOWED_FOCUS_AREAS.has(item))
      .slice(0, 3);

    return focusAreas.length ? focusAreas : DEFAULT_FOCUS_AREAS;
  } catch {
    return DEFAULT_FOCUS_AREAS;
  }
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
      logPalmReading("model_attempt", {
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
      logPalmReading("model_attempt_error", {
        attempt: attempt + 1,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error)
      });
      lastError = error;
    }
  }

  throw lastError;
}

function validateReading(input: unknown): PalmReading {
  const source = input as Partial<PalmReading>;
  const reading = source.reading ?? ({} as PalmReading["reading"]);
  const timeline = source.timeline ?? ({} as PalmReading["timeline"]);
  const luckyTips = source.luckyTips ?? ({} as PalmReading["luckyTips"]);
  const scores = source.scores ?? ({} as PalmScores);

  const observations = coerceStringArray(source.observations, 8);
  if (observations.length === 0) {
    throw new Error("Missing observations.");
  }

  const palmFeatures = Array.isArray(source.palmFeatures)
    ? source.palmFeatures
        .map((feature) => {
          const typed = feature as Partial<PalmFeature>;
          return {
            label: coerceString(typed.label),
            fact: coerceString(typed.fact),
            insight: coerceString(typed.insight)
          };
        })
        .filter((feature) => feature.label && feature.fact && feature.insight)
        .slice(0, 6)
    : [];

  if (palmFeatures.length === 0) {
    throw new Error("Missing palm features.");
  }

  const strengthRadar = Array.isArray(source.strengthRadar)
    ? source.strengthRadar
        .map((item) => {
          const typed = item as Partial<RadarItem>;
          return {
            label: coerceString(typed.label),
            score: coerceScore(typed.score),
            note: coerceString(typed.note)
          };
        })
        .filter((item) => item.label && item.note)
        .slice(0, 5)
    : [];

  const weeklyPlan = Array.isArray(source.weeklyPlan)
    ? source.weeklyPlan
        .map((item) => {
          const typed = item as Partial<WeeklyPlanItem>;
          return {
            day: coerceString(typed.day),
            task: coerceString(typed.task)
          };
        })
        .filter((item) => item.day && item.task)
        .slice(0, 7)
    : [];

  const result: PalmReading = {
    summary: coerceString(source.summary),
    keywords: coerceStringArray(source.keywords, 5),
    dailyQuote: coerceString(source.dailyQuote),
    observations,
    palmFeatures,
    scores: {
      emotionalEnergy: coerceScore(scores.emotionalEnergy),
      actionPower: coerceScore(scores.actionPower),
      relationshipSensitivity: coerceScore(scores.relationshipSensitivity),
      stability: coerceScore(scores.stability),
      creativity: coerceScore(scores.creativity)
    },
    strengthRadar,
    avoidPitfalls: coerceStringArray(source.avoidPitfalls, 4),
    reading: {
      personality: coerceString(reading.personality),
      relationships: coerceString(reading.relationships),
      career: coerceString(reading.career),
      wealthMindset: coerceString(reading.wealthMindset),
      currentState: coerceString(reading.currentState),
      focus: coerceString(reading.focus)
    },
    timeline: {
      sevenDays: coerceString(timeline.sevenDays),
      thirtyDays: coerceString(timeline.thirtyDays),
      ninetyDays: coerceString(timeline.ninetyDays)
    },
    weeklyPlan,
    luckyTips: {
      color: coerceString(luckyTips.color),
      action: coerceString(luckyTips.action),
      keyword: coerceString(luckyTips.keyword)
    },
    actionPlan: coerceStringArray(source.actionPlan, 3),
    comfort: coerceString(source.comfort),
    disclaimer:
      coerceString(source.disclaimer) ||
      "本解析仅供娱乐和自我反思，不代表科学判断、医学诊断、法律建议、财务建议或确定性预测。"
  };

  const requiredStrings = [
    result.summary,
    result.dailyQuote,
    result.reading.personality,
    result.reading.relationships,
    result.reading.career,
    result.reading.wealthMindset,
    result.reading.currentState,
    result.reading.focus,
    result.timeline.sevenDays,
    result.timeline.thirtyDays,
    result.timeline.ninetyDays,
    result.luckyTips.color,
    result.luckyTips.action,
    result.luckyTips.keyword,
    result.comfort
  ];

  if (
    requiredStrings.some((value) => !value) ||
    result.keywords.length === 0 ||
    result.strengthRadar.length === 0 ||
    result.avoidPitfalls.length === 0 ||
    result.weeklyPlan.length === 0 ||
    result.actionPlan.length === 0
  ) {
    throw new Error("Incomplete reading.");
  }

  return result;
}

export async function POST(request: Request) {
  const baseUrl = process.env.OPENAI_COMPAT_BASE_URL;
  const apiKey = process.env.OPENAI_COMPAT_API_KEY;
  const model = process.env.OPENAI_COMPAT_MODEL;

  if (!baseUrl || !apiKey || !model) {
    return jsonError("服务端模型配置不完整，请检查环境变量。", 500);
  }

  const formData = await request.formData();
  const file = formData.get("image");
  const focusAreas = parseFocusAreas(formData.get("focusAreas"));
  const handPreference = coerceAllowed(formData.get("handPreference"), ALLOWED_HANDS, "不确定");
  const currentSituation = coerceAllowed(formData.get("currentSituation"), ALLOWED_SITUATIONS, "探索方向");
  const readingStyle = coerceAllowed(formData.get("readingStyle"), ALLOWED_STYLES, "温柔鼓励");

  logPalmReading("request_received", {
    focusAreas,
    handPreference,
    currentSituation,
    readingStyle,
    fileType: file instanceof File ? file.type : "missing",
    fileSize: file instanceof File ? file.size : 0
  });

  if (!(file instanceof File)) {
    return jsonError("请上传一张手掌照片。", 400);
  }

  if (!SUPPORTED_TYPES.has(file.type)) {
    return jsonError("仅支持 JPG、PNG 或 WebP 图片。", 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return jsonError("图片不能超过 8MB。", 413);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const imageDataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;

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
        temperature: readingStyle === "理性分析" ? 0.62 : 0.82,
        max_tokens: 2200,
        response_format: { type: "json_object" },
        enable_thinking: false,
        extra_body: { enable_thinking: false },
        messages: [
          {
            role: "system",
            content:
              "你是温暖、细致、有边界感的中文娱乐向手相解析师。先写照片可见事实，再做自我启发式解读。禁止确定预测命运、疾病、寿命、财富、婚姻、考试结果；禁止医学、法律、投资建议。回答必须简洁，所有字段控制在 1-3 句内。只输出合法 JSON，不要 Markdown。"
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `请分析这张手掌照片。
用户关注点：${focusAreas.join("、")}
用户选择的手：${handPreference}
用户当前状态：${currentSituation}
用户喜欢的解析风格：${readingStyle}

输出 JSON，字段必须完整：
{
  "summary": "一句话总体画像，温暖但不夸张",
  "keywords": ["3-5 个核心关键词"],
  "dailyQuote": "今日一句话签文，20字内，不要神化，不要恐吓",
  "observations": ["3-8 条照片中能看见的客观事实，不写推测"],
  "palmFeatures": [
    {"label": "掌型/生命线/智慧线/感情线/事业线/指型/掌丘等", "fact": "可见事实，30字内", "insight": "娱乐向启发，50字内"}
  ],
  "scores": {
    "emotionalEnergy": 0-100,
    "actionPower": 0-100,
    "relationshipSensitivity": 0-100,
    "stability": 0-100,
    "creativity": 0-100
  },
  "strengthRadar": [
    {"label": "优势名称", "score": 0-100, "note": "一句解释，40字内"}
  ],
  "avoidPitfalls": ["2-4 条近期需要避开的坑，每条40字内"],
  "reading": {
    "personality": "性格底色",
    "relationships": "感情关系",
    "career": "事业发展",
    "wealthMindset": "财富观念，只能写消费/规划倾向，不能承诺发财",
    "currentState": "结合用户当前状态的近期状态",
    "focus": "围绕用户关注点的专项解读"
  },
  "timeline": {
    "sevenDays": "未来 7 天行动建议，60字内",
    "thirtyDays": "未来 30 天行动建议，60字内",
    "ninetyDays": "未来 90 天行动建议，60字内"
  },
  "weeklyPlan": [
    {"day": "周一", "task": "当天一条很小、可执行的任务，30字内"}
  ],
  "luckyTips": {
    "color": "幸运色",
    "action": "适合做的一件小事",
    "keyword": "提醒关键词"
  },
  "actionPlan": ["3 条具体可执行建议，每条50字内"],
  "comfort": "高情绪价值总结，120字内",
  "disclaimer": "仅供娱乐和自我反思，不代表科学判断、医学诊断、法律建议、财务建议或确定性预测。"
}

要求：observations 和 palmFeatures.fact 只能写照片可见事实；其他内容必须是娱乐向、自我启发式表达。根据解析风格调整语气，但始终保持边界。`
              },
              {
                type: "image_url",
                image_url: {
                  url: imageDataUrl
                }
              }
            ]
          }
        ]
      })
    });
  } catch (error) {
    logPalmReading("model_request_failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    return jsonError("模型连接超时或网络不稳定，请稍后重试。", 504);
  }

  if (!response.ok) {
    logPalmReading("model_bad_status", {
      status: response.status,
      statusText: response.statusText
    });
    return jsonError("模型服务暂时没有返回有效结果，请稍后重试。", 502);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    logPalmReading("model_missing_content", {
      choiceCount: Array.isArray(payload?.choices) ? payload.choices.length : 0
    });
    return jsonError("模型结果格式异常，请稍后重试。", 502);
  }

  try {
    const validated = validateReading(extractJson(content));
    logPalmReading("request_succeeded", {
      keywordCount: validated.keywords.length,
      observationCount: validated.observations.length
    });
    return NextResponse.json(validated);
  } catch (error) {
    logPalmReading("model_parse_failed", {
      error: error instanceof Error ? error.message : String(error),
      contentPreview: content.slice(0, 240)
    });
    return jsonError("模型结果解析失败，请换一张更清晰的照片重试。", 502);
  }
}
