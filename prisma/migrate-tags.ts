import { PrismaClient } from "@prisma/client";

// Ensure prisma client is generated
// Run `npx prisma generate` before executing this script

const prisma = new PrismaClient();

async function main() {
  console.log("Migrating tags...");

  // Delete Urgent tag
  const urgentTag = await prisma.tag.findFirst({
    where: { name: "Urgent" }
  });

  if (urgentTag) {
    await prisma.tag.delete({
      where: { id: urgentTag.id }
    });
    console.log("Deleted Urgent tag");
  }

  // Add new tags
  const newTags = [
    { name: "Blocked", color: "#ef4444" },
    { name: "Quick Win", color: "#10b981" },
    { name: "Research", color: "#8b5cf6" },
    { name: "Review", color: "#f59e0b" },
  ];

  for (const tag of newTags) {
    const exists = await prisma.tag.findFirst({
      where: { name: tag.name }
    });

    if (!exists) {
      await prisma.tag.create({ data: tag });
      console.log(`Created ${tag.name} tag`);
    } else {
      console.log(`${tag.name} tag already exists`);
    }
  }

  console.log("Migration complete");
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
