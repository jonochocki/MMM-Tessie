var mqtt = require('mqtt');
var NodeHelper = require("node_helper");
var https = require('https');
const topicPrefix = 'teslamate/cars/';

var globalServer = {};

module.exports = NodeHelper.create({
    tessieConfig: null,
    tessieTimer: null,

    makeTopics: function (carID) {
      return {
        name: topicPrefix + carID + '/display_name',
        state: topicPrefix + carID + '/state',
        health: topicPrefix + carID + '/healthy',

        lat: topicPrefix + carID + '/latitude',
        lon: topicPrefix + carID + '/longitude',
        shift_state: topicPrefix + carID + '/shift_state',
        speed: topicPrefix + carID + '/speed',

        locked: topicPrefix + carID + '/locked',
        sentry: topicPrefix + carID + '/sentry_mode',
        windows: topicPrefix + carID + '/windows_open',

        outside_temp: topicPrefix + carID + '/outside_temp',
        inside_temp: topicPrefix + carID + '/inside_temp',
        climate_on: topicPrefix + carID + '/is_climate_on',

        odometer: topicPrefix + carID + '/odometer',
        ideal_range: topicPrefix + carID + '/ideal_battery_range_km',
        est_range: topicPrefix + carID + '/est_battery_range_km',
        rated_range: topicPrefix + carID + '/rated_battery_range_km',

        battery: topicPrefix + carID + '/battery_level',
        battery_usable: topicPrefix + carID + '/usable_battery_level',
        plugged_in: topicPrefix + carID + '/plugged_in',
        charge_added: topicPrefix + carID + '/charge_energy_added',
        charge_limit: topicPrefix + carID + '/charge_limit_soc',
        // charge_port: 'teslamate/cars/1/charge_port_door_open',
        // charge_current: 'teslamate/cars/1/charger_actual_current',
        // charge_phases: 'teslamate/cars/1/charger_phases',
        // charge_power: 'teslamate/cars/1/charger_power',
        // charge_voltage: 'teslamate/cars/1/charger_voltage',
        charge_start: topicPrefix + carID + '/scheduled_charging_start_time',
        charge_time:  topicPrefix + carID + '/time_to_full_charge',

        update_available: topicPrefix + carID + '/update_available',
        geofence: topicPrefix + carID + '/geofence',
        tpms_pressure_fl: topicPrefix + carID + '/tpms_pressure_fl',
        tpms_pressure_fr: topicPrefix + carID + '/tpms_pressure_fr',
        tpms_pressure_rl: topicPrefix + carID + '/tpms_pressure_rl',
        tpms_pressure_rr: topicPrefix + carID + '/tpms_pressure_rr',
      };
    },

    start: function () {
        console.log(this.name + ': Starting node helper');
        this.loaded = false;
    },

    makeServerKey: function (server) {
        return '' + server.address + ':' + (server.port ?? '1883');
    },

    addServer: function (server, carID) {
        var Topics = this.makeTopics(carID);
        console.log(this.name + ': Adding server: ', server);
        var serverKey = this.makeServerKey(server);
        var mqttServer = {}
        if (globalServer.serverKey === serverKey) {
            mqttServer = globalServer;
        } else {
            mqttServer.serverKey = serverKey;
            mqttServer.address = server.address;
            mqttServer.port = server.port;
            mqttServer.options = {};
            mqttServer.topics = [];
            if (server.user) mqttServer.options.username = server.user;
            if (server.password) mqttServer.options.password = server.password;
        }

        for (var key in Topics) {
            console.log(Topics[key]);
            mqttServer.topics.push(Topics[key]);
        }

        globalServer = mqttServer;
        this.startClient(mqttServer);
    },

    addConfig: function (config) {
        console.log('Adding config');
        const hasTessieCreds = (config && config.tessie && config.tessie.accessToken && config.tessie.vin);
        if (config.dataSource === 'tessie' && hasTessieCreds) {
            this.startTessieClient(config);
        } else {
            if (config.dataSource === 'tessie' && !hasTessieCreds) {
                console.log(this.name + ': Tessie selected but missing accessToken or vin; using MQTT');
            }
            this.addServer(config.mqttServer, config.carID);
        }
    },

    startClient: function (server) {

        console.log(this.name + ': Starting client for: ', server);

        var self = this;

        var mqttServer = (server.address.match(/^mqtts?:\/\//) ? '' : 'mqtt://') + server.address;
        if (server.port) {
            mqttServer = mqttServer + ':' + server.port
        }
        console.log(self.name + ': Connecting to ' + mqttServer);

        server.client = mqtt.connect(mqttServer, server.options);

        server.client.on('error', function (err) {
            console.log(self.name + ' ' + server.serverKey + ': Error: ', err);
        });

        server.client.on('reconnect', function (err) {
            server.value = 'reconnecting'; // Hmmm...
            console.log(self.name + ': ' + server.serverKey + ' reconnecting, error was: ', err);
        });

        server.client.on('connect', function (connack) {
            console.log(self.name + ' connected to ' + mqttServer);
            console.log(self.name + ': subscribing to ' + server.topics);
            server.client.subscribe(server.topics);
        });

        server.client.on('message', function (topic, payload) {
            self.sendSocketNotification('MQTT_PAYLOAD', {
                serverKey: server.serverKey,
                topic: topic,
                value: payload.toString(),
                time: Date.now()
            });
        });

    },

    socketNotificationReceived: function (notification, payload) {
        console.log(this.name + ': Socket notification received: ', notification, ': ', payload);
        var self = this;
        if (notification === 'MQTT_CONFIG') {
            var config = payload;
            self.addConfig(config);
            self.loaded = true;
        } else if (notification === 'TESSIE_CONFIG') {
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
        if (self.tessieTimer) {
            clearInterval(self.tessieTimer);
            self.tessieTimer = null;
        }
        // Initial poll then interval
        self.pollTessie();
        self.tessieTimer = setInterval(function() {
            self.pollTessie();
        }, self.tessieConfig.periodMs);
    },

    pollTessie: function() {
        var self = this;
        var cfg = self.tessieConfig;
        if (!cfg) return;

        // Prefer the state endpoint for full nested vehicle state
        self.tessieGet('/' + encodeURIComponent(cfg.vin) + '/state?use_cache=true', cfg.token)
          .then(function(res) {
            var st = null;
            try { st = JSON.parse(res); } catch (e) {
              console.log(self.name + ': Tessie state parse error: ', e);
              return null;
            }
            if (!st) return null;
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
            self.sendSocketNotification('TESSIE_STATE', { values: mapped });
          })
          .catch(function(err) {
            console.log(self.name + ': Tessie poll error: ', err);
          });
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

    mapTessieToModuleFields: function(ls, location) {
        // Helpers
        function boolStr(v) { return v ? 'true' : 'false'; }
        function mphToKmh(mph) { return (typeof mph === 'number') ? mph * 1.609344 : 0; }
        function milesToKm(mi) { return (typeof mi === 'number') ? mi * 1.609344 : 0; }
        function secToISO(sec) { return (typeof sec === 'number' && sec > 0) ? new Date(sec * 1000).toISOString() : ''; }

        var drive = ls && ls.drive_state ? ls.drive_state : {};
        var veh = ls && ls.vehicle_state ? ls.vehicle_state : {};
        var clim = ls && ls.climate_state ? ls.climate_state : {};
        var chg = ls && ls.charge_state ? ls.charge_state : {};

        var windowsOpen = (veh.fd_window || veh.fp_window || veh.rd_window || veh.rp_window) ? true : false;
        var doorsOpen = (veh.df || veh.dr || veh.pf || veh.pr) ? true : false;
        var trunkOpen = (veh.rt && veh.rt !== 0) ? true : false;
        var frunkOpen = (veh.ft && veh.ft !== 0) ? true : false;

        var pluggedIn = false;
        if (chg) {
            var cable = chg.conn_charge_cable;
            if (cable && cable !== '<invalid>') pluggedIn = true;
            if (chg.charge_port_latch === 'Engaged') pluggedIn = true;
            if (chg.charge_port_door_open === true) pluggedIn = true;
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
            tpms_pressure_rr: (typeof veh.tpms_pressure_rr === 'number' ? veh.tpms_pressure_rr : 0)
        };
    }
});

