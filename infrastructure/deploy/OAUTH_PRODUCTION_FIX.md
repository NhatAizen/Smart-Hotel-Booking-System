# EnziuRooms OAuth production fix

Production public URL: `https://enziurooms.xyz`

## OAuth callback URLs

Google:
`https://enziurooms.xyz/login/oauth2/code/google`

Facebook:
`https://enziurooms.xyz/login/oauth2/code/facebook`

## Google Cloud Console

Authorized JavaScript origin:
`https://enziurooms.xyz`

Authorized redirect URI:
`https://enziurooms.xyz/login/oauth2/code/google`

Remove the production redirect URI using `api.enziurooms.xyz` if that hostname is not published.

## Meta Developers

App Domain:
`enziurooms.xyz`

Website URL:
`https://enziurooms.xyz`

Valid OAuth Redirect URI:
`https://enziurooms.xyz/login/oauth2/code/facebook`

## Deployment

From the project root, deploy using the same production compose command already used by the project. Recreate at least `identity-service` and `reverse-proxy` so the changed environment and nginx config are applied.

The running identity container must have these public values, even when the frontend is deployed separately from services started with the base compose file:

```dotenv
OAUTH_FRONTEND_REDIRECT=https://enziurooms.xyz/oauth2/callback
FRONTEND_BASE_URL=https://enziurooms.xyz
PUBLIC_BASE_URL=https://enziurooms.xyz
```

For a base-compose installation, set these three URL entries in the ignored root `.env`, then recreate only identity-service using its existing image and reload the reverse proxy. Do not switch database credentials or apply a full production overlay to an existing database merely to repair a redirect. Local development may explicitly use the localhost URLs from `.env.example`.

Verify the configured callback, Google authorization `redirect_uri`, error callback, SPA route and rejection of an invalid exchange code:

```powershell
.\scripts\verify-oauth-routing.ps1
```

This check never follows Google or uses a real login code. A real Google account sign-in still needs to be retried in the browser. Previously issued codes are single-use, expire after 120 seconds, and are invalidated when the identity container restarts.
