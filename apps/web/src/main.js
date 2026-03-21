import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App.js";
import { I18nProvider } from "./shared/i18n/I18nProvider.js";
import "./shared/styles/global.css";
ReactDOM.createRoot(document.getElementById("root")).render(_jsx(React.StrictMode, { children: _jsx(I18nProvider, { children: _jsx(App, {}) }) }));
//# sourceMappingURL=main.js.map