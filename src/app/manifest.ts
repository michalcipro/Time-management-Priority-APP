import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Priority Agent",
    short_name: "Priority",
    description: "Sjednocená komunikace, chytré priority a řízení týmu s AI asistentem.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8fc",
    theme_color: "#2563eb",
    lang: "cs",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
