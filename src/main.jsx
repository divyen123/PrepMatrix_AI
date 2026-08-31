import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import FirstLoginGuideCoordinator from "./components/FirstLoginGuideCoordinator";
import { AiQuotaProvider } from "./components/AiQuotaProvider";
import { BackgroundTaskProvider } from "./components/BackgroundTaskProvider";
import "./App.css";
import "./components/PrepMatrixGuideDialog.css";

const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <AiQuotaProvider>
        <BackgroundTaskProvider>
          <App />
          <FirstLoginGuideCoordinator />
        </BackgroundTaskProvider>
      </AiQuotaProvider>
    ),
  },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
