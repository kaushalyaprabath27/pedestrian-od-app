# Pedestrian Origin–Destination / Intercept Survey

Offline-first PWA for the pedestrian O–D and intercept survey (Section 5.1.2): one form per respondent. Rows go to a Google Sheet through Google Apps Script. No admin registration.

## How a surveyor uses it

1. **Setup:** Surveyor, **Location ID**, **Street**, **Survey Round (1 / 2 / 3)**, optional **GPS**, then **Start Survey**.
2. **Recorded automatically:** Respondent No. (1, 2, 3… per location, round and day on this phone), Date and Time (taken when the form is saved).
3. **Questions** (most are a single tap):
   1. Respondent / trip category
   2. Age category
   3. Gender
   4. Origin – type-ahead place suggestions (typed text is always the first suggestion)
   5. Principal destination – same
   6. Access mode used to enter the study area
   7. Boarding / alighting / parking / drop-off location (+ optional name of the stop, stand or car park)
   8. Route used: entry point – suggestions close to the site, plus points already used at this location
   9. Route used: exit point – same
   10. Approximate walking distance / time
   11. Existing barriers experienced – **select all that apply**, *None*, *Other* (type it) and a details box
   12. Priority improvements requested – **select all that apply**, *None*, *Other* and a details box
4. **Save respondent.** The form clears and the next respondent number appears. A half-filled form survives closing the app.
5. **Undo** deletes the last saved respondent (until it has been sent) and its number is reused. **End** finishes the survey.

## Data (sheet tab `pedestrian-od`)

Location ID, Street, Survey Round, Surveyor, Respondent No., Date, Time, GPS Lat/Lon, Respondent / Trip Category, Age Category, Gender, Origin + Lat/Lon, Principal Destination + Lat/Lon, Access Mode, Boarding/Alighting/Parking/Drop-off Location, Stop / Stand / Car Park Name, Route Entry Point, Route Exit Point, Walking Distance / Time, Existing Barriers, Barrier Details, Priority Improvements, Improvement Details, EventID.

"Other" answers are saved as `Other: <text>`; multiple answers are separated by `; `. The sheet menu **Pedestrian O-D → Build / refresh summary** counts every answer to each categorical question, overall and per Location ID.

## Changing the questions

All option lists are in the `FORM` list at the top of [`app.js`](app.js). If you add or rename a question, also update `COLUMNS` in the backend.

## Deployment

1. **Backend:** new Google Sheet → Extensions → Apps Script → paste [`backend/pedestrian_od_apps_script.js`](backend/pedestrian_od_apps_script.js) → run `setup` once → Deploy → New deployment → Web app (Execute as: Me, Access: Anyone) → copy the `/exec` URL.
2. Paste the URL into `appsScriptUrl` in [`config.js`](config.js).
3. **Frontend:** push this folder to its own GitHub repo and connect it to Netlify (no build command, publish directory `.`).
4. After changing app files, bump `CACHE_NAME` in [`sw.js`](sw.js).
