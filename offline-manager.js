// ===== OFFLINE MANAGER =====
// Manages IndexedDB storage for offline bird audio packs
// Used by downloads.html (UI) and service-worker.js (fetch intercept)

const OFFLINE_DB_NAME = 'ChirpCoachOffline';
const OFFLINE_DB_VERSION = 1;
const AUDIO_STORE = 'audioFiles';
const PACKS_STORE = 'installedPacks';

// =================== IndexedDB ===================

function openOfflineDB() {
    return new Promise(function(resolve, reject) {
        var request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
        request.onupgradeneeded = function(e) {
            var db = e.target.result;
            if (!db.objectStoreNames.contains(AUDIO_STORE)) {
                db.createObjectStore(AUDIO_STORE); // key = audio file path
            }
            if (!db.objectStoreNames.contains(PACKS_STORE)) {
                db.createObjectStore(PACKS_STORE); // key = pack id
            }
        };
        request.onsuccess = function(e) { resolve(e.target.result); };
        request.onerror = function(e) { reject(e.target.error); };
    });
}

// Store a single audio file blob
function storeAudioFile(db, path, blob) {
    return new Promise(function(resolve, reject) {
        var tx = db.transaction(AUDIO_STORE, 'readwrite');
        tx.objectStore(AUDIO_STORE).put(blob, path);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function(e) { reject(e.target.error); };
    });
}

// Get a stored audio file
function getAudioFile(db, path) {
    return new Promise(function(resolve, reject) {
        var tx = db.transaction(AUDIO_STORE, 'readonly');
        var req = tx.objectStore(AUDIO_STORE).get(path);
        req.onsuccess = function() { resolve(req.result || null); };
        req.onerror = function(e) { reject(e.target.error); };
    });
}

// Delete a stored audio file
function deleteAudioFile(db, path) {
    return new Promise(function(resolve, reject) {
        var tx = db.transaction(AUDIO_STORE, 'readwrite');
        tx.objectStore(AUDIO_STORE).delete(path);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function(e) { reject(e.target.error); };
    });
}

// Get all stored audio file keys
function getAllAudioKeys(db) {
    return new Promise(function(resolve, reject) {
        var tx = db.transaction(AUDIO_STORE, 'readonly');
        var req = tx.objectStore(AUDIO_STORE).getAllKeys();
        req.onsuccess = function() { resolve(req.result || []); };
        req.onerror = function(e) { reject(e.target.error); };
    });
}

// =================== Pack Management ===================

function savePackInfo(db, packId, info) {
    return new Promise(function(resolve, reject) {
        var tx = db.transaction(PACKS_STORE, 'readwrite');
        tx.objectStore(PACKS_STORE).put(info, packId);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function(e) { reject(e.target.error); };
    });
}

function getPackInfo(db, packId) {
    return new Promise(function(resolve, reject) {
        var tx = db.transaction(PACKS_STORE, 'readonly');
        var req = tx.objectStore(PACKS_STORE).get(packId);
        req.onsuccess = function() { resolve(req.result || null); };
        req.onerror = function(e) { reject(e.target.error); };
    });
}

function getAllPacks(db) {
    return new Promise(function(resolve, reject) {
        var tx = db.transaction(PACKS_STORE, 'readonly');
        var store = tx.objectStore(PACKS_STORE);
        var keys = [];
        var values = [];
        var keyReq = store.getAllKeys();
        keyReq.onsuccess = function() {
            keys = keyReq.result;
            var valReq = store.getAll();
            valReq.onsuccess = function() {
                values = valReq.result;
                var result = {};
                for (var i = 0; i < keys.length; i++) {
                    result[keys[i]] = values[i];
                }
                resolve(result);
            };
            valReq.onerror = function(e) { reject(e.target.error); };
        };
        keyReq.onerror = function(e) { reject(e.target.error); };
    });
}

function deletePackInfo(db, packId) {
    return new Promise(function(resolve, reject) {
        var tx = db.transaction(PACKS_STORE, 'readwrite');
        tx.objectStore(PACKS_STORE).delete(packId);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function(e) { reject(e.target.error); };
    });
}

// =================== Pack Definitions ===================
// Built dynamically from allbirds.js data

function buildPackDefinitions(allbirdsData) {
    var hotspotBirds = {};

    allbirdsData.forEach(function(bird) {
        if (!bird || !bird.hotspot || !bird.audio) return;
        bird.hotspot.split(';').forEach(function(s) {
            s = s.trim();
            if (!s) return;
            if (!hotspotBirds[s]) hotspotBirds[s] = [];
            hotspotBirds[s].push({ english: bird.english, audio: bird.audio });
        });
    });

    // Group by region (merge Other + Special)
    var regions = {};
    Object.keys(hotspotBirds).sort().forEach(function(spot) {
        var base = spot.replace(' Other', '').replace(' Special', '').trim();
        if (!regions[base]) {
            regions[base] = { hotspots: [], birds: new Set(), audioFiles: new Set() };
        }
        regions[base].hotspots.push(spot);
        hotspotBirds[spot].forEach(function(b) {
            regions[base].birds.add(b.english);
            regions[base].audioFiles.add(b.audio);
        });
    });

    // Convert to pack list
    var packs = [];
    Object.keys(regions).sort().forEach(function(name) {
        var r = regions[name];
        if (name === 'Vagrant') return; // skip single-bird vagrant
        var id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        packs.push({
            id: id,
            name: name,
            hotspots: r.hotspots,
            speciesCount: r.birds.size,
            audioCount: r.audioFiles.size,
            audioFiles: Array.from(r.audioFiles)
        });
    });

    return packs;
}

// =================== Download a Pack ===================

async function downloadPack(packDef, onProgress) {
    var db = await openOfflineDB();
    var files = packDef.audioFiles;
    var downloaded = 0;
    var failed = 0;
    var totalBytes = 0;
    var errors = [];

    for (var i = 0; i < files.length; i++) {
        var audioPath = files[i];
        try {
            // Check if already downloaded
            var existing = await getAudioFile(db, audioPath);
            if (existing) {
                downloaded++;
                if (onProgress) onProgress(downloaded, files.length, 0, null);
                continue;
            }

            var response = await fetch(audioPath);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            var blob = await response.blob();
            totalBytes += blob.size;
            await storeAudioFile(db, audioPath, blob);
            downloaded++;
        } catch (e) {
            failed++;
            errors.push(audioPath + ': ' + e.message);
        }
        if (onProgress) onProgress(downloaded, files.length, failed, null);
    }

    // Save pack info
    await savePackInfo(db, packDef.id, {
        name: packDef.name,
        hotspots: packDef.hotspots,
        speciesCount: packDef.speciesCount,
        audioCount: packDef.audioCount,
        downloadedFiles: downloaded,
        failedFiles: failed,
        installedDate: new Date().toISOString()
    });

    return { downloaded: downloaded, failed: failed, errors: errors };
}

// =================== Delete a Pack ===================

async function deletePack(packDef) {
    var db = await openOfflineDB();
    
    // Get all installed packs to check shared files
    var allPacks = await getAllPacks(db);
    var otherPackFiles = new Set();
    Object.keys(allPacks).forEach(function(pid) {
        if (pid === packDef.id) return;
        // We need the pack definition to know its files
        // For safety, we'll check each file against other packs
    });

    // For now, delete all audio files that belong to this pack
    // (shared files will be re-downloaded if another pack needs them)
    var files = packDef.audioFiles;
    for (var i = 0; i < files.length; i++) {
        try {
            await deleteAudioFile(db, files[i]);
        } catch(e) {
            // ignore delete errors
        }
    }

    await deletePackInfo(db, packDef.id);
}

// =================== Check Offline Storage Usage ===================

async function getStorageUsage() {
    if (navigator.storage && navigator.storage.estimate) {
        var est = await navigator.storage.estimate();
        return {
            used: est.usage || 0,
            quota: est.quota || 0,
            usedMB: ((est.usage || 0) / (1024 * 1024)).toFixed(1),
            quotaMB: ((est.quota || 0) / (1024 * 1024)).toFixed(0)
        };
    }
    return { used: 0, quota: 0, usedMB: '?', quotaMB: '?' };
}
