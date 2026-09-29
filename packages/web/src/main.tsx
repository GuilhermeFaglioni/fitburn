import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./styles/global.css";
import "./styles/admin.css";
import "./styles/client.css";
import "./styles/attendance.css";
import "./styles/gamification.css";
import "./styles/goals.css";
import "./styles/plan.css";
import "./styles/workout.css";
import "./styles/profile.css";
import "./styles/home.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
