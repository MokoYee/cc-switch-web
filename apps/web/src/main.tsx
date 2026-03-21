import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./app/App.js";
import { I18nProvider } from "./shared/i18n/I18nProvider.js";
import "./shared/styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
