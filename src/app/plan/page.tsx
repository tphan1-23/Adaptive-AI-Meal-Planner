import { redirect } from "next/navigation";

// The design has no separate weekly-plan screen: the week strip on Today is the plan view.
export default function PlanPage() {
  redirect("/today");
}
