import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WhatsApp Agent Hub — Dashboard" },
      { name: "description", content: "Centralized WhatsApp dashboard and AI agent gateway (MCP + REST)." },
      { property: "og:title", content: "WhatsApp Agent Hub" },
      { property: "og:description", content: "Centralized WhatsApp dashboard and AI agent gateway (MCP + REST)." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/accounts" });
  },
  component: () => null,
});
