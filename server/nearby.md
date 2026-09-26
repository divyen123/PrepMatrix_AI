# PrepMatrix Nearby

Nearby replaces the former Trend entry. Its backend is registered in `index.js`; existing MongoDB and authenticated sessions are required. No map API key is needed for the small-scale default configuration.

## Discovery providers

- Geocoding: [Photon](https://github.com/komoot/photon), using OpenStreetMap data. Its public demo permits reasonable project usage, provides no availability guarantee and may throttle heavy traffic. `NEARBY_PHOTON_URL` can point to a private Photon `/api/` endpoint.
- Places: [Overpass API](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html). `NEARBY_OVERPASS_URL` can point to another compatible interpreter endpoint. The default is `https://overpass-api.de/api/interpreter`.
- Client attribution must link to [OpenStreetMap copyright and contributors](https://www.openstreetmap.org/copyright). OSM source links and object timestamps are returned with each result.

Provider lookups occur only in response to user searches. Each server process caches geocoding for 24 hours and places for 20 minutes, coalesces identical in-flight requests, and spaces upstream requests by at least 1.1 seconds per provider. The queue, result count, radius and timeout are bounded. Search results are limited extracts, not complete coverage. For multiple server replicas or sustained traffic, configure dedicated providers and a deployment-wide rate limiter; public endpoints are not an SLA-backed production dependency.

OSM listings do not establish teaching subjects, board compatibility, batch seats, tutor availability, crowd levels, or consent to telephone doubt support. Absent details remain empty. An OSM phone is a public institution enquiry number. `phoneSupport: true` is reserved for reviewed records with explicit doubt-support consent.

## Reviewed listings

Operators may maintain approved records in the `nearbyListings` MongoDB collection. There is no automatic publication endpoint. Review provider identity, source details and permission before approving. Records without `status: 'approved'` are excluded. Store only public business/venue contact details, never a student's home or personal contact information.

```js
{
  _id: 'stable-provider-id',
  status: 'approved',
  category: 'tuitions', // tuitions, spots, or rescue
  name: 'Provider-supplied public name',
  type: 'tutor',
  lat: 13.08,
  lon: 80.27,
  address: 'Public business or study venue address',
  website: 'https://provider.example',
  sourceUrl: 'https://provider.example/contact',
  phone: '+91 1234567890',
  phonePublishedConsent: true,
  phoneSupport: true,
  phoneSupportConsent: true,
  callHours: 'Provider-confirmed calling hours',
  hours: 'Provider-confirmed opening hours',
  subjects: ['Mathematics'],
  chapters: ['Integration'],
  board: 'CBSE',
  language: 'English',
  fees: 'Provider-confirmed fee description',
  facilities: ['Wi-Fi', 'Charging points'],
  access: 'yes', // private/no venues cannot host revision circles
  batches: [{
    id: 'stable-batch-id',
    name: 'Provider-supplied batch name',
    subject: 'Mathematics',
    board: 'CBSE',
    grade: 'Class 12',
    chapter: 'Integration',
    schedule: 'Provider-confirmed days and times',
    language: 'English',
    fees: 'Provider-confirmed fee description',
    availableSeats: null, // nonnegative integer only when confirmed
    trial: 'Provider-confirmed trial details'
  }],
  updatedAt: new Date()
}
```

The example is a schema illustration and is not seeded into the application. Category `tuitions` records with published phones can also appear in Chapter Rescue; the client distinguishes general enquiries from opted-in doubt support.

## Revision circles

The `nearbyCircles` collection holds upcoming sessions. Hosts select an actual listed library or coworking venue, which is verified server-side, and confirm that it permits the group. These are community-hosted sessions; the API does not claim institution verification. Creating/joining requires an authenticated academic profile. School profiles additionally require an active Parent Corner unlock. Profiles without that parental-access workflow can browse but cannot participate.

Join requests remain pending until approved by the host. Updates use an optimistic version check so concurrent approvals cannot exceed capacity. Only hosts receive requester first names and request IDs. Public responses never expose user IDs, profile IDs, member contact details or a participant roster. First names are the only system-derived identifying display values.

The host can approve/decline requests and cancel a circle; participants can withdraw. `POST /api/nearby/circles/:id/report` accepts a reason and stores one pending report per reporting profile in `nearbyReports`. Operators must review that queue; no automatic moderation decision or notification is claimed. A host can withdraw a session by setting its status to `cancelled`. Circle data expires 30 days after its start. Account/profile deletion also removes owned circles/reports and the profile's membership in other circles.

Reporting hides that circle from the reporting profile’s discovery results. Cancelled circles remain visible to their host and requesters. Personal history includes sessions outside the search area and recently completed sessions; updates are checked when the page is loaded or refreshed.

## Page integration

`/nearby` is authenticated and opens from the existing sidebar position formerly used by Trend. The other page components and global appearance stylesheet are unchanged. The page owns its scoped styles and uses the existing academic profile, subjects and planner reminders.

Saved place IDs and search preferences are local to the account/profile in that browser. Exact device coordinates are not persisted. Matching uses supplied subject, syllabus, class, chapter, language and timing text. It does not infer batch availability or automatically detect timetable conflicts from free-text schedules. Adding a session creates a user-confirmed study reminder, optionally weekly for four or eight weeks; it does not book a provider or a venue. Chapter Rescue opens a normal telephone link and does not place or record calls automatically.

## Endpoints

All endpoints require authentication and the app's academic-profile request header when available. Mutations use the existing same-origin request guard and academic-profile write fence.

- `GET /api/nearby/geocode?q=...` → `{ locations: [{ label, lat, lon }], source }`
- `GET /api/nearby/places?lat=...&lon=...&radius=5&category=tuitions|spots|rescue` → `{ places, source, notice? }`
- `GET /api/nearby/circles?lat=...&lon=...&radius=5` → `{ circles, canParticipate, requiresParentAccess }`
- `GET /api/nearby/circles?mine=true` → personal hosted/joined sessions across locations (coordinates optional)
- `POST /api/nearby/circles` with title, subject, chapter, board, language, agenda, ISO startsAt, durationMinutes, capacity, selected venue, and `publicVenueConfirmed: true` → `{ circle }`
- `POST /api/nearby/circles/:id/join`, `/leave`, `/cancel` → `{ circle }`
- `POST /api/nearby/circles/:id/requests/:requestId` with `{ action: 'approve' | 'decline' }` → `{ circle }`
- `POST /api/nearby/circles/:id/report` with `{ reason }` → `{ reported: true }`

Errors return an explicit HTTP status and `{ error, code }`. Provider outages are not represented as a successful empty search; reviewed listings may still be returned with a notice if available.

Run `node --test server/nearby.test.js` for mocked-provider and database-backed route contract checks.
