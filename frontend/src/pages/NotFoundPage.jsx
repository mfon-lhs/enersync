import { Compass } from "lucide-react";
import { Link } from "react-router";
import { EmptyState } from "../components/States.jsx";

export default function NotFoundPage() {
  return (
    <section className="panel">
      <EmptyState icon={Compass} title="This page does not exist">
        <Link to="/">Go back to the Command Center</Link>
      </EmptyState>
    </section>
  );
}
