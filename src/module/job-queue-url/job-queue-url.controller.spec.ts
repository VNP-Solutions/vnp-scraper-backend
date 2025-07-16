import { Test, TestingModule } from '@nestjs/testing';
import { JobQueueUrlStatus } from '@prisma/client';
import { Response } from 'express';
import { JobQueueUrlController } from './job-queue-url.controller';
import { IJobQueueUrlService } from './job-queue-url.interface';

describe('JobQueueUrlController', () => {
  let controller: JobQueueUrlController;
  let service: IJobQueueUrlService;

  const mockJobQueueUrlService = {
    createUrl: jest.fn(),
    getAllUrls: jest.fn(),
    getUrlById: jest.fn(),
    updateUrl: jest.fn(),
    deleteUrl: jest.fn(),
    getAvailableUrls: jest.fn(),
    bookAvailableUrl: jest.fn(),
    releaseUrl: jest.fn(),
    getUrlsByStatus: jest.fn(),
    getQueueStatistics: jest.fn(),
    setUrlMaintenance: jest.fn(),
    setUrlOffline: jest.fn(),
    setUrlOnline: jest.fn(),
  };

  const mockResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobQueueUrlController],
      providers: [
        {
          provide: 'IJobQueueUrlService',
          useValue: mockJobQueueUrlService,
        },
      ],
    }).compile();

    controller = module.get<JobQueueUrlController>(JobQueueUrlController);
    service = module.get<IJobQueueUrlService>('IJobQueueUrlService');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createUrl', () => {
    const createUrlDto = {
      name: 'Test Server',
      url: 'http://test-server.com:3000',
      description: 'Test server description',
      priority: 5,
      max_concurrent_jobs: 2,
      is_active: true,
    };

    const mockCreatedUrl = {
      id: '507f1f77bcf86cd799439011',
      ...createUrlDto,
      status: JobQueueUrlStatus.Available,
      assigned_to_job_id: null,
      last_used: null,
      current_job_count: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create a new URL successfully', async () => {
      mockJobQueueUrlService.createUrl.mockResolvedValue(mockCreatedUrl);

      await controller.createUrl(createUrlDto, mockResponse);

      expect(service.createUrl).toHaveBeenCalledWith(createUrlDto);
    });
  });

  describe('bookUrl', () => {
    const bookUrlDto = { jobId: '507f1f77bcf86cd799439012' };

    it('should book an available URL successfully', async () => {
      const mockBookingResult = {
        success: true,
        message: 'URL booked successfully',
        url: {
          id: '507f1f77bcf86cd799439011',
          name: 'Test Server',
          url: 'http://test-server.com:3000',
          status: JobQueueUrlStatus.Booked,
        },
      };

      mockJobQueueUrlService.bookAvailableUrl.mockResolvedValue(
        mockBookingResult,
      );

      await controller.bookUrl(bookUrlDto, mockResponse);

      expect(service.bookAvailableUrl).toHaveBeenCalledWith(bookUrlDto.jobId);
    });

    it('should return error when all servers are busy', async () => {
      const mockBookingResult = {
        success: false,
        message: 'All servers are busy. No available URLs for booking.',
      };

      mockJobQueueUrlService.bookAvailableUrl.mockResolvedValue(
        mockBookingResult,
      );

      await controller.bookUrl(bookUrlDto, mockResponse);

      expect(service.bookAvailableUrl).toHaveBeenCalledWith(bookUrlDto.jobId);
    });
  });

  describe('getAllUrls', () => {
    it('should return all URLs', async () => {
      const mockUrls = [
        {
          id: '1',
          name: 'Server 1',
          url: 'http://server1.com',
          status: JobQueueUrlStatus.Available,
        },
        {
          id: '2',
          name: 'Server 2',
          url: 'http://server2.com',
          status: JobQueueUrlStatus.Booked,
        },
      ];

      mockJobQueueUrlService.getAllUrls.mockResolvedValue(mockUrls);

      await controller.getAllUrls(mockResponse);

      expect(service.getAllUrls).toHaveBeenCalled();
    });
  });

  describe('getAvailableUrls', () => {
    it('should return available URLs', async () => {
      const mockAvailableUrls = [
        {
          id: '1',
          name: 'Server 1',
          url: 'http://server1.com',
          status: JobQueueUrlStatus.Available,
        },
      ];

      mockJobQueueUrlService.getAvailableUrls.mockResolvedValue(
        mockAvailableUrls,
      );

      await controller.getAvailableUrls(mockResponse);

      expect(service.getAvailableUrls).toHaveBeenCalled();
    });
  });

  describe('getStatistics', () => {
    it('should return queue statistics', async () => {
      const mockStats = {
        total: 5,
        available: 3,
        booked: 1,
        maintenance: 1,
        offline: 0,
        totalCapacity: 10,
        currentUsage: 2,
      };

      mockJobQueueUrlService.getQueueStatistics.mockResolvedValue(mockStats);

      await controller.getStatistics(mockResponse);

      expect(service.getQueueStatistics).toHaveBeenCalled();
    });
  });

  describe('releaseUrl', () => {
    it('should release a booked URL', async () => {
      const urlId = '507f1f77bcf86cd799439011';
      const mockReleasedUrl = {
        id: urlId,
        name: 'Test Server',
        url: 'http://test-server.com:3000',
        status: JobQueueUrlStatus.Available,
        assigned_to_job_id: null,
        current_job_count: 0,
      };

      mockJobQueueUrlService.releaseUrl.mockResolvedValue(mockReleasedUrl);

      await controller.releaseUrl(urlId, mockResponse);

      expect(service.releaseUrl).toHaveBeenCalledWith(urlId);
    });
  });

  describe('setMaintenance', () => {
    it('should set URL to maintenance mode', async () => {
      const urlId = '507f1f77bcf86cd799439011';
      const mockMaintenanceUrl = {
        id: urlId,
        status: JobQueueUrlStatus.Maintenance,
      };

      mockJobQueueUrlService.setUrlMaintenance.mockResolvedValue(
        mockMaintenanceUrl,
      );

      await controller.setMaintenance(urlId, mockResponse);

      expect(service.setUrlMaintenance).toHaveBeenCalledWith(urlId);
    });
  });
});
