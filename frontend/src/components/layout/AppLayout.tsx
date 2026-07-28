/** Layout principal: sidebar de navegacion + barra superior + contenido. */
import { useState, type ReactNode } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Package, Users, PackagePlus,
  CreditCard, Boxes, Wallet, BarChart3, Settings, TrendingUp, Menu, LogOut,
  Receipt, UserCog, Tags,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { cerrarSesion } from '@/lib/authApi';
import { iniciales } from '@/lib/formato';
import { cn } from '@/lib/cn';
import { TasaBadge } from './TasaBadge';
import { ToggleTema, BotonInstalarApp } from './NavbarAcciones';
import { useScannerGlobal } from '@/features/pos/useScannerGlobal';
import { useRealtime } from '@/app/useRealtime';

interface ItemNav {
  a: string;
  etiqueta: string;
  icono: typeof LayoutDashboard;
  permiso?: string;
}

const NAV: { seccion: string; items: ItemNav[] }[] = [
  {
    seccion: 'Operación',
    items: [
      { a: '/', etiqueta: 'Dashboard', icono: LayoutDashboard, permiso: 'dashboard.ver' },
      { a: '/pos', etiqueta: 'Punto de venta', icono: ShoppingCart, permiso: 'pos.vender' },
      { a: '/ventas', etiqueta: 'Ventas', icono: Receipt, permiso: 'ventas.ver' },
      { a: '/tasas-cambio', etiqueta: 'Tasa del día', icono: TrendingUp, permiso: 'tasas.ver' },
    ],
  },
  {
    seccion: 'Catálogo',
    items: [
      { a: '/productos', etiqueta: 'Productos', icono: Package, permiso: 'productos.ver' },
      { a: '/clientes', etiqueta: 'Clientes', icono: Users, permiso: 'clientes.ver' },
    ],
  },
  {
    seccion: 'Inventario',
    items: [
      { a: '/compras', etiqueta: 'Entrada de mercancía', icono: PackagePlus, permiso: 'compras.ver' },
      { a: '/inventario', etiqueta: 'Existencias', icono: Boxes, permiso: 'inventario.ver' },
    ],
  },
  {
    seccion: 'Finanzas',
    items: [
      { a: '/creditos', etiqueta: 'Créditos', icono: CreditCard, permiso: 'creditos.ver' },
      { a: '/caja', etiqueta: 'Caja', icono: Wallet, permiso: 'caja.ver' },
      { a: '/reportes', etiqueta: 'Reportes', icono: BarChart3, permiso: 'reportes.ver' },
    ],
  },
  {
    seccion: 'Administración',
    items: [
      { a: '/categorias', etiqueta: 'Categorías', icono: Tags, permiso: 'categorias.ver' },
      { a: '/usuarios', etiqueta: 'Usuarios', icono: UserCog, permiso: 'usuarios.ver' },
      { a: '/configuracion', etiqueta: 'Configuración', icono: Settings, permiso: 'configuracion.ver' },
    ],
  },
];

export function AppLayout({ children }: { children: ReactNode }) {
  /**
   * En teléfono el sidebar es un panel encima del contenido y arranca CERRADO:
   * abierto se comía 256px de una pantalla de 375px y no cabía ninguna tabla.
   * De `md` para arriba se comporta como siempre (empuja el contenido).
   */
  const [abierto, setAbierto] = useState(() => window.innerWidth >= 768);
  const esMovil = () => window.innerWidth < 768;
  const usuario = useAuthStore((s) => s.usuario);
  const permisos = useAuthStore((s) => s.permisos);
  const navegar = useNavigate();
  useScannerGlobal();
  useRealtime();

  const puede = (p?: string) => !p || permisos.includes(p);

  const salir = async () => {
    await cerrarSesion();
    navegar('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Fondo oscuro para cerrar tocando fuera; solo en teléfono. */}
      {abierto && (
        <div onClick={() => setAbierto(false)} className="fixed inset-0 z-30 bg-black/50 md:hidden" />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-200 bg-white',
          'transition-transform dark:border-gray-700 dark:bg-gray-800',
          abierto ? 'translate-x-0' : '-translate-x-full',
          // De md en adelante vuelve al flujo: sin overlay, colapsa por ancho.
          'md:static md:translate-x-0 md:transition-all',
          abierto ? 'md:w-64' : 'md:w-0 md:overflow-hidden',
        )}
      >
        <div className="flex items-center gap-2 border-b border-gray-200 p-4 dark:border-gray-700">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 font-bold text-white">
            G
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold">Los Gochitos</p>
            <p className="text-[11px] text-gray-500">Mini Market</p>
          </div>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {NAV.map((grupo) => {
            const visibles = grupo.items.filter((i) => puede(i.permiso));
            if (visibles.length === 0) return null;
            return (
              <div key={grupo.seccion}>
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {grupo.seccion}
                </p>
                <div className="space-y-0.5">
                  {visibles.map((item) => (
                    <NavLink
                      key={item.a}
                      to={item.a}
                      end={item.a === '/'}
                      // En teléfono el panel tapa el contenido: al navegar se cierra.
                      onClick={() => { if (esMovil()) setAbierto(false); }}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
                        )
                      }
                    >
                      <item.icono className="h-4.5 w-4.5" />
                      {item.etiqueta}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Contenido */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
          <button
            onClick={() => setAbierto((v) => !v)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2 sm:gap-3">
            <TasaBadge />
            <ToggleTema />
            <BotonInstalarApp />
            <Link to="/mi-cuenta" className="flex items-center gap-2 rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-700" title="Mi cuenta">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-xs font-semibold text-white">
                {iniciales(usuario?.nombreCompleto)}
              </div>
              <div className="hidden leading-tight sm:block">
                <p className="text-sm font-medium">{usuario?.nombreCompleto}</p>
                <p className="text-[11px] text-gray-500">{usuario?.rolCodigo}</p>
              </div>
            </Link>
            <button
              onClick={salir}
              className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
              title="Cerrar sesión"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
