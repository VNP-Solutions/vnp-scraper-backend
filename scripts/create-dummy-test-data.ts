import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createDummyTestData() {
  console.log('Creating dummy test data for AgodaCaseItem...');

  try {
    // Job IDs provided by user
    const jobIds = ['6a985e96bd7aa6611611adf5', '6a985e96bd7aa6611611adf4'];

    // Fetch the jobs to get property/batch info
    const jobs = await prisma.job.findMany({
      where: {
        id: { in: jobIds },
      },
      include: {
        property: {
          include: {
            portfolio: true,
          },
        },
        batch: true,
      },
    });

    if (jobs.length === 0) {
      console.error('No jobs found with the provided IDs');
      return;
    }

    console.log(`Found ${jobs.length} job(s)`);

    // Get a user for createdBy
    const user = await prisma.user.findFirst();
    if (!user) {
      console.error('No users found in the database');
      return;
    }

    const dummyItems = [];

    // Create 3-5 dummy items per job
    for (const job of jobs) {
      const itemCount = Math.floor(Math.random() * 3) + 3; // 3-5 items

      for (let i = 0; i < itemCount; i++) {
        const reservationId = `TEST${Math.floor(Math.random() * 1000000000)}`;
        const checkInDate = new Date(2026, 8, 10 + i);
        const checkOutDate = new Date(2026, 8, 15 + i);
        
        dummyItems.push({
          property_id: job.property_id,
          batch_id: job.batch_id,
          portfolio_id: job.property.portfolio_id,
          reservation_id: reservationId,
          guest_name: `Dummy Guest ${i + 1}`,
          check_in: checkInDate.toISOString().split('T')[0], // YYYY-MM-DD
          check_out: checkOutDate.toISOString().split('T')[0], // YYYY-MM-DD
          amount: (Math.random() * 500 + 100).toFixed(2),
          amount_to_charge: (Math.random() * 500 + 100).toFixed(2),
          vcc_card_number: `4111${Math.floor(Math.random() * 100000000000000)}`.substring(0, 16),
          card_expire: '12/28',
          card_cvv: '123',
          currency: 'USD',
          charge_status: ['retrieval_required', 'pending', 'charged'][Math.floor(Math.random() * 3)],
          is_missing: [true, false][Math.floor(Math.random() * 2)],
          is_archived: false,
          is_declined: [true, false][Math.floor(Math.random() * 2)],
          ota_provider: 'Agoda',
          posting_type: job.posting_type || 'pre',
          createdBy: user.id,
        });
      }
    }

    // Insert all dummy items
    const result = await prisma.agodaCaseItem.createMany({
      data: dummyItems,
    });

    console.log(`✅ Successfully created ${result.count} dummy AgodaCaseItem records`);
    console.log('Job IDs:', jobIds);
    console.log('\nYou can now test the export/archive APIs with these records.');
    console.log('\n⚠️  Remember to delete these test records after testing!');
  } catch (error) {
    console.error('Error creating dummy test data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createDummyTestData();
