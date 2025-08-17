import { Inject, Injectable, Logger } from '@nestjs/common';
import { Property } from '@prisma/client';
import { EncryptionUtil } from 'src/common/utils/encryption.util';
import * as XLSX from 'xlsx';
import { CreatePropertyDto, UpdatePropertyDto } from './property.dto';
import { IPropertyRepository, IPropertyService } from './property.interface';

@Injectable()
export class PropertyService implements IPropertyService {
  constructor(
    @Inject('IPropertyRepository')
    private readonly repository: IPropertyRepository,
    private readonly logger: Logger,
    private readonly encryptionUtil: EncryptionUtil,
  ) {}

  async createProperty(data: CreatePropertyDto): Promise<Property> {
    try {
      const property = await this.repository.create(data);
      return this.processProperty(property);
    } catch (error) {
      this.logger.error(
        `Error creating property: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getAllProperties(query?: Record<string, any>): Promise<any> {
    try {
      const data = await this.repository.findAll(query);
      for (let property of data.properties) {
        property = this.processProperty(property);
      }
      return data;
    } catch (error) {
      this.logger.error(
        `Error getting properties: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getPropertyById(id: string): Promise<Property> {
    try {
      const property = await this.repository.findById(id);
      if (!property) {
        throw new Error(`Property with ID ${id} not found`);
      }
      return this.processProperty(property);
    } catch (error) {
      this.logger.error(
        `Error finding property: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async updateProperty(id: string, data: UpdatePropertyDto): Promise<Property> {
    try {
      const property = await this.repository.update(id, data);
      return this.processProperty(property);
    } catch (error) {
      this.logger.error(
        `Error updating property: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async deleteProperty(id: string): Promise<Property> {
    try {
      const property = await this.repository.delete(id);
      return property;
    } catch (error) {
      this.logger.error(
        `Error deleting property: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getPermission(id: string, userId: string): Promise<any> {
    return this.repository.getPermission(id, userId);
  }

  async getFilteredProperty(
    userId: string,
    query?: Record<string, any>,
  ): Promise<any> {
    const data = await this.repository.findFilteredProperty(userId, query);
    for (let property of data.properties) {
      property = this.processProperty(property);
    }
    return data;
  }

  async getPermissionByPortfolioId(
    portfolioId: string,
    userId: string,
  ): Promise<any> {
    return this.repository.getPermissionByPortfolioId(portfolioId, userId);
  }

  async getPermissionBySubPortfolioId(
    subPortfolioId: string,
    userId: string,
  ): Promise<any> {
    return this.repository.getPermissionBySubPortfolioId(
      subPortfolioId,
      userId,
    );
  }

  async getPropertyByPortfolioId(portfolioId: string): Promise<any> {
    return this.repository.findPropertyByPortfolioId(portfolioId);
  }

  async getPropertyBySubPortfolioId(subPortfolioId: string): Promise<any> {
    return this.repository.findPropertyBySubPortfolioId(subPortfolioId);
  }

  private processProperty(property: any) {
    // Decrypt the password when returning property data
    if (property.user_password) {
      try {
        property.user_password = this.encryptionUtil.decryptPassword(
          property.user_password,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to decrypt password for property ${property.id}: ${error.message}`,
        );
        // Keep the encrypted password if decryption fails
      }
    }

    const credential = { ...property.credentials?.[0] };
    property.credentials = credential;
    return property;
  }

  async findPortfolioAndSubPortfolioForDropdown(user: any): Promise<any> {
    return this.repository.findPortfolioAndSubPortfolioForDropdown(user);
  }

  async getAllPropertiesByUserPermission(
    userId: string,
    isAdmin: boolean,
  ): Promise<Property[]> {
    try {
      const properties = await this.repository.findAllByUserPermission(
        userId,
        isAdmin,
      );
      return properties.map((property) => this.processProperty(property));
    } catch (error) {
      this.logger.error(
        `Error getting properties by user permission: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get decrypted credentials for authentication purposes
   * @param propertyId - Property ID
   * @returns Object with decrypted user_email and user_password
   */
  // async getPropertyCredentials(
  //   propertyId: string,
  // ): Promise<any> {
  //   try {
  //     const property = await this.repository.findById(propertyId);
  //     if (!property) {
  //       throw new Error(`Property with ID ${propertyId} not found`);
  //     }

  //     return property
  //   } catch (error) {
  //     this.logger.error(
  //       `Error getting property credentials: ${error.message}`,
  //       error.stack,
  //     );
  //     throw error;
  //   }
  // }

  /**
   * Import properties from Excel file
   *
   * Expected Excel format:
   * - Required columns: "Property"
   * - Optional columns: "Portfolio", "Sub Portfolio", "email", "password"
   * - OTA columns: "expedia_id", "expedia_status", "booking_id", "booking_status", "agoda_id", "agoda_status"
   * - Credential columns: "expediaUsername", "expediaPassword", "agodaUsername", "agodaPassword", "bookingUsername", "bookingPassword", "expediaEmailAssociated", "propertyContactEmail", "portfolioContactEmail"
   *
   * The method will:
   * 1. Extract unique portfolio names and create them if they don't exist
   * 2. Extract unique sub-portfolio names and create them if they don't exist (linked to portfolios)
   * 3. Create properties with relationships to portfolios and sub-portfolios
   * 4. Create property credentials for OTA platforms
   *
   * @param file - Excel file buffer
   * @returns Object containing creation counts and created entities
   */
  async importPropertiesFromExcel(file: Express.Multer.File): Promise<{
    portfoliosCreated: number;
    subPortfoliosCreated: number;
    propertiesCreated: number;
    credentialsCreated: number;
    portfolios: any[];
    subPortfolios: any[];
    properties: any[];
  }> {
    try {
      // Validate file buffer
      if (!file.buffer) {
        throw new Error('File buffer is empty');
      }

      // Parse Excel file
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      if (!data || data.length === 0) {
        throw new Error('Excel file is empty or invalid');
      }

      // Get headers from first row
      const headers = Object.keys(data[0] as any);

      // Check required headers
      if (!headers.includes('Property Name')) {
        throw new Error('Property column is required in Excel file');
      }

      this.logger.log(
        `Starting import process for ${data.length} rows with headers: ${headers.join(', ')}`,
      );

      let portfoliosCreated = 0;
      let subPortfoliosCreated = 0;
      let propertiesCreated = 0;
      let credentialsCreated = 0;
      const portfolios: any[] = [];
      const subPortfolios: any[] = [];
      const properties: any[] = [];

      // Step 1: Handle Portfolios
      if (headers.includes('Portfolio')) {
        const portfolioNames = [
          ...new Set(
            data
              .map((row: any) => row.Portfolio)
              .filter((name) => name && name.trim() !== ''),
          ),
        ];

        this.logger.log(
          `Found ${portfolioNames.length} unique portfolios to process`,
        );

        for (const portfolioName of portfolioNames) {
          try {
            // Check if portfolio exists
            const existingPortfolio = await this.repository.findPortfolioByName(
              portfolioName.toString(),
            );

            if (!existingPortfolio) {
              // Create new portfolio
              const newPortfolio = await this.repository.createPortfolio(
                portfolioName.toString(),
              );
              portfolios.push(newPortfolio);
              portfoliosCreated++;
              this.logger.log(`Created new portfolio: ${newPortfolio.name}`);
            } else {
              portfolios.push(existingPortfolio);
              this.logger.log(
                `Using existing portfolio: ${existingPortfolio.name}`,
              );
            }
          } catch (error) {
            this.logger.error(
              `Error processing portfolio ${portfolioName}: ${error.message}`,
            );
            throw error;
          }
        }
      }

      // Step 2: Handle Sub Portfolios
      if (headers.includes('Sub Portfolio')) {
        const subPortfolioData = data
          .map((row: any) => ({
            subPortfolioName: row['Sub Portfolio'],
            portfolioName: row['Portfolio'],
          }))
          .filter(
            (item) =>
              item.subPortfolioName && item.subPortfolioName.trim() !== '',
          );

        // Get unique sub-portfolio names
        const uniqueSubPortfolios = [
          ...new Set(subPortfolioData.map((item) => item.subPortfolioName)),
        ];

        this.logger.log(
          `Found ${uniqueSubPortfolios.length} unique sub-portfolios to process`,
        );

        for (const subPortfolioName of uniqueSubPortfolios) {
          try {
            // Find the corresponding portfolio for this sub-portfolio
            const relatedData = subPortfolioData.find(
              (item) => item.subPortfolioName === subPortfolioName,
            );
            const portfolioName = relatedData?.portfolioName;

            if (portfolioName) {
              const portfolio = portfolios.find(
                (p) => p.name === portfolioName.toString().trim(),
              );

              if (portfolio) {
                // Check if sub-portfolio exists
                const existingSubPortfolio =
                  await this.repository.findSubPortfolioByNameAndPortfolio(
                    subPortfolioName.toString(),
                    portfolio.id,
                  );

                if (!existingSubPortfolio) {
                  // Create new sub-portfolio
                  const newSubPortfolio =
                    await this.repository.createSubPortfolio(
                      subPortfolioName.toString(),
                      portfolio.id,
                    );
                  subPortfolios.push(newSubPortfolio);
                  subPortfoliosCreated++;
                  this.logger.log(
                    `Created new sub-portfolio: ${newSubPortfolio.name} under portfolio: ${portfolio.name}`,
                  );
                } else {
                  subPortfolios.push(existingSubPortfolio);
                  this.logger.log(
                    `Using existing sub-portfolio: ${existingSubPortfolio.name}`,
                  );
                }
              } else {
                this.logger.warn(
                  `Portfolio '${portfolioName}' not found for sub-portfolio '${subPortfolioName}'`,
                );
              }
            } else {
              this.logger.warn(
                `No portfolio specified for sub-portfolio '${subPortfolioName}'`,
              );
            }
          } catch (error) {
            this.logger.error(
              `Error processing sub-portfolio ${subPortfolioName}: ${error.message}`,
            );
            throw error;
          }
        }
      }

      // Step 3: Handle Properties
      this.logger.log(`Processing ${data.length} properties`);

      for (const row of data) {
        const rowData = row as any;

        if (
          !rowData['Property Name'] ||
          rowData['Property Name'].trim() === ''
        ) {
          continue;
        }

        try {
          // Find related portfolio and sub-portfolio
          let portfolioId = null;
          let subPortfolioId = null;

          if (rowData.Portfolio) {
            const portfolio = portfolios.find(
              (p) => p.name === rowData.Portfolio.toString().trim(),
            );
            if (portfolio) {
              portfolioId = portfolio.id;
            }
          }

          if (rowData['Sub Portfolio']) {
            const subPortfolio = subPortfolios.find(
              (sp) => sp.name === rowData['Sub Portfolio'].toString().trim(),
            );
            if (subPortfolio) {
              subPortfolioId = subPortfolio.id;
            }
          }

          // Check if property already exists
          const existingProperty =
            await this.repository.findPropertyByNameAndRelations(
              rowData['Property Name'].toString(),
              portfolioId,
              subPortfolioId,
            );

          if (!existingProperty) {
            // Create property data
            const propertyData: CreatePropertyDto = {
              name: rowData['Property Name'].toString().trim(),
              portfolio_id: portfolioId,
              sub_portfolio_id: subPortfolioId,
              expedia_id: rowData['Expedia ID']
                ? parseInt(rowData['Expedia ID'])
                : 0,
              expedia_status: rowData['Expedia Status'] || 'Access Required',
              booking_id: rowData.booking_id ? parseInt(rowData.booking_id) : 0,
              booking_status: rowData['Booking Status'] || 'Access Required',
              agoda_id: rowData['Agoda ID'] ? parseInt(rowData['Agoda ID']) : 0,
              agoda_status: rowData['Agoda Status'] || 'Access Required',
            };

            // Create property using existing method (which handles encryption)
            const newProperty = await this.createProperty(propertyData);
            properties.push(newProperty);
            propertiesCreated++;
            this.logger.log(`Created new property: ${newProperty.name}`);

            // Create property credentials if any credential data exists
            const credentialsData: any = {};
            let hasCredentials = false;

            // Check for credential columns and extract data
            if (rowData['Expedia Username']) {
              credentialsData.expediaUsername = rowData['Expedia Username']
                .toString()
                .trim();
              hasCredentials = true;
            }
            if (rowData['Expedia Password']) {
              credentialsData.expediaPassword =
                this.encryptionUtil.encryptPassword(
                  rowData['Expedia Password'],
                );

              hasCredentials = true;
            }
            if (rowData['Agoda Username']) {
              credentialsData.agodaUsername = rowData['Agoda Username']
                .toString()
                .trim();
              hasCredentials = true;
            }
            if (rowData['Agoda Password']) {
              credentialsData.agodaPassword =
                this.encryptionUtil.encryptPassword(rowData['Agoda Password']);

              hasCredentials = true;
            }
            if (rowData['Booking Username']) {
              credentialsData.bookingUsername = rowData['Booking Username']
                .toString()
                .trim();
              hasCredentials = true;
            }
            if (rowData['Booking Password']) {
              credentialsData.bookingPassword =
                this.encryptionUtil.encryptPassword(
                  rowData['Booking Password'],
                );
              hasCredentials = true;
            }
            if (rowData['Expedia Email Associated']) {
              credentialsData.expediaEmailAssociated = rowData[
                'Expedia Email Associated'
              ]
                .toString()
                .trim();
              hasCredentials = true;
            }
            if (rowData['Property Contact Email']) {
              credentialsData.propertyContactEmail = rowData[
                'Property Contact Email'
              ]
                .toString()
                .trim();
              hasCredentials = true;
            }
            if (rowData['Portfolio Contact Email']) {
              credentialsData.portfolioContactEmail = rowData[
                'Portfolio Contact Email'
              ]
                .toString()
                .trim();
              hasCredentials = true;
            }
            if (rowData['Multiple Portfolio Emails']) {
              // Handle comma-separated emails
              const emails = rowData['Multiple Portfolio Emails']
                .toString()
                .split(',')
                .map((email: string) => email.trim())
                .filter((email: string) => email);
              if (emails.length > 0) {
                credentialsData.multiplePortfolioEmails = emails;
                hasCredentials = true;
              }
            }

            // Create credentials if any credential data exists
            if (hasCredentials) {
              try {
                await this.repository.createPropertyCredentials(
                  newProperty.id,
                  credentialsData,
                );
                credentialsCreated++;
                this.logger.log(
                  `Created credentials for property: ${newProperty.name}`,
                );
              } catch (credentialError) {
                this.logger.error(
                  `Error creating credentials for property ${newProperty.name}: ${credentialError.message}`,
                );
                // Don't fail the entire import if credentials creation fails
              }
            }
          } else {
            this.logger.log(
              `Property '${rowData['Property Name']}' already exists, skipping`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Error processing property ${rowData['Property Name']}: ${error.message}`,
          );
          // Continue with next property instead of stopping the entire import
        }
      }

      this.logger.log(
        `Import completed: ${portfoliosCreated} portfolios, ${subPortfoliosCreated} sub-portfolios, ${propertiesCreated} properties, and ${credentialsCreated} credentials created`,
      );

      return {
        portfoliosCreated,
        subPortfoliosCreated,
        propertiesCreated,
        credentialsCreated,
        portfolios,
        subPortfolios,
        properties,
      };
    } catch (error) {
      this.logger.error(
        `Error importing properties from Excel: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
