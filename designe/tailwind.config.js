/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./index.tsx",
        "./App.tsx",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./context/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                serif: ['Playfair Display', 'serif'],
            },
            colors: {
                dark: {
                    bg: '#000000',
                    card: '#121212',
                    cardHover: '#18181b',
                    border: '#27272a',
                    text: '#ffffff',
                    textMuted: '#a1a1aa',
                    accent: '#3b82f6',
                }
            }
        },
    },
    plugins: [],
}
