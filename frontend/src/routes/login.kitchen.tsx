import { createFileRoute } from "@tanstack/react-router";
import { StaffRoleLogin } from "@/components/StaffRoleLogin";

export const Route = createFileRoute("/login/kitchen")({
  head: () => ({
    meta: [
      { title: "Kitchen team sign in — Tales of Hyderabad" },
      { name: "description", content: "Sign in to view your outlet kitchen display." },
    ],
  }),
  component: KitchenLoginPage,
});

function KitchenLoginPage() {
  return <StaffRoleLogin role="kitchen" />;
}
