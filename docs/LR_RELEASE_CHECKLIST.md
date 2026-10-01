# LR public exam release checklist

## Automated gate

- [x] Public event, registration, introduction and attempt API tests: 18/18.
- [x] LR 20-question E2E flow: 12/12.
- [x] Audio, video, image and rich HTML delivery verified.
- [x] Answer persistence and refresh restoration verified.
- [x] Invalid answer rejection verified.
- [x] Expiry blocks new writes and triggers final submission.
- [x] Repeated start resumes the active attempt.
- [x] Repeated submit is idempotent.
- [x] Candidate mobile production build succeeds.

## Release packaging gate

- [x] Candidate app uses `/events/` as its production asset base.
- [x] Candidate bundle is packaged at `frontend/dist/events/`.
- [x] Nginx routes `/events/*` deep links to the candidate app.
- [ ] Release commit is reviewed, clean and on `main`.
- [ ] Root and admin frontend versions match the release tag.
- [ ] Release tag exists on the exact commit and is pushed to origin.
- [ ] Verified production database backup exists.

## Post-deploy smoke gate

- [ ] `/health` reports the expected production version and commit.
- [ ] `/events/<event-id>` loads over HTTPS without asset errors.
- [ ] Registration and audio check work on a physical phone.
- [ ] An answer persists after refresh and after network reconnect.
- [ ] Deep links for introduction, attempt and result load directly.
- [ ] Timer expiry submits once; repeated submit returns the same result.
- [ ] Audio, video and images load from production storage/CDN.
- [ ] Mobile and iPad layouts have no clipped controls or overlapping sticky bars.
- [ ] Application and Nginx logs show no new 5xx responses.

Production activation is allowed only after every release-packaging item is
checked. Keep the previous immutable release and the verified database backup
until the post-deploy smoke gate is complete.
