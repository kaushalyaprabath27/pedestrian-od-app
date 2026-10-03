// Settings for this deployment. Edit here, not in app.js.
window.PEDOD_CONFIG = {
    // Google Apps Script Web App URL (Deploy > Manage deployments, ends in /exec).
    // Until this is set, responses are kept safely on the device and are NOT sent.
    appsScriptUrl: 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE',

    // Optional. Leave empty to use free OpenStreetMap place suggestions.
    googlePlacesApiKey: '',

    // Place suggestions are limited to this box: [west, south, east, north] (Sri Lanka).
    placeSearchBbox: [79.4, 5.8, 82.0, 10.0],
    placeSearchCountry: 'lk',

    // Survey area. Suggestions near here come first; the setup GPS is used
    // instead when it has been captured.
    surveyAreaName: 'Kandy',
    surveyAreaCenter: { lat: 7.2906, lon: 80.6337 }
};
