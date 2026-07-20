/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fondo: 'hsl(var(--color-fondo) / <alpha-value>)',
        superficie: 'hsl(var(--color-superficie) / <alpha-value>)',
        'superficie-alt': 'hsl(var(--color-superficie-alt) / <alpha-value>)',
        borde: 'hsl(var(--color-borde) / <alpha-value>)',
        'borde-fuerte': 'hsl(var(--color-borde-fuerte) / <alpha-value>)',
        texto: 'hsl(var(--color-texto) / <alpha-value>)',
        'texto-suave': 'hsl(var(--color-texto-suave) / <alpha-value>)',
        'texto-tenue': 'hsl(var(--color-texto-tenue) / <alpha-value>)',
        primario: {
          DEFAULT: 'hsl(var(--color-primario) / <alpha-value>)',
          suave: 'hsl(var(--color-primario-suave) / <alpha-value>)',
          fuerte: 'hsl(var(--color-primario-fuerte) / <alpha-value>)',
          texto: 'hsl(var(--color-primario-texto) / <alpha-value>)',
        },
        exito: {
          DEFAULT: 'hsl(var(--color-exito) / <alpha-value>)',
          suave: 'hsl(var(--color-exito-suave) / <alpha-value>)',
        },
        alerta: {
          DEFAULT: 'hsl(var(--color-alerta) / <alpha-value>)',
          suave: 'hsl(var(--color-alerta-suave) / <alpha-value>)',
        },
        peligro: {
          DEFAULT: 'hsl(var(--color-peligro) / <alpha-value>)',
          suave: 'hsl(var(--color-peligro-suave) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'hsl(var(--color-info) / <alpha-value>)',
          suave: 'hsl(var(--color-info-suave) / <alpha-value>)',
        },
        anillo: 'hsl(var(--color-anillo) / <alpha-value>)',
      },
      borderRadius: {
        sm: 'var(--radio-sm)',
        DEFAULT: 'var(--radio-md)',
        md: 'var(--radio-md)',
        lg: 'var(--radio-lg)',
        xl: 'var(--radio-xl)',
        '2xl': 'var(--radio-2xl)',
      },
      boxShadow: {
        sutil: 'var(--sombra-sutil)',
        media: 'var(--sombra-media)',
        elevada: 'var(--sombra-elevada)',
        flotante: 'var(--sombra-flotante)',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      zIndex: {
        cabecera: '30',
        lateral: '40',
        capa: '50',
        modal: '60',
        aviso: '70',
      },
      keyframes: {
        'aparecer-fundido': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'aparecer-arriba': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'brillo-carga': {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'aparecer-fundido': 'aparecer-fundido 150ms ease-out',
        'aparecer-arriba': 'aparecer-arriba 180ms ease-out',
      },
    },
  },
  plugins: [],
};
