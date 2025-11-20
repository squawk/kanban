import { Link } from "react-router";
import type { Route } from "./+types/about";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "About - Kanban Board" },
    { name: "description", content: "Learn more about our Kanban Board application" },
  ];
}

export default function About() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container flex h-16 items-center px-4">
          <h1 className="text-xl font-bold">Kanban Board</h1>
          <nav className="ml-auto flex gap-4 sm:gap-6">
            <Link
              className="text-sm font-medium hover:underline underline-offset-4"
              to="/"
            >
              Home
            </Link>
            <Link
              className="text-sm font-medium hover:underline underline-offset-4"
              to="/about"
            >
              About
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <section className="w-full py-12 md:py-24">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                  About This Project
                </h1>
                <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl">
                  A modern kanban board application showcasing the latest web technologies
                </p>
              </div>
            </div>
            <div className="mx-auto max-w-3xl space-y-6 py-12">
              <Card>
                <CardHeader>
                  <CardTitle>Technology Stack</CardTitle>
                  <CardDescription>
                    Built with cutting-edge tools and frameworks
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">React Router 7</h3>
                    <p className="text-sm text-muted-foreground">
                      The latest version of React Router provides a powerful routing
                      solution with built-in data loading, actions, and more.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Tailwind CSS</h3>
                    <p className="text-sm text-muted-foreground">
                      A utility-first CSS framework that allows for rapid UI
                      development with consistent design patterns.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">shadcn/ui</h3>
                    <p className="text-sm text-muted-foreground">
                      A collection of re-usable components built with Radix UI and
                      Tailwind CSS, providing accessible and customizable UI elements.
                    </p>
                  </div>
                </CardContent>
              </Card>
              <div className="flex justify-center">
                <Button asChild>
                  <Link to="/">Back to Home</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
