"use client";

import { useEffect } from "react";
import { ToastProvider } from "./toast";

function ServiceWorkerRegister() {
  useEffect(() => {
    // I utvikling ville en cachet service worker gitt utdaterte filer.
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ServiceWorkerRegister />
      {children}
    </ToastProvider>
  );
}
