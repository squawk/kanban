import { Link } from "react-router";
import type { Route } from "./+types/home";
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
    { title: "Kanban Board" },
    { name: "description", content: "A React Router 7 app with Tailwind and shadcn/ui" },
  ];
}

export default function Home() {
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
        <section className="w-full py-12 md:py-24 lg:py-32">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none">
                  Welcome to Kanban Board
                </h1>
                <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl">
                  Built with React Router 7, Tailwind CSS, and shadcn/ui components
                </p>
              </div>
              <div className="space-x-4">
                <Button asChild>
                  <Link to="/about">Learn More</Link>
                </Button>
                <Button variant="outline" asChild>
                  <a
                    href="https://reactrouter.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Documentation
                  </a>
                </Button>
              </div>
            </div>
            <div className="mx-auto grid max-w-5xl gap-6 py-12 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>React Router 7</CardTitle>
                  <CardDescription>
                    Modern routing for React applications
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Built on top of Vite with full TypeScript support and modern
                    React patterns.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Tailwind CSS</CardTitle>
                  <CardDescription>
                    Utility-first CSS framework
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Rapidly build modern websites with a utility-first approach
                    and custom design system.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>shadcn/ui</CardTitle>
                  <CardDescription>
                    Beautiful UI components
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Accessible, customizable components built with Radix UI and
                    Tailwind CSS.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
