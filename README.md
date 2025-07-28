## Description

This project serves as the main backend for managing and orchestrating job execution. It provides APIs and logic to queue, schedule, and monitor jobs, which are then executed by a separate runner project. The backend handles job metadata, status tracking, and job queue management, acting as the central hub for job processing workflows.

## Project setup

# Git clone
```
$ git clone [https://github.com/VNP-Solutions/vnp-scraper-backend]
```

## Compile and run the project

NPM Setup

```bash
$ npm install --legacy-per-deps
```


```bash
#switch to working branch
git switch staging 

#generate prisma schema
npx prisma generate

#build
npm run build

# development(don't follow)
$ npm run start

# watch mode/development
$ npm run start:dev

# production mode
$ npm run start:prod
```

# Git commands
```
$ git switch staging
$ git pull origin staging
$ git checkout -b new-branch
```
Make changes to your code
```
$ git add .
$ git commit -m "Your fancy commit message"
$ git switch staging
$ git pull origin staging
$ git switch new-branch
$ git rebase staging
$ git push origin new-branch
```

## Scraper Module

The scraper module provides a modular architecture for integrating multiple booking platforms (Booking.com, Expedia, etc.) with a unified interface. It uses inheritance and interface patterns to ensure consistency while allowing platform-specific customizations.

### Architecture Overview

```
├── scraper/
│   ├── base-scraper.controller.ts     # Abstract base controller with shared functionality
│   ├── platform.dto.ts                # Generic data transfer objects (type maintenance)
│   ├── platform.interface.ts          # Behavioral contracts (polymorphism)
│   ├── scraper.dto.ts                  # Common response DTOs
│   ├── scraper.module.ts               # Module configuration
│   ├── expedia/                        # Expedia implementation
│   │   ├── expedia.controller.ts
│   │   ├── expedia.dto.ts
│   │
    └── new-platform/                  # For example - airbnb/
        ├── new-platform.controller.ts
        ├── new-platform.dto.ts
        └── new-platform.validation.ts
```

### Adding a New Platform
 - Create platform directory
 - Create platform specific DTOs
 - Create platform controller that extends BaseScraperController and implement the abstract methods
 - Add validations if needed
 - Register controller, by updating `scraper.module.ts`

