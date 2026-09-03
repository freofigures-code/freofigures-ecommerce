import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import FreoIntro from "./FreoIntro.tsx";
import "./index.css";

createRoot(
  document.getElementById("root")!
).render(
  <StrictMode>
    <FreoIntro>
      <App />
    </FreoIntro>
  </StrictMode>
);
