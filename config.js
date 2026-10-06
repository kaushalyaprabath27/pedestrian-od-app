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
    // Principal destination, passing bus stands and landmarks (tap an empty box to see all).
    presetLocations: [
        'Bogambara TT',
        'SWRD Bandaranayake Mw TT',
        'Clock Tower TT',
        'Torrington TT',
        'Prison Front TT',
        'Front of Swarnamahal TT',
        'Kachcheriya (DS) TT',
        'Infront of Dalada Maligawa',
        'Kandy DS office',
        'Kandy Municipal Council',
        'Kandy Hospital (Hanthana Entrance)',
        'Kandy Hospital (WGM Entrance)',
        'Municipal Central Market'
    ],
    surveyAreaCenter: { lat: 7.2906, lon: 80.6337 },

    // Bus routes offered as you type in "Bus route" (access / egress by bus).
    // Any route can still be typed; edit this list as needed.
    busRoutes: [
        'Colombo – Kandy',
        'Kandy – Kurunegala',
        'Kandy – Matale',
        'Kandy – Dambulla',
        'Kandy – Anuradhapura',
        'Kandy – Polonnaruwa',
        'Kandy – Trincomalee',
        'Kandy – Jaffna',
        'Kandy – Batticaloa',
        'Kandy – Ampara',
        'Kandy – Mahiyanganaya',
        'Kandy – Badulla',
        'Kandy – Nuwara Eliya',
        'Kandy – Hatton',
        'Kandy – Gampola',
        'Kandy – Nawalapitiya',
        'Kandy – Kegalle',
        'Kandy – Ratnapura',
        'Kandy – Negombo',
        'Kandy – Puttalam',
        'Kandy – Galle',
        'Kandy – Matara',
        'Kandy – Kataragama',
        'Kandy – Kadugannawa',
        'Kandy – Peradeniya',
        'Kandy – Galaha',
        'Kandy – Katugastota',
        'Kandy – Wattegama',
        'Kandy – Digana',
        'Kandy – Teldeniya',
        'Kandy – Kundasale',
        'Kandy – Ampitiya',
        'Kandy – Hanguranketha'
    ],

    // Route map: the survey area, shown as a dashed yellow box,
    // [west, south, east, north] (Kandy town).
    mapBounds: [80.618, 7.276, 80.655, 7.308],
    // The map can be moved and tapped anywhere inside this larger area
    // (Peradeniya, Katugastota, Kundasale...), [west, south, east, north].
    mapOuterBounds: [80.56, 7.22, 80.72, 7.36],
    // Map shown first: 'satellite' or 'street'.
    mapDefaultLayer: 'satellite'
};
