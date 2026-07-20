import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryProvider } from './QueryProvider';
import { TasaProvider } from './TasaProvider';
import { ProtectedRoute } from './ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { Toaster } from '@/components/ui/Toaster';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import PosPage from '@/pages/PosPage';
import ProductosPage from '@/pages/ProductosPage';
import VentasPage from '@/pages/VentasPage';
import TasasPage from '@/pages/TasasPage';
import ClientesPage from '@/pages/ClientesPage';
import CreditosPage from '@/pages/CreditosPage';
import ComprasPage from '@/pages/ComprasPage';
import InventarioPage from '@/pages/InventarioPage';
import ReportesPage from '@/pages/ReportesPage';
import CajaPage from '@/pages/CajaPage';
import ConfiguracionPage from '@/pages/ConfiguracionPage';
import CategoriasPage from '@/pages/CategoriasPage';
import UsuariosPage from '@/pages/UsuariosPage';
import MiCuentaPage from '@/pages/MiCuentaPage';

function Privada({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

export function App() {
  return (
    <QueryProvider>
      <BrowserRouter>
        <TasaProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route path="/" element={<Privada><DashboardPage /></Privada>} />
            <Route path="/pos" element={<Privada><PosPage /></Privada>} />
            <Route path="/ventas" element={<Privada><VentasPage /></Privada>} />
            <Route path="/tasas-cambio" element={<Privada><TasasPage /></Privada>} />
            <Route path="/productos" element={<Privada><ProductosPage /></Privada>} />
            <Route path="/clientes" element={<Privada><ClientesPage /></Privada>} />
            <Route path="/compras" element={<Privada><ComprasPage /></Privada>} />
            <Route path="/inventario" element={<Privada><InventarioPage /></Privada>} />
            <Route path="/creditos" element={<Privada><CreditosPage /></Privada>} />
            <Route path="/caja" element={<Privada><CajaPage /></Privada>} />
            <Route path="/reportes" element={<Privada><ReportesPage /></Privada>} />
            <Route path="/categorias" element={<Privada><CategoriasPage /></Privada>} />
            <Route path="/usuarios" element={<Privada><UsuariosPage /></Privada>} />
            <Route path="/configuracion" element={<Privada><ConfiguracionPage /></Privada>} />
            <Route path="/mi-cuenta" element={<Privada><MiCuentaPage /></Privada>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
          <ConfirmDialog />
        </TasaProvider>
      </BrowserRouter>
    </QueryProvider>
  );
}
