export default [
    {
        ignores: ["dist/", "node_modules/"]
    },
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                window: "readonly",
                document: "readonly",
                console: "readonly",
                localStorage: "readonly",
                navigator: "readonly",
                setTimeout: "readonly",
                setInterval: "readonly",
                clearTimeout: "readonly",
                clearInterval: "readonly",
                URL: "readonly",
                fetch: "readonly",
                alert: "readonly",
                confirm: "readonly",
                getComputedStyle: "readonly",
                requestAnimationFrame: "readonly",
                cancelAnimationFrame: "readonly",
                performance: "readonly",
                Notification: "readonly",
                html2pdf: "readonly",
                Event: "readonly",
                Audio: "readonly",
                SpeechSynthesisUtterance: "readonly",
                // App specific globals (until migrated to modules)
                APP_CONFIG: "readonly",
                AppState: "readonly",
                Modals: "readonly",
                DB_COMMUNITY: "readonly",
                DB_TRACCE: "readonly",
                GLOSSARIO_ISTITUTI: "readonly",
                cloud: "readonly",
                app: "readonly",
                OraleController: "readonly",
                SimulationController: "readonly",
                CommunityController: "readonly",
                AppLoader: "readonly",
                showToast: "readonly",
                escapeHtml: "readonly",
                lucide: "readonly",
                Chart: "readonly"
            }
        },
        rules: {
            "semi": ["error", "always"],
            "quotes": ["warn", "single", { "avoidEscape": true }],
            "no-unused-vars": "warn",
            "no-undef": "error"
        }
    },
    {
        // File Node.js (serverless functions, script di pipeline, test)
        files: ["api/**/*.js", "scripts/**/*.js", "scripts/**/*.mjs", "tests/**/*.mjs", "*.mjs", "*.cjs"],
        languageOptions: {
            globals: {
                process: "readonly",
                Buffer: "readonly",
                console: "readonly",
                fetch: "readonly",
                URL: "readonly",
                setTimeout: "readonly",
                setInterval: "readonly",
                clearTimeout: "readonly",
                clearInterval: "readonly",
                __dirname: "readonly",
                require: "readonly",
                module: "writable",
                Response: "readonly",
                Headers: "readonly",
                Request: "readonly"
            }
        }
    }
];
