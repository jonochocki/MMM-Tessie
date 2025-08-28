var NodeHelper = require("node_helper");
var https = require('https');

module.exports = NodeHelper.create({
    tessieConfig: null,
    tessieTimer: null,
    tessieBackoffMs: null,
    lastMappedValues: null,
    lastSentAt: 0,
    pollCounter: 0,
    pollConfig: null,

    

    start: function () {
        console.log(this.name + ': Starting node helper');
        this.loaded = false;
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
    startTessieClient: function(config) {
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
            enabled: (config.displayMode === 'map' || config.displayMode === 'radial') || (config.mapOptions && config.mapOptions.enabled === true),
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
        self.lastMappedValues = null;
        self.lastSentAt = 0;
        self.pollTessie();
    },

    pollTessie: function() {
        var self = this;
        var cfg = self.tessieConfig;
        if (!cfg) return;

        var includeLocation = false;
        if (self.pollConfig && typeof self.pollConfig.locationEvery === 'number') {
            includeLocation = (self.pollCounter % self.pollConfig.locationEvery) === 0;
        }
        self.pollCounter = (self.pollCounter + 1) % 1000000;

        // Prefer the state endpoint for full nested vehicle state
        self.tessieGet('/' + encodeURIComponent(cfg.vin) + '/state?use_cache=true', cfg.token)
          .then(function(res) {
            var st = null;
            try { st = JSON.parse(res); } catch (e) {
              console.log(self.name + ': Tessie state parse error: ', e);
              return null;
            }
            if (!st) return null;
            if (!includeLocation) {
                return { state: st, location: null };
            }
            return self.tessieGet('/' + encodeURIComponent(cfg.vin) + '/location', cfg.token)
                .then(function(locRes) {
                    var location = null;
                    try { location = JSON.parse(locRes); } catch (e) {}
                    return { state: st, location: location };
                })
                .catch(function() { return { state: st, location: null }; });
          })
          .then(function(bundle) {
            if (!bundle) return;
            var mapped = self.mapTessieToModuleFields(bundle.state, bundle.location);
            // Preserve last known geofence if location not fetched or empty
            if ((!mapped.geofence || mapped.geofence === '') && self.lastMappedValues && self.lastMappedValues.geofence) {
                mapped.geofence = self.lastMappedValues.geofence;
            }
            var afterMap = Promise.resolve(mapped);
            if (self.mapOptions && self.mapOptions.enabled) {
                var mo = self.mapOptions;
                var mapPath = '/' + encodeURIComponent(cfg.vin) + '/map?width=' + encodeURIComponent(mo.width) + '&height=' + encodeURIComponent(mo.height) + '&zoom=' + encodeURIComponent(mo.zoom) + '&marker_size=' + encodeURIComponent(mo.marker_size) + '&style=' + encodeURIComponent(mo.style);
                afterMap = self.tessieGetBuffer(mapPath, cfg.token)
                    .then(function(buf) {
                        try {
                            mapped.map_image = 'data:image/png;base64,' + buf.toString('base64');
                        } catch (e) {}
                        return mapped;
                    })
                    .catch(function() { return mapped; });
            }

            afterMap.then(function(finalMapped) {
                var shouldSend = false;
                try {
                    if (!self.lastMappedValues) shouldSend = true;
                    else shouldSend = (JSON.stringify(self.lastMappedValues) !== JSON.stringify(finalMapped));
                } catch (e) {
                    shouldSend = true;
                }
                if (shouldSend) {
                    self.lastMappedValues = finalMapped;
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
          .catch(function(err) {
            console.log(self.name + ': Tessie poll error: ', err);
            var base = (self.pollConfig && self.pollConfig.errorBackoffMs) ? self.pollConfig.errorBackoffMs : 60000;
            self.tessieBackoffMs = self.tessieBackoffMs ? Math.min(self.tessieBackoffMs * 2, base * 10) : base;
            self.scheduleNextPoll(self.tessieBackoffMs);
          });
    },

    scheduleNextPoll: function(delayMs) {
        var self = this;
        if (self.tessieTimer) {
            clearTimeout(self.tessieTimer);
            self.tessieTimer = null;
        }
        self.tessieTimer = setTimeout(function() { self.pollTessie(); }, delayMs);
    },

    tessieGet: function(path, token) {
        return new Promise(function(resolve, reject) {
            var options = {
                hostname: 'api.tessie.com',
                port: 443,
                path: path,
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Accept': 'application/json'
                }
            };
            var req = https.request(options, function(res) {
                var data = '';
                res.on('data', function(chunk) { data += chunk; });
                res.on('end', function() {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(data);
                    } else {
                        reject(new Error('HTTP ' + res.statusCode + ': ' + data));
                    }
                });
            });
            req.on('error', function(e) { reject(e); });
            req.end();
        });
    },

    tessieGetBuffer: function(path, token) {
        return new Promise(function(resolve, reject) {
            var options = {
                hostname: 'api.tessie.com',
                port: 443,
                path: path,
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Accept': '*/*'
                }
            };
            var req = https.request(options, function(res) {
                var data = [];
                res.on('data', function(chunk) { data.push(chunk); });
                res.on('end', function() {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(Buffer.concat(data));
                    } else {
                        reject(new Error('HTTP ' + res.statusCode));
                    }
                });
            });
            req.on('error', function(e) { reject(e); });
            req.end();
        });
    },

    mapTessieToModuleFields: function(ls, location) {
        // Helpers
        function boolStr(v) { return v ? 'true' : 'false'; }
        function mphToKmh(mph) { return (typeof mph === 'number') ? mph * 1.609344 : 0; }
        function milesToKm(mi) { return (typeof mi === 'number') ? mi * 1.609344 : 0; }
        function secToISO(sec) { return (typeof sec === 'number' && sec > 0) ? new Date(sec * 1000).toISOString() : ''; }
        function mapCarTypeToModelCode(carType) {
            if (!carType || typeof carType !== 'string') return null;
            var ct = carType.toLowerCase();
            if (ct.indexOf('model3') >= 0 || ct === 'model3') return 'm3';
            if (ct.indexOf('models') >= 0 || ct === 'models' || ct === 'models2' || ct === 'modelsx') return 'ms';
            if (ct.indexOf('modelx') >= 0 || ct === 'modelx') return 'mx';
            if (ct.indexOf('modely') >= 0 || ct === 'modely') return 'my';
            return null;
        }
        function mapExteriorColorToCode(color) {
            if (!color || typeof color !== 'string') return null;
            switch (color) {
                case 'PearlWhite':
                case 'PearlWhiteMultiCoat':
                    return 'PPSW';
                case 'RedMulticoat':
                case 'RedMultiCoat':
                    return 'PPMR';
                case 'DeepBlueMetallic':
                case 'DeepBlue':
                    return 'PPSB';
                case 'MidnightSilverMetallic':
                case 'MidnightSilver':
                    return 'PMNG';
                case 'SolidBlack':
                case 'ObsidianBlackMetallic':
                    return 'PBSB';
                case 'SilverMetallic':
                    return 'PMSS';
                default:
                    return null;
            }
        }
        function mapWheelTypeToCode(carTypeCode, wheelType, trimBadging) {
            if (!wheelType || typeof wheelType !== 'string') return '';
            var wt = wheelType;
            var trim = (typeof trimBadging === 'string') ? trimBadging.toLowerCase() : '';

            // Performance-specific overrides
            if (carTypeCode === 'm3' && trim === 'p74d') return 'W33D';
            if (carTypeCode === 'my' && trim === 'p74d') return 'WY21P';

            switch (wt) {
                // Model 3 common
                case 'Pinwheel18': return 'W38B';
                case 'Pinwheel18CapKit':
                case 'PinwheelRefresh18': return 'W40B';
                case 'Aero19': return 'WTAE';
                case 'Sportwheel19':
                case 'Stiletto19': return 'W39B';
                case 'Aero18':
                case 'StilettoRefresh19': return 'W41B';
                case 'Performancewheel20':
                case 'Stiletto20DarkSquare':
                case 'Stiletto20': return 'W32P';
                case 'Cardenio19': return 'WS90';

                // S/X legacy mapping (subset)
                case 'Slipstream19Silver': return 'WTAS';
                case 'Slipstream19Carbon': return 'WTDS';
                case 'Slipstream20Carbon': return 'WTSC';
                case 'Slipstream20Silver': return 'WT20';
                case 'AeroTurbine19': return 'WTAS';
                case 'AeroTurbine20': return 'WT20';
                case 'Turbine19': return 'WTTB';
                case 'Arachnid21Grey': return 'WTAB';
                case 'AeroTurbine22': return 'WT22';
                case 'Turbine22Dark': return 'WTUT';
                case 'Turbine22Light': return 'WT22';

                // Model Y
                case 'Gemini19':
                case 'Apollo19': return 'WY19B';
                case 'Induction20Black': return 'WY20P';
                case 'UberTurbine21Black': return 'WY21P';
            }

            // Fallback heuristics
            if (wt.indexOf('Slipstream19') >= 0) return 'WTAS';
            if (wt.indexOf('Turbine22') >= 0) return 'WTUT';
            if (wt.indexOf('UberTurbine20') >= 0) return 'W33D';
            if (wt.indexOf('Base19') >= 0) return 'WT19';
            if (wt.indexOf('Stiletto20') >= 0) return 'W32P';
            if (wt.indexOf('Cyberstream') >= 0) return 'WX00';
            return '';
        }

        var drive = ls && ls.drive_state ? ls.drive_state : {};
        var veh = ls && ls.vehicle_state ? ls.vehicle_state : {};
        var clim = ls && ls.climate_state ? ls.climate_state : {};
        var chg = ls && ls.charge_state ? ls.charge_state : {};
        var vconf = ls && ls.vehicle_config ? ls.vehicle_config : {};

        var windowsOpen = (veh.fd_window || veh.fp_window || veh.rd_window || veh.rp_window) ? true : false;
        var doorsOpen = (veh.df || veh.dr || veh.pf || veh.pr) ? true : false;
        var trunkOpen = (veh.rt && veh.rt !== 0) ? true : false;
        var frunkOpen = (veh.ft && veh.ft !== 0) ? true : false;

        var pluggedIn = false;
        if (chg) {
            var cable = chg.conn_charge_cable;
            var chargingState = (typeof chg.charging_state === 'string') ? chg.charging_state.toLowerCase() : '';
            var cablePresent = (cable && cable !== '<invalid>');
            var notDisconnected = (chargingState && chargingState !== 'disconnected');
            pluggedIn = !!(cablePresent && notDisconnected);
            // Note: we no longer infer plugged status from latch or port door alone to avoid false positives
        }

        var updating = veh && veh.software_update && veh.software_update.status && (veh.software_update.status.trim() !== '');
        var driving = (drive && (drive.speed && drive.speed > 0)) || (drive && (drive.shift_state === 'D' || drive.shift_state === 'N' || drive.shift_state === 'R'));
        var stateOut = updating ? 'updating' : (driving ? 'driving' : (ls && ls.state ? ls.state : 'offline'));

        var geofenceName = '';
        if (location) {
            if (location.saved_location) geofenceName = location.saved_location;
            else if (location.address) geofenceName = location.address;
        }

        var timeHrs = (typeof chg.minutes_to_full_charge === 'number' && chg.minutes_to_full_charge > 0) ? (chg.minutes_to_full_charge / 60.0) : (typeof chg.time_to_full_charge === 'number' ? chg.time_to_full_charge : 0);

        var imageModel = mapCarTypeToModelCode(vconf.car_type);
        var imageOptionCodes = [];
        var paintCode = mapExteriorColorToCode(vconf.exterior_color);
        if (paintCode) imageOptionCodes.push(paintCode);
        if (vconf && typeof vconf.spoiler_type === 'string' && vconf.spoiler_type !== 'None' && vconf.spoiler_type !== '') {
            imageOptionCodes.push('SLR1');
        }
        var wheelCode = mapWheelTypeToCode(imageModel, vconf.wheel_type, vconf.trim_badging);
        if (wheelCode) imageOptionCodes.push(wheelCode);

        return {
            name: (ls.display_name || veh.vehicle_name || ''),
            state: stateOut,
            health: boolStr(ls.state && ls.state !== 'offline'),

            lat: (typeof drive.latitude === 'number' ? drive.latitude : null),
            lon: (typeof drive.longitude === 'number' ? drive.longitude : null),
            shift_state: (drive.shift_state || ''),
            speed: mphToKmh(drive.speed || 0),

            locked: boolStr(veh.locked === true),
            sentry: boolStr(veh.sentry_mode === true),
            windows: boolStr(windowsOpen),
            doors: boolStr(doorsOpen),
            trunk: boolStr(trunkOpen),
            frunk: boolStr(frunkOpen),
            user: boolStr(veh.is_user_present === true),

            outside_temp: (typeof clim.outside_temp === 'number' ? clim.outside_temp : null),
            inside_temp: (typeof clim.inside_temp === 'number' ? clim.inside_temp : null),
            climate_on: boolStr(clim.is_climate_on === true),
            preconditioning: boolStr(clim.is_preconditioning === true),

            odometer: milesToKm(veh.odometer || 0),
            ideal_range: milesToKm(chg.ideal_battery_range || 0),
            est_range: milesToKm(chg.est_battery_range || 0),
            rated_range: milesToKm(chg.battery_range || 0),

            battery: (typeof chg.battery_level === 'number' ? chg.battery_level : null),
            battery_usable: (typeof chg.usable_battery_level === 'number' ? chg.usable_battery_level : null),
            plugged_in: boolStr(pluggedIn),
            charge_added: (typeof chg.charge_energy_added === 'number' ? chg.charge_energy_added : 0),
            charge_limit: (typeof chg.charge_limit_soc === 'number' ? chg.charge_limit_soc : 0),
            charge_start: secToISO(chg.scheduled_charging_start_time),
            charge_time: timeHrs,

            update_available: boolStr(updating),
            geofence: geofenceName,

            tpms_pressure_fl: (typeof veh.tpms_pressure_fl === 'number' ? veh.tpms_pressure_fl : 0),
            tpms_pressure_fr: (typeof veh.tpms_pressure_fr === 'number' ? veh.tpms_pressure_fr : 0),
            tpms_pressure_rl: (typeof veh.tpms_pressure_rl === 'number' ? veh.tpms_pressure_rl : 0),
            tpms_pressure_rr: (typeof veh.tpms_pressure_rr === 'number' ? veh.tpms_pressure_rr : 0),

            // Image compositor helpers (used by frontend when carImageOptions not provided)
            image_model: imageModel,
            image_options: imageOptionCodes.join(',')
        };
    }
});

