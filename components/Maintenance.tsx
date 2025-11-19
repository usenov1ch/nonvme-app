// components/Maintenance.tsx
import React from "react";

export default function Maintenance() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#050406",
      color: "#fff",
      padding: 24,
      fontFamily: "Inter, Roboto, sans-serif",
    }}>
      <div style={{
        maxWidth: 880,
        width: "100%",
        borderRadius: 18,
        padding: 28,
        background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
        boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
        textAlign: "center",
        border: "1px solid rgba(255,255,255,0.04)"
      }}>
        <h1 style={{ margin: 0, fontSize: 28, letterSpacing: -0.4 }}>Сейчас непростой момент</h1>
        <p style={{ marginTop: 12, fontSize: 16, color: "rgba(255,255,255,0.85)" }}>
          Мы временно закрыли доступ к приложению — готовим кое-что классное и доводим до ума.  
          Если ты видишь эту страницу — значит, ты пока в очереди наблюдателей.
        </p>

        <div style={{
          marginTop: 20,
          padding: 18,
          borderRadius: 12,
          background: "rgba(0,0,0,0.35)",
          color: "rgba(255,255,255,0.95)",
          fontSize: 15
        }}>
          <strong style={{ display: "block", marginBottom: 6 }}>Когда откроем — тебе придёт доступ.</strong>
          <div style={{ opacity: .85 }}>
            Если нужен срочный доступ — напиши администратору в Telegram.
          </div>
        </div>

        <div style={{ marginTop: 18, display: "flex", gap: 12, justifyContent: "center", alignItems: "center" }}>
          <a href="https://t.me/nonvme" target="_blank" rel="noreferrer" style={{
            display: "inline-block",
            padding: "10px 18px",
            borderRadius: 10,
            background: "rgba(124,92,255,0.95)",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 700,
          }}>Написать администратору</a>

          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "#fff",
              cursor: "pointer"
            }}
          >
            Обновить страницу
          </button>
        </div>

        <small style={{ display: "block", marginTop: 18, color: "rgba(255,255,255,0.45)" }}>
          Код: maintenance / only owners access.
        </small>
      </div>
    </div>
  );
}
