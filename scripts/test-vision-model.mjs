import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_IMAGE = "cdfa158371199b270dbb00bf9f28092d.png";
const TIMEOUT_MS = Number(process.env.MODEL_TEST_TIMEOUT_MS ?? 45000);

function loadDotenv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalIndex = trimmed.indexOf("=");
    if (equalIndex === -1) continue;

    const key = trimmed.slice(0, equalIndex).trim();
    const rawValue = trimmed.slice(equalIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function detectMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  throw new Error(`不支持的图片格式：${ext || "无扩展名"}。仅支持 jpg/png/webp。`);
}

async function fetchWithTimeout(url, init, timeoutMs) {
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

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] ?? "";
}

async function main() {
  const cwd = process.cwd();
  loadDotenv(path.join(cwd, ".env"));

  const baseUrl = process.env.OPENAI_COMPAT_BASE_URL;
  const apiKey = process.env.OPENAI_COMPAT_API_KEY;
  const model = process.env.OPENAI_COMPAT_MODEL;
  const imageArg = getArgValue("--image") || process.argv[2] || DEFAULT_IMAGE;
  const imagePath = path.resolve(cwd, imageArg);

  if (!baseUrl || !apiKey || !model) {
    throw new Error("环境变量不完整，请检查 OPENAI_COMPAT_BASE_URL、OPENAI_COMPAT_API_KEY、OPENAI_COMPAT_MODEL。");
  }

  if (!fs.existsSync(imagePath)) {
    throw new Error(`找不到测试图片：${imagePath}`);
  }

  const mimeType = detectMimeType(imagePath);
  const buffer = fs.readFileSync(imagePath);
  const imageDataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const startedAt = Date.now();

  console.log("Vision model test started");
  console.log(`Endpoint: ${url}`);
  console.log(`Model: ${model}`);
  console.log(`Image: ${imagePath}`);
  console.log(`Image size: ${buffer.length} bytes`);
  console.log(`Timeout: ${TIMEOUT_MS} ms`);

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "你是一个视觉模型连通性测试助手。只输出合法 JSON。"
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  '请判断这张图片是否成功被你看到。输出 JSON：{"seen":true,"description":"一句中文描述","image_type":"图片类型或内容类别"}'
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
    },
    TIMEOUT_MS
  );

  const durationMs = Date.now() - startedAt;
  const text = await response.text();

  console.log(`HTTP status: ${response.status} ${response.statusText}`);
  console.log(`Duration: ${durationMs} ms`);

  if (!response.ok) {
    console.error("Raw response:");
    console.error(text.slice(0, 2000));
    process.exit(1);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    console.error("响应不是合法 JSON：");
    console.error(text.slice(0, 2000));
    process.exit(1);
  }

  const content = payload?.choices?.[0]?.message?.content;
  console.log("Model content:");
  console.log(content ?? "(empty)");

  if (typeof content !== "string" || !content.trim()) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Vision model test failed");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
