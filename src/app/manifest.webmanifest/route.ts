export function GET() {
  return Response.json({
    name: "All American Inline Hockey",
    short_name: "All American",
    start_url: "/me",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#B00000",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  });
}
