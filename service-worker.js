const CACHE_NAME = 'chirp-coach-v5';
const OFFLINE_DB_NAME = 'ChirpCoachOffline';
const AUDIO_STORE = 'audioFiles';

// Core app shell files to cache for offline
const APP_SHELL = [
    './start.html',
    './index.html',
    './identify.html',
    './learn.html',
    './single-select.html',
    './multiplayer.html',
    './soundscape.html',
    './downloads.html',
    './about.html',
    './spectro-challenge.html',
    './app-icon.png',
    './app.js',
    './allbirds.js',
    './audio-analyzer.js',
    './spectrogram-generator.js',
    './interactive-spectrogram.js',
    './offline-manager.js',
    './maintenance-check.js',
    './soundscapes.js',
    './bird_audio_features.json',
    './manifest.json',
    './studio.html',
    './wav-processor.js',
    './guide.html'
];

// Install event - cache core app shell
self.addEventListener('install', function(event) {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(APP_SHELL).catch(function(err) {
                console.warn('Some app shell files failed to cache:', err);
            });
        })
    );
});

// Activate event - clean up old caches, claim clients
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.filter(function(name) {
                    return name !== CACHE_NAME;
                }).map(function(name) {
                    return caches.delete(name);
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// Helper: open IndexedDB from service worker
function openOfflineDBFromSW() {
    return new Promise(function(resolve, reject) {
        var request = indexedDB.open(OFFLINE_DB_NAME, 1);
        request.onupgradeneeded = function(e) {
            var db = e.target.result;
            if (!db.objectStoreNames.contains(AUDIO_STORE)) {
                db.createObjectStore(AUDIO_STORE);
            }
            if (!db.objectStoreNames.contains('installedPacks')) {
                db.createObjectStore('installedPacks');
            }
        };
        request.onsuccess = function(e) { resolve(e.target.result); };
        request.onerror = function(e) { reject(e.target.error); };
    });
}

// Helper: get audio from IndexedDB
function getAudioFromDB(path) {
    return openOfflineDBFromSW().then(function(db) {
        return new Promise(function(resolve, reject) {
            var tx = db.transaction(AUDIO_STORE, 'readonly');
            var req = tx.objectStore(AUDIO_STORE).get(path);
            req.onsuccess = function() { resolve(req.result || null); };
            req.onerror = function() { resolve(null); };
        });
    }).catch(function() { return null; });
}

// Fetch event
self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);
    var path = url.pathname;

    // For audio files (mp3/wav/webm in 'All birds/' or other audio dirs)
    if (path.match(/\.(mp3|wav|webm|ogg)$/i) || path.includes('All%20birds/') || path.includes('All birds/')) {
        event.respondWith(
            fetch(event.request).catch(function() {
                // Network failed - try IndexedDB
                var relativePath = decodeURIComponent(path);
                // Strip leading slash and try common patterns
                if (relativePath.startsWith('/')) relativePath = relativePath.substring(1);

                return getAudioFromDB(relativePath).then(function(blob) {
                    if (blob) {
                        return new Response(blob, {
                            headers: { 'Content-Type': blob.type || 'audio/mpeg' }
                        });
                    }
                    // Also try with './' prefix
                    return getAudioFromDB('./' + relativePath);
                }).then(function(result) {
                    if (result instanceof Response) return result;
                    if (result) {
                        return new Response(result, {
                            headers: { 'Content-Type': result.type || 'audio/mpeg' }
                        });
                    }
                    return new Response('Audio not available offline', { status: 404 });
                });
            })
        );
        return;
    }

    // For bird photos (from subdirectories with images)
    if (path.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        event.respondWith(
            fetch(event.request).then(function(response) {
                // Cache photos as they're viewed
                var responseClone = response.clone();
                caches.open(CACHE_NAME).then(function(cache) {
                    cache.put(event.request, responseClone);
                });
                return response;
            }).catch(function() {
                return caches.match(event.request).then(function(cached) {
                    return cached || new Response('Image not available offline', { status: 404 });
                });
            })
        );
        return;
    }

    // For app shell files: stale-while-revalidate
    event.respondWith(
        caches.match(event.request).then(function(cached) {
            var fetchPromise = fetch(event.request).then(function(response) {
                // Update cache with fresh copy
                if (response.ok) {
                    var responseClone = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            }).catch(function() {
                return cached;
            });

            return cached || fetchPromise;
        })
    );
});
