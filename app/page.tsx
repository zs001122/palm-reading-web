"use client";

import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";

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

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const sections: Array<{
  key: keyof PalmReading["reading"];
  title: string;
  eyebrow: string;
}> = [
  { key: "personality", title: "性格底色", eyebrow: "掌心里的稳定力量" },
  { key: "relationships", title: "感情与关系", eyebrow: "亲密关系的相处节奏" },
  { key: "career", title: "事业与行动", eyebrow: "适合你的发力方式" },
  { key: "energy", title: "近期能量", eyebrow: "当下状态的温柔提醒" },
  { key: "advice", title: "接下来可以做的事", eyebrow: "把好运落到行动里" }
];

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [reading, setReading] = useState<PalmReading | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const fileHint = useMemo(() => {
    if (!file) return "JPG、PNG、WebP，最大 8MB";
    return `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)}MB`;
  }, [file]);

  function setSelectedFile(nextFile: File | null) {
    setError("");
    setReading(null);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError("先上传一张清晰的手掌照片。");
      return;
    }

    setIsLoading(true);
    setError("");
    setReading(null);

    const body = new FormData();
    body.append("image", file);

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

  return (
    <main className="shell">
      <section className="hero">
        <div className="heroCopy">
          <p className="kicker">掌心小读</p>
          <h1>上传一张手掌照片，读一点事实，也给你一点温柔。</h1>
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

          <button className="primaryButton" disabled={!file || isLoading} type="submit">
            {isLoading ? "正在解析..." : "开始解析"}
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
          <p>解析仅作娱乐和自我反思，不替代专业建议。</p>
        </div>
      </section>

      {reading ? (
        <section className="result" aria-live="polite">
          <div className="resultHeader">
            <p className="kicker">解析结果</p>
            <h2>这只手给人的第一感觉，是认真生活过的痕迹。</h2>
          </div>

          <div className="facts">
            <h3>我从照片里看到的事实</h3>
            <ul>
              {reading.observations.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="readingGrid">
            {sections.map((section) => (
              <article key={section.key}>
                <p>{section.eyebrow}</p>
                <h3>{section.title}</h3>
                <span>{reading.reading[section.key]}</span>
              </article>
            ))}
          </div>

          <blockquote>{reading.comfort}</blockquote>
          <p className="disclaimer">{reading.disclaimer}</p>
        </section>
      ) : null}
    </main>
  );
}
