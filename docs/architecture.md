# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Developer                               │
│                    git push → master                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub Actions                              │
│                                                                 │
│  1. Checkout source code                                        │
│  2. Configure AWS credentials (from GitHub Secrets)            │
│  3. Package app into versioned ZIP                              │
│  4. Upload ZIP → Amazon S3                                      │
│  5. Create Elastic Beanstalk application version               │
│  6. Deploy version to EB environment                           │
│  7. Wait for environment to become healthy                      │
└──────────┬────────────────────────┬────────────────────────────┘
           │                        │
           ▼                        ▼
┌──────────────────┐    ┌───────────────────────────┐
│   Amazon S3      │    │   Elastic Beanstalk        │
│                  │    │                            │
│  Deployment ZIPs │    │  ┌─────────────────────┐  │
│  (versioned)     │    │  │  EC2 Instance        │  │
│                  │    │  │  Node.js 24 / AL2023 │  │
└──────────────────┘    │  │                      │  │
                        │  │  app.js (Express)    │  │
                        │  │  npm dependencies    │  │
                        │  └──────────┬──────────┘  │
                        │             │              │
                        │  Health     │ IAM Role     │
                        │  checks     │ (no keys)    │
                        └────────────┼──────────────┘
                                     │
                                     ▼
                        ┌────────────────────────────┐
                        │      Amazon DynamoDB        │
                        │                            │
                        │  Table: eb-demo-stuff      │
                        │  PK: id (String)           │
                        │  Attrs: name, description  │
                        └────────────────────────────┘
```

---

## Component Breakdown

### GitHub Actions (CI/CD)
The automation layer. Triggered on every push to `master`, it orchestrates the entire deployment — from packaging to waiting for a healthy environment. It authenticates to AWS using an IAM user's credentials stored as GitHub encrypted secrets.

### Amazon S3 (Artifact Store)
Stores the application source bundles (ZIP files). Each bundle is named with a unique version label (`deploy-<sha>-<run>-<attempt>.zip`), giving a full history of every artifact ever deployed. Elastic Beanstalk reads directly from this bucket when deploying a new version.

### AWS Elastic Beanstalk (Managed Platform)
The core hosting layer. EB abstracts away EC2 instance management, OS patching, Node.js runtime setup, health monitoring, and auto-scaling configuration. It exposes a public URL and manages the lifecycle of application versions. Internally, EB uses AWS CloudFormation to provision and update the underlying infrastructure stack.

### EC2 Instance (Runtime)
The actual server running the Node.js application. Provisioned and managed entirely by Elastic Beanstalk. The instance uses an IAM instance profile (role) to authenticate AWS SDK calls — no access keys are ever stored on the server.

### Amazon DynamoDB (External Data Service)
A fully managed NoSQL database. The application connects to it at runtime using the AWS SDK, with the table name passed in via an Elastic Beanstalk environment variable. The EC2 instance role is granted DynamoDB access — the application code itself contains no credentials.

---

## Deployment Flow (step by step)

```
git push origin master
        │
        ▼
GitHub Actions triggers
        │
        ├─► Authenticate to AWS using GitHub Secrets
        │
        ├─► zip app.js + package.json + package-lock.json
        │   (excluding node_modules, .git, .github)
        │
        ├─► aws s3 cp deploy-<version>.zip s3://<bucket>/
        │
        ├─► aws elasticbeanstalk create-application-version
        │   --version-label "<sha>-<run>-<attempt>"
        │   --source-bundle S3Bucket=...,S3Key=...
        │
        ├─► aws elasticbeanstalk update-environment
        │   --version-label "<sha>-<run>-<attempt>"
        │   --option-settings APP_VERSION=<version>
        │
        ├─► aws elasticbeanstalk wait environment-updated
        │   (polls until status = Ready, health = Green/Ok)
        │
        └─► Print public URL to Actions log
```

---

## Request Flow (runtime)

```
User browser
     │
     ▼
http://<env>.elasticbeanstalk.com
     │
     ▼
Elastic Beanstalk (routes to EC2)
     │
     ▼
Express app (app.js, port 8080)
     │
     ├─► GET /          → HTML dashboard (no DB call)
     │
     ├─► GET /data      → Scan DynamoDB table → render items
     │
     ├─► POST /data     → PutItem to DynamoDB → redirect to /data
     │
     └─► GET /health    → JSON { status, version } (EB health check)
```

---

## Security Model

| Actor | Identity | How |
|-------|----------|-----|
| GitHub Actions | IAM User (`github-actions-eb`) | Access key stored as GitHub Secret |
| EC2 instance (app) | IAM Role (`aws-elasticbeanstalk-ec2-role`) | Instance profile — no keys anywhere |
| DynamoDB access | Granted to EC2 role | `AmazonDynamoDBFullAccess` managed policy |
| EB deployment | IAM User permissions | Scoped to S3, EB, EC2 describe, CloudFormation |

No AWS credentials are present in the application source code. All secrets are injected at runtime through IAM roles or environment variables.
