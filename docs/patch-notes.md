# Patch notes — v2026.7.29

**Release date:** 2026-07-29

## Highlights

- Public distribution is **web + hybrid shell** only
- Firestore removed from the web client data path; Supabase is required
- Chat visibility **snapshot** save fixed (storage gateway JWT + timeout)
- Encrypted Google-linked chat backup uses Supabase Storage
- Personal info / terms surfaces retained in-app
- Full local LOCO desktop client **discontinued** in the public package

## Fixes

- Snapshot dialog no longer sticks on “저장 중…” when the storage gateway rejected Firebase JWTs at the edge
- Separate `snapshotBusy` state so other busy flags cannot strand the dialog

## Docs

- Principles, architecture, disclaimer, version pages published via GitHub Pages
