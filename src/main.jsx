import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import FirstLoginGuideCoordinator from "./components/FirstLoginGuideCoordinator";
import { AiQuotaProvider } from "./components/AiQuotaProvider";
import "./App.css";
import "./components/PrepMatrixGuideDialog.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AiQuotaProvider>
        <App />
        <FirstLoginGuideCoordinator />
      </AiQuotaProvider>
    </BrowserRouter>
  </React.StrictMode>
);
