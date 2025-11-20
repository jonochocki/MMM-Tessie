var NodeHelper = require("node_helper");
var axios = require('axios');
var fs = require('fs');
var path = require('path');
var TessieMapper = require('./lib/TessieMapper');

module.exports = NodeHelper.create({
    tessieConfig: null,
    tessieTimer: null,
    tessieBackoffMs: null,
    lastMappedValues: null,
    lastSentAt: 0,
    pollCounter: 0,
    pollConfig: null,
    lastLocation: null,

    start: function () {
        console.log(this.name + ': Starting node helper');
        this.loaded = false;
        this.loadCache();
    },

    loadCache: function () {
        var cachePath = path.join(__dirname, 'tessie_cache.json');
        if (fs.existsSync(cachePath)) {
            try {
                var data = fs.readFileSync(cachePath, 'utf8');
                this.lastMappedValues = JSON.parse(data);
                console.log(this.name + ': Loaded cache');
                if (this.lastMappedValues) {
                    this.sendSocketNotification('TESSIE_STATE', { values: this.lastMappedValues });
                }
            } catch (e) {
                console.error(this.name + ': Error loading cache', e);
            }
        }
    },

    saveCache: function (values) {
        var cachePath = path.join(__dirname, 'tessie_cache.json');
        try {
            fs.writeFileSync(cachePath, JSON.stringify(values));
        } catch (e) {
            console.error(this.name + ': Error saving cache', e);
        }
    },

    socketNotificationReceived: function (notification, payload) {
        console.log(this.name + ': Socket notification received: ', notification, ': ', payload);
        var self = this;
        if (notification === 'TESSIE_CONFIG') {
            var configT = payload;
            self.startTessieClient(configT);
            self.loaded = true;
        }
    },

    // === Tessie support ===
    startTessieClient: function (config) {
        var self = this;
        if (!config || !config.tessie || !config.tessie.accessToken || !config.tessie.vin) {
            console.log(self.name + ': Tessie config invalid; requires tessie.accessToken and tessie.vin');
            return;
        }
        self.tessieConfig = {
            token: config.tessie.accessToken,
            vin: config.tessie.vin,
            periodMs: (config.updatePeriod ? config.updatePeriod : 5) * 1000
        };
        self.mapOptions = {
            enabled: (config.displayMode === 'map') || (config.displayMode === 'radial') || (config.mapOptions && config.mapOptions.enabled === true),
            width: (config.mapOptions && config.mapOptions.width) ? config.mapOptions.width : 200,
            height: (config.mapOptions && config.mapOptions.height) ? config.mapOptions.height : 200,
            zoom: (config.mapOptions && config.mapOptions.zoom) ? config.mapOptions.zoom : 16,
            marker_size: (config.mapOptions && config.mapOptions.markerSize) ? config.mapOptions.markerSize : 50,
            style: (config.mapOptions && config.mapOptions.style) ? config.mapOptions.style : 'dark'
        };
        self.pollConfig = {
            drivingMs: (config.pollingCadence && config.pollingCadence.drivingMs) ? config.pollingCadence.drivingMs : 5000,
            onlineMs: (config.pollingCadence && config.pollingCadence.onlineMs) ? config.pollingCadence.onlineMs : 30000,
            asleepMs: (config.pollingCadence && config.pollingCadence.asleepMs) ? config.pollingCadence.asleepMs : 300000,
            errorBackoffMs: (config.pollingCadence && config.pollingCadence.errorBackoffMs) ? config.pollingCadence.errorBackoffMs : 60000,
            locationEvery: (config.pollingCadence && config.pollingCadence.locationEvery) ? config.pollingCadence.locationEvery : 6
        };
        if (self.tessieTimer) {
            clearInterval(self.tessieTimer);
            self.tessieTimer = null;
        }
        // Initial poll then dynamically scheduled polls
        self.pollCounter = 0;
        self.tessieBackoffMs = null;
        // self.lastMappedValues = null; // Don't clear if loaded from cache
        self.lastSentAt = 0;
        self.pollTessie();
    },

    pollTessie: function () {
        var self = this;
        var cfg = self.tessieConfig;
        if (!cfg) return;

        self.pollCounter = (self.pollCounter + 1) % 1000000;

        // Prefer the state endpoint for full nested vehicle state
        var url = 'https://api.tessie.com/' + encodeURIComponent(cfg.vin) + '/state?use_cache=true';

        axios.get(url, { headers: { 'Authorization': 'Bearer ' + cfg.token } })
            .then(function (response) {
                var st = response.data;
                if (!st) return null;

                // Optimization: Check if we need to fetch location
                var includeLocation = false;
                var drive = st.drive_state || {};
                var lat = drive.latitude;
                var lon = drive.longitude;

                // Always fetch if we have no location history
                if (!self.lastLocation) includeLocation = true;
                else {
                    // Calculate distance
                    var dist = self.getDistanceFromLatLonInKm(self.lastLocation.lat, self.lastLocation.lon, lat, lon);
                    // Fetch if moved > 0.1km
                    if (dist > 0.1) includeLocation = true;
                }

                // Also respect the periodic forced refresh (fallback)
                if ((self.pollCounter % self.pollConfig.locationEvery) === 0) {
                    includeLocation = true;
                }

                if (includeLocation && lat && lon) {
                    self.lastLocation = { lat: lat, lon: lon };
                }

                if (!includeLocation) {
                    return { state: st, location: null };
                }

                return axios.get('https://api.tessie.com/' + encodeURIComponent(cfg.vin) + '/location', { headers: { 'Authorization': 'Bearer ' + cfg.token } })
                    .then(function (locRes) {
                        return { state: st, location: locRes.data };
                    })
                    .catch(function () { return { state: st, location: null }; });
            })
            .then(function (bundle) {
                if (!bundle) return;
                var mapped = TessieMapper.mapTessieToModuleFields(bundle.state, bundle.location);

                // Preserve last known geofence if location not fetched or empty
                if ((!mapped.geofence || mapped.geofence === '') && self.lastMappedValues && self.lastMappedValues.geofence) {
                    mapped.geofence = self.lastMappedValues.geofence;
                }

                var afterMap = Promise.resolve(mapped);
                if (self.mapOptions && self.mapOptions.enabled) {
                    var mo = self.mapOptions;
                    var mapPath = 'https://api.tessie.com/' + encodeURIComponent(cfg.vin) + '/map?width=' + encodeURIComponent(mo.width) + '&height=' + encodeURIComponent(mo.height) + '&zoom=' + encodeURIComponent(mo.zoom) + '&marker_size=' + encodeURIComponent(mo.marker_size) + '&style=' + encodeURIComponent(mo.style);

                    afterMap = axios.get(mapPath, {
                        headers: { 'Authorization': 'Bearer ' + cfg.token },
                        responseType: 'arraybuffer'
                    })
                        .then(function (res) {
                            try {
                                var b64 = Buffer.from(res.data, 'binary').toString('base64');
                                mapped.map_image = 'data:image/png;base64,' + b64;
                            } catch (e) { }
                            return mapped;
                        })
                        .catch(function () { return mapped; });
                }

                afterMap.then(function (finalMapped) {
                    var shouldSend = false;
                    try {
                        if (!self.lastMappedValues) shouldSend = true;
                        else shouldSend = (JSON.stringify(self.lastMappedValues) !== JSON.stringify(finalMapped));
                    } catch (e) {
                        shouldSend = true;
                    }
                    if (shouldSend) {
                        self.lastMappedValues = finalMapped;
                        self.saveCache(finalMapped);
                        self.lastSentAt = Date.now();
                        self.sendSocketNotification('TESSIE_STATE', { values: finalMapped });
                    }

                    // compute next delay
                    var nextMs = self.pollConfig ? self.pollConfig.onlineMs : cfg.periodMs;
                    if (finalMapped && typeof finalMapped.state === 'string') {
                        if (finalMapped.state === 'driving') nextMs = self.pollConfig.drivingMs;
                        else if (finalMapped.state === 'asleep' || finalMapped.state === 'offline') nextMs = self.pollConfig.asleepMs;
                        else nextMs = self.pollConfig.onlineMs;
                    }
                    // jitter +/-10%
                    var jitter = (Math.random() * 0.2) - 0.1;
                    nextMs = Math.max(1000, Math.floor(nextMs * (1 + jitter)));
                    self.scheduleNextPoll(nextMs);
                    self.tessieBackoffMs = null;
                });
            })
            .catch(function (err) {
                console.log(self.name + ': Tessie poll error: ', err.message);
                var base = (self.pollConfig && self.pollConfig.errorBackoffMs) ? self.pollConfig.errorBackoffMs : 60000;
                self.tessieBackoffMs = self.tessieBackoffMs ? Math.min(self.tessieBackoffMs * 2, base * 10) : base;
                self.scheduleNextPoll(self.tessieBackoffMs);
            });
    },

    scheduleNextPoll: function (delayMs) {
        var self = this;
        if (self.tessieTimer) {
            clearTimeout(self.tessieTimer);
            self.tessieTimer = null;
        }
        self.tessieTimer = setTimeout(function () { self.pollTessie(); }, delayMs);
    },

    getDistanceFromLatLonInKm: function (lat1, lon1, lat2, lon2) {
        var R = 6371; // Radius of the earth in km
        var dLat = this.deg2rad(lat2 - lat1);
        var dLon = this.deg2rad(lon2 - lon1);
        var a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2)
            ;
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        var d = R * c; // Distance in km
        return d;
    },

    deg2rad: function (deg) {
        return deg * (Math.PI / 180)
    }
});

