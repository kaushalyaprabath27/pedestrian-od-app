// Settings for this deployment. Edit here, not in app.js.
window.PEDOD_CONFIG = {
    // Google Apps Script Web App URL (Deploy > Manage deployments, ends in /exec).
    // Until this is set, responses are kept safely on the device and are NOT sent.
    appsScriptUrl: 'https://script.google.com/macros/s/AKfycbxmUCrQPYtZh12M3hSR46uyA-pZBsJidrMvMOFCE7Dqw1572HTgBtHcSxNYq7L0T_Sz6A/exec',

    // Optional. Leave empty to use free OpenStreetMap place suggestions.
    googlePlacesApiKey: '',

    // Place suggestions are limited to this box: [west, south, east, north] (Sri Lanka).
    placeSearchBbox: [79.4, 5.8, 82.0, 10.0],
    placeSearchCountry: 'lk',

    // Survey area. Suggestions near here come first; the setup GPS is used
    // instead when it has been captured.
    surveyAreaName: 'Kandy',

    // Study-area locations offered first as you type Location Name, Origin,
    // Principal destination and Route entry/exit (tap an empty box to see all).
    presetLocations: [
        'Bogambara TT',
        'SWRD Bandaranayake Mw TT',
        'Clock Tower TT',
        'Torrington (Penideniya) TT',
        'Torrington (Market) TT',
        'Prison Front TT',
        'Front of Swarnamahal TT',
        'Kachcheriya (DS) TT',
        'Infront of Maligawa',
        'Kandy DS office',
        'Kandy Municipal Council',
        'Kandy Hospital (Hanthana Entrance)',
        'Kandy Hospital (WGM Entrance)',
        'Municipal Central Market'
    ],
    surveyAreaCenter: { lat: 7.2906, lon: 80.6337 }
};
