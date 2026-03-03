import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting migration to add portfolio, property, and OTA IDs to recurring_jobs...');

  try {
    // Get all recurring jobs
    const recurringJobs = await prisma.recurringJob.findMany({
      include: {
        jobs: {
          take: 1,
          include: {
            property: {
              select: {
                id: true,
                name: true,
                expedia_id: true,
                agoda_id: true,
                booking_id: true,
              },
            },
            portfolio: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    console.log(`Found ${recurringJobs.length} recurring jobs to update`);

    let updatedCount = 0;

    for (const recurringJob of recurringJobs) {
      const updates: any = {};

      // Get data from first job
      if (recurringJob.jobs.length > 0) {
        const firstJob = recurringJob.jobs[0];

        // Add portfolio information
        if (!recurringJob.portfolio_id && firstJob.portfolio_id) {
          updates.portfolio_id = firstJob.portfolio_id;
        }
        if (!recurringJob.portfolio_name && firstJob.portfolio_name) {
          updates.portfolio_name = firstJob.portfolio_name;
        }

        // Add property information
        if (!recurringJob.property_id && firstJob.property_id) {
          updates.property_id = firstJob.property_id;
        }
        if (!recurringJob.property_name && firstJob.property_name) {
          updates.property_name = firstJob.property_name;
        }

        // Add OTA hotel_id based on provider
        if (firstJob.property && firstJob.ota_provider) {
          let hotelId = null;
          
          switch (firstJob.ota_provider) {
            case 'Expedia':
              hotelId = firstJob.property.expedia_id;
              break;
            case 'Agoda':
              hotelId = firstJob.property.agoda_id;
              break;
            case 'Booking':
              hotelId = firstJob.property.booking_id;
              break;
          }
          
          if (!recurringJob.hotel_id && hotelId) {
            updates.hotel_id = hotelId;
          }
        }
      }

      // Update if there are any changes
      if (Object.keys(updates).length > 0) {
        await prisma.recurringJob.update({
          where: { id: recurringJob.id },
          data: updates,
        });

        updatedCount++;
        console.log(
          `Updated recurring job ${recurringJob.id}: ${JSON.stringify(updates)}`,
        );
      }
    }

    console.log(`Migration completed successfully! Updated ${updatedCount} recurring jobs.`);
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
