import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JobQueueUrlStatus } from '@prisma/client';
import { IJobQueueUrlRepository } from './job-queue-url.interface';
import { JobQueueUrlService } from './job-queue-url.service';

describe('JobQueueUrlService', () => {
  let service: JobQueueUrlService;
  let repository: IJobQueueUrlRepository;

  const mockJobQueueUrlRepository = {
    create: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn(),
    findAvailableUrls: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findByUrl: jest.fn(),
    findAvailableUrlForBooking: jest.fn(),
    bookUrl: jest.fn(),
    releaseUrl: jest.fn(),
    findByStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobQueueUrlService,
        {
          provide: 'IJobQueueUrlRepository',
          useValue: mockJobQueueUrlRepository,
        },
      ],
    }).compile();

    service = module.get<JobQueueUrlService>(JobQueueUrlService);
    repository = module.get<IJobQueueUrlRepository>('IJobQueueUrlRepository');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createUrl', () => {
    const createUrlData = {
      name: 'Test Server',
      url: 'http://test-server.com:3000',
      description: 'Test server description',
      priority: 5,
      max_concurrent_jobs: 2,
      is_active: true,
    };

    const mockCreatedUrl = {
      id: '507f1f77bcf86cd799439011',
      ...createUrlData,
      status: JobQueueUrlStatus.Available,
      assigned_to_job_id: null,
      last_used: null,
      current_job_count: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create a new URL successfully', async () => {
      mockJobQueueUrlRepository.findByUrl.mockResolvedValue(null);
      mockJobQueueUrlRepository.create.mockResolvedValue(mockCreatedUrl);

      const result = await service.createUrl(createUrlData);

      expect(repository.findByUrl).toHaveBeenCalledWith(createUrlData.url);
      expect(repository.create).toHaveBeenCalledWith(createUrlData);
      expect(result).toEqual(mockCreatedUrl);
    });

    it('should throw ConflictException if URL already exists', async () => {
      mockJobQueueUrlRepository.findByUrl.mockResolvedValue(mockCreatedUrl);

      await expect(service.createUrl(createUrlData)).rejects.toThrow(
        ConflictException,
      );
      expect(repository.findByUrl).toHaveBeenCalledWith(createUrlData.url);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('bookAvailableUrl', () => {
    const jobId = '507f1f77bcf86cd799439012';

    it('should book an available URL successfully', async () => {
      const availableUrl = {
        id: '507f1f77bcf86cd799439011',
        name: 'Test Server',
        url: 'http://test-server.com:3000',
        status: JobQueueUrlStatus.Available,
        current_job_count: 0,
        max_concurrent_jobs: 2,
      };

      const bookedUrl = {
        ...availableUrl,
        status: JobQueueUrlStatus.Booked,
        assigned_to_job_id: jobId,
        current_job_count: 1,
      };

      mockJobQueueUrlRepository.findAvailableUrlForBooking.mockResolvedValue(
        availableUrl,
      );
      mockJobQueueUrlRepository.bookUrl.mockResolvedValue(bookedUrl);

      const result = await service.bookAvailableUrl(jobId);

      expect(repository.findAvailableUrlForBooking).toHaveBeenCalled();
      expect(repository.bookUrl).toHaveBeenCalledWith(availableUrl.id, jobId);
      expect(result).toEqual({
        success: true,
        url: bookedUrl,
        message: 'URL booked successfully',
      });
    });

    it('should return error when no URLs are available', async () => {
      mockJobQueueUrlRepository.findAvailableUrlForBooking.mockResolvedValue(
        null,
      );

      const result = await service.bookAvailableUrl(jobId);

      expect(repository.findAvailableUrlForBooking).toHaveBeenCalled();
      expect(repository.bookUrl).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        message: 'All servers are busy. No available URLs for booking.',
      });
    });

    it('should handle booking errors gracefully', async () => {
      const availableUrl = {
        id: '507f1f77bcf86cd799439011',
        name: 'Test Server',
        url: 'http://test-server.com:3000',
        status: JobQueueUrlStatus.Available,
      };

      mockJobQueueUrlRepository.findAvailableUrlForBooking.mockResolvedValue(
        availableUrl,
      );
      mockJobQueueUrlRepository.bookUrl.mockRejectedValue(
        new Error('Database error'),
      );

      const result = await service.bookAvailableUrl(jobId);

      expect(result).toEqual({
        success: false,
        message: 'Failed to book URL: Database error',
      });
    });
  });

  describe('getUrlById', () => {
    const urlId = '507f1f77bcf86cd799439011';

    it('should return URL when found', async () => {
      const mockUrl = {
        id: urlId,
        name: 'Test Server',
        url: 'http://test-server.com:3000',
        status: JobQueueUrlStatus.Available,
      };

      mockJobQueueUrlRepository.findById.mockResolvedValue(mockUrl);

      const result = await service.getUrlById(urlId);

      expect(repository.findById).toHaveBeenCalledWith(urlId);
      expect(result).toEqual(mockUrl);
    });

    it('should throw NotFoundException when URL not found', async () => {
      mockJobQueueUrlRepository.findById.mockResolvedValue(null);

      await expect(service.getUrlById(urlId)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.findById).toHaveBeenCalledWith(urlId);
    });
  });

  describe('deleteUrl', () => {
    const urlId = '507f1f77bcf86cd799439011';

    it('should delete URL successfully when not in use', async () => {
      const mockUrl = {
        id: urlId,
        status: JobQueueUrlStatus.Available,
        current_job_count: 0,
      };

      mockJobQueueUrlRepository.findById.mockResolvedValue(mockUrl);
      mockJobQueueUrlRepository.delete.mockResolvedValue(undefined);

      await service.deleteUrl(urlId);

      expect(repository.findById).toHaveBeenCalledWith(urlId);
      expect(repository.delete).toHaveBeenCalledWith(urlId);
    });

    it('should throw NotFoundException when URL not found', async () => {
      mockJobQueueUrlRepository.findById.mockResolvedValue(null);

      await expect(service.deleteUrl(urlId)).rejects.toThrow(NotFoundException);
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when URL is in use', async () => {
      const mockUrl = {
        id: urlId,
        status: JobQueueUrlStatus.Booked,
        current_job_count: 1,
      };

      mockJobQueueUrlRepository.findById.mockResolvedValue(mockUrl);

      await expect(service.deleteUrl(urlId)).rejects.toThrow(ConflictException);
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });

  describe('releaseUrl', () => {
    const urlId = '507f1f77bcf86cd799439011';

    it('should release URL successfully', async () => {
      const mockUrl = {
        id: urlId,
        status: JobQueueUrlStatus.Booked,
        assigned_to_job_id: 'job123',
      };

      const releasedUrl = {
        ...mockUrl,
        status: JobQueueUrlStatus.Available,
        assigned_to_job_id: null,
        current_job_count: 0,
      };

      mockJobQueueUrlRepository.findById.mockResolvedValue(mockUrl);
      mockJobQueueUrlRepository.releaseUrl.mockResolvedValue(releasedUrl);

      const result = await service.releaseUrl(urlId);

      expect(repository.findById).toHaveBeenCalledWith(urlId);
      expect(repository.releaseUrl).toHaveBeenCalledWith(urlId);
      expect(result).toEqual(releasedUrl);
    });

    it('should throw NotFoundException when URL not found', async () => {
      mockJobQueueUrlRepository.findById.mockResolvedValue(null);

      await expect(service.releaseUrl(urlId)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.releaseUrl).not.toHaveBeenCalled();
    });
  });

  describe('getQueueStatistics', () => {
    it('should return queue statistics', async () => {
      const mockUrls = [
        {
          id: '1',
          status: JobQueueUrlStatus.Available,
          is_active: true,
          max_concurrent_jobs: 2,
          current_job_count: 0,
        },
        {
          id: '2',
          status: JobQueueUrlStatus.Booked,
          is_active: true,
          max_concurrent_jobs: 3,
          current_job_count: 1,
        },
        {
          id: '3',
          status: JobQueueUrlStatus.Maintenance,
          is_active: true,
          max_concurrent_jobs: 1,
          current_job_count: 0,
        },
        {
          id: '4',
          status: JobQueueUrlStatus.Offline,
          is_active: false,
          max_concurrent_jobs: 2,
          current_job_count: 0,
        },
      ];

      mockJobQueueUrlRepository.findAll.mockResolvedValue(mockUrls);

      const result = await service.getQueueStatistics();

      expect(repository.findAll).toHaveBeenCalled();
      expect(result).toEqual({
        total: 4,
        available: 1,
        booked: 1,
        maintenance: 1,
        offline: 1,
        totalCapacity: 8,
        currentUsage: 1,
      });
    });
  });
});
