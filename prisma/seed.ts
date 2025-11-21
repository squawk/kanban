import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Start seeding...");

  // Create default tags
  const tags = await Promise.all([
    prisma.tag.create({
      data: { name: "Bug", color: "#ef4444" }, // red
    }),
    prisma.tag.create({
      data: { name: "Feature", color: "#3b82f6" }, // blue
    }),
    prisma.tag.create({
      data: { name: "Urgent", color: "#f59e0b" }, // orange
    }),
    prisma.tag.create({
      data: { name: "Enhancement", color: "#8b5cf6" }, // purple
    }),
    prisma.tag.create({
      data: { name: "Documentation", color: "#10b981" }, // green
    }),
    prisma.tag.create({
      data: { name: "Design", color: "#ec4899" }, // pink
    }),
  ]);

  console.log(`Created ${tags.length} default tags`);

  // Create the default board with default columns
  const board = await prisma.board.create({
    data: {
      columns: {
        create: [
          {
            id: "todo",
            title: "TODO",
            position: 0,
            cardIds: [],
          },
          {
            id: "in-progress",
            title: "In Progress",
            position: 1,
            cardIds: [],
          },
          {
            id: "completed",
            title: "Completed",
            position: 2,
            cardIds: [],
          },
        ],
      },
    },
  });

  console.log(`Created board with id: ${board.id}`);
  console.log("Seeding finished.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
