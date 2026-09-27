# Secure LAN deployment

The launchd installer defaults to `https-proxy` mode. PTZ Commander listens only on
`127.0.0.1`, trusts only the loopback proxy, and marks session cookies Secure.

1. Install Caddy with `brew install caddy`.
2. Install and trust Caddy's local CA on every tablet that will open PTZ Commander.
3. Run Caddy with the bundled configuration:

   ```sh
   PTZ_PUBLIC_HOST=ptzcommand.local PORT=3478 caddy run --config deploy/Caddyfile
   ```

4. Open `https://ptzcommand.local` and complete the admin bootstrap.

Caddy terminates TLS, supports WebSocket upgrades, and replaces forwarded client-IP
headers before requests reach Express. For a public DNS name with a publicly trusted
certificate, remove `tls internal` and set `PTZ_PUBLIC_HOST` to that name.

Direct HTTP remains available for an isolated, trusted network only:

```sh
PTZCOMMAND_DEPLOYMENT_MODE=lan-http sh deploy/install-launchd.sh
```

That mode binds to all interfaces and cannot protect credentials or commands from
observers on the network.

## Encryption-key rotation

Stored device credentials use a versioned AES-256-GCM envelope. `SESSION_SECRET` is
not used for new encryption. For a launchd installation, stop writes, rotate every
stored value, persist the new key and ID, and restart with one command:

```sh
sh deploy/rotate-encryption-key.sh local-v2
```

For another deployment type, rotate keys without losing credentials as follows:

1. Keep the old key in `SECRET_ENCRYPTION_PREVIOUS_KEYS` and set a new active key and ID.
2. Stop PTZ Commander so no settings can change during the migration.
3. Run `npm run secrets:rotate` with the same database and key environment.
4. Start PTZ Commander and verify devices, then remove the old key from the previous-key map.

Example:

```sh
SECRET_ENCRYPTION_KEY_ID=local-v2 \
SECRET_ENCRYPTION_KEY='<new-32-plus-character-secret>' \
SECRET_ENCRYPTION_PREVIOUS_KEYS='{"local-v1":"<old-secret>"}' \
npm run secrets:rotate
```

The rotation command loads and decrypts every stored credential before writing any
changes, then commits all database updates in one transaction. The launchd helper
also keeps the prior key available until the transaction succeeds and restarts the
old configuration after a failure. Startup refuses to listen if a credential is unreadable, so a missing
legacy key produces a visible failure instead of silently replacing credentials with
empty values. Configuration exports contain plaintext credentials and should be
stored like passwords.
