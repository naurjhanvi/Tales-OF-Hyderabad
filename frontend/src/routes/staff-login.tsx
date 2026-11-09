import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/staff-login")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});
