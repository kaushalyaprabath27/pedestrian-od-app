# Pedestrian Origin–Destination / Intercept Survey

Offline-first PWA for the pedestrian O–D and intercept survey (Section 5.1.2): one form per respondent. Rows go to a Google Sheet through Google Apps Script. No admin registration.

## How a surveyor uses it

1. **Setup:** Surveyor, **Location ID**, **Location Name** (suggests the study-area list as you type), optional **GPS**, then **Start Survey**.
2. **Recorded automatically:** Respondent No. (1, 2, 3… per location and day on this phone), Date and Time (taken when the form is saved).
3. **Questions** (most are a single tap):
   1. Gender (Male / Female)
   2. Age category (Under 18 / 18–40 / 41–60 / Over 60)
   3. Respondent / trip category (incl. School child, University student, Other student, Patient)
   4. Origin – suggests the 14 study-area locations (all of them when the box is empty), then map places; the typed text is always the first suggestion
   5. Principal destination – same
   6. Did you use an underpass on this journey? Yes / No – **No** opens **6a Why not?** (Don't know about underpasses / Difficult to use / Other; tick all that apply)
   7. Access mode used to enter the study area
   8. Egress mode used to leave the study area
   9. Boarding / alighting / parking / drop-off location (+ optional name)
   10. Route used: entry point – study-area list, points used before at this location, nearby places
   11. Route used: exit point – same
   12. Approximate walking time (Under 5 / 5–10 / 10–15 / Over 15 min)
   13. Existing barriers experienced – select all that apply, *None*, *Other* and details
   14. Priority improvements requested – select all that apply (incl. Signalized crossing, Elevated crossing), *None*, *Other* and details
4. **Save respondent.** The form clears and the next respondent number appears. A half-filled form survives closing the app.
5. **Undo** deletes the last saved respondent (until it has been sent) and its number is reused. **End** finishes the survey.

The study-area location list is `presetLocations` in [`config.js`](config.js).

## Data (sheet tab `pedestrian-od`)

Location ID, Location Name, Surveyor, Respondent No., Date, Time, GPS Lat/Lon, Gender, Age Category, Respondent / Trip Category, Origin + Lat/Lon, Principal Destination + Lat/Lon, Access Mode, Egress Mode, Boarding/Alighting/Parking/Drop-off Location, Stop / Stand / Car Park Name, Route Entry Point, Route Exit Point, Used Underpass, Why No Underpass, Walking Time, Existing Barriers, Barrier Details, Priority Improvements, Improvement Details, EventID.

"Other" answers are saved as `Other: <text>`; multiple answers are separated by `; `. The sheet menu **Pedestrian O-D → Build / refresh summary** counts every answer to each categorical question, overall and per Location ID.

## Changing the questions

All option lists are in the `FORM` list at the top of [`app.js`](app.js). If you add or rename a question, also update `COLUMNS` in the backend.

## Deployment

1. **Backend:** new Google Sheet → Extensions → Apps Script → paste [`backend/pedestrian_od_apps_script.js`](backend/pedestrian_od_apps_script.js) → run `setup` once → Deploy → New deployment → Web app (Execute as: Me, Access: Anyone) → copy the `/exec` URL.
2. Paste the URL into `appsScriptUrl` in [`config.js`](config.js).
3. **Frontend:** push this folder to its own GitHub repo and connect it to Netlify (no build command, publish directory `.`).
4. After changing app files, bump `CACHE_NAME` in [`sw.js`](sw.js).
