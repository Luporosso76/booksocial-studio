/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Scala di ELEVAZIONE dark-mode con stacchi reali (in dark mode l'elevazione si
        // legge dalle superfici più chiare, non dalle ombre scure su near-black). Leggera
        // tinta fredda verso il brand indigo per ricchezza. Ladder: base < inset < raised
        // < card < hover, con gap percepibili così le card non si fondono col fondo.
        bg: {
          base: '#08080b', // sfondo pagina: PIÙ profondo, così le card risaltano per contrasto
          inset: '#1c1c24', // superficie "campo"/item: chiaramente sopra il fondo
          raised: '#23232c', // superficie intermedia
          card: '#2a2a35', // superficie card principale: tono nettamente più chiaro del fondo
          hover: '#34343f', // stato hover delle superfici
        },
        border: {
          subtle: '#34343f', // bordo ben visibile
          DEFAULT: '#43434f',
          strong: '#565663',
        },
        content: {
          primary: '#f4f4f7', // testo principale, più nitido
          secondary: '#b8b8c4', // testo secondario, ≥4.5:1 sulle card
          tertiary: '#8c8c98', // testo terziario leggibile (era #6e6e78, sottosoglia)
          faint: '#5e5e6a', // solo icone/decorazioni
        },
        accent: {
          DEFAULT: '#6366f1',
          hover: '#5457e0',
          light: '#a5b4fc',
          soft: 'rgba(99,102,241,0.12)',
          ring: 'rgba(99,102,241,0.45)',
        },
        success: '#34d399',
        warning: '#fbbf24',
        danger: '#f87171',
        'danger-soft': 'rgba(248,113,113,0.12)',
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
      },
      borderRadius: {
        lg: '0.625rem',
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        // Elevazione dark-mode: top-highlight (linea chiara sul bordo superiore) + ombra
        // ambientale morbida. Il highlight è ciò che "solleva" la card dal fondo scuro.
        card: 'inset 0 1px 0 0 rgba(255,255,255,0.055), 0 1px 2px 0 rgba(0,0,0,0.55)',
        raised:
          'inset 0 1px 0 0 rgba(255,255,255,0.06), 0 8px 24px -6px rgba(0,0,0,0.7)',
        popover:
          'inset 0 1px 0 0 rgba(255,255,255,0.06), 0 16px 40px -8px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
        'accent-glow': '0 0 0 1px rgba(99,102,241,0.55), 0 4px 16px -2px rgba(99,102,241,0.28)',
      },
      transitionTimingFunction: {
        'out-strong': 'cubic-bezier(0.23, 1, 0.32, 1)',
        'in-out-strong': 'cubic-bezier(0.77, 0, 0.175, 1)',
        drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'overlay-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms cubic-bezier(0.23,1,0.32,1)',
        'scale-in': 'scale-in 200ms cubic-bezier(0.23,1,0.32,1)',
        'slide-up-in': 'slide-up-in 250ms cubic-bezier(0.23,1,0.32,1) both',
        'overlay-in': 'overlay-in 180ms ease-out',
        'spin-fast': 'spin 700ms linear infinite',
      },
    },
  },
  plugins: [],
};
