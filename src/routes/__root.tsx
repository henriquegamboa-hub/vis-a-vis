import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import appCss from "../styles.css?url";

const APP_NAME = "Vis-à-vis";

/** Public file URL. `BASE_URL` is `/` in dev and `/<repo>/` on GitHub Pages. */
function publicAsset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Conversation locale à deux claviers : saisie classique à gauche, braille français par accords à droite.",
      },
      { name: "theme-color", content: "#121410" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: publicAsset("favicon.svg") },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  component: () => (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
