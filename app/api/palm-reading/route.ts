import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type PalmReading = {
  observations: string[];
  reading: {
    personality: string;
    relationships: string;
    career: string;
    energy: string;
    advice: string;
  };
  comfort: string;
  disclaimer: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function extractJson(raw: string): PalmReading {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Model response did not contain JSON.");
  }

  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as PalmReading;
}

function validateReading(reading: PalmReading): PalmReading {
  if (!Array.isArray(reading.observations) || reading.observations.length === 0) {
    throw new Error("Missing observations.");
  }

  const requiredReadingKeys: Array<keyof PalmReading["reading"]> = [
    "personality",
    "relationships",
    "career",
    "energy",
    "advice"
  ];

  for (const key of requiredReadingKeys) {
    if (typeof reading.reading?.[key] !== "string" || !reading.reading[key].trim()) {
      throw new Error(`Missing reading.${key}.`);
    }
  }

  if (typeof reading.comfort !== "string" || !reading.comfort.trim()) {
    throw new Error("Missing comfort.");
  }

  return {
    observations: reading.observations.slice(0, 8).map(String),
    reading: {
      personality: reading.reading.personality,
      relationships: reading.reading.relationships,
      career: reading.reading.career,
      energy: reading.reading.energy,
      advice: reading.reading.advice
    },
    comfort: reading.comfort,
    disclaimer:
      reading.disclaimer ||
      "本解析仅供娱乐和自我反思，不代表科学判断、医学诊断或确定性预测。"
  };
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
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是一个温暖、细致、有边界感的中文娱乐向手相解析师。你可以观察用户上传的手掌照片中可见的客观视觉特征，再基于传统手相语境做自我启发式解读。不得声称能确定预测命运、疾病、财富或婚姻结果。不得做医学诊断、法律建议、财务建议。语气要真诚、具体、鼓励，情绪价值高，但不要夸张恐吓。只输出合法 JSON。"
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "请分析这张手掌照片。输出 JSON，字段必须为：observations 字符串数组；reading 对象，包含 personality、relationships、career、energy、advice 五个字符串；comfort 字符串；disclaimer 字符串。observations 只写照片中能看见的事实，reading 和 comfort 写娱乐向、温暖陪伴式解读。"
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
