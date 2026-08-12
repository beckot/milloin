"use client";

import { useEffect, useState } from "react";

export type Locale = "fi" | "en";

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>("fi");
  useEffect(() => {
    const saved = window.localStorage.getItem("milloin_locale");
    const initial: Locale = saved === "en" || saved === "fi" ? saved : navigator.language.toLowerCase().startsWith("fi") ? "fi" : "en";
    setLocaleState(initial);
    document.documentElement.lang = initial;
  }, []);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem("milloin_locale", next);
    document.documentElement.lang = next;
  };
  return { locale, setLocale };
}

export function LanguageSwitch({ locale, setLocale }: { locale: Locale; setLocale: (locale: Locale) => void }) {
  return (
    <div className="language-switch" aria-label="Language">
      <button type="button" className={locale === "fi" ? "active" : ""} onClick={() => setLocale("fi")}>FI</button>
      <span>·</span>
      <button type="button" className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>EN</button>
    </div>
  );
}
