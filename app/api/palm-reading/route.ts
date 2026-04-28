import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_FOCUS_AREAS = new Set([
  "感情关系",
  "事业发展",
  "财富观念",
  "学业成长",
  "自我状态",
  "人际贵人"
]);
const DEFAULT_FOCUS_AREAS = ["自我状态", "事业发展"];

type PalmFeature = {
  label: string;
  fact: string;
  insight: string;
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
  observations: string[];
  palmFeatures: PalmFeature[];
  scores: PalmScores;
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

  const result: PalmReading = {
    summary: coerceString(source.summary),
    observations,
    palmFeatures,
    scores: {
      emotionalEnergy: coerceScore(scores.emotionalEnergy),
      actionPower: coerceScore(scores.actionPower),
      relationshipSensitivity: coerceScore(scores.relationshipSensitivity),
      stability: coerceScore(scores.stability),
      creativity: coerceScore(scores.creativity)
    },
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

  if (requiredStrings.some((value) => !value) || result.actionPlan.length === 0) {
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

  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.82,
      max_tokens: 2200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是一个温暖、细致、有边界感的中文娱乐向手相解析师。你必须先描述照片中可见的客观事实，再基于传统手相语境做自我启发式解读。你不能声称能确定预测命运、疾病、寿命、财富、婚姻结果或考试结果。你不能提供医学诊断、法律建议、投资建议。语气要真诚、具体、鼓励，情绪价值高，但不要恐吓、夸大或制造焦虑。只输出合法 JSON，不要输出 Markdown。"
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `请分析这张手掌照片。用户关注点：${focusAreas.join("、")}。

输出 JSON，字段必须完整：
{
  "summary": "一句话总体画像，温暖但不夸张",
  "observations": ["3-8 条照片中能看见的客观事实，不写推测"],
  "palmFeatures": [
    {"label": "掌型/生命线/智慧线/感情线/事业线/指型/掌丘等", "fact": "可见事实", "insight": "娱乐向启发"}
  ],
  "scores": {
    "emotionalEnergy": 0-100,
    "actionPower": 0-100,
    "relationshipSensitivity": 0-100,
    "stability": 0-100,
    "creativity": 0-100
  },
  "reading": {
    "personality": "性格底色",
    "relationships": "感情关系",
    "career": "事业发展",
    "wealthMindset": "财富观念，只能写消费/规划倾向，不能承诺发财",
    "currentState": "近期状态",
    "focus": "围绕用户关注点的专项解读"
  },
  "timeline": {
    "sevenDays": "未来 7 天行动建议",
    "thirtyDays": "未来 30 天行动建议",
    "ninetyDays": "未来 90 天行动建议"
  },
  "luckyTips": {
    "color": "幸运色",
    "action": "适合做的一件小事",
    "keyword": "提醒关键词"
  },
  "actionPlan": ["3 条具体可执行建议"],
  "comfort": "高情绪价值总结",
  "disclaimer": "仅供娱乐和自我反思，不代表科学判断、医学诊断、法律建议、财务建议或确定性预测。"
}

要求：observations 和 palmFeatures.fact 只能写照片可见事实；其他内容必须是娱乐向、自我启发式表达。`
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

  if (!response.ok) {
    return jsonError("模型服务暂时没有返回有效结果，请稍后重试。", 502);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    return jsonError("模型结果格式异常，请稍后重试。", 502);
  }

  try {
    return NextResponse.json(validateReading(extractJson(content)));
  } catch {
    return jsonError("模型结果解析失败，请换一张更清晰的照片重试。", 502);
  }
}
