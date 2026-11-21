import { Redirect } from "expo-router";

// "/" goes to Today. The root layout sends logged-out users to /login first.
export default function Index() {
  return <Redirect href="/today" />;
}
