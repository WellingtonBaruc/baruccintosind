import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import Login from "./pages/Login";
import DashboardRouter from "./pages/DashboardRouter";
import Usuarios from "./pages/Usuarios";
import Pipelines from "./pages/Pipelines";
import FilaProducao from "./pages/FilaProducao";
import NovoPedido from "./pages/NovoPedido";
import DetalheOrdem from "./pages/DetalheOrdem";
import FilaLoja from "./pages/FilaLoja";
import VerificacaoLoja from "./pages/VerificacaoLoja";
import FilaFinanceira from "./pages/FilaFinanceira";
import ValidacaoFinanceira from "./pages/ValidacaoFinanceira";
import FilaLogistica from "./pages/FilaLogistica";
import RegistroEnvio from "./pages/RegistroEnvio";
import Integracao from "./pages/Integracao";
import PCP from "./pages/PCP";
import MinhaFila from "./pages/MinhaFila";
import PainelTV from "./pages/PainelTV";
import ProgramacaoDia from "./pages/ProgramacaoDia";
import AppLayout from "./components/AppLayout";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardRouter />} />
              <Route path="/usuarios" element={<Usuarios />} />
              <Route path="/pipelines" element={<Pipelines />} />
              <Route path="/producao" element={<FilaProducao />} />
              <Route path="/producao/novo" element={<NovoPedido />} />
              <Route path="/producao/ordem/:id" element={<DetalheOrdem />} />
              <Route path="/loja" element={<FilaLoja />} />
              <Route path="/loja/verificar/:id" element={<VerificacaoLoja />} />
              <Route path="/financeiro" element={<FilaFinanceira />} />
              <Route path="/financeiro/validar/:id" element={<ValidacaoFinanceira />} />
              <Route path="/logistica" element={<FilaLogistica />} />
              <Route path="/logistica/envio/:id" element={<RegistroEnvio />} />
              <Route path="/pcp" element={<PCP />} />
              <Route path="/minha-fila" element={<MinhaFila />} />
              <Route path="/painel" element={<PainelTV />} />
              <Route path="/programacao" element={<ProgramacaoDia />} />
              <Route path="/integracao" element={<Integracao />} />
            </Route>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
