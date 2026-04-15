import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ["react", "react-native", "@react-navigation/native"],
});
