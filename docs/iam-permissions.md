# IAM Permissions

## Overview

Two IAM identities are used in this project:

| Identity | Type | Used by | Purpose |
|----------|------|---------|---------|
| `github-actions-eb` | IAM User | GitHub Actions workflow | Deploy new versions to EB |
| `aws-elasticbeanstalk-ec2-role` | IAM Role | EC2 instances (the app) | Access DynamoDB at runtime |

These two identities have completely different permission scopes because they serve different purposes. Keeping them separate is a security best practice — if the GitHub Actions credentials were ever compromised, they could not be used to read or write DynamoDB data, because that permission lives on the EC2 role, not the IAM user.

---

## IAM User — `github-actions-eb`

### Purpose
This user's credentials are stored as GitHub encrypted secrets and used exclusively by the GitHub Actions workflow to deploy new application versions.

### Authentication method
Long-lived access key (Access Key ID + Secret Access Key), stored as GitHub repository secrets:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

### Attached policies

| Policy | Type | Why it's needed |
|--------|------|-----------------|
| `AdministratorAccess-AWSElasticBeanstalk` | AWS Managed | Full EB access — create versions, update environments, describe resources |
| `AWSCloudFormationFullAccess` | AWS Managed | EB internally uses CloudFormation to update the infrastructure stack |
| `AmazonS3FullAccess` | AWS Managed | Upload deployment ZIPs and allow EB to read from its internal S3 bucket |

### What this user can do

- Upload deployment bundles to S3
- Register new Elastic Beanstalk application versions
- Trigger environment updates
- Read CloudFormation stack state
- Create/read EB's internal S3 bucket for runtime metadata

### What this user cannot do

- Read or write DynamoDB (that permission belongs to the EC2 role)
- Create or delete EC2 instances directly
- Access other AWS services not listed above

---

## IAM Role — `aws-elasticbeanstalk-ec2-role`

### Purpose
This role is the **instance profile** — it is attached to every EC2 instance that Elastic Beanstalk provisions. The application code running on those instances assumes this role automatically via the EC2 Instance Metadata Service.

### Authentication method
No keys. The AWS SDK on the EC2 instance calls the IMDS endpoint (`http://169.254.169.254/latest/meta-data/iam/security-credentials/`) to get a temporary token. AWS rotates these tokens automatically every few hours.

This is the recommended way to authenticate workloads running on EC2 — no credential management, no secrets to rotate, no risk of key exposure.

### Auto-created by
AWS Elastic Beanstalk creates this role automatically when you create your first environment. It comes with a default set of EB-required permissions.

### Attached policies (after manual additions)

| Policy | Type | Why it's needed |
|--------|------|-----------------|
| `AWSElasticBeanstalkWebTier` | AWS Managed | Default EB instance permissions (S3 logs, CloudWatch metrics, X-Ray) |
| `AWSElasticBeanstalkWorkerTier` | AWS Managed | Default EB worker permissions |
| `AWSElasticBeanstalkMulticontainerDocker` | AWS Managed | Default EB container permissions |
| `AmazonDynamoDBFullAccess` | AWS Managed | Read and write items in DynamoDB |

### What this role allows the application to do

- `dynamodb:Scan` — list all items in the table (used by `GET /data`)
- `dynamodb:PutItem` — write new items (used by `POST /data`)
- Write logs to CloudWatch
- Write metrics to CloudWatch
- Read/write EB's internal S3 bucket for platform operations

---

## How Credentials Flow

```
GitHub Secrets
(AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
        │
        ▼
GitHub Actions runner
        │
        └─► aws-actions/configure-aws-credentials
            sets environment variables for the AWS CLI
                    │
                    ▼
            AWS CLI commands (s3 cp, elasticbeanstalk create-application-version, etc.)
            authenticate as: github-actions-eb IAM user


EC2 Instance (running app.js)
        │
        └─► AWS SDK (aws-sdk)
            calls IMDS: http://169.254.169.254/...
                    │
                    ▼
            Receives temporary token for: aws-elasticbeanstalk-ec2-role
                    │
                    ▼
            DynamoDB API calls authenticate as: ec2 role (no keys in code)
```

---

## Security Principles Applied

| Principle | How it's applied |
|-----------|-----------------|
| Least privilege | GitHub Actions user has only deploy permissions; EC2 role has only DynamoDB access |
| Separation of duties | Deploy identity ≠ runtime identity |
| No hardcoded credentials | App uses IAM role; workflow uses GitHub Secrets |
| Short-lived tokens where possible | EC2 role tokens are temporary and auto-rotated |
| Secrets never in source code | `.gitignore` includes `.env`; no keys in `app.js` |

---

## Production Recommendations

For a production deployment, the following improvements would be made:

1. **Replace `AmazonDynamoDBFullAccess` with a scoped policy** targeting only the specific table ARN and only the actions needed (`Scan`, `PutItem`).

2. **Replace the IAM user with OIDC federation** — GitHub Actions supports OpenID Connect, which allows the workflow to request short-lived AWS credentials directly without storing a long-lived access key anywhere. This eliminates the need for `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` secrets entirely.

3. **Scope S3 permissions** on the GitHub Actions user to only the specific deployment bucket, not all S3 buckets.

4. **Enable CloudTrail** to audit all API calls made by both identities.
