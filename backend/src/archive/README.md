# Archive endpoints

The surface the native apps call to put things in, and get them back out.

| Method | Path | What it does |
|---|---|---|
| `POST` | `/api/v1/vaults/:vaultId/memories` | Create a memory. Idempotent on `clientId` |
| `GET` | `/api/v1/vaults/:vaultId/memories` | The timeline, by `occurred_at`, keyset-paginated |
| `POST` | `/api/v1/uploads` | Check quota, reserve a session, return a signed `PUT` URL |
| `POST` | `/api/v1/uploads/:id/complete` | Verify the object, record the asset, charge the quota |
| `GET` | `/api/v1/media/:id/url` | A short-lived signed `GET` URL |

## The upload path, and why it is shaped like this

```
client                      API                         R2
  │  POST /uploads           │                           │
  ├─────────────────────────►│  quota check              │
  │                          │  reserve upload_session   │
  │◄─────────────────────────┤  signed PUT URL           │
  │                                                      │
  ├──────────────  PUT the bytes  ──────────────────────►│
  │                                                      │
  │  POST /uploads/:id/complete                          │
  ├─────────────────────────►│  HEAD ────────────────────►
  │                          │◄──────────── size, etag   │
  │◄─────────────────────────┤  media_assets + quota     │
```

**Bytes never pass through the API.** A 4K video routed through a request
handler would occupy it for minutes, count against the container's memory and
bandwidth, and make a rolling deploy cancel somebody's upload. Signing a URL
takes milliseconds.

**The quota is checked before a byte moves.** Checking afterwards means paying
for storage you then refuse — and telling somebody their video is over quota
after twenty minutes on a mobile connection is its own kind of insult.

**The size is read from the store, not the client.** `HEAD` after the upload is
what stops a client claiming 5 MB and writing 5 GB, and what stops a row
describing an object that is not there — a photograph that opens empty in 2046.

**The quota moves in the same transaction as the asset row.** A nightly
recount is a quota that is correct once a day, and therefore one a user can
walk straight through for twenty-three hours.

## What is not here yet

- **Transcoding.** Assets land as `transcode_status = 'pending'`; nothing
  consumes that queue. The dashboard counts the backlog.
- **A real checksum.** `checksum_sha256` holds the ETag padded to the right
  width, which is not a SHA-256 for a multipart upload. It is recorded as
  unverified rather than as a lie, and the integrity sweep will replace it.
- **Thumbnails, blurhash, EXIF.** All columns exist; nothing writes them.
- **Deletion.** There is no DELETE policy on `memories` or `media_assets` by
  design — removal is a soft delete plus a purge job under another role.
