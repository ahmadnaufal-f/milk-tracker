/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
    readonly VITE_FIREBASE_API_KEY: string
    readonly VITE_FIREBASE_AUTH_DOMAIN: string
    readonly VITE_FIREBASE_PROJECT_ID: string
    readonly VITE_FIREBASE_STORAGE_BUCKET: string
    readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
    readonly VITE_FIREBASE_APP_ID: string
    readonly VITE_DOMAIN_MIGRATION_ENABLED?: string
    readonly VITE_DOMAIN_MIGRATION_READY?: string
    readonly VITE_DOMAIN_MIGRATION_OLD_ORIGINS?: string
    readonly VITE_DOMAIN_MIGRATION_DESTINATION?: string
    readonly VITE_DOMAIN_MIGRATION_RETIREMENT_DATE?: string
    readonly VITE_DOMAIN_MIGRATION_CAMPAIGN_ID?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}

declare module '*?raw' {
    const content: string;
    export default content;
}
