import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import FreoIntro from "./FreoIntro.tsx";
import { BlackFridayProvider } from "./blackFriday.tsx";
import "./index.css";

createRoot(
  document.getElementById("root")!
).render(
  <StrictMode>
    <BlackFridayProvider>
      <FreoIntro>
        <App />
      </FreoIntro>
    </BlackFridayProvider>
  </StrictMode>
);
