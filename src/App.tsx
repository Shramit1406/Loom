import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LoomProvider } from "@/context/LoomContext";
import Index from "./pages/Index.tsx";
import Onboarding from "./pages/Onboarding.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import AddPerson from "./pages/AddPerson.tsx";
import CameraView from "./pages/CameraView.tsx";
import Caregiver from "./pages/Caregiver.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <LoomProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/add-person" element={<AddPerson />} />
            <Route path="/camera" element={<CameraView />} />
            <Route path="/caregiver" element={<Caregiver />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </LoomProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
