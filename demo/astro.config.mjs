import { defineConfig } from "astro/config";
import asteroids from "astro-asteroids";

export default defineConfig({
  integrations: [
    asteroids({
      trigger: "both",
      shipColor: "#4DD0E1",
      particleColor: "#FF3B30",
    }),
  ],
});
