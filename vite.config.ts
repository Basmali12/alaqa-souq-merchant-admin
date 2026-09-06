import { defineConfig, type Plugin } from "vite";

function courierIdentity(): Plugin {
  return {
    name: "courier-pwa-identity",
    transformIndexHtml(html) {
      return html
        .replace("تطبيق إدارة تاجر علاكة", "تطبيق مندوب علاكة سوك لاستلام طلبات التوصيل")
        .replaceAll("إدارة تاجر", "مندوب علاكة سوك")
        .replace("./manifest.webmanifest", "./courier.webmanifest")
        .replaceAll("./icons/merchant-192.png", "./icons/courier-192.png");
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: mode === "courier" ? [courierIdentity()] : [],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
}));
