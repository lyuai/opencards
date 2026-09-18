import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { Brand } from "./brand";
import "./styles.css";

export function meta() {
  return [
    { title: "OpenCards · 掼蛋" },
    { name: "description", content: "在浏览器里打一局完整掼蛋，教练会看着牌面给你建议。" },
    { property: "og:title", content: "OpenCards · 掼蛋" },
    { property: "og:description", content: "四人牌桌、级牌升级、实时出牌建议。" },
    { name: "apple-mobile-web-app-title", content: "OpenCards" },
  ];
}

export function links() {
  return [
    { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  ];
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#173b2b" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const message = notFound ? "这个地址没有对应的页面。" : error instanceof Error ? error.message : "页面加载失败，请稍后再试。";
  return (
    <main className="training">
      <header><Brand /></header>
      <section className="trainingIntro">
        <small>OPENCARDS</small>
        <h1>{notFound ? "找不到这一页" : "出了点问题"}</h1>
        <p>{message}</p>
        <p><a className="primary" href="/" style={{ display: "inline-block", textDecoration: "none" }}>回牌桌</a></p>
      </section>
    </main>
  );
}
