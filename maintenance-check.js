// maintenance-check.js
// Shows a friendly maintenance notice if bird data fails to load (e.g. syntax error in allbirds.js)
(function() {
    var dataOk = false;
    try {
        dataOk = (typeof allbirds !== 'undefined') && Array.isArray(allbirds) && allbirds.length > 0;
    } catch(e) {
        dataOk = false;
    }

    if (!dataOk) {
        // Create maintenance overlay
        var overlay = document.createElement('div');
        overlay.id = 'maintenanceOverlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;' +
            'background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);' +
            'display:flex;align-items:center;justify-content:center;padding:20px;';

        var box = document.createElement('div');
        box.style.cssText = 'background:white;border-radius:20px;padding:40px;max-width:500px;' +
            'width:100%;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,0.2);';

        box.innerHTML = '<div style="font-size:3em;margin-bottom:15px;">🛠️</div>' +
            '<h2 style="color:#333;margin:0 0 15px 0;font-family:Segoe UI,sans-serif;">Maintenance in Progress</h2>' +
            '<p style="color:#666;font-family:Segoe UI,sans-serif;line-height:1.6;margin:0 0 20px 0;">' +
            'We are busy updating the bird data. The app will be back shortly — please try again in a few minutes.</p>' +
            '<p style="color:#666;font-family:Segoe UI,sans-serif;line-height:1.6;margin:0 0 20px 0;">' +
            'Ons is besig om die voëldata op te dateer. Die app sal binne \'n paar minute weer werk — probeer asseblief later weer.</p>' +
            '<button onclick="location.href=\'start.html\'" style="background:linear-gradient(135deg,#667eea,#764ba2);' +
            'color:white;border:none;padding:12px 30px;border-radius:10px;font-size:1em;cursor:pointer;' +
            'font-family:Segoe UI,sans-serif;">← Back to Start</button>';

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // Stop any further script execution from running game logic
        window.MAINTENANCE_MODE = true;
    }
})();
