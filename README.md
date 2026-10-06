# Pedestrian Origin–Destination / Intercept Survey

Offline-first PWA for the pedestrian O–D and intercept survey (Section 5.1.2): one form per respondent. Rows go to a Google Sheet through Google Apps Script. No admin registration.

## How a surveyor uses it

1. **Setup:** Surveyor, **Location ID**, **Location Name** (suggests the study-area list as you type), optional **GPS**, then **Start Survey**.
2. **Recorded automatically:** Date and Time (taken when the form is saved).
3. **Questions** (most are a single tap):
   1. Gender (Male / Female)
   2. Age category (Under 18 / 18–40 / 41–60 / Over 60)
   3. Origin – suggests the study-area locations (all of them when the box is empty), then **every Sri Lankan city / town** matching the text, then other map places; the typed text is always the first suggestion
   4. Principal destination – same
   5. Respondent / trip category (incl. School child, University student, Other student, Patient, Pilgrim)
   6. Did you use an underpass on this journey? Yes / No – **No** opens **Why not?** (Don't know about underpasses / Difficult to use / Other; tick all that apply)
   7. Access mode used to enter the study area – **Bus** opens **7a Bus terminal where they got off** (study-area list, terminals used before at this location, map places) and **7b Bus route they came on** (e.g. *Colombo – Kandy*; suggests the `busRoutes` list in [`config.js`](config.js), routes used before, and **any Sri Lankan city / town as a route** – typing *bad* offers *Badulla – Kandy*; any route can be typed)
   8. Egress mode used to leave the study area – **Bus** opens **8a Bus terminal where they will board** and **8b Bus route they will take** (same suggestions)
   9. Boarding / alighting / parking / drop-off location (+ optional name)
   10. **Route used: draw on the map** – tap where the walk started, each turn, then the end. Each part follows the footpaths/streets (OpenStreetMap walking routes); it is drawn straight if there is no signal, or if the street route would be a long detour (more than 2.5× and 250 m longer than the straight line – usually a tap that snapped to an unconnected path). Double-tapping does not zoom, so it cannot add stray points. *Undo point*, *Clear* and *Full screen* buttons. **Full screen** shows only the map, a **search box** (type any Sri Lankan city / town – listed first – or a place, road or shop → pick a suggestion → the map moves there and a red pin marks it; tap the pin to add it as a point), the points line, *Minimize*, *Undo point* and *Save route*. Opens on the **satellite** photo with road names (switch to *Street map* in the corner; the choice is remembered). The survey area (**Kandy town**) is outlined by a dashed yellow box, but the map zooms out to **all of Sri Lanka** and points can be tapped anywhere on the island. Change `mapBounds` (the box), `mapOuterBounds` / `mapMinZoom` (how far the map goes) in [`config.js`](config.js). Needs internet for the map.
   11. Route used: landmarks passed – add as many as needed, in order (numbered; tap × to remove)
   12. Approximate walking time (Less than 5 / 5–10 / 10–15 / Over 15 min)
   13. Existing barriers experienced – select all that apply, *None*, *Other* and details
   14. Priority improvements requested – select all that apply (incl. Signalized crossing, Elevated crossing), *None*, *Other* and details
4. **Save respondent.** The form clears for the next respondent. A half-filled form (including the drawn route) survives closing the app.
5. **Undo** deletes the last saved respondent (until it has been sent). **End** finishes the survey.

The study-area location list is `presetLocations` in [`config.js`](config.js).

## Data (sheet tab `pedestrian-od`)

Location ID, Location Name, Surveyor, Date, Time, GPS Lat/Lon, Gender, Age Category, Origin + Lat/Lon, Principal Destination + Lat/Lon, Respondent / Trip Category, Used Underpass, Why No Underpass, Access Mode, Access Bus Terminal, Access Bus Route, Egress Mode, Egress Bus Terminal, Egress Bus Route, Boarding/Alighting/Parking/Drop-off Location, Stop / Stand / Car Park Name, Route Map Link, Route Length (m), Landmarks Passed, Walking Time, Existing Barriers, Barrier Details, Priority Improvements, Improvement Details, Route Points (lat,lon), Route Path (encoded polyline), EventID.

**Route columns:** *Route Map Link* opens the walk in Google Maps (walking directions through up to 8 of the tapped points). *Route Points* are the tapped points in order. *Route Path* is the full street-following line as a Google encoded polyline – paste it into a polyline decoder or decode it in Python (`polyline.decode(...)`) / QGIS to map every route.

"Other" answers are saved as `Other: <text>`; multiple answers are separated by `; `. The sheet menu **Pedestrian O-D → Build / refresh summary** counts every answer to each categorical question, overall and per Location ID.

## Changing the questions

All option lists are in the `FORM` list at the top of [`app.js`](app.js). If you add or rename a question, also update `COLUMNS` in the backend.

## Deployment

1. **Backend:** new Google Sheet → Extensions → Apps Script → paste [`backend/pedestrian_od_apps_script.js`](backend/pedestrian_od_apps_script.js) → run `setup` once → Deploy → New deployment → Web app (Execute as: Me, Access: Anyone) → copy the `/exec` URL.
2. Paste the URL into `appsScriptUrl` in [`config.js`](config.js).
3. **Frontend:** push this folder to its own GitHub repo and connect it to Netlify (no build command, publish directory `.`).
4. After changing app files, bump `CACHE_NAME` in [`sw.js`](sw.js).
