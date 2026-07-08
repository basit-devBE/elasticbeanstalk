# AWS Elastic Beanstalk — Node.js Deployment Lab

## Overview

This project demonstrates how to deploy a managed web application on AWS Elastic Beanstalk with a fully automated CI/CD pipeline. Application versions are built from source, packaged into a ZIP bundle, uploaded to Amazon S3, and deployed automatically whenever new code is pushed to GitHub — without any manual intervention.

The application also integrates with Amazon DynamoDB as an external data service, with connection details managed securely through Elastic Beanstalk environment variables.

---

## What We Built

| Component | Technology |
|-----------|------------|
| Web application | Node.js + Express |
| Hosting | AWS Elastic Beanstalk |
| CI/CD pipeline | GitHub Actions |
| Artifact storage | Amazon S3 |
| External data service | Amazon DynamoDB |
| Infrastructure identity | AWS IAM |

---

## Documentation Index

| Document | Description |
|----------|-------------|
| [Architecture](./architecture.md) | System design, component relationships, data flow |
| [Application](./application.md) | Source code walkthrough, endpoints, UI |
| [Setup Guide](./setup.md) | Step-by-step AWS and GitHub setup instructions |
| [CI/CD Pipeline](./cicd.md) | GitHub Actions workflow explained in detail |
| [DynamoDB Integration](./dynamodb.md) | Table design, connection, read/write operations |
| [IAM Permissions](./iam-permissions.md) | Roles, policies, and least-privilege breakdown |

---

## Live Endpoints

| Endpoint | Description |
|----------|-------------|
| `/` | Deployment dashboard — version, region, status |
| `/data` | DynamoDB data explorer — list and add items |
| `/health` | JSON health check used by Elastic Beanstalk |

---

## Key Capabilities Demonstrated

- **Automated deployment** — every `git push` to `master` triggers the full pipeline
- **Versioned releases** — each deployment gets a unique label (`<sha>-<run>-<attempt>`) tracked in Elastic Beanstalk
- **Managed infrastructure** — no direct EC2, load balancer, or scaling configuration
- **External service integration** — live DynamoDB reads and writes through IAM instance roles
- **Environment-based configuration** — no credentials in code, all connection details in EB environment variables
- **Zero-downtime awareness** — workflow waits for environment to reach healthy state before completing
