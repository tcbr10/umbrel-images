# Album Flipbook for Umbrel

This bundle includes live uploads, admin protection, and a configurable viewer password.

## Included features

- Upload a PDF while the app is already running.
- Upload multiple images while the app is already running.
- Protect the admin panel with its own password.
- Enable or disable a separate password for the viewing screen.
- Change the viewer password from inside the admin panel.
- Persist uploaded pages and settings inside `${APP_DATA_DIR}/data`.

## Default admin login

The default admin password is `umbrel` on first launch.
Change it immediately from the admin panel after installation.

## Runtime storage

- Uploaded pages: `/data/pages`
- Album metadata: `/data/manifest.json`
- Security settings: `/data/settings.json`

## Publish

1. Update `exports.sh` with your GHCR namespace.
2. Update `umbrel-app.yml` metadata fields.
3. Push this folder into your custom Umbrel app-store repository.
4. Enable GitHub Actions so the image is built and pushed to GHCR.
5. Refresh the app store on Umbrel and install the app.
