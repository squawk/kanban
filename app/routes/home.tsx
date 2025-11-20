import type { Route } from "./+types/home";
import { KanbanBoard } from "~/components/KanbanBoard";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Vibe Coding Kanban" },
    { name: "description", content: "A beautiful project management kanban board" },
  ];
}

export default function Home() {
  return <KanbanBoard />;
}
