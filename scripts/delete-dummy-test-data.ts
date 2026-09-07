import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteDummyTestData() {
  console.log('Deleting dummy test data from AgodaCaseItem...');

  try {
    // Delete all AgodaCaseItem records with reservation_id starting with "TEST"
    const result = await prisma.agodaCaseItem.deleteMany({
      where: {
        reservation_id: {
          startsWith: 'TEST',
        },
      },
    });

    console.log(`✅ Successfully deleted ${result.count} dummy AgodaCaseItem records`);
    console.log('\n✨ Database cleaned up!');
  } catch (error) {
    console.error('Error deleting dummy test data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

deleteDummyTestData();
