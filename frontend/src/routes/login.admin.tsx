import { createFileRoute } from "@tanstack/react-router";
import { StaffRoleLogin } from "@/components/StaffRoleLogin";

export const Route = createFileRoute("/login/admin")({
  head: () => ({
    meta: [
      { title: "Menu admin sign in — Tales of Hyderabad" },
      { name: "description", content: "Sign in to manage the central Tales of Hyderabad menu." },
    ],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  return <StaffRoleLogin role="admin" />;
}
