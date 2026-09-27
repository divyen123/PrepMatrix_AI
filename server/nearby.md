# PrepMatrix Nearby

Nearby replaces the former Trend entry. Its backend is registered in `index.js`; existing MongoDB and authenticated sessions are required. No map API key is needed for the small-scale default configuration.

## Discovery providers

- Geocoding: [Photon](https://github.com/komoot/photon), using OpenStreetMap data. Its public demo permits reasonable project usage, provides no availability guarantee and may throttle heavy traffic. `NEARBY_PHOTON_URL` can point to a private Photon `/api/` endpoint.
- Places: [Overpass API](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html). The default is `https://overpass-api.de/api/interpreter`, with `https://overpass.private.coffee/api/interpreter` as an outage fallback. `NEARBY_OVERPASS_URL` can point to another compatible interpreter endpoint. A custom primary disables the default public backup; explicitly set `NEARBY_OVERPASS_FALLBACK_URL` to opt into a compatible backup, or set it to an empty string to disable fallback.
- Client attribution must link to [OpenStreetMap copyright and contributors](https://www.openstreetmap.org/copyright). OSM source links and object timestamps are returned with each result.

Provider lookups occur only in response to user searches. Each server process caches geocoding for 24 hours and places for 20 minutes, coalesces identical in-flight requests, and spaces upstream requests by at least 1.1 seconds per provider. The queue, result count, radius and timeout are bounded. Search results are limited extracts, not complete coverage. For multiple server replicas or sustained traffic, configure dedicated providers and a deployment-wide rate limiter; public endpoints are not an SLA-backed production dependency.

Place requests use a bounding-box query to limit the provider scan, followed by an exact circular-distance filter. Bounding boxes account for the poles and the antimeridian. Requests wait at most three seconds for the provider queue and allow up to 15 seconds per endpoint. Transport failures, server errors and incomplete Overpass responses may try the backup once. HTTP client errors, including rate limits and access refusals, do not trigger failover. Failed endpoints cool down for at least 30 seconds; longer `Retry-After` values are respected up to one hour.

If a refresh fails, the service can return nonempty results from the exact same coordinates and radius, fetched within the last 24 hours. A visible notice includes the original fetch time; it is not presented as a successful live refresh. Empty or unusable cached results do not hide an outage. The page retains results during a retry of the same search and clears them when the location or radius changes. Failed searches offer retry, a smaller radius when applicable, and an external map search. Provider failures emit sanitized server diagnostics containing provider host, failure type, elapsed time and an optional HTTP or transport code; searches and coordinates are not logged. The `X-Nearby-Version` response header identifies the deployed Nearby backend.

OSM listings do not establish live availability, crowd levels, entry rules or confirmed facilities. Absent details remain empty. A listed phone, if present, is a public venue contact; users should confirm access before visiting.

## Reviewed listings

Operators may maintain approved Study Spot records in the `nearbyListings` MongoDB collection. There is no automatic publication endpoint. Review venue identity, source details and permission before approving. Only records with `status: 'approved'` and `category: 'spots'` are returned. Store only public venue details, never a student's home or personal contact information.

```js
{
  _id: 'stable-venue-id',
  status: 'approved',
  category: 'spots',
  name: 'Venue-supplied public name',
  type: 'library',
  lat: 13.08,
  lon: 80.27,
  address: 'Public study venue address',
  website: 'https://venue.example',
  sourceUrl: 'https://venue.example/contact',
  phone: '+91 1234567890',
  phonePublishedConsent: true,
  hours: 'Venue-confirmed opening hours',
  fees: 'Venue-confirmed entry fee',
  facilities: ['Wi-Fi', 'Charging points'],
  access: 'yes', // private/no venues cannot host revision circles
  updatedAt: new Date()
}
```

The example is a schema illustration and is not seeded into the application. Older tuition or rescue records are ignored by the Study Spots endpoint.

## Revision circles

The `nearbyCircles` collection holds upcoming sessions. Hosts select an actual listed library or coworking venue, which is verified server-side, and confirm that it permits the group. These are community-hosted sessions; the API does not claim institution verification. Creating/joining requires an authenticated academic profile. School profiles additionally require an active Parent Corner unlock. Profiles without that parental-access workflow can browse but cannot participate.

Join requests remain pending until approved by the host. Updates use an optimistic version check so concurrent approvals cannot exceed capacity. Only hosts receive requester first names and request IDs. Public responses never expose user IDs, profile IDs, member contact details or a participant roster. First names are the only system-derived identifying display values.

The host can approve/decline requests and cancel a circle; participants can withdraw. `POST /api/nearby/circles/:id/report` accepts a reason and stores one pending report per reporting profile in `nearbyReports`. Operators must review that queue; no automatic moderation decision or notification is claimed. A host can withdraw a session by setting its status to `cancelled`. Circle data expires 30 days after its start. Account/profile deletion also removes owned circles/reports and the profile's membership in other circles.

Reporting hides that circle from the reporting profile’s discovery results. Cancelled circles remain visible to their host and requesters. Personal history includes sessions outside the search area and recently completed sessions; updates are checked when the page is loaded or refreshed.

## Page integration

`/nearby` is authenticated and opens from the existing sidebar position formerly used by Trend. The other page components and global appearance stylesheet are unchanged. The page owns its scoped styles and uses the existing academic profile, subjects and planner reminders.

Saved place IDs and search preferences are local to the account/profile in that browser. Exact device coordinates are not persisted. Older saved tabs for removed features reopen at Study Spots. Study Spot suggestions use listed facilities for the selected activity, and unknown facilities remain unconfirmed. Revision Circles use the selected subject and chapter. Adding a session creates a user-confirmed study reminder, optionally weekly for four or eight weeks; it does not book a venue.

## Endpoints

All endpoints require authentication and the app's academic-profile request header when available. Mutations use the existing same-origin request guard and academic-profile write fence.

- `GET /api/nearby/geocode?q=...` → `{ locations: [{ label, lat, lon }], source }`
- `GET /api/nearby/places?lat=...&lon=...&radius=5&category=spots` → `{ places, source, notice?, retryAfterSeconds? }`; omitted category defaults to `spots`, removed categories return HTTP 400.
- `GET /api/nearby/circles?lat=...&lon=...&radius=5` → `{ circles, canParticipate, requiresParentAccess }`
- `GET /api/nearby/circles?mine=true` → personal hosted/joined sessions across locations (coordinates optional)
- `POST /api/nearby/circles` with title, subject, chapter, board, language, agenda, ISO startsAt, durationMinutes, capacity, selected venue, and `publicVenueConfirmed: true` → `{ circle }`
- `POST /api/nearby/circles/:id/join`, `/leave`, `/cancel` → `{ circle }`
- `POST /api/nearby/circles/:id/requests/:requestId` with `{ action: 'approve' | 'decline' }` → `{ circle }`
- `POST /api/nearby/circles/:id/report` with `{ reason }` → `{ reported: true }`

Errors return an explicit HTTP status and `{ error, code }`. Provider outages are not represented as a successful empty search; reviewed listings may still be returned with a notice if available.

Run `node --test server/nearby.test.js server/nearbyService.test.js src/utils/nearby.test.js src/utils/nearbySearchState.test.js` for provider recovery, route contracts, matching and search-state checks.
