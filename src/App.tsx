import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { VersionBanner } from "@/components/VersionBanner";
import Login from "./pages/Login";
import DashboardGestao from "./pages/DashboardGestao";
import FilaMestre from "./pages/FilaMestre";
import KanbanProducao from "./pages/KanbanProducao";
import RelatoriosProducao from "./pages/RelatoriosProducao";
import KanbanVenda from "./pages/KanbanVenda";
import PainelDia from "./pages/PainelDia";
import Usuarios from "./pages/Usuarios";
import Pipelines from "./pages/Pipelines";
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
import NovaVendaComercial from "./pages/NovaVendaComercial";
import DashboardFinanceiro from "./pages/DashboardFinanceiro";
import DashboardLoja from "./pages/DashboardLoja";
import CurvaABC from "./pages/CurvaABC";
import AlmoxarifadoPage from "./pages/Almoxarifado";
import AppLayout from "./components/AppLayout";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <VersionBanner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<AppLayout />}>
              {/* Main 3 screens */}
              <Route path="/dashboard" element={<DashboardGestao />} />
              <Route path="/producao" element={<FilaMestre />} />
              <Route path="/kanban" element={<KanbanProducao />} />
              <Route path="/kanban-venda" element={<KanbanVenda />} />
              <Route path="/painel-dia" element={<PainelDia />} />

              {/* Config / Admin */}
              <Route path="/usuarios" element={<Usuarios />} />
              <Route path="/pipelines" element={<Pipelines />} />
              <Route path="/integracao" element={<Integracao />} />
              <Route path="/pcp" element={<PCP />} />

              {/* Production detail */}
              <Route path="/producao/novo" element={<NovoPedido />} />
              <Route path="/producao/ordem/:id" element={<DetalheOrdem />} />

              {/* Role-specific queues */}
              <Route path="/loja" element={<FilaLoja />} />
              <Route path="/loja/verificar/:id" element={<VerificacaoLoja />} />
              <Route path="/financeiro" element={<FilaFinanceira />} />
              <Route path="/financeiro/validar/:id" element={<ValidacaoFinanceira />} />
              <Route path="/logistica" element={<FilaLogistica />} />
              <Route path="/logistica/envio/:id" element={<RegistroEnvio />} />

              {/* Role dashboards for specific profiles */}
              <Route path="/comercial/nova-venda" element={<NovaVendaComercial />} />
              <Route path="/painel-financeiro" element={<DashboardFinanceiro />} />
              <Route path="/painel-loja" element={<DashboardLoja />} />

              {/* Reports */}
              <Route path="/relatorios/abc" element={<CurvaABC />} />
              <Route path="/relatorios/producao" element={<RelatoriosProducao />} />
              <Route path="/almoxarifado" element={<AlmoxarifadoPage />} />
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
