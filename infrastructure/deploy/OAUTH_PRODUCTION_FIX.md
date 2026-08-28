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
