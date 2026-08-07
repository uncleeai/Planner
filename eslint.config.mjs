import next from 'eslint-config-next';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'build/**', 'next-env.d.ts'],
  },
  ...next,
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Apka celowo pobiera dane w przeglądarce po zamontowaniu strony
      // (`load()` w useEffect) — nie mamy warstwy serwerowej. Zostawiamy jako
      // ostrzeżenie, żeby nowe przypadki były widoczne, ale nie blokowały lintu.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];

export default config;
