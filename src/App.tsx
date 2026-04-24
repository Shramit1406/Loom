import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import AppPermissionsGate from "@/components/AppPermissionsGate";
import { LoomProvider } from "@/context/LoomContext";
import { checkPermission, PERMISSIONS_META } from "@/lib/permissions";
import Index from "./pages/Index.tsx";
import Onboarding from "./pages/Onboarding.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import AddPerson from "./pages/AddPerson.tsx";
import CameraView from "./pages/CameraView.tsx";
import Caregiver from "./pages/Caregiver.tsx";
import CaregiverApp from "./pages/CaregiverApp.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      setIsReady(true);
      return;
    }

    const checkAll = async () => {
      const results = await Promise.all(PERMISSIONS_META.map(p => checkPermission(p.key)));
      setIsReady(results.every(r => r === "granted" || r === "unsupported"));
    };

    void checkAll();

    const listener = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void checkAll();
    });

    return () => {
      void listener.then(l => l.remove());
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LoomProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            {!isReady ? (
              <AppPermissionsGate />
            ) : (
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/add-person" element={<AddPerson />} />
                <Route path="/camera" element={<CameraView />} />
                <Route path="/caregiver" element={<Caregiver />} />
                <Route path="/caregiver-app" element={<CaregiverApp />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            )}
          </BrowserRouter>
        </LoomProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
