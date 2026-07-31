import { lazy, Suspense, type ComponentType } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryProvider } from './QueryProvider';
import { TasaProvider } from './TasaProvider';
import { ProtectedRoute } from './ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { Toaster } from '@/components/ui/Toaster';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Cargando } from '@/components/ui/Feedback';

/**
 * Las pantallas se cargan bajo demanda.
 *
 * Antes las 16 paginas iban en un unico bundle: abrir el POS obligaba a bajar y
 * parsear tambien reportes, usuarios y configuracion. Ahora cada ruta trae solo
 * su codigo, y el arranque baja a la capa comun + la pantalla que se abrio.
 *
 * Login, Dashboard y POS se PRECARGAN apenas la app queda ociosa: son las tres
 * que se usan todo el dia y no deben esperar una descarga al navegar.
 */
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const PosPage = lazy(() => import('@/pages/PosPage'));
const ProductosPage = lazy(() => import('@/pages/ProductosPage'));
const VentasPage = lazy(() => import('@/pages/VentasPage'));
const TasasPage = lazy(() => import('@/pages/TasasPage'));
const ClientesPage = lazy(() => import('@/pages/ClientesPage'));
const CreditosPage = lazy(() => import('@/pages/CreditosPage'));
const ComprasPage = lazy(() => import('@/pages/ComprasPage'));
const InventarioPage = lazy(() => import('@/pages/InventarioPage'));
const ReportesPage = lazy(() => import('@/pages/ReportesPage'));
const BancoPage = lazy(() => import('@/pages/BancoPage'));
const CajaPage = lazy(() => import('@/pages/CajaPage'));
const ConfiguracionPage = lazy(() => import('@/pages/ConfiguracionPage'));
const CategoriasPage = lazy(() => import('@/pages/CategoriasPage'));
const UsuariosPage = lazy(() => import('@/pages/UsuariosPage'));
const MiCuentaPage = lazy(() => import('@/pages/MiCuentaPage'));

/**
 * Precarga las pantallas de uso diario cuando el navegador esta libre, para que
 * cambiar de Dashboard a POS sea instantaneo aun con la red lenta del local.
 */
function precargarHabituales(): void {
  const precargar = () => {
    void import('@/pages/PosPage');
    void import('@/pages/DashboardPage');
    void import('@/pages/VentasPage');
  };
  if ('requestIdleCallback' in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void) => void })
      .requestIdleCallback(precargar);
  } else {
    setTimeout(precargar, 2000);
  }
}
precargarHabituales();

function Privada({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

/** Ruta privada perezosa: el layout se pinta ya y solo el contenido espera. */
function RutaPrivada({ pagina: Pagina }: { pagina: ComponentType }) {
  return (
    <Privada>
      <Suspense fallback={<Cargando />}>
        <Pagina />
      </Suspense>
    </Privada>
  );
}

export function App() {
  return (
    <QueryProvider>
      <BrowserRouter>
        <TasaProvider>
          <Routes>
            <Route
              path="/login"
              element={<Suspense fallback={<Cargando />}><LoginPage /></Suspense>}
            />

            <Route path="/" element={<RutaPrivada pagina={DashboardPage} />} />
            <Route path="/pos" element={<RutaPrivada pagina={PosPage} />} />
            <Route path="/ventas" element={<RutaPrivada pagina={VentasPage} />} />
            <Route path="/tasas-cambio" element={<RutaPrivada pagina={TasasPage} />} />
            <Route path="/productos" element={<RutaPrivada pagina={ProductosPage} />} />
            <Route path="/clientes" element={<RutaPrivada pagina={ClientesPage} />} />
            <Route path="/compras" element={<RutaPrivada pagina={ComprasPage} />} />
            <Route path="/inventario" element={<RutaPrivada pagina={InventarioPage} />} />
            <Route path="/creditos" element={<RutaPrivada pagina={CreditosPage} />} />
            <Route path="/caja" element={<RutaPrivada pagina={CajaPage} />} />
            <Route path="/reportes" element={<RutaPrivada pagina={ReportesPage} />} />
            <Route path="/banco" element={<RutaPrivada pagina={BancoPage} />} />
            <Route path="/categorias" element={<RutaPrivada pagina={CategoriasPage} />} />
            <Route path="/usuarios" element={<RutaPrivada pagina={UsuariosPage} />} />
            <Route path="/configuracion" element={<RutaPrivada pagina={ConfiguracionPage} />} />
            <Route path="/mi-cuenta" element={<RutaPrivada pagina={MiCuentaPage} />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
          <ConfirmDialog />
        </TasaProvider>
      </BrowserRouter>
    </QueryProvider>
  );
}
