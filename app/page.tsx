"use client";

import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";

type PalmFeature = {
  label: string;
  fact: string;
  insight: string;
};

type PalmReading = {
  summary: string;
  observations: string[];
  palmFeatures: PalmFeature[];
  scores: {
    emotionalEnergy: number;
    actionPower: number;
    relationshipSensitivity: number;
    stability: number;
    creativity: number;
  };
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

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FOCUS_AREAS = 3;

const focusOptions = ["感情关系", "事业发展", "财富观念", "学业成长", "自我状态", "人际贵人"];

const scoreSections: Array<{
  key: keyof PalmReading["scores"];
  title: string;
}> = [
  { key: "emotionalEnergy", title: "情绪能量" },
  { key: "actionPower", title: "行动力" },
  { key: "relationshipSensitivity", title: "关系敏感度" },
  { key: "stability", title: "稳定度" },
  { key: "creativity", title: "创造力" }
];

const readingSections: Array<{
  key: keyof PalmReading["reading"];
  title: string;
  eyebrow: string;
}> = [
  { key: "personality", title: "性格底色", eyebrow: "你稳定发光的方式" },
  { key: "relationships", title: "感情关系", eyebrow: "亲密与边界" },
  { key: "career", title: "事业发展", eyebrow: "发力节奏" },
  { key: "wealthMindset", title: "财富观念", eyebrow: "选择与规划" },
  { key: "currentState", title: "近期状态", eyebrow: "当下能量" },
  { key: "focus", title: "关注点专项", eyebrow: "为你多看一眼" }
];

const timelineSections: Array<{
  key: keyof PalmReading["timeline"];
  title: string;
}> = [
  { key: "sevenDays", title: "7 天" },
  { key: "thirtyDays", title: "30 天" },
  { key: "ninetyDays", title: "90 天" }
];

function formatReportAsText(reading: PalmReading) {
  const scoreText = scoreSections
    .map((section) => `${section.title}：${reading.scores[section.key]}/100`)
    .join("\n");
  const features = reading.palmFeatures
    .map((feature) => `【${feature.label}】\n事实：${feature.fact}\n启发：${feature.insight}`)
    .join("\n\n");
  const readings = readingSections
    .map((section) => `【${section.title}】\n${reading.reading[section.key]}`)
    .join("\n\n");
  const timeline = timelineSections
    .map((section) => `${section.title}：${reading.timeline[section.key]}`)
    .join("\n");

  return [
    "掌心小读｜掌心报告",
    "",
    reading.summary,
    "",
    "幸运提示",
    `幸运色：${reading.luckyTips.color}`,
    `适合行动：${reading.luckyTips.action}`,
    `提醒关键词：${reading.luckyTips.keyword}`,
    "",
    "我从照片里看到的事实",
    ...reading.observations.map((item, index) => `${index + 1}. ${item}`),
    "",
    "娱乐向能量评分",
    scoreText,
    "",
    "掌纹细项",
    features,
    "",
    "详细解读",
    readings,
    "",
    "接下来的节奏",
    timeline,
    "",
    "行动清单",
    ...reading.actionPlan.map((item, index) => `${index + 1}. ${item}`),
    "",
    "给你的温暖提醒",
    reading.comfort,
    "",
    reading.disclaimer
  ].join("\n");
}

function formatShareText(reading: PalmReading) {
  return [
    "我的掌心小读报告",
    reading.summary,
    `关键词：${reading.luckyTips.keyword}`,
    `适合行动：${reading.luckyTips.action}`,
    reading.disclaimer
  ].join("\n");
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [focusAreas, setFocusAreas] = useState<string[]>(["自我状态", "事业发展"]);
  const [reading, setReading] = useState<PalmReading | null>(null);
  const [error, setError] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const fileHint = useMemo(() => {
    if (!file) return "JPG、PNG、WebP，最大 8MB";
    return `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)}MB`;
  }, [file]);

  const selectedFocusText = focusAreas.length ? focusAreas.join("、") : "未选择";

  function setSelectedFile(nextFile: File | null) {
    setError("");
    setReading(null);
    setExportStatus("");

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    if (!nextFile) {
      setFile(null);
      setPreviewUrl("");
      return;
    }

    if (!SUPPORTED_TYPES.includes(nextFile.type)) {
      setFile(null);
      setPreviewUrl("");
      setError("请上传 JPG、PNG 或 WebP 格式的手掌照片。");
      return;
    }

    if (nextFile.size > MAX_FILE_SIZE) {
      setFile(null);
      setPreviewUrl("");
      setError("图片不能超过 8MB。");
      return;
    }

    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
  }

  function toggleFocusArea(option: string) {
    setError("");

    if (focusAreas.includes(option)) {
      setFocusAreas((current) => current.filter((item) => item !== option));
      return;
    }

    if (focusAreas.length >= MAX_FOCUS_AREAS) {
      setError(`最多选择 ${MAX_FOCUS_AREAS} 个关注点。`);
      return;
    }

    setFocusAreas((current) => [...current, option]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError("先上传一张清晰的手掌照片。");
      return;
    }

    setIsLoading(true);
    setError("");
    setReading(null);
    setExportStatus("");

    const body = new FormData();
    body.append("image", file);
    body.append("focusAreas", JSON.stringify(focusAreas));

    try {
      const response = await fetch("/api/palm-reading", {
        method: "POST",
        body
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error ?? "解析失败，请稍后重试。");
      }

      setReading(payload as PalmReading);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "解析失败，请稍后重试。");
    } finally {
      setIsLoading(false);
    }
  }

  function exportTxt() {
    if (!reading) return;
    downloadTextFile("掌心小读-分析报告.txt", formatReportAsText(reading), "text/plain;charset=utf-8");
    setExportStatus("TXT 报告已导出。");
  }

  function exportJson() {
    if (!reading) return;
    downloadTextFile(
      "掌心小读-分析报告.json",
      JSON.stringify(reading, null, 2),
      "application/json;charset=utf-8"
    );
    setExportStatus("JSON 数据已导出。");
  }

  async function copySummary() {
    if (!reading) return;

    try {
      await navigator.clipboard.writeText(formatShareText(reading));
      setExportStatus("分享摘要已复制。");
    } catch {
      setExportStatus("复制失败，请手动选择报告内容复制。");
    }
  }

  async function nativeShare() {
    if (!reading) return;
    const text = formatShareText(reading);

    if (!navigator.share) {
      await copySummary();
      return;
    }

    try {
      await navigator.share({
        title: "掌心小读报告",
        text
      });
      setExportStatus("已打开系统分享。");
    } catch {
      setExportStatus("分享已取消或暂不可用。");
    }
  }

  function printReport() {
    if (!reading) return;
    setExportStatus("正在打开打印窗口，可选择“另存为 PDF”。");
    window.setTimeout(() => window.print(), 80);
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="heroCopy">
          <p className="kicker">掌心小读</p>
          <h1>把掌心交给光，也把一点温柔留给自己。</h1>
          <p className="intro">
            上传一张清晰手掌照，选择你当下最在意的方向。后台会调用支持视觉输入的 OpenAI
            兼容模型，生成一份包含事实观察、掌纹细项、能量评分和行动建议的娱乐向报告。
          </p>
          <div className="heroStats" aria-label="产品能力">
            <span>客观观察</span>
            <span>关注点定制</span>
            <span>行动建议</span>
          </div>
        </div>

        <form className="uploadPanel" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            accept="image/jpeg,image/png,image/webp"
            className="srOnly"
            name="image"
            onChange={handleFileChange}
            type="file"
          />

          <button
            className={`dropZone ${previewUrl ? "hasImage" : ""}`}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="上传的手掌照片预览" src={previewUrl} />
            ) : (
              <span>
                <strong>选择手掌照片</strong>
                <small>手掌摊开、光线充足、掌纹清晰</small>
              </span>
            )}
          </button>

          <div className="uploadMeta">
            <span>{fileHint}</span>
            {file ? (
              <button onClick={() => setSelectedFile(null)} type="button">
                重新选择
              </button>
            ) : null}
          </div>

          <fieldset className="focusPicker">
            <legend>这次想重点看看什么？</legend>
            <div>
              {focusOptions.map((option) => {
                const selected = focusAreas.includes(option);
                return (
                  <button
                    aria-pressed={selected}
                    className={selected ? "selected" : ""}
                    key={option}
                    onClick={() => toggleFocusArea(option)}
                    type="button"
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            <p>已选择：{selectedFocusText}</p>
          </fieldset>

          <button className="primaryButton" disabled={!file || isLoading} type="submit">
            {isLoading ? "正在生成完整报告..." : "开始解析"}
          </button>

          {error ? <p className="error">{error}</p> : null}
        </form>
      </section>

      <section className="guide">
        <div>
          <span>01</span>
          <p>只拍一只手，尽量让掌心完整进入画面。</p>
        </div>
        <div>
          <span>02</span>
          <p>避免强反光和过度美颜，掌纹越清楚越好。</p>
        </div>
        <div>
          <span>03</span>
          <p>结果只做娱乐和自我反思，不替代专业建议。</p>
        </div>
      </section>

      {reading ? (
        <section className="result" aria-live="polite">
          <div className="resultHeader">
            <p className="kicker">掌心报告</p>
            <h2>{reading.summary}</h2>
          </div>

          <div className="exportBar">
            <div>
              <strong>分享与导出</strong>
              <span>支持 TXT、JSON、打印另存 PDF、复制摘要和系统分享。</span>
            </div>
            <div className="exportActions">
              <button onClick={exportTxt} type="button">
                导出 TXT
              </button>
              <button onClick={exportJson} type="button">
                导出 JSON
              </button>
              <button onClick={printReport} type="button">
                打印/PDF
              </button>
              <button onClick={copySummary} type="button">
                复制摘要
              </button>
              <button onClick={nativeShare} type="button">
                系统分享
              </button>
            </div>
            {exportStatus ? <p>{exportStatus}</p> : null}
          </div>

          <div className="reportBand">
            <div>
              <p>幸运色</p>
              <strong>{reading.luckyTips.color}</strong>
            </div>
            <div>
              <p>适合行动</p>
              <strong>{reading.luckyTips.action}</strong>
            </div>
            <div>
              <p>提醒关键词</p>
              <strong>{reading.luckyTips.keyword}</strong>
            </div>
          </div>

          <div className="facts">
            <h3>我从照片里看到的事实</h3>
            <ul>
              {reading.observations.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="scorePanel">
            <h3>娱乐向能量评分</h3>
            <div>
              {scoreSections.map((section) => {
                const score = reading.scores[section.key];
                return (
                  <article key={section.key}>
                    <span>{section.title}</span>
                    <div className="meter" aria-label={`${section.title} ${score} 分`}>
                      <i style={{ width: `${score}%` }} />
                    </div>
                    <strong>{score}</strong>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="featureGrid">
            {reading.palmFeatures.map((feature) => (
              <article key={`${feature.label}-${feature.fact}`}>
                <p>{feature.label}</p>
                <h3>{feature.fact}</h3>
                <span>{feature.insight}</span>
              </article>
            ))}
          </div>

          <div className="readingGrid">
            {readingSections.map((section) => (
              <article key={section.key}>
                <p>{section.eyebrow}</p>
                <h3>{section.title}</h3>
                <span>{reading.reading[section.key]}</span>
              </article>
            ))}
          </div>

          <div className="timeline">
            <h3>接下来的节奏</h3>
            <div>
              {timelineSections.map((section) => (
                <article key={section.key}>
                  <strong>{section.title}</strong>
                  <p>{reading.timeline[section.key]}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="actionPlan">
            <h3>把好运落到行动里</h3>
            <ol>
              {reading.actionPlan.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ol>
          </div>

          <blockquote>{reading.comfort}</blockquote>
          <p className="disclaimer">{reading.disclaimer}</p>
        </section>
      ) : null}
    </main>
  );
}
