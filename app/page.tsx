"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";

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

type PalmReading = {
  summary: string;
  keywords?: string[];
  dailyQuote?: string;
  observations: string[];
  palmFeatures: PalmFeature[];
  scores: {
    emotionalEnergy: number;
    actionPower: number;
    relationshipSensitivity: number;
    stability: number;
    creativity: number;
  };
  strengthRadar?: RadarItem[];
  avoidPitfalls?: string[];
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
  weeklyPlan?: WeeklyPlanItem[];
  luckyTips: {
    color: string;
    action: string;
    keyword: string;
  };
  actionPlan: string[];
  comfort: string;
  disclaimer: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tips?: string[];
  createdAt: string;
};

type SavedReport = {
  id: string;
  createdAt: string;
  focusAreas: string[];
  handPreference?: string;
  currentSituation?: string;
  readingStyle?: string;
  reading: PalmReading;
  chatMessages: ChatMessage[];
};

type FailureKind = "none" | "network" | "model" | "parse" | "input";

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FOCUS_AREAS = 3;
const MAX_SAVED_REPORTS = 5;
const MAX_CHAT_MESSAGES = 20;
const STORAGE_KEY = "palm-reading-reports-v1";

const focusOptions = ["感情关系", "事业发展", "财富观念", "学业成长", "自我状态", "人际贵人"];
const handOptions = ["左手", "右手", "不确定"];
const situationOptions = ["工作中", "学生", "创业", "情感困惑", "低能量期", "探索方向"];
const styleOptions = ["温柔鼓励", "直接清醒", "玄学沉浸", "理性分析"];
const quickQuestions = [
  "这份报告里最该听进去的一句话是什么？",
  "最近感情关系上我该注意什么？",
  "事业上我适合主动一点吗？",
  "接下来 7 天最适合做哪件小事？"
];

const personalizationLabels = {
  handPreference: "手别",
  currentSituation: "当前状态",
  readingStyle: "解析风格"
};

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

function formatReportAsText(reading: PalmReading, chatMessages: ChatMessage[] = []) {
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
  const keywords = reading.keywords?.length ? reading.keywords.join("、") : "暂无";
  const radar =
    reading.strengthRadar
      ?.map((item) => `${item.label}：${item.score}/100，${item.note}`)
      .join("\n") || "暂无";
  const pitfalls = reading.avoidPitfalls?.map((item, index) => `${index + 1}. ${item}`) ?? [];
  const weeklyPlan = reading.weeklyPlan?.map((item) => `${item.day}：${item.task}`) ?? [];

  return [
    "掌心小读｜掌心报告",
    "",
    reading.summary,
    "",
    `核心关键词：${keywords}`,
    `今日签文：${reading.dailyQuote ?? "暂无"}`,
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
    "优势雷达",
    radar,
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
    "本周行动计划",
    ...weeklyPlan,
    "",
    "近期需要避开的坑",
    ...pitfalls,
    "",
    "行动清单",
    ...reading.actionPlan.map((item, index) => `${index + 1}. ${item}`),
    "",
    "给你的温暖提醒",
    reading.comfort,
    "",
    reading.disclaimer,
    "",
    ...formatChatMessages(chatMessages)
  ].join("\n");
}

function formatShareText(reading: PalmReading) {
  return [
    "我的掌心小读报告",
    reading.summary,
    reading.keywords?.length ? `关键词：${reading.keywords.join("、")}` : "",
    reading.dailyQuote ? `今日签文：${reading.dailyQuote}` : "",
    `关键词：${reading.luckyTips.keyword}`,
    `适合行动：${reading.luckyTips.action}`,
    reading.disclaimer
  ]
    .filter(Boolean)
    .join("\n");
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

function formatChatMessages(chatMessages: ChatMessage[]) {
  if (chatMessages.length === 0) return [];

  return [
    "追问记录",
    ...chatMessages.map((message) => {
      const prefix = message.role === "user" ? "我问" : "掌心小读答";
      const tips =
        message.tips && message.tips.length
          ? `\n建议：${message.tips.map((tip, index) => `${index + 1}. ${tip}`).join(" ")}`
          : "";
      return `【${prefix}】${message.content}${tips}`;
    })
  ];
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function classifyFailure(message: string): FailureKind {
  if (!message) return "none";
  if (message.includes("超时") || message.includes("网络")) return "network";
  if (message.includes("模型服务")) return "model";
  if (message.includes("解析失败") || message.includes("格式异常")) return "parse";
  return "input";
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const posterRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [focusAreas, setFocusAreas] = useState<string[]>(["自我状态", "事业发展"]);
  const [handPreference, setHandPreference] = useState("不确定");
  const [currentSituation, setCurrentSituation] = useState("探索方向");
  const [readingStyle, setReadingStyle] = useState("温柔鼓励");
  const [reading, setReading] = useState<PalmReading | null>(null);
  const [currentReportId, setCurrentReportId] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [error, setError] = useState("");
  const [failureKind, setFailureKind] = useState<FailureKind>("none");
  const [chatFailureKind, setChatFailureKind] = useState<FailureKind>("none");
  const [lastChatQuestion, setLastChatQuestion] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const fileHint = useMemo(() => {
    if (!file) return "JPG、PNG、WebP，最大 8MB";
    return `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)}MB`;
  }, [file]);

  const selectedFocusText = focusAreas.length ? focusAreas.join("、") : "未选择";

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedReport[];
      if (Array.isArray(parsed)) {
        setSavedReports(parsed.slice(0, MAX_SAVED_REPORTS));
      }
    } catch {
      setSavedReports([]);
    }
  }, []);

  function persistReports(nextReports: SavedReport[]) {
    const limited = nextReports.slice(0, MAX_SAVED_REPORTS);
    setSavedReports(limited);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
  }

  function saveReportSnapshot(
    nextReading: PalmReading,
    nextFocusAreas: string[],
    nextChatMessages: ChatMessage[],
    reportId = currentReportId || createId(),
    nextPersonalization = { handPreference, currentSituation, readingStyle }
  ) {
    const id = reportId;
    const savedReport: SavedReport = {
      id,
      createdAt: new Date().toISOString(),
      focusAreas: nextFocusAreas,
      handPreference: nextPersonalization.handPreference,
      currentSituation: nextPersonalization.currentSituation,
      readingStyle: nextPersonalization.readingStyle,
      reading: nextReading,
      chatMessages: nextChatMessages.slice(-MAX_CHAT_MESSAGES)
    };

    setCurrentReportId(id);
    persistReports([savedReport, ...savedReports.filter((item) => item.id !== id)]);
  }

  function setSelectedFile(nextFile: File | null) {
    setError("");
    setFailureKind("none");
    setReading(null);
    setExportStatus("");
    setCurrentReportId("");
    setChatMessages([]);
    setChatInput("");
    setChatError("");
    setChatFailureKind("none");

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
    setFailureKind("none");

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

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!file) {
      setError("先上传一张清晰的手掌照片。");
      setFailureKind("input");
      return;
    }

    setIsLoading(true);
    setError("");
    setFailureKind("none");
    setReading(null);
    setExportStatus("");
    setCurrentReportId("");
    setChatMessages([]);
    setChatInput("");
    setChatError("");

    const body = new FormData();
    body.append("image", file);
    body.append("focusAreas", JSON.stringify(focusAreas));
    body.append("handPreference", handPreference);
    body.append("currentSituation", currentSituation);
    body.append("readingStyle", readingStyle);

    try {
      const response = await fetch("/api/palm-reading", {
        method: "POST",
        body
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error ?? "解析失败，请稍后重试。");
      }

      const nextReading = payload as PalmReading;
      const nextReportId = createId();
      setReading(nextReading);
      saveReportSnapshot(nextReading, focusAreas, [], nextReportId, {
        handPreference,
        currentSituation,
        readingStyle
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "解析失败，请稍后重试。";
      setError(message);
      setFailureKind(classifyFailure(message));
    } finally {
      setIsLoading(false);
    }
  }

  function exportTxt() {
    if (!reading) return;
    downloadTextFile("掌心小读-分析报告.txt", formatReportAsText(reading, chatMessages), "text/plain;charset=utf-8");
    setExportStatus("TXT 报告已导出。");
  }

  function exportJson() {
    if (!reading) return;
    downloadTextFile(
      "掌心小读-分析报告.json",
      JSON.stringify({ reading, focusAreas, handPreference, currentSituation, readingStyle, chatMessages }, null, 2),
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

  async function exportPosterPng() {
    if (!posterRef.current) return;

    setExportStatus("正在生成海报 PNG...");

    try {
      const dataUrl = await toPng(posterRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#fbfaf8"
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = "掌心小读-报告海报.png";
      link.click();
      setExportStatus("海报 PNG 已导出。");
    } catch {
      setExportStatus("海报导出失败，请尝试打印/PDF。");
    }
  }

  async function submitChat(questionOverride?: string) {
    if (!reading || isChatLoading) return;

    const question = (questionOverride ?? chatInput).trim();
    if (!question) {
      setChatError("请输入想追问的问题。");
      setChatFailureKind("input");
      return;
    }

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: question,
      createdAt: new Date().toISOString()
    };
    const nextMessages = [...chatMessages, userMessage].slice(-MAX_CHAT_MESSAGES);

    setChatMessages(nextMessages);
    setChatInput("");
    setChatError("");
    setChatFailureKind("none");
    setLastChatQuestion(question);
    setIsChatLoading(true);

    try {
      const response = await fetch("/api/palm-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          report: reading,
          question,
          focusAreas,
          handPreference,
          currentSituation,
          readingStyle
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error ?? "追问失败，请稍后重试。");
      }

      const assistantMessage: ChatMessage = {
        id: createId(),
        role: "assistant",
        content: payload.answer,
        tips: Array.isArray(payload.tips) ? payload.tips : [],
        createdAt: new Date().toISOString()
      };
      const completedMessages = [...nextMessages, assistantMessage].slice(-MAX_CHAT_MESSAGES);
      setChatMessages(completedMessages);
      saveReportSnapshot(reading, focusAreas, completedMessages, currentReportId, {
        handPreference,
        currentSituation,
        readingStyle
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "追问失败，请稍后重试。";
      setChatMessages(chatMessages);
      setChatError(message);
      setChatFailureKind(classifyFailure(message));
    } finally {
      setIsChatLoading(false);
    }
  }

  function loadSavedReport(savedReport: SavedReport) {
    setReading(savedReport.reading);
    setCurrentReportId(savedReport.id);
    setFocusAreas(savedReport.focusAreas);
    setHandPreference(savedReport.handPreference ?? "不确定");
    setCurrentSituation(savedReport.currentSituation ?? "探索方向");
    setReadingStyle(savedReport.readingStyle ?? "温柔鼓励");
    setChatMessages(savedReport.chatMessages ?? []);
    setChatInput("");
    setChatError("");
    setChatFailureKind("none");
    setError("");
    setFailureKind("none");
    setExportStatus("已载入本地历史报告。");
  }

  function deleteSavedReport(id: string) {
    const nextReports = savedReports.filter((item) => item.id !== id);
    persistReports(nextReports);

    if (currentReportId === id) {
      setCurrentReportId("");
    }
  }

  function clearSavedReports() {
    persistReports([]);
    setExportStatus("本地历史报告已清空。");
  }

  function renderFailureTitle(kind: FailureKind) {
    if (kind === "network") return "模型连接超时";
    if (kind === "model") return "模型服务暂时不可用";
    if (kind === "parse") return "模型结果需要重试";
    return "操作没有完成";
  }

  function renderFailureHint(kind: FailureKind) {
    if (kind === "network") return "这通常是模型接口响应慢、网络波动或代理连接不稳定，不是照片本身的问题。";
    if (kind === "model") return "后台已经自动重试过一次，但模型服务仍没有返回可用结果。";
    if (kind === "parse") return "模型返回了不完整内容，重新生成通常可以恢复。";
    return "请检查输入内容后再试一次。";
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

          <div className="personalizationGrid">
            <label>
              <span>{personalizationLabels.handPreference}</span>
              <select value={handPreference} onChange={(event) => setHandPreference(event.target.value)}>
                {handOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{personalizationLabels.currentSituation}</span>
              <select value={currentSituation} onChange={(event) => setCurrentSituation(event.target.value)}>
                {situationOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{personalizationLabels.readingStyle}</span>
              <select value={readingStyle} onChange={(event) => setReadingStyle(event.target.value)}>
                {styleOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button className="primaryButton" disabled={!file || isLoading} type="submit">
            {isLoading ? "正在生成完整报告..." : "开始解析"}
          </button>

          {error && failureKind !== "input" ? (
            <div className="failurePanel">
              <div>
                <strong>{renderFailureTitle(failureKind)}</strong>
                <p>{error}</p>
                <span>{renderFailureHint(failureKind)}</span>
              </div>
              <div className="failureActions">
                <button disabled={!file || isLoading} onClick={() => handleSubmit()} type="button">
                  {isLoading ? "重试中..." : "重新解析"}
                </button>
                <button onClick={() => inputRef.current?.click()} type="button">
                  换张照片
                </button>
              </div>
              <small>后台已记录本次失败日志，可在本地日志或 Vercel Function Logs 中查看。</small>
            </div>
          ) : null}

          {error && failureKind === "input" ? <p className="error">{error}</p> : null}
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

      {savedReports.length ? (
        <section className="historyPanel">
          <div className="historyHeader">
            <div>
              <p className="kicker">本地历史</p>
              <h2>当前浏览器保存了 {savedReports.length} 份报告</h2>
              <span>仅保存在这台设备的浏览器里，不会上传到服务器。</span>
            </div>
            <button onClick={clearSavedReports} type="button">
              清空历史
            </button>
          </div>
          <div className="historyList">
            {savedReports.map((savedReport) => (
              <article key={savedReport.id}>
                <div>
                  <strong>{savedReport.reading.summary}</strong>
                  <span>
                    {formatDateTime(savedReport.createdAt)} · {savedReport.focusAreas.join("、")} ·{" "}
                    {savedReport.readingStyle ?? "温柔鼓励"} · {savedReport.chatMessages.length} 条追问
                  </span>
                </div>
                <div>
                  <button onClick={() => loadSavedReport(savedReport)} type="button">
                    查看
                  </button>
                  <button onClick={() => deleteSavedReport(savedReport.id)} type="button">
                    删除
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {reading ? (
        <section className="result" aria-live="polite">
          <div className="resultHeader">
            <p className="kicker">掌心报告</p>
            <h2>{reading.summary}</h2>
          </div>

          <div className="personalSummary">
            <span>{handPreference}</span>
            <span>{currentSituation}</span>
            <span>{readingStyle}</span>
          </div>

          {(reading.keywords?.length || reading.dailyQuote) ? (
            <div className="highlightPanel">
              <div>
                <p>核心关键词</p>
                <strong>{reading.keywords?.join("、") || reading.luckyTips.keyword}</strong>
              </div>
              <div>
                <p>今日一句话签文</p>
                <strong>{reading.dailyQuote ?? "把注意力收回到你能行动的一小步里。"}</strong>
              </div>
            </div>
          ) : null}

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
              <button onClick={exportPosterPng} type="button">
                导出海报
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

          <section className="posterSection">
            <div className="posterIntro">
              <p className="kicker">海报预览</p>
              <h3>掌相解读指南</h3>
              <span>按参考图风格生成的黑白极简报告海报，可导出 PNG 或打印保存。</span>
            </div>

            <div className="posterCanvas" ref={posterRef}>
              <div className="posterHero">
                <div>
                  <p className="posterEyebrow">✦ PALMISTRY GUIDE</p>
                  <h2>掌相解读指南</h2>
                  <span>探索你的天赋 · 性格 · 运势</span>
                </div>
                <div className="posterImage">
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="手掌海报图片" src={previewUrl} />
                  ) : (
                    <span>PALM PHOTO</span>
                  )}
                </div>
                <div className="posterBadges">
                  <span>理性与分析</span>
                  <span>行动与执行</span>
                  <span>创造与表达</span>
                  <span>人际与魅力</span>
                </div>
              </div>

              <div className="posterOverall">
                <p>整体印象</p>
                <strong>{reading.summary}</strong>
                <span>{reading.keywords?.join(" · ") || reading.luckyTips.keyword}</span>
              </div>

              <div className="posterLines">
                {reading.palmFeatures.slice(0, 4).map((feature, index) => (
                  <article key={`${feature.label}-${index}`}>
                    <div>
                      <b>{index + 1}</b>
                      <strong>{feature.label}</strong>
                      <span>{feature.fact}</span>
                    </div>
                    <p>{feature.insight}</p>
                  </article>
                ))}
              </div>

              <div className="posterDiagram">
                <div>
                  <p>主要掌纹图解</p>
                  {reading.palmFeatures.slice(0, 4).map((feature, index) => (
                    <span key={`${feature.label}-diagram`}>
                      <b>{index + 1}</b>
                      {feature.label}
                    </span>
                  ))}
                </div>
                <div className="handSketch" aria-hidden="true">
                  <i className="finger f1" />
                  <i className="finger f2" />
                  <i className="finger f3" />
                  <i className="finger f4" />
                  <i className="thumb" />
                  <i className="palm" />
                  <i className="line l1" />
                  <i className="line l2" />
                  <i className="line l3" />
                  <i className="dot d1">1</i>
                  <i className="dot d2">2</i>
                  <i className="dot d3">3</i>
                </div>
              </div>

              <div className="posterTextCards">
                <article>
                  <p>性格与天赋</p>
                  <span>{reading.reading.personality}</span>
                </article>
                <article>
                  <p>事业与财富</p>
                  <span>{reading.reading.career} {reading.reading.wealthMindset}</span>
                </article>
                <article>
                  <p>建议与指引</p>
                  <span>{reading.actionPlan.slice(0, 2).join(" ")}</span>
                </article>
              </div>

              <div className="posterFooter">
                <span>PALMISTRY · INSIGHTS · GUIDANCE</span>
                <strong>掌纹是先天的地图，而你，永远拥有改写未来的力量。</strong>
              </div>
            </div>
          </section>

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

          {reading.strengthRadar?.length ? (
            <div className="radarPanel">
              <h3>优势雷达</h3>
              <div>
                {reading.strengthRadar.map((item) => (
                  <article key={`${item.label}-${item.score}`}>
                    <span>{item.label}</span>
                    <div className="meter" aria-label={`${item.label} ${item.score} 分`}>
                      <i style={{ width: `${item.score}%` }} />
                    </div>
                    <strong>{item.score}</strong>
                    <p>{item.note}</p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

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

          {reading.weeklyPlan?.length ? (
            <div className="weeklyPlan">
              <h3>本周行动计划</h3>
              <div>
                {reading.weeklyPlan.map((item) => (
                  <article key={`${item.day}-${item.task}`}>
                    <strong>{item.day}</strong>
                    <p>{item.task}</p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {reading.avoidPitfalls?.length ? (
            <div className="pitfallPanel">
              <h3>近期需要避开的坑</h3>
              <ul>
                {reading.avoidPitfalls.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

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

          <section className="chatPanel">
            <div className="chatHeader">
              <div>
                <p className="kicker">继续追问</p>
                <h3>围绕这份报告，再问得具体一点</h3>
                <span>追问会调用一次模型，只基于当前报告回答，不重新上传图片。</span>
              </div>
            </div>

            <div className="quickQuestions">
              {quickQuestions.map((question) => (
                <button
                  disabled={isChatLoading}
                  key={question}
                  onClick={() => submitChat(question)}
                  type="button"
                >
                  {question}
                </button>
              ))}
            </div>

            {chatMessages.length ? (
              <div className="chatMessages">
                {chatMessages.map((message) => (
                  <article className={message.role} key={message.id}>
                    <span>{message.role === "user" ? "我问" : "掌心小读"}</span>
                    <p>{message.content}</p>
                    {message.tips?.length ? (
                      <ul>
                        {message.tips.map((tip, index) => (
                          <li key={`${message.id}-${tip}-${index}`}>{tip}</li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : null}

            <form
              className="chatComposer"
              onSubmit={(event) => {
                event.preventDefault();
                submitChat();
              }}
            >
              <input
                maxLength={240}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="例如：我最近在事业上最该避免什么？"
                value={chatInput}
              />
              <button disabled={isChatLoading} type="submit">
                {isChatLoading ? "回答中..." : "发送"}
              </button>
            </form>
            {chatError && chatFailureKind !== "input" ? (
              <div className="failurePanel compact">
                <div>
                  <strong>{renderFailureTitle(chatFailureKind)}</strong>
                  <p>{chatError}</p>
                  <span>{renderFailureHint(chatFailureKind)}</span>
                </div>
                <div className="failureActions">
                  <button
                    disabled={!lastChatQuestion || isChatLoading}
                    onClick={() => submitChat(lastChatQuestion)}
                    type="button"
                  >
                    {isChatLoading ? "重试中..." : "重新发送"}
                  </button>
                </div>
              </div>
            ) : null}
            {chatError && chatFailureKind === "input" ? <p className="error">{chatError}</p> : null}
          </section>
        </section>
      ) : null}
    </main>
  );
}
