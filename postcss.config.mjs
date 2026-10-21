// Tailwind runs through PostCSS so it also applies to the separately-bundled
// Wix dashboard extension (which does not inherit Astro's Vite plugins).
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
