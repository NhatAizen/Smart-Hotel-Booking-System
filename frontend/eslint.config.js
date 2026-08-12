import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Dự án đang dùng các hàm tải dữ liệu được gọi từ effect; rule mới của
      // eslint-plugin-react-hooks báo quá nghiêm với mẫu này.
      'react-hooks/set-state-in-effect': 'off',
      // AuthContext vừa export Provider vừa export hook dùng chung.
      'react-refresh/only-export-components': 'off',
    },
  },
])
