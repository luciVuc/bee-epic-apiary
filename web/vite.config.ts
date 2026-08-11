import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' lets the UpdatePrompt component show a toast when a new SW
      // is waiting, rather than 'autoUpdate' which silently swaps on the
      // next navigation. See web/src/components/pwa/UpdatePrompt.tsx
      // (review #12).
      registerType: "prompt",
      includeAssets: ["favicon.ico", "images/**/*.png"],
      manifest: {
        name: "Bee Epic Apiary",
        short_name: "Bee Epic",
        description: "Raw Honey & Bee Products",
        id: "bee-epic-apiary",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#ffffff",
        theme_color: "#f59e0b",
        categories: ["shopping", "food"],
        icons: [
          {
            src: "images/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "images/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "images/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "images/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        // Keep the service worker OFF in dev. Enabling it registers a dev-sw.js
        // that controls the page and double-mounts React ("createRoot() on a
        // container that has already been passed to createRoot()"). PWA is a
        // production concern; the manifest is generated and served only in the
        // build. In dev there is no manifest <link> (vite-plugin-pwa injects it
        // only when the SW is active), so nothing requests it and there is no
        // "Manifest: Syntax error" console noise.
        enabled: false,
      },
    }),
  ],
  base: "/",
});
