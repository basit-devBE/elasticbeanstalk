# Setup Guide

This guide covers everything that needs to be configured in AWS and GitHub before the automated pipeline can run.

---

## Prerequisites

- An AWS account
- A GitHub account with the repository at `https://github.com/basit-devBE/elasticbeanstalk`
- AWS CLI (optional, for verification)

---

## Step 1 — Create the S3 Bucket

The S3 bucket stores the deployment ZIP bundles. One bucket is used for all deployments.

1. Go to **S3 → Create bucket**
2. Bucket name: `eb-node-app-deployments-<your-account-id>` (must be globally unique)
3. Region: `eu-north-1` (must match your EB environment region)
4. Block all public access: **enabled** (the bucket is private)
5. All other settings: leave as default
6. Click **Create bucket**

> The bucket name must match the `S3_BUCKET` GitHub secret set in Step 5.

---

## Step 2 — Create the Elastic Beanstalk Application and Environment

### 2a. Create the Application

1. Go to **Elastic Beanstalk → Create application**
2. Application name: `ebs`
3. Click **Create**

### 2b. Create the Environment

1. Inside the application, click **Create new environment**
2. Select **Web server environment**
3. Environment name: `Ebs-env`
4. Platform: **Node.js**, Branch: **Node.js 24**, Version: recommended
5. Application code: **Sample application** (the real app is deployed by GitHub Actions)
6. Preset: **Single instance (free tier eligible)**

### 2c. Configure Service Access (Step 2 of wizard)

At this step, the two IAM roles do not exist yet. You need to create them:

- **Service role:** Click **Create role** → confirm → come back and select `aws-elasticbeanstalk-service-role`
- **EC2 instance profile:** Click **Create role** → confirm → come back and select `aws-elasticbeanstalk-ec2-role`
- **EC2 key pair:** Leave blank

7. Continue through remaining steps with defaults → **Submit**

Wait for the environment to reach **Health: Ok** (green) before proceeding.

---

## Step 3 — Create the DynamoDB Table

1. Go to **DynamoDB → Create table**
2. Table name: `eb-demo-stuff`
3. Partition key: `id` (type: **String**)
4. Table settings: default (on-demand capacity)
5. Click **Create table**

### Add seed items

Once the table is created:

1. Click the table → **Explore items → Create item**
2. Add item 1:
   - `id` (String): `1`
   - Add attribute `name` (String): `Demo Item One`
   - Add attribute `description` (String): `First item for demonstration`
3. Add item 2:
   - `id` (String): `2`
   - Add attribute `name` (String): `Demo Item Two`
   - Add attribute `description` (String): `Second item for demonstration`

---

## Step 4 — Configure IAM Permissions

### 4a. Grant the EC2 role DynamoDB access

The EC2 instances running the app need permission to read and write DynamoDB.

1. Go to **IAM → Roles**
2. Search for `aws-elasticbeanstalk-ec2-role` and click it
3. Click **Add permissions → Attach policies**
4. Search for `AmazonDynamoDBFullAccess`, check it
5. Click **Add permissions**

### 4b. Create the GitHub Actions IAM user

1. Go to **IAM → Users → Create user**
2. User name: `github-actions-eb`
3. Click **Next** (no console access needed)
4. Select **Attach policies directly**
5. Attach these three managed policies:
   - `AdministratorAccess-AWSElasticBeanstalk`
   - `AWSCloudFormationFullAccess`
   - `AmazonS3FullAccess`
6. Create the user

### 4c. Create an access key for the user

1. Click on `github-actions-eb` → **Security credentials**
2. Scroll to **Access keys → Create access key**
3. Use case: **Application running outside AWS**
4. Click **Create access key**
5. **Save both the Access Key ID and Secret Access Key** — the secret is only shown once

---

## Step 5 — Set Elastic Beanstalk Environment Variables

1. Go to **Elastic Beanstalk → Ebs-env → Configuration**
2. Find **Updates, monitoring, and logging** → **Edit**
3. Scroll to **Environment properties** and add:

| Key | Value |
|-----|-------|
| `DYNAMODB_TABLE_NAME` | `eb-demo-stuff` |
| `AWS_REGION` | `eu-north-1` |

4. Click **Apply** and wait for the environment to update

---

## Step 6 — Add GitHub Secrets

1. Go to your GitHub repository → **Settings → Secrets and variables → Actions**
2. Click **New repository secret** and add each of the following:

| Secret name | Value |
|-------------|-------|
| `AWS_ACCESS_KEY_ID` | Access key ID from Step 4c |
| `AWS_SECRET_ACCESS_KEY` | Secret access key from Step 4c |
| `AWS_REGION` | `eu-north-1` |
| `S3_BUCKET` | Your S3 bucket name from Step 1 |
| `EB_APP_NAME` | `ebs` |
| `EB_ENV_NAME` | `Ebs-env` |

---

## Step 7 — Trigger the First Automated Deployment

With all setup complete, push any change to `master`:

```bash
git add .
git commit -m "feat: initial deployment"
git push origin master
```

Go to **GitHub → Actions** to watch the workflow run. When it completes successfully, visit your Elastic Beanstalk URL — it should show the deployment dashboard with your app version.

---

## Verification Checklist

| Check | How to verify |
|-------|--------------|
| App is live | Visit `http://<env>.elasticbeanstalk.com` |
| Correct version shown | Version on dashboard matches the GitHub Actions run label |
| DynamoDB connected | Visit `/data` — seed items should appear |
| Add item works | Submit the form on `/data` — item appears in list |
| Health check passing | Visit `/health` — returns `{ "status": "healthy" }` |
| Re-deploy on push | Make a small change, push, watch Actions, verify version updates |
