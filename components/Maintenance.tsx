import React, { useEffect, useMemo, useState } from "react";

type TaskItem = {
  id: string;
  title: string;
  icon: React.ReactNode;
  href?: string;      // если есть — будет link
  onClick?: () => void; // если нужно действие
  disabled?: boolean;
};

type MaintenanceProps = {
  /** Дата/время запуска (таймер считает до неё) */
  launchAt: Date | string;

  /** Пути к ассетам (подставь свои) */
  assets?: {
    backgroundUrl: string; // фон-паттерн
    logoUrl: string;       // лого NONVME (или любое)
    mascotsLeftUrl?: string;  // опционально: персонаж слева
    mascotsRightUrl?: string; // опционально: персонаж справа
  };

  /** Ссылки/экшены */
  links?: {
    designersContest?: string; // ссылка на пост/канал с конкурсом
    newsChannel?: string;
    chat?: string;
    vote?: string;
    youtube?: string;
    instagram?: string;
    x?: string;
    tiktok?: string;
  };

  /** Если хочешь поменять тексты */
  copy?: {
    contestTitle?: string;
    contestSubtitle?: string;
    prestartTitle?: string;
    prestartSubtitle?: string;
  };
};

function pad2(n: number) {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

function formatCountdown(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "00:00:00:00";

  const totalSeconds = Math.floor(ms / 1000);

  const days = Math.floor(totalSeconds / 86400); // 24*60*60
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${pad2(days)}:${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

export default function Maintenance({
  launchAt,
  assets = {
    backgroundUrl: "/assets/back.png",
    logoUrl: "/assets/logo.png",


  },
  links = {
    designersContest: "https://t.me/nonvme",
    newsChannel: "https://t.me/nonvme",
    chat: "https://t.me/nonvme_chat",
    vote: "https://t.me/nonvme",
    youtube: "https://youtube.com/",
    instagram: "https://instagram.com/",
    x: "https://x.com/",
    tiktok: "https://tiktok.com/",
  },
  copy = {
    contestTitle: "Конкурс для Дизайнеров",
    contestSubtitle: "Сделай скины для нашего персонажа.\nПодробности в канале.",
    prestartTitle: "Pre-Start",
    prestartSubtitle: "Выполняй задания чтобы получить очки.\nОни помогут повысить прогресс.",
  },
}: MaintenanceProps) {
  const target = useMemo(() => {
    return new Date("2026-02-20T00:00:00+05:00").getTime();

  }, [launchAt]);





  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const leftMs = target - now;
  const timerText = formatCountdown(leftMs);

  const tasks: TaskItem[] = useMemo(
    () => [
      { id: "news", title: "Подпишитесь на новостной канал", icon: <IconHash />, href: links.newsChannel },
      { id: "chat", title: "Присоединитесь в чат", icon: <IconHash />, href: links.chat },
      { id: "vote", title: "Проголосуйте за канал", icon: <IconBolt />, href: links.vote },
      { id: "yt", title: "Подпишитесь на YouTube", icon: <IconYoutube />, href: links.youtube },
      { id: "ig", title: "Подпишитесь на Instagram", icon: <IconInstagram />, href: links.instagram },
      { id: "x", title: "Подпишитесь на X", icon: <IconX />, href: links.x },
      { id: "tt", title: "Подпишитесь на TikTok", icon: <IconTiktok />, href: links.tiktok },
      { id: "invite", title: "Пригласите 5 друзей", icon: <IconUsers />, onClick: () => alert("Сюда подключим твой invite-flow") },
    ],
    [links]
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#050406",
        backgroundImage: `url(${assets.backgroundUrl})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
        backgroundPosition: "center",
        color: "#fff",
        fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        display: "flex",
        justifyContent: "center",
        padding: "18px 14px 28px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Banner */}
        <div style={styles.glassBanner}>
          <div style={{ width: 34, height: 34, display: "grid", placeItems: "center" }}>
            <IconPencil />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.1 }}>{copy.contestTitle}</div>
            <div style={{ marginTop: 4, fontSize: 12.5, opacity: 0.82, whiteSpace: "pre-line" }}>
              {copy.contestSubtitle}
            </div>
          </div>

          <a
            href={links.designersContest}
            target="_blank"
            rel="noreferrer"
            style={styles.bannerLink}
            aria-label="Открыть"
            title="Открыть"
          >
            <IconChevronRight />
          </a>
        </div>

        {/* Center logo block */}
        <div style={{ display: "grid", placeItems: "center", paddingTop: 4 }}>
          <div style={{ position: "relative", width: "100%", height: 200, display: "grid", placeItems: "center" }}>
            {/* Mascots (optional) */}
            {assets.mascotsLeftUrl ? (
              <img
                src={assets.mascotsLeftUrl}
                alt=""
                style={{ position: "absolute", left: 16, bottom: 8, width: 88, height: "auto", filter: "drop-shadow(0 10px 22px rgba(0,0,0,.55))" }}
              />
            ) : null}

            {assets.mascotsRightUrl ? (
              <img
                src={assets.mascotsRightUrl}
                alt=""
                style={{ position: "absolute", right: 16, bottom: 8, width: 88, height: "auto", filter: "drop-shadow(0 10px 22px rgba(0,0,0,.55))" }}
              />
            ) : null}

            <img
              src={assets.logoUrl}
              alt="NONVME"
              style={{ width: 250, maxWidth: "84%", height: "auto", filter: "drop-shadow(0 18px 30px rgba(0,0,0,.55))" }}
            />
          </div>

          {/* Countdown pill */}
          <div style={styles.countdownPill}>
            <span style={{ fontVariantNumeric: "tabular-nums", letterSpacing: 0.6 }}>{timerText}</span>
          </div>
        </div>

        {/* Pre-start Card */}
        <div style={styles.glassCard}>
          <div style={{ padding: "16px 16px 10px" }}>
            <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: -0.2 }}>{copy.prestartTitle}</div>
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.72, whiteSpace: "pre-line" }}>
              {copy.prestartSubtitle}
            </div>
          </div>

          <div style={{ padding: "6px 10px 12px" }}>
            {tasks.map((t) => (
              <TaskRow key={t.id} item={t} />
            ))}
          </div>

          <div style={{ display: "grid", placeItems: "center", paddingBottom: 10, opacity: 0.55 }}>
            <IconChevronDown />
          </div>
        </div>

        {/* Optional footer hint */}
        <div style={{ textAlign: "center", fontSize: 11.5, opacity: 0.45, paddingTop: 2 }}>
          Pre-start экран. Дальше будет продукт — просто пока не выпускаем всех в прод.
        </div>
      </div>
    </div>
  );
}

function TaskRow({ item }: { item: TaskItem }) {
  const content = (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        padding: "12px 12px",
        borderRadius: 14,
        cursor: item.disabled ? "not-allowed" : item.href || item.onClick ? "pointer" : "default",
        opacity: item.disabled ? 0.4 : 1,
        transition: "transform .08s ease, background .12s ease",
        background: "transparent",
      }}
      onClick={() => {
        if (item.disabled) return;
        if (item.onClick) item.onClick();
      }}
      onMouseDown={(e) => {
        // лёгкий "нажим" как в мобилке
        (e.currentTarget as HTMLDivElement).style.transform = "scale(0.995)";
        (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)";
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "scale(1)";
        (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "scale(1)";
        (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      <div style={styles.taskIconWrap}>{item.icon}</div>
      <div style={{ flex: 1, fontSize: 14.2, opacity: 0.78 }}>{item.title}</div>
    </div>
  );

  if (item.href && !item.disabled) {
    return (
      <a href={item.href} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
        {content}
      </a>
    );
  }

  return content;
}

const styles: Record<string, React.CSSProperties> = {
  glassBanner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 12px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 10px 32px rgba(0,0,0,0.45)",
  },
  bannerLink: {
    width: 34,
    height: 34,
    display: "grid",
    placeItems: "center",
    borderRadius: 12,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  countdownPill: {
    marginTop: 8,
    padding: "7px 14px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.86)",
    color: "#0b0b0c",
    fontWeight: 800,
    fontSize: 14,
    boxShadow: "0 10px 26px rgba(0,0,0,0.35)",
  },
  glassCard: {
    borderRadius: 18,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(12px)",
    boxShadow: "0 14px 44px rgba(0,0,0,0.55)",
    overflow: "hidden",
  },
  taskIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    background: "rgba(0,0,0,0.28)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
};

/** Иконки (без библиотек, чтобы не тащить зависимости) */

function IconPencil() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 20h9" stroke="rgba(255,255,255,.85)" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5z"
        stroke="rgba(255,255,255,.85)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 18l6-6-6-6" stroke="rgba(255,255,255,.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="rgba(255,255,255,.75)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconHash() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 3L8 21" stroke="rgba(255,255,255,.85)" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 3l-2 18" stroke="rgba(255,255,255,.85)" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 9h18" stroke="rgba(255,255,255,.85)" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 15h18" stroke="rgba(255,255,255,.85)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconBolt() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M13 2L3 14h7l-1 8 12-14h-7l-1-6z"
        stroke="rgba(255,255,255,.85)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconYoutube() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 8s-.2-1.4-.8-2c-.8-.8-1.7-.8-2.1-.9C15.3 5 12 5 12 5h0s-3.3 0-6.1.1c-.4.1-1.3.1-2.1.9-.6.6-.8 2-.8 2S3 9.6 3 11.2v1.6C3 14.4 3.1 16 3.1 16s.2 1.4.8 2c.8.8 1.9.8 2.4.9C8.1 19 12 19 12 19s3.3 0 6.1-.1c.4-.1 1.3-.1 2.1-.9.6-.6.8-2 .8-2s.1-1.6.1-3.2v-1.6C21.1 9.6 21 8 21 8z"
        stroke="rgba(255,255,255,.85)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M10 15l6-3-6-3v6z" fill="rgba(255,255,255,.85)" />
    </svg>
  );
}

function IconInstagram() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5z"
        stroke="rgba(255,255,255,.85)"
        strokeWidth="2"
      />
      <path d="M16 11.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" stroke="rgba(255,255,255,.85)" strokeWidth="2" />
      <path d="M17.5 6.5h.01" stroke="rgba(255,255,255,.85)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 4l16 16M20 4L4 20"
        stroke="rgba(255,255,255,.85)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconTiktok() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 3v11.5a4.5 4.5 0 1 1-4-4.47"
        stroke="rgba(255,255,255,.85)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14 6c1.2 1.8 3 3 5 3"
        stroke="rgba(255,255,255,.85)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="rgba(255,255,255,.85)" strokeWidth="2" strokeLinecap="round" />
      <path d="M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="rgba(255,255,255,.85)" strokeWidth="2" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" stroke="rgba(255,255,255,.85)" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="rgba(255,255,255,.85)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
