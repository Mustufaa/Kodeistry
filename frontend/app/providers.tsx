"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { PreferencesProvider } from "@/components/settings/preferences-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    let leaving = false;
    const lostAccess = () => {
      if (leaving) return;
      leaving = true;
      void queryClient.cancelQueries().finally(() => {
        queryClient.clear();
        window.location.replace("/onboarding");
      });
    };
    window.addEventListener("kodeistry-access-lost", lostAccess);
    return () => window.removeEventListener("kodeistry-access-lost", lostAccess);
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}><PreferencesProvider>{children}</PreferencesProvider><Toaster richColors position="top-right" offset={{ top: 20, right: 20 }} mobileOffset={{ top: 12, right: 12 }} /></QueryClientProvider>;
}
