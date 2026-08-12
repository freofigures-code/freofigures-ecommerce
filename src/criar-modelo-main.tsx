import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import FreoCriarModelo from "./FreoCriarModelo";
import "./index.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Elemento #root não encontrado em criar-modelo.html");
}

createRoot(container).render(
  <StrictMode>
    <FreoCriarModelo />
  </StrictMode>
);
