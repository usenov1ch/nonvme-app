// pages/_app.tsx
import React, { useEffect, useState } from "react";
import type { AppProps } from "next/app";
import { supabase } from "../lib/supabase";
import Maintenance from "../components/Maintenance";


export default function MyApp({ Component, pageProps }: AppProps) {
  const [allowed, setAllowed] = useState<boolean | null>(null); // null = loading
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Получаем пользователя Telegram из WebApp (если есть)
        const tgUser = (typeof window !== "undefined") ? window.Telegram?.WebApp?.initDataUnsafe?.user : null;
        const tgIdNum = tgUser?.id ? String(tgUser.id) : null;
        const tgName = tgUser?.username ?? tgUser?.id?.toString() ?? null;

        // Если нет телеграма (например прямой заход в браузере) — заблокировать доступ
        if (!tgIdNum && !tgName) {
          if (mounted) { setAllowed(false); setChecking(false); }
          return;
        }

        // Ищем запись в users: сначала по telegram_id (число), потом по telegram_id_text (имя)
        // Используем два запроса, т.к. or может быть неудобен с типами
        let found = false;

        // Проверяем по цифровому id (telegram_id)
        if (tgIdNum) {
          const { data: byId, error: err1 } = await supabase
            .from("users")
            .select("telegram_id, telegram_id_text")
            .eq("telegram_id", Number(tgIdNum))
            .limit(1);

          if (!err1 && Array.isArray(byId) && byId.length > 0) found = true;
        }

        // Если не нашли — проверяем по текстовому полю (telegram_id_text)
        if (!found && tgName) {
          const { data: byText, error: err2 } = await supabase
            .from("users")
            .select("telegram_id, telegram_id_text")
            .eq("telegram_id_text", String(tgName))
            .limit(1);

          if (!err2 && Array.isArray(byText) && byText.length > 0) found = true;
        }

        if (mounted) setAllowed(found);
      } catch (e) {
        console.error("Access check failed", e);
        if (mounted) setAllowed(false);
      } finally {
        if (mounted) setChecking(false);
      }
    })();

    return () => { mounted = false; }
  }, []);

  // Пока идёт проверка — можно показывать пустой экран или спиннер
  if (checking || allowed === null) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#000",
        color: "#fff"
      }}>
        <div style={{ textAlign: "center", opacity: 0.9 }}>
          <div style={{ marginBottom: 12 }}>Проверяем доступ…</div>
          <div style={{ fontSize: 12, opacity: .6 }}>Если проверка занимает слишком долго — обнови страницу.</div>
        </div>
      </div>
    );
  }

  // Если не разрешён — показываем заглушку
  if (!allowed) {
    return <Maintenance />;
  }

  // Разрешён — рендерим приложение как обычно
  return <Component {...pageProps} />;
}
