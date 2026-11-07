import { redirect } from "next/navigation";

// The customer storefront waits for the owner's design pick (BUILD-PLAN §3). Until then the
// root goes straight to the staff dashboard.
export default function Home() {
  redirect("/dashboard");
}
