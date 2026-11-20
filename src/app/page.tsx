import { redirect } from "next/navigation";

// "/" -> Today. The middleware sends logged-out visitors on to /login first.
export default function Home() {
  redirect("/today");
}
