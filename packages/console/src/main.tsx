import "@mantine/core/styles.css";
import "@mantine/spotlight/styles.css";
import "@mantine/dates/styles.css";
import "mantine-datatable/styles.layer.css";
import "react-medium-image-zoom/dist/styles.css";
import "allotment/dist/style.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@/context/QueryClientProvider";
import { ThemeProvider } from "@/context/ThemeProvider";
import {
  PikkuHTTPProvider,
  PikkuRPCProvider,
} from "@/context/PikkuRpcProvider";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider>
        <ThemeProvider initial="light" locale="en">
          <PikkuHTTPProvider>
            <PikkuRPCProvider>
              <App />
            </PikkuRPCProvider>
          </PikkuHTTPProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>
);
