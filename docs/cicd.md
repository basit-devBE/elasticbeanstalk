# CI/CD Pipeline

## Overview

The pipeline is defined in `.github/workflows/deploy.yml` and runs entirely on GitHub's infrastructure. It is triggered automatically on every push to the `master` branch and requires no manual steps after initial setup.

---

## Trigger

```yaml
on:
  push:
    branches:
      - master
```

Every commit merged or pushed directly to `master` starts a new pipeline run. Pushes to other branches (feature branches, PRs) do not trigger a deployment.

---

## Concurrency Control

```yaml
concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: true
```

If two pushes happen in quick succession, the older in-progress run is cancelled and only the latest runs to completion. This prevents two deployments from racing and potentially deploying an outdated version.

---

## Permissions

```yaml
permissions:
  contents: read
```

The workflow only needs to read the repository contents. No write permissions are granted to the GitHub token, following the principle of least privilege.

---

## Steps Explained

### Step 1 — Checkout source

```yaml
- uses: actions/checkout@v4
```

Clones the repository into the runner's working directory. All subsequent steps operate on this code.

---

### Step 2 — Configure AWS credentials

```yaml
- uses: aws-actions/configure-aws-credentials@v4
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: ${{ secrets.AWS_REGION }}
```

Reads the IAM user credentials from GitHub encrypted secrets and injects them as environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`). All subsequent `aws` CLI commands use these credentials automatically.

Credentials are never printed in logs — GitHub Actions masks secret values.

---

### Step 3 — Package application

```yaml
- name: Package application
  run: |
    VERSION="$(echo "${{ github.sha }}" | cut -c1-8)-${{ github.run_number }}-${{ github.run_attempt }}"
    BUNDLE="deploy-${VERSION}.zip"
    zip -r "$BUNDLE" . \
      --exclude="node_modules/*" \
      --exclude=".git/*" \
      --exclude="*.zip" \
      --exclude=".github/*"
    echo "VERSION=${VERSION}" >> $GITHUB_ENV
    echo "BUNDLE=${BUNDLE}" >> $GITHUB_ENV
```

**Version label construction:**

| Part | Example | Source |
|------|---------|--------|
| Short git SHA | `d77afc5a` | First 8 chars of `github.sha` |
| Run number | `3` | Increments with each new push trigger |
| Run attempt | `1` | Increments when a run is manually re-run |

Combined: `d77afc5a-3-1`

This three-part label guarantees uniqueness even when:
- The same commit is deployed multiple times (run number changes)
- A failed run is re-run (run attempt changes)

**What gets packaged:**

| Included | Excluded |
|----------|----------|
| `app.js` | `node_modules/` (EB runs `npm install` on the server) |
| `package.json` | `.git/` (version control history, not needed at runtime) |
| `package-lock.json` | `*.zip` (avoids bundling previous bundles) |
| `docs/` | `.github/` (workflow files, not needed at runtime) |

`node_modules/` is excluded because Elastic Beanstalk automatically runs `npm install` on the EC2 instance after receiving the bundle, installing dependencies fresh from `package.json`. This keeps the ZIP small (12 KB vs several MB).

---

### Step 4 — Upload bundle to S3

```yaml
- name: Upload bundle to S3
  run: |
    aws s3 cp "$BUNDLE" "s3://${{ secrets.S3_BUCKET }}/$BUNDLE"
```

Uploads the versioned ZIP to the S3 bucket. The S3 key matches the bundle filename, so every version is stored individually:

```
s3://eb-node-app-deployments-abdul-2026/
├── deploy-d77afc5a-1-1.zip
├── deploy-d77afc5a-2-1.zip
├── deploy-d77afc5a-3-1.zip
└── deploy-abc12345-1-1.zip
```

This gives a full artifact history and allows manual rollback by redeploying any previous S3 key.

---

### Step 5 — Create Elastic Beanstalk application version

```yaml
- name: Create Elastic Beanstalk application version
  run: |
    aws elasticbeanstalk create-application-version \
      --application-name "${{ secrets.EB_APP_NAME }}" \
      --version-label "$VERSION" \
      --source-bundle "S3Bucket=${{ secrets.S3_BUCKET }},S3Key=$BUNDLE" \
      --description "Deployed from commit ${{ github.sha }} by ${{ github.actor }}"
```

Registers the S3 bundle as a named application version in Elastic Beanstalk. At this point, the version exists in EB's version history but has not been deployed anywhere yet.

The description records the full commit SHA and the GitHub user who triggered the deployment, providing a clear audit trail in the EB console.

---

### Step 6 — Deploy to environment

```yaml
- name: Deploy new version to environment
  run: |
    aws elasticbeanstalk update-environment \
      --application-name "${{ secrets.EB_APP_NAME }}" \
      --environment-name "${{ secrets.EB_ENV_NAME }}" \
      --version-label "$VERSION" \
      --option-settings \
        "Namespace=aws:elasticbeanstalk:application:environment,OptionName=APP_VERSION,Value=${VERSION}"
```

Tells the EB environment to switch to the new application version. The `--option-settings` flag simultaneously updates the `APP_VERSION` environment variable on the running EC2 instances, so the application displays the correct version string on every request.

When this command is issued, EB begins a rolling update: it pulls the ZIP from S3, runs `npm install`, starts the new process, and performs health checks before completing.

---

### Step 7 — Wait for deployment

```yaml
- name: Wait for deployment to complete
  run: |
    aws elasticbeanstalk wait environment-updated \
      --application-name "${{ secrets.EB_APP_NAME }}" \
      --environment-name "${{ secrets.EB_ENV_NAME }}"
```

Blocks the workflow until EB reports that the environment has finished updating and is healthy. Without this step, the workflow would report success before the deployment is actually complete. With it, a failed deployment (app crash, npm install failure, etc.) causes the workflow to fail — giving accurate feedback.

---

### Step 8 — Print deployment URL

```yaml
- name: Print application URL
  run: |
    URL=$(aws elasticbeanstalk describe-environments \
      --application-name "${{ secrets.EB_APP_NAME }}" \
      --environment-names "${{ secrets.EB_ENV_NAME }}" \
      --query "Environments[0].CNAME" \
      --output text)
    echo "Deployed version ${VERSION} to http://${URL}"
```

Fetches the public CNAME of the environment and prints the full URL to the Actions log. This gives a direct clickable link to the newly deployed application at the end of every successful run.

---

## Full Pipeline Duration

| Step | Typical duration |
|------|-----------------|
| Checkout | ~1s |
| Configure credentials | ~1s |
| Package ZIP | ~1s |
| Upload to S3 | ~2s |
| Create EB version | ~1s |
| Update EB environment | ~1s (fires async) |
| Wait for EB update | ~60–120s |
| Print URL | ~1s |
| **Total** | **~2–3 minutes** |

The majority of time is spent in the wait step while EB provisions and health-checks the new deployment.

---

## Rollback

To roll back to a previous version:

1. Go to **Elastic Beanstalk → Application versions**
2. Select the previous version label
3. Click **Deploy** → select the environment
4. EB redeploys the old bundle without any code change needed

Alternatively, revert the git commit and push to `master` — the pipeline will re-deploy the reverted code as a new version.
