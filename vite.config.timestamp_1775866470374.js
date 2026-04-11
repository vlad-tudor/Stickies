// vite.config.ts
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
var vite_config_default = defineConfig({
  plugins: [solidPlugin()],
  resolve: {
    alias: {
      "~": "/src"
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler"
      }
    }
  }
});
export {
  vite_config_default as default
};
