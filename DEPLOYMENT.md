# Deployment Guide

## Deploying to Fly.io

### First-Time Setup

1. **Install the Fly CLI**
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login to Fly.io**
   ```bash
   fly auth login
   ```

3. **Create the app** (if not already created)
   ```bash
   fly launch
   ```
   - Choose a unique app name or let Fly generate one
   - Select a region close to your users
   - When prompted about a database, choose "No" (we use SQLite)

4. **Create a persistent volume** for the SQLite database
   ```bash
   fly volumes create kanban_data --size 1 --region <your-region>
   ```
   Replace `<your-region>` with your app's region (e.g., `iad`, `lax`, `ams`)

5. **Set environment secrets**
   ```bash
   # Required: Session secret for encryption
   fly secrets set SESSION_SECRET=$(openssl rand -base64 32)

   # Optional: Admin approval secret (defaults to SESSION_SECRET if not set)
   fly secrets set ADMIN_APPROVAL_SECRET=$(openssl rand -base64 32)

   # Required: SendGrid API key for email notifications
   fly secrets set SENDGRID_API_KEY=your_sendgrid_api_key

   # Optional: OpenAI API key for AI prompt generation
   fly secrets set OPENAI_API_KEY=your_openai_api_key

   # Optional: reCAPTCHA for signup spam prevention
   fly secrets set VITE_RECAPTCHA_SITE_KEY=your_site_key
   fly secrets set RECAPTCHA_SECRET_KEY=your_secret_key
   ```

### Deploying Updates

After making changes to your code:

```bash
fly deploy
```

**Important:** Your database will persist across deployments because it's stored in the mounted volume at `/data/data.db`.

### Managing Your Database

**View logs:**
```bash
fly logs
```

**SSH into your app:**
```bash
fly ssh console
```

Once inside, you can:
- Check the database: `ls -lh /data/data.db`
- View database size: `du -h /data/data.db`

**Backup your database:**
```bash
# Download the database file to your local machine
fly ssh sftp get /data/data.db ./backup-$(date +%Y%m%d).db
```

**Restore a database:**
```bash
# Upload a database file
fly ssh sftp shell
put ./backup-20231215.db /data/data.db
```

### Volume Management

**List volumes:**
```bash
fly volumes list
```

**Increase volume size:**
```bash
fly volumes extend <volume-id> --size <new-size-gb>
```

**Create a snapshot:**
```bash
fly volumes snapshots create <volume-id>
```

## Environment Variables

The following environment variables are configured:

- `NODE_ENV=production` - Set by fly.toml
- `DATABASE_PATH=/data/data.db` - Set by fly.toml to use persistent volume
- `SESSION_SECRET` - Set via `fly secrets set`
- `ADMIN_APPROVAL_SECRET` - Set via `fly secrets set`
- `SENDGRID_API_KEY` - Set via `fly secrets set`
- `OPENAI_API_KEY` - Set via `fly secrets set`
- `VITE_RECAPTCHA_SITE_KEY` - Set via `fly secrets set`
- `RECAPTCHA_SECRET_KEY` - Set via `fly secrets set`

## Troubleshooting

**Database not persisting:**
- Ensure the volume is created and mounted correctly
- Check fly.toml has the correct mount configuration
- Verify DATABASE_PATH environment variable is set

**Out of disk space:**
- Check volume size: `fly volumes list`
- Extend volume: `fly volumes extend <volume-id> --size <new-size>`

**App not starting:**
- Check logs: `fly logs`
- Verify all required secrets are set: `fly secrets list`
