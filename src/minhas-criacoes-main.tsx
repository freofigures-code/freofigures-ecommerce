import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MinhasCriacoes from "./MinhasCriacoes";
import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error("Elemento #root não encontrado em minhas-criacoes.html");

createRoot(container).render(
  <StrictMode>
    <MinhasCriacoes />
  </StrictMode>,
);
