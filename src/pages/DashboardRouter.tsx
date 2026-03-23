import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import Dashboard from './Dashboard';
import DashboardSupervisor from './DashboardSupervisor';
import DashboardOperador from './DashboardOperador';
import DashboardLoja from './DashboardLoja';
import DashboardComercial from './DashboardComercial';
import DashboardFinanceiro from './DashboardFinanceiro';

export default function DashboardRouter() {
  const { profile } = useAuth();

  if (!profile) return null;

  switch (profile.perfil) {
    case 'supervisor_producao':
      return <DashboardSupervisor />;
    case 'operador_producao':
      return <DashboardOperador />;
    case 'loja':
      return <DashboardLoja />;
    case 'comercial':
      return <DashboardComercial />;
    case 'financeiro':
      return <DashboardFinanceiro />;
    case 'almoxarifado':
      return <Navigate to="/almoxarifado" replace />;
    default:
      // admin, gestor
      return <Dashboard />;
  }
}
