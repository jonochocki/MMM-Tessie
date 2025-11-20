const TessieMapper = {
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
};

module.exports = TessieMapper;
