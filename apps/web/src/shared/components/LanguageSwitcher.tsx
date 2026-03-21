import type { LocaleCode } from "@ai-cli-switch/shared";

import { useI18n } from "../i18n/I18nProvider.js";

const localeOptions: Array<{ value: LocaleCode; label: string }> = [
  { value: "zh-CN", label: "中文" },
  { value: "en-US", label: "English" }
];

export const LanguageSwitcher = (): JSX.Element => {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className="language-switcher">
      <span>{t("app.languageLabel")}</span>
      <select
        aria-label={t("app.languageLabel")}
        value={locale}
        onChange={(event) => setLocale(event.target.value as LocaleCode)}
      >
        {localeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
};
