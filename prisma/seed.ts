import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Start seeding...");

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
