import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import DashboardPage from "./page";
import { IndexedDbNoteStorage } from "./indexeddb-storage";
import { TooltipProvider } from "./components/ui/tooltip";
import "./globals.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing root element.");
}

createRoot(rootElement).render(
  <StrictMode>
    <TooltipProvider>
      <DashboardPage storage={new IndexedDbNoteStorage()} />
    </TooltipProvider>
  </StrictMode>,
);
