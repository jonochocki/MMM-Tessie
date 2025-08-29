Module.register("MMM-Tessie", {

  getScripts: function () {
    console.log(this.name + ": getScripts called");
    return [];
  },
  getStyles: function () {
    console.log(this.name + ": getStyles called");
    return [
      'https://cdnjs.cloudflare.com/ajax/libs/material-design-iconic-font/2.2.0/css/material-design-iconic-font.min.css',
      'Tessie.css',
    ];
  },

  // Default module config
  defaults: {
    tessie: {
      accessToken: null,
      vin: null,
    },
    displayMode: 'graphic', // 'graphic' | 'map' | 'radial' | 'smart'
    mapOptions: {
      enabled: false, // if true or displayMode === 'map', backend fetches map image
      width: 200,
      height: 200,
      zoom: 16,
      markerSize: 50,
      style: 'dark'
    },
    radialOptions: {
      showCar: true, // overlay car at bottom of circle
      showPercentage: true, // show battery percentage in center
      ringThickness: 8, // px
      iconBandThickness: 18, // px
      gapDegrees: 6 // small gap to simulate complication spacing
    },
    rangeDisplay: "%",
    imperial: false,
    sizeOptions: {
      width: 450,
      height: 203,
      batWidth: 250,
      batHeight: 75,
      topOffset: -40,
      fontSize: '.9rem', // null (to use default/css) or rem/px
      lineHeight: '1.2rem', // null (to use default/css) or rem/px
    },
    displayOptions: {
      odometer: {
        visible: true,
      },
      batteryBar: {
        visible: true,
        topMargin: 0,
      },
      temperatureIcons: {
        topMargin: 0,
      },
      tpms: {
        visible: true,
      },
      speed: {
        visible: true,
      },
      geofence: {
        visible: true,
      },
    },
    // Top-level on/off toggle for Intelligence features (user-friendly)
    intelligence: true,
    intelligenceOptions: {
      charging: true,
      temperature: true,
      schedule: true,
      tempThresholds: {
        // Defaults are in user's configured units
        cabinHot: 90,
        cabinCold: 40
      }
    },
    showTemps: "hvac_on",
    updatePeriod: 10, // update period in seconds (default increased to 10)
  },

  start: function () {
    console.log(this.name + ": start called");
    const keys = [
      'name','state','health',
      'lat','lon','shift_state','speed',
      'locked','sentry','windows','doors','trunk','frunk','user',
      'outside_temp','inside_temp','climate_on','preconditioning',
      'odometer','ideal_range','est_range','rated_range',
      'battery','battery_usable','plugged_in','charge_added','charge_limit','charge_start','charge_time',
      'update_available','geofence','tpms_pressure_fl','tpms_pressure_fr','tpms_pressure_rl','tpms_pressure_rr',
      'image_model','image_options','map_image'
    ];

    this.subscriptions = {};
    for (let i = 0; i < keys.length; i++) {
      this.subscriptions[keys[i]] = { value: null, time: null };
    }

    const hasTessieCreds = (this.config.tessie && this.config.tessie.accessToken && this.config.tessie.vin);
    if (!hasTessieCreds) {
      console.log(this.name + ': Tessie credentials missing; set config.tessie.accessToken and config.tessie.vin');
      this.missingCreds = true;
      return;
    }
    // Initialize intelligence state container
    this.intelState = {
      currentId: null,
      currentPriority: -1,
      lastChangeAt: 0,
      lastEligibleAtById: {}
    };
    this.openTessieConnection();
  },

  openTessieConnection: function () {
    console.log(this.name + ": openTessieConnection called");
    this.sendSocketNotification('TESSIE_CONFIG', this.config);
  },

  socketNotificationReceived: function (notification, payload) {
    console.log(this.name + ": socketNotificationReceived - Notification: " + notification);
    if (notification === 'TESSIE_STATE') {
      if (payload && payload.values) {
        console.log(this.name + ": TESSIE_STATE received");
        const now = Date.now();
        for (let key in payload.values) {
          if (this.subscriptions[key]) {
            this.subscriptions[key].value = payload.values[key];
            this.subscriptions[key].time = now;
          }
        }
        this.triggerDomUpdate();
      } else {
        console.log(this.name + ': TESSIE_STATE - No payload');
      }
    }
  },

  triggerDomUpdate: function () {
    console.log(this.name + ": triggerDomUpdate called");
    // Render immediately if we never rendered before or if it's more than 5s ago (configurable)
    if (!this.lastRenderTimestamp || this.lastRenderTimestamp <= (Date.now() - this.config.updatePeriod * 1000)) {
      console.log(this.name + ": Immediate DOM update");
      this.updateDom();
      this.lastRenderTimestamp = Date.now();
    // Schedule a render in 5s if one isn't scheduled already
    } else if (!this.nextRenderTimer) {
      console.log(this.name + ": Scheduling DOM update");
      this.nextRenderTimer = setTimeout(() => {
        this.updateDom();
        this.lastRenderTimestamp = Date.now();
        this.nextRenderTimer = null;
      }, this.config.updatePeriod * 1000);
    }
  },

  getDom: function () {
    console.log(this.name + ": getDom called");
    if (this.missingCreds || !(this.config.tessie && this.config.tessie.accessToken && this.config.tessie.vin)) {
      const wrapper = document.createElement('div');
      wrapper.className = 'loading';
      wrapper.innerHTML = 'Configure tessie.accessToken and tessie.vin in module config';
      return wrapper;
    }
    const kmToMiFixed = function (miles, fixed) {
      return (miles / 1.609344).toFixed(fixed);
    };

    const cToFFixed = function (celcius, fixed) {
      return ((celcius * 9 / 5) + 32).toFixed(fixed);
    };

    const barToPSI = function (bar, fixed) {
      return (bar * 14.503773773).toFixed(fixed);
    };

    const wrapper = document.createElement('div');

    const carName = this.subscriptions["name"].value;
    const state = this.subscriptions["state"].value;
    const latitude = this.subscriptions["lat"].value;
    const longitude = this.subscriptions["lon"].value;
    const battery = this.subscriptions["battery"].value;
    const batteryUsable = this.subscriptions["battery_usable"].value;
    const chargeLimitSOC = this.subscriptions["charge_limit"].value;

    const chargeStart = this.subscriptions["charge_start"].value;
    const timeToFull = this.subscriptions["charge_time"].value;
    const pluggedIn = this.subscriptions["plugged_in"].value;
    const charging = pluggedIn && timeToFull > 0.0;
    const energyAdded = this.subscriptions["charge_added"].value;
    const locked = this.subscriptions["locked"].value;
    const sentry = this.subscriptions["sentry"].value;
    const windowsOpen = this.subscriptions["windows"].value;
    const doorsOpen = this.subscriptions["doors"].value;
    const trunkOpen = this.subscriptions["trunk"].value;
    const frunkOpen = this.subscriptions["frunk"].value;
    const isUserPresent = this.subscriptions["user"].value;
    const isClimateOn = this.subscriptions["climate_on"].value;
    const isPreconditioning = this.subscriptions["preconditioning"].value;
    const isHealthy = this.subscriptions["health"].value;
    const isUpdateAvailable = this.subscriptions["update_available"].value;
    const geofence = this.subscriptions["geofence"].value;

    var idealRange = this.subscriptions["ideal_range"].value ? this.subscriptions["ideal_range"].value : 0;
    var estRange = this.subscriptions["est_range"].value ? this.subscriptions["est_range"].value : 0;
    var speed = this.subscriptions["speed"].value ? this.subscriptions["speed"].value : 0;
    var outside_temp = this.subscriptions["outside_temp"].value ? this.subscriptions["outside_temp"].value : 0;
    var inside_temp = this.subscriptions["inside_temp"].value ? this.subscriptions["inside_temp"].value : 0;
    var odometer = this.subscriptions["odometer"].value ? this.subscriptions["odometer"].value : 0;

    var tpms_pressure_fl = this.subscriptions["tpms_pressure_fl"].value ? this.subscriptions["tpms_pressure_fl"].value : 0;
    var tpms_pressure_fr = this.subscriptions["tpms_pressure_fr"].value ? this.subscriptions["tpms_pressure_fr"].value : 0;
    var tpms_pressure_rl = this.subscriptions["tpms_pressure_rl"].value ? this.subscriptions["tpms_pressure_rl"].value : 0;
    var tpms_pressure_rr = this.subscriptions["tpms_pressure_rr"].value ? this.subscriptions["tpms_pressure_rr"].value : 0;

    if (!this.config.imperial) {
      idealRange = (idealRange * 1.0).toFixed(0);
      estRange = (estRange * 1.0).toFixed(0);
      speed = (speed * 1.0).toFixed(0);
      odometer = (odometer * 1.0).toFixed(0);

      outside_temp = (outside_temp * 1.0).toFixed(1);
      inside_temp = (inside_temp * 1.0).toFixed(1);

      tpms_pressure_fl = (tpms_pressure_fl * 1.0).toFixed(1);
      tpms_pressure_fr = (tpms_pressure_fr * 1.0).toFixed(1);
      tpms_pressure_rl = (tpms_pressure_rl * 1.0).toFixed(1);
      tpms_pressure_rr = (tpms_pressure_rr * 1.0).toFixed(1);
    } else {
      idealRange = kmToMiFixed(idealRange, 0);
      estRange = kmToMiFixed(estRange, 0);
      speed = kmToMiFixed(speed, 0);
      odometer = kmToMiFixed(odometer, 0);

      outside_temp = cToFFixed(outside_temp, 1);
      inside_temp = cToFFixed(inside_temp, 1);

      tpms_pressure_fl = barToPSI(tpms_pressure_fl,1);
      tpms_pressure_fr = barToPSI(tpms_pressure_fr,1);
      tpms_pressure_rl = barToPSI(tpms_pressure_rl,1);
      tpms_pressure_rr = barToPSI(tpms_pressure_rr,1);
    }

    const data = {
      carName, state, latitude, longitude, battery, chargeLimitSOC,
      chargeStart, timeToFull, pluggedIn, energyAdded, locked, sentry,
      idealRange, estRange, speed, outside_temp, inside_temp, odometer,
      windowsOpen, batteryUsable, isClimateOn, isHealthy, charging,
      doorsOpen, trunkOpen, frunkOpen, isUserPresent, isUpdateAvailable,
      isPreconditioning, geofence, tpms_pressure_fl, tpms_pressure_fr, tpms_pressure_rl, tpms_pressure_rr
    }

    console.log(this.name + ": Generating DOM with data: ", data);

    // Update intelligence decision state before rendering
    this.updateIntelligenceDecision(data);
    if ((this.config.displayMode && this.config.displayMode.toLowerCase() === 'map') || (this.config.mapOptions && this.config.mapOptions.enabled)) {
      this.generateMapDom(wrapper, data);
    } else if (this.config.displayMode && this.config.displayMode.toLowerCase() === 'radial') {
      this.generateRadialDom(wrapper, data);
    } else if (this.config.displayMode && this.config.displayMode.toLowerCase() === 'smart') {
      this.generateSmartDom(wrapper, data);
    } else {
      this.generateGraphicDom(wrapper, data);
    }

    //optionally append the table
    if (this.config.hybridView)
      this.generateTableDom(wrapper, data);

    return wrapper;
  },

  // Centralized intelligence selection
  updateIntelligenceDecision: function (data) {
    if (this.config.intelligence === false) return;
    const opts = this.config.intelligenceOptions || {};
    const thresholdsUser = (opts.tempThresholds || {});
    const now = Date.now();

    // Utility: Celsius only internally
    const toC = (t) => {
      if (t == null) return null;
      return this.config.imperial ? ((t - 32) * 5 / 9) : t;
    };

    // Interpret user thresholds in configured units, then convert to Celsius for comparisons
    const unitIsF = !!this.config.imperial;
    const toCFromUser = (t) => {
      if (t == null) return null;
      return unitIsF ? ((t - 32) * 5 / 9) : t;
    };
    const cabinC = toC(data.inside_temp);
    const hotUser = (typeof thresholdsUser.cabinHot === 'number' ? thresholdsUser.cabinHot : (unitIsF ? 90 : 32));
    const coldUser = (typeof thresholdsUser.cabinCold === 'number' ? thresholdsUser.cabinCold : (unitIsF ? 40 : 4));
    // Internal hysteresis deltas (non-configurable)
    const hotDeltaUser = unitIsF ? 2 : 1;
    const coldDeltaUser = unitIsF ? 2 : 1;
    const hot = toCFromUser(hotUser);
    const cold = toCFromUser(coldUser);
    const hotClear = toCFromUser(hotUser - hotDeltaUser);
    const coldClear = toCFromUser(coldUser + coldDeltaUser);

    // Eligibility predicates
    const candidates = [];

    // P1: Safety (temperature)
    if (opts.temperature !== false && cabinC != null) {
      const wasTempHot = this.intelState.currentId === 'tempHot';
      const wasTempCold = this.intelState.currentId === 'tempCold';
      const hotEligible = cabinC >= hot;
      const hotClears = cabinC <= hotClear;
      const coldEligible = cabinC <= cold;
      const coldClears = cabinC >= coldClear;

      if (hotEligible || (wasTempHot && !hotClears)) {
        candidates.push({ id: 'tempHot', priority: 4, message: () => `Cabin hot (${this.config.imperial ? Math.round((cabinC * 9/5) + 32) : Math.round(cabinC)}°)` });
      }
      if (coldEligible || (wasTempCold && !coldClears)) {
        candidates.push({ id: 'tempCold', priority: 4, message: () => `Cabin cold (${this.config.imperial ? Math.round((cabinC * 9/5) + 32) : Math.round(cabinC)}°)` });
      }
    }

    // P2: Charging active
    if (opts.charging !== false && data.pluggedIn && data.timeToFull && data.timeToFull > 0) {
      candidates.push({ id: 'chargingEta', priority: 3, message: () => {
        const totalMins = Math.max(0, Math.round(data.timeToFull * 60));
        const hrs = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        const hPart = hrs > 0 ? (hrs + 'h ') : '';
        return `${hPart}${mins}m remaining`;
      }});
    }

    // P3: Scheduled charging
    if (opts.schedule !== false && data.pluggedIn && (!data.timeToFull || data.timeToFull <= 0) && data.chargeStart) {
      const d = new Date(data.chargeStart);
      if (!isNaN(d.getTime()) && d.getTime() > Date.now()) {
        candidates.push({ id: 'chargeScheduled', priority: 2, message: () => {
          let hrs = d.getHours();
          const mins = d.getMinutes();
          const ampm = hrs >= 12 ? 'PM' : 'AM';
          hrs = hrs % 12; if (hrs === 0) hrs = 12;
          const mm = (mins < 10 ? '0' : '') + mins;
          return `Charge starts at ${hrs}:${mm}${ampm}`;
        }});
      }
    }

    // Sort by priority desc, then by recency (more recent eligibility wins)
    // Tuned behavior constants (not user-configurable)
    const minDwellMs = 10000;
    const debounceMs = 2000;
    const allowInterrupt = true;

    const nowEligible = candidates.map(c => {
      const lastEligibleAt = this.intelState.lastEligibleAtById[c.id] || 0;
      const firstSeenAt = lastEligibleAt === 0 ? now : lastEligibleAt;
      return { ...c, firstSeenAt };
    });

    // Update eligibility timestamps
    for (let c of nowEligible) {
      this.intelState.lastEligibleAtById[c.id] = now;
    }

    nowEligible.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return b.firstSeenAt - a.firstSeenAt;
    });

    const currentId = this.intelState.currentId;
    const currentPriority = this.intelState.currentPriority;
    const lastChangeAt = this.intelState.lastChangeAt || 0;

    // Decide winner
    let winner = null;
    if (nowEligible.length > 0) {
      winner = nowEligible[0];
    }

    if (!winner) {
      // Nothing eligible → clear current after dwell
      if (currentId && (now - lastChangeAt) >= minDwellMs) {
        this.intelState.currentId = null;
        this.intelState.currentPriority = -1;
        this.intelState.lastChangeAt = now;
      }
      return;
    }

    const isDifferent = winner.id !== currentId;
    const higherPriority = winner.priority > (currentPriority || -1);
    const dwellSatisfied = (now - lastChangeAt) >= minDwellMs;
    const debounceSatisfied = (now - winner.firstSeenAt) >= debounceMs;

    if (!currentId) {
      if (debounceSatisfied) {
        this.intelState.currentId = winner.id;
        this.intelState.currentPriority = winner.priority;
        this.intelState.lastChangeAt = now;
      }
      return;
    }

    if (isDifferent) {
      if ((higherPriority && allowInterrupt && debounceSatisfied) || (dwellSatisfied && debounceSatisfied)) {
        this.intelState.currentId = winner.id;
        this.intelState.currentPriority = winner.priority;
        this.intelState.lastChangeAt = now;
      }
    } else {
      // Same message continues; nothing to do
    }
  },

  generateTableDom: function (wrapper, data) {
    console.log(this.name + ": generateTableDom called with data: ", data);

    const {
      carName, state, latitude, longitude, battery, chargeLimitSOC,
      chargeStart, timeToFull, pluggedIn, energyAdded, locked, sentry,
      idealRange, estRange, speed, outside_temp, inside_temp, odometer,
      windowsOpen, batteryUsable, isClimateOn, isHealthy, charging,
      doorsOpen, trunkOpen, frunkOpen, isUserPresent, isUpdateAvailable,
      isPreconditioning, geofence, tpms_pressure_fl, tpms_pressure_fr, tpms_pressure_rl, tpms_pressure_rr
    } = data;

    const makeSpan = function (className, content) {
      var span = document.createElement("span");
      span.className = className;
      span.innerHTML = content;
      return span;
    }

    const makeChargeStartString = function (input) {
      const diffMs = (Date.parse(input) - Date.now());
      var diffDays = Math.floor(diffMs / 86400000);
      var diffHrs = Math.floor((diffMs % 86400000) / 3600000);
      var diffMins = Math.round(((diffMs % 86400000) % 3600000) / 60000);
      var returnStr = (diffDays > 0 ? (diffDays + " Days, ") : "");
      returnStr += (diffHrs > 0 ? (diffHrs + " Hour" + (diffHrs > 1 ? "s" : "") + ", ") : "");
      return returnStr + (diffMins > 0 ? (diffMins + " Min" + (diffMins > 1 ? "s" : "")) : "");
    }
    
    //TODO bother formatting days? Poor trickle chargers...
    const makeChargeRemString = function (remHrs) {
      const hrs = Math.floor(remHrs);
      const mins = Math.ceil((remHrs - hrs) * 60.0);

      return (hrs > 0 ? (hrs + " Hour" + (hrs > 1 ? "s" : "") + ", ") : "") + (mins > 0 ? (mins + " Min" + (mins > 1 ? "s" : "")) : "");
    }

    const fontSize = this.config.sizeOptions?.fontSize || '.9rem';
    const lineHeight = this.config.sizeOptions?.lineHeight || '1.2rem';
    const lineStyle = 'font-size: ' + fontSize + ';line-height: ' + lineHeight + ';';

    var attrList = document.createElement("ul");
    attrList.className = "mattributes";

    if (charging) {
      var energyAddedLi = document.createElement("li");
      energyAddedLi.className = "mattribute";
      energyAddedLi.style = lineStyle;
      energyAddedLi.appendChild(makeSpan("icon zmdi zmdi-input-power zmdi-hc-fw", ""));
      energyAddedLi.appendChild(makeSpan("name", "Charge Added"));
      energyAddedLi.appendChild(makeSpan("value", energyAdded + " kWh"));

      var timeToFullLi = document.createElement("li");
      timeToFullLi.className = "mattribute";
      timeToFullLi.style = lineStyle;
      timeToFullLi.appendChild(makeSpan("icon zmdi zmdi-time zmdi-hc-fw", ""));
      timeToFullLi.appendChild(makeSpan("name", "Time to " + chargeLimitSOC + "%"));
      timeToFullLi.appendChild(makeSpan("value", makeChargeRemString(timeToFull)));
      attrList.appendChild(energyAddedLi);
      attrList.appendChild(timeToFullLi);
    } else if (pluggedIn && chargeStart && chargeStart !== "") {
      var chargeStartLi = document.createElement("li");
      chargeStartLi.className = "mattribute";
      chargeStartLi.style = lineStyle;
      chargeStartLi.appendChild(makeSpan("icon zmdi zmdi-time zmdi-hc-fw", ""));
      chargeStartLi.appendChild(makeSpan("name", "Charge Starting"));
      chargeStartLi.appendChild(makeSpan("value", makeChargeStartString(chargeStart)));
      attrList.appendChild(chargeStartLi);
    }

    if (this.config.displayOptions?.odometer?.visible ?? true) {
      var odometerLi = document.createElement("li");
      odometerLi.className = "mattribute";
      odometerLi.style = lineStyle;
      odometerLi.appendChild(makeSpan("icon zmdi zmdi-dot-circle-alt zmdi-hc-fw", ""));
      odometerLi.appendChild(makeSpan("name", "Odometer"));
      odometerLi.appendChild(makeSpan("value", odometer + (!this.config.imperial ? " km" : " mi")));

      attrList.appendChild(odometerLi);
    }
   
    if (this.config.displayOptions?.tpms?.visible ?? true) {
      var tpmsLi = document.createElement("li");
      tpmsLi.className = "mattribute";
      tpmsLi.style = lineStyle;
      tpmsLi.appendChild(makeSpan("icon zmdi zmdi-star-circle zmdi-hc-fw", ""));
      tpmsLi.appendChild(makeSpan("name", "TPMS"));
      tpmsLi.appendChild(makeSpan("value", tpms_pressure_fl + ",  " + tpms_pressure_fr + ",  " + tpms_pressure_rl + ",  " + tpms_pressure_rr + (!this.config.imperial ? " (bar)" : " (psi)")));

      attrList.appendChild(tpmsLi);
    }

    if ((this.config.displayOptions?.geofence?.visible ?? true) && geofence !== null && geofence !== "") {
      var geofenceLi = document.createElement("li");
      geofenceLi.className = "mattribute";
      geofenceLi.style = lineStyle;
      geofenceLi.appendChild(makeSpan("icon zmdi zmdi-my-location zmdi-hc-fw", ""));
      geofenceLi.appendChild(makeSpan("name", "Location"));
      geofenceLi.appendChild(makeSpan("value", geofence));

      attrList.appendChild(geofenceLi);
    }

    if ((this.config.displayOptions?.speed?.visible ?? true) && state == "driving") {
      var speedLi = document.createElement("li");
      speedLi.className = "mattribute";
      speedLi.style = lineStyle;
      speedLi.appendChild(makeSpan("icon zmdi zmdi-run zmdi-hc-fw", ""));
      speedLi.appendChild(makeSpan("name", "Speed"));
      speedLi.appendChild(makeSpan("value", speed + (!this.config.imperial ? " km/h" : " mph")));

      attrList.appendChild(speedLi);
    }

    wrapper.appendChild(attrList);
  },

  generateGraphicDom: function (wrapper, data) {
    console.log(this.name + ": generateGraphicDom called with data: ", data);

    const {
      carName, state, latitude, longitude, battery, chargeLimitSOC,
      chargeStart, timeToFull, pluggedIn, energyAdded, locked, sentry,
      idealRange, estRange, speed, outside_temp, inside_temp, odometer,
      windowsOpen, batteryUsable, isClimateOn, isHealthy, charging,
      doorsOpen, trunkOpen, frunkOpen, isUserPresent, isUpdateAvailable,
      isPreconditioning, geofence, tpms_pressure_fl, tpms_pressure_fr, tpms_pressure_rl, tpms_pressure_rr
    } = data;

    const stateIcons = [];
    if (state == "asleep" || state == "suspended")
      stateIcons.push("power-sleep");
    if (state == "suspended")
      stateIcons.push("timer-sand");
    if (state == "driving")
      stateIcons.push("steering");
    if (pluggedIn == "true")
      stateIcons.push("power-plug");
    if (locked == "false")
      stateIcons.push("lock-open-variant");
    if (sentry == "true")
      stateIcons.push("cctv");
    if (windowsOpen == "true")
      stateIcons.push("window-open");
    if (isUserPresent == "true")
      stateIcons.push("account");
    if (doorsOpen == "true" || trunkOpen == "true" || frunkOpen == "true")
      stateIcons.push("car-door");
    if (isClimateOn == "true" || isPreconditioning == "true")
      stateIcons.push("air-conditioner");

    const networkIcons = [];
    if (state == "updating")
      networkIcons.push("cog-clockwise");
    else if (isUpdateAvailable == "true")
      networkIcons.push("gift");
    if (isHealthy != "true")
      networkIcons.push("alert-box");
    networkIcons.push((state == "offline") ? "signal-off" : "signal");

    // size options
    // size of the icons + battery (above text)
    const layWidth = this.config.sizeOptions?.width ?? 450; // px, default: 450
    const layHeight = this.config.sizeOptions?.height ?? 203; // px, default: 203
    // the battery images itself
    const layBatWidth = this.config.sizeOptions?.batWidth ?? 250; // px, default: 250
    const layBatHeight = this.config.sizeOptions?.batHeight ?? 75; // px, default: 75
    const layBatTopMargin = this.config.displayOptions?.batteryBar?.topMargin ?? 0; // px, default: 0
    // top offset - to reduce visual distance to the module above
    const topOffset = this.config.sizeOptions?.topOffset ?? -40; // px, default: -40

    // calculate scales
    var layBatScaleWidth = layBatWidth / 250;  // scale factor normalized to 250
    var layBatScaleHeight = layBatHeight / 75; // scale factor normalized to 75
    var layScaleWidth = layWidth / 450;        // scale factor normalized to 450
    var layScaleHeight = layHeight / 203;      // scale factor normalized to 203

    const teslaModel = this.config.carImageOptions?.model ?? this.subscriptions["image_model"]?.value ?? "m3";
    const teslaView = this.config.carImageOptions?.view ?? "STUD_3QTR";
    const teslaOptions = this.config.carImageOptions?.options ?? this.subscriptions["image_options"]?.value ?? "PPSW,W32B,SLR1";

    const teslaImageWidth = 720; // Tesla compositor stopped returning arbitrary-sized images, only steps of 250, 400, 720 etc work now. We use CSS to scale the image to the correct layout width
    const teslaImageUrl = `https://static-assets.tesla.com/v1/compositor/?model=${teslaModel}&view=${teslaView}&size=${teslaImageWidth}&options=${teslaOptions}&bkba_opt=1`;
    const imageOffset = this.config.carImageOptions?.verticalOffset ?? 0;
    const imageOpacity = this.config.carImageOptions?.imageOpacity ?? 0.4;
    const imageWidth = layWidth * (this.config.carImageOptions?.scale ?? 1);

    const renderedStateIcons = stateIcons.map((icon) => `<span class="mdi mdi-${icon}"></span>`)
    const renderedNetworkIcons = networkIcons.map((icon) => `<span class="mdi mdi-${icon}" ${icon == "alert-box" ? "style='color: #f66'" : ""}></span>`)

    const batteryReserveVisible = (battery - batteryUsable) > 1; // at <= 1% reserve the app and the car don't show it, so we won't either

    const batteryOverlayIcon = charging ? `<span class="mdi mdi-flash bright light"></span>` :
      batteryReserveVisible ? `<span class="mdi mdi-snowflake bright light"></span>` : '';

    const batteryBigNumber = this.config.rangeDisplay === "%" ? batteryUsable : idealRange;
    const formatRemainingShort = function (remHrs) {
      if (!remHrs || remHrs <= 0) return '';
      const totalMins = Math.max(0, Math.round(remHrs * 60));
      const hrs = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      const hPart = hrs > 0 ? (hrs + "h ") : '';
      return hPart + mins + "m remaining";
    };
    const formatChargeStartLocal = function (isoStr) {
      if (!isoStr || isoStr === '') return '';
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '';
      let hrs = d.getHours();
      const mins = d.getMinutes();
      const ampm = hrs >= 12 ? 'PM' : 'AM';
      hrs = hrs % 12; if (hrs === 0) hrs = 12;
      const mm = (mins < 10 ? '0' : '') + mins;
      return `${hrs}:${mm}${ampm}`;
    };
    const renderIntelligence = () => {
      const topLevelEnabled = (this.config.intelligence !== false);
      if (!topLevelEnabled) return '';
      const id = this.intelState && this.intelState.currentId;
      if (!id) return '';
      // Recompute winner's text via same mapping used in updateIntelligenceDecision
      let text = '';
      if (id === 'tempHot') {
        const c = this.config.imperial ? ((inside_temp - 32) * 5 / 9) : inside_temp;
        const disp = this.config.imperial ? `${Math.round(inside_temp)}°` : `${Math.round(c)}°`;
        text = `Cabin hot (${disp})`;
      } else if (id === 'tempCold') {
        const c = this.config.imperial ? ((inside_temp - 32) * 5 / 9) : inside_temp;
        const disp = this.config.imperial ? `${Math.round(inside_temp)}°` : `${Math.round(c)}°`;
        text = `Cabin cold (${disp})`;
      } else if (id === 'chargingEta') {
        text = formatRemainingShort(timeToFull);
      } else if (id === 'chargeScheduled') {
        text = `Charge starts at ${formatChargeStartLocal(chargeStart)}`;
      }
      if (!text) return '';
      return `<div class=\"intel-section\" style=\"text-align:center; margin-top: 8px;\">` +
             `<div class=\"normal small\">${text}</div>` +
             `</div>`;
    };
    const batteryUnit = this.config.rangeDisplay === "%" ? "%" : (this.config.imperial ? "mi" : "km");

    const showTemps = ((this.config.showTemps === "always") ||
                       (this.config.showTemps === "hvac_on" && (isClimateOn == "true" || isPreconditioning == "true"))) &&
                      (inside_temp && outside_temp);
    const temperatureIcons = !showTemps ? "" :
      `<span class="mdi mdi-car normal small"></span>
       <span class="bright light small">${inside_temp}°</span>
       &nbsp;&nbsp;
       <span class="mdi mdi-earth normal small"></span>
       <span class="bright light small">${outside_temp}°</span>`;

    let batteryBarHtml = '';
    if (this.config.displayOptions?.batteryBar?.visible ?? true) {
      const innerWidthPx = (layBatWidth - 12);
      const innerHeightPx = (layBatHeight - 12);
      const usableWidthPx = Math.round(innerWidthPx * (Math.max(0, Math.min(100, batteryUsable)) / 100));
      const reservePct = Math.max(0, (battery - batteryUsable));
      const reserveWidthPx = Math.round(innerWidthPx * (reservePct / 100));
      const limitLeftPx = Math.round(innerWidthPx * (Math.max(0, Math.min(100, chargeLimitSOC)) / 100));

      // iOS-style color thresholds
      const levelClass = (batteryUsable <= 20) ? 'battery--low' : (batteryUsable <= 50 ? 'battery--medium' : 'battery--high');

      batteryBarHtml = `
        <div class="battery ios26 ${levelClass} ${charging ? 'battery--charging' : ''}"
             style="margin-left: ${(layWidth - layBatWidth) / 2}px;
                    margin-top: ${layBatTopMargin}px;
                    width: ${layBatWidth}px; height: ${layBatHeight}px;">
          <div class="battery-body">
            <div class="battery-inner" style="width: ${innerWidthPx}px; height: ${innerHeightPx}px;">
              <div class="battery-fill" style="width: ${usableWidthPx}px; height: ${innerHeightPx}px;"></div>
              <div class="battery-reserve" style="left: ${usableWidthPx}px; width: ${reserveWidthPx}px; height: ${innerHeightPx}px; ${batteryReserveVisible ? '' : 'visibility: hidden;'}"></div>
              <div class="battery-limit" style="left: ${limitLeftPx}px; height: ${innerHeightPx}px; ${chargeLimitSOC === 0 ? 'visibility: hidden;' : ''}"></div>
              <div class="battery-overlay medium">${batteryOverlayIcon}</div>
            </div>
          </div>
          <div class="battery-terminal"></div>
        </div>
      `;
    }

    wrapper.innerHTML = `
      <div style="width: ${layWidth}px; height: ${layHeight}px;">
        <link href="https://cdn.materialdesignicons.com/4.8.95/css/materialdesignicons.min.css" rel="stylesheet" type="text/css"> 
        <div style="z-index: 1; 
                    position: relative; top: 0px; left: 0px; 
                    margin-top: ${topOffset}px;
                    margin-bottom: -${layHeight}px;
                    width: ${layWidth}px; height: ${layHeight}px; 
                    opacity: ${imageOpacity}; 
                    background-image: url('${teslaImageUrl}'); 
                    background-size: ${imageWidth}px;;
                    background-repeat: no-repeat;
                    background-position: center ${imageOffset}px;"></div>
        <div style="z-index: 2; position: relative; top: 0px; left: 0px; margin-top: ${topOffset}px;">

          <!-- Percentage/range -->
          <div style="margin-top: ${50 * layScaleHeight}px; 
                      margin-left: auto; 
                      text-align: center; 
                      width: ${layWidth}px; 
                      height: 70px">
            <span class="bright large light">${batteryBigNumber}</span><span class="normal medium">${batteryUnit}</span>
            ${charging ? `<div class=\"normal small\" style=\"margin-top: 4px;\">${formatRemainingShort(timeToFull)}</div>` : ''}
          </div>

          <!-- State icons -->
          <div style="float: left; 
                      margin-top: -${65 * layScaleHeight}px; 
                      margin-left: ${((layWidth - layBatWidth) / 2) - 5}px; 
                      text-align: left; ${state == "offline" ? 'opacity: 0.3;' : ''}" 
               class="small">
            ${renderedStateIcons.join(" ")}
          </div>

          <!-- Online state icon -->
          <div style="float: right; 
                      margin-top: -${65 * layScaleHeight}px; 
                      margin-right: ${((layWidth - layBatWidth) / 2) - 5}px; 
                      text-align: right;" 
               class="small">
            ${renderedNetworkIcons.join(" ")}
          </div>

          ${batteryBarHtml}
          ${renderIntelligence()}

          <!-- Optional graphic mode icons below the car -->
          <div style="text-align: center; 
                      margin-top: ${this.config.displayOptions?.temperatureIcons?.topMargin ?? 0}px;
                      ${temperatureIcons == "" ? 'display: none;' : ''}
                      ${state == "offline" || state == "asleep" || state == "suspended" ? 'opacity: 0.3;' : ''}">
            ${temperatureIcons}
          </div>
        </div>
      </div>
		`;
  },

  generateMapDom: function (wrapper, data) {
    console.log(this.name + ": generateMapDom called with data: ", data);

    const {
      carName, state, battery, batteryUsable, chargeLimitSOC,
      isClimateOn, isPreconditioning, pluggedIn, locked, sentry, windowsOpen, doorsOpen, trunkOpen, frunkOpen, isUserPresent,
      isHealthy, isUpdateAvailable, idealRange, outside_temp, inside_temp, geofence, tpms_pressure_fl, tpms_pressure_fr, tpms_pressure_rl, tpms_pressure_rr
    } = data;

    const layWidth = this.config.sizeOptions?.width ?? 450;
    const layHeight = this.config.sizeOptions?.height ?? 203;
    const topOffset = this.config.sizeOptions?.topOffset ?? -40;

    const teslaModel = this.config.carImageOptions?.model ?? this.subscriptions["image_model"]?.value ?? "m3";
    const teslaView = this.config.carImageOptions?.view ?? "STUD_3QTR";
    const teslaOptions = this.config.carImageOptions?.options ?? this.subscriptions["image_options"]?.value ?? "PPSW,W32B,SLR1";
    const teslaImageWidth = 720;
    const teslaImageUrl = `https://static-assets.tesla.com/v1/compositor/?model=${teslaModel}&view=${teslaView}&size=${teslaImageWidth}&options=${teslaOptions}&bkba_opt=1`;
    const imageOpacity = this.config.carImageOptions?.imageOpacity ?? 0.4;

    const mapImg = this.subscriptions["map_image"]?.value;

    const batteryUnit = this.config.rangeDisplay === "%" ? "%" : (this.config.imperial ? "mi" : "km");
    const batteryBigNumber = this.config.rangeDisplay === "%" ? batteryUsable : idealRange;
    const formatRemainingShort = function (remHrs) {
      if (!remHrs || remHrs <= 0) return '';
      const totalMins = Math.max(0, Math.round(remHrs * 60));
      const hrs = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      const hPart = hrs > 0 ? (hrs + "h ") : '';
      return hPart + mins + "m remaining";
    };
    const formatChargeStartLocal = function (isoStr) {
      if (!isoStr || isoStr === '') return '';
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '';
      let hrs = d.getHours();
      const mins = d.getMinutes();
      const ampm = hrs >= 12 ? 'PM' : 'AM';
      hrs = hrs % 12; if (hrs === 0) hrs = 12;
      const mm = (mins < 10 ? '0' : '') + mins;
      return `${hrs}:${mm}${ampm}`;
    };
    const renderIntelligence = () => {
      const topLevelEnabled = (this.config.intelligence !== false);
      if (!topLevelEnabled) return '';
      const id = this.intelState && this.intelState.currentId;
      if (!id) return '';
      let text = '';
      if (id === 'tempHot') {
        const c = this.config.imperial ? ((data.inside_temp - 32) * 5 / 9) : data.inside_temp;
        const disp = this.config.imperial ? `${Math.round(data.inside_temp)}°` : `${Math.round(c)}°`;
        text = `Cabin hot (${disp})`;
      } else if (id === 'tempCold') {
        const c = this.config.imperial ? ((data.inside_temp - 32) * 5 / 9) : data.inside_temp;
        const disp = this.config.imperial ? `${Math.round(data.inside_temp)}°` : `${Math.round(c)}°`;
        text = `Cabin cold (${disp})`;
      } else if (id === 'chargingEta') {
        text = formatRemainingShort(this.subscriptions["charge_time"].value);
      } else if (id === 'chargeScheduled') {
        text = `Charge starts at ${formatChargeStartLocal(this.subscriptions["charge_start"].value)}`;
      }
      if (!text) return '';
      return `<div class=\"intel-section\" style=\"text-align:left; margin-top: 8px;\">` +
             `<div class=\"normal small\">${text}</div>` +
             `</div>`;
    };

    const stateIcons = [];
    if (state == "asleep" || state == "suspended") stateIcons.push("power-sleep");
    if (state == "suspended") stateIcons.push("timer-sand");
    if (pluggedIn == "true") stateIcons.push("power-plug");
    if (locked == "false") stateIcons.push("lock-open-variant");
    if (sentry == "true") stateIcons.push("cctv");
    if (windowsOpen == "true") stateIcons.push("window-open");
    if (isUserPresent == "true") stateIcons.push("account");
    if (doorsOpen == "true" || trunkOpen == "true" || frunkOpen == "true") stateIcons.push("car-door");
    if (isClimateOn == "true" || isPreconditioning == "true") stateIcons.push("air-conditioner");

    const networkIcons = [];
    if (state == "updating") networkIcons.push("cog-clockwise");
    else if (isUpdateAvailable == "true") networkIcons.push("gift");
    if (isHealthy != "true") networkIcons.push("alert-box");
    networkIcons.push((state == "offline") ? "signal-off" : "signal");

    const renderedStateIcons = stateIcons.map((icon) => `<span class="mdi mdi-${icon}"></span>`)
    const renderedNetworkIcons = networkIcons.map((icon) => `<span class="mdi mdi-${icon}" ${icon == "alert-box" ? "style='color: #f66'" : ""}></span>`)

    const mapBatWidth = Math.round((this.config.sizeOptions?.batWidth ?? 250) * 0.7);
    const mapBatHeight = Math.round((this.config.sizeOptions?.batHeight ?? 75) * 0.7);
    const layBatTopMargin = this.config.displayOptions?.batteryBar?.topMargin ?? 0;
    const layBatScaleWidth = mapBatWidth / 250;
    const layBatScaleHeight = mapBatHeight / 75;
    const batteryReserveVisible = (battery - batteryUsable) > 1;
    const innerWidthPx = (mapBatWidth - 12);
    const innerHeightPx = (mapBatHeight - 12);
    const usableWidthPx = Math.round(innerWidthPx * (Math.max(0, Math.min(100, batteryUsable)) / 100));
    const reservePct = Math.max(0, (battery - batteryUsable));
    const reserveWidthPx = Math.round(innerWidthPx * (reservePct / 100));
    const limitLeftPx = Math.round(innerWidthPx * (Math.max(0, Math.min(100, chargeLimitSOC)) / 100));
    const levelClass = (batteryUsable <= 20) ? 'battery--low' : (batteryUsable <= 50 ? 'battery--medium' : 'battery--high');

    const batteryOverlayIcon = (pluggedIn && (this.subscriptions["charge_time"].value > 0.0)) ? `<span class=\"mdi mdi-flash bright light\"></span>` : (batteryReserveVisible ? `<span class=\"mdi mdi-snowflake bright light\"></span>` : '');

    const batteryHtml = `
      <div class=\"battery ios26 ${levelClass} ${(pluggedIn && (this.subscriptions["charge_time"].value > 0.0)) ? 'battery--charging' : ''}\"
           style=\"margin-top: ${layBatTopMargin}px; width: ${mapBatWidth}px; height: ${mapBatHeight}px;\">
        <div class=\"battery-body\">
          <div class=\"battery-inner\" style=\"width: ${innerWidthPx}px; height: ${innerHeightPx}px;\">
            <div class=\"battery-fill\" style=\"width: ${usableWidthPx}px; height: ${innerHeightPx}px;\"></div>
            <div class=\"battery-reserve\" style=\"left: ${usableWidthPx}px; width: ${reserveWidthPx}px; height: ${innerHeightPx}px; ${batteryReserveVisible ? '' : 'visibility: hidden;'}\"></div>
            <div class=\"battery-limit\" style=\"left: ${limitLeftPx}px; height: ${innerHeightPx}px; ${chargeLimitSOC === 0 ? 'visibility: hidden;' : ''}\"></div>
            <div class=\"battery-overlay medium\">${batteryOverlayIcon}</div>
          </div>
        </div>
        <div class=\"battery-terminal\"></div>
      </div>`;

    const carBgWidth = Math.round(layWidth * 0.4);

    const mapSide = Math.min(this.config.mapOptions?.width ?? 200, this.config.mapOptions?.height ?? 200);
    const mapHtml = mapImg ? `<img class=\"map-rounded\" src=\"${mapImg}\" style=\"width: ${mapSide}px; height: ${mapSide}px;\"/>` : '';

    wrapper.innerHTML = `
      <div class=\"map-mode\" style=\"width: ${layWidth}px;\"> 
        <link href=\"https://cdn.materialdesignicons.com/4.8.95/css/materialdesignicons.min.css\" rel=\"stylesheet\" type=\"text/css\"> 
        <div class=\"row top\" style=\"display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-top: ${topOffset}px;\">
          <div class=\"left\" style=\"flex: 1; min-width: 0; position: relative; height: ${mapSide}px;\">
            <div class=\"car-bg\" style=\"position:absolute; inset:0; width:${carBgWidth}px; background-image:url('${teslaImageUrl}'); background-size: ${carBgWidth}px auto; background-repeat:no-repeat; background-position:left center; opacity:${imageOpacity};\"></div>
            <div class=\"left-content\" style=\"position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; justify-content: space-between;\">
              <div class=\"icons\" style=\"display:flex; gap: 6px; align-items:center;\">${renderedStateIcons.join(' ')} ${renderedNetworkIcons.join(' ')} </div>
              <div class=\"battery-row\" style=\"display:flex; flex-direction: column; align-items: flex-start;\">
                <div class=\"percent\" style=\"margin-bottom: 4px;\"><span class=\"bright medium light\">${batteryBigNumber}</span><span class=\"normal small\">${batteryUnit}</span>${(pluggedIn && (this.subscriptions["charge_time"].value > 0.0)) ? `<div class=\\"normal small\\" style=\\"margin-top: 2px;\\">${formatRemainingShort(this.subscriptions["charge_time"].value)}</div>` : ''}</div>
                ${batteryHtml}
                ${renderIntelligence()}
              </div>
            </div>
          </div>
          <div class=\"right\" style=\"flex: 0 0 auto;\">${mapHtml}</div>
        </div>
      </div>`;
  },

  generateRadialDom: function (wrapper, data) {
    console.log(this.name + ": generateRadialDom called with data: ", data);

    const {
      state, battery, batteryUsable, chargeLimitSOC, pluggedIn, locked, sentry, windowsOpen, doorsOpen, trunkOpen, frunkOpen,
      isUserPresent, isClimateOn, isPreconditioning, isHealthy, isUpdateAvailable, idealRange
    } = data;

    const side = Math.min(this.config.mapOptions?.width ?? 200, this.config.mapOptions?.height ?? 200);
    const radius = side / 2;
    const ringThickness = this.config.radialOptions?.ringThickness ?? 8;
    const iconBandThickness = this.config.radialOptions?.iconBandThickness ?? 18;
    const gapDegrees = this.config.radialOptions?.gapDegrees ?? 6;
    const showCar = this.config.radialOptions?.showCar !== false;

    const mapImg = this.subscriptions["map_image"]?.value;

    const teslaModel = this.config.carImageOptions?.model ?? this.subscriptions["image_model"]?.value ?? "m3";
    const teslaView = this.config.carImageOptions?.view ?? "STUD_3QTR";
    const teslaOptions = this.config.carImageOptions?.options ?? this.subscriptions["image_options"]?.value ?? "PPSW,W32B,SLR1";
    const teslaImageWidth = 720;
    const teslaImageUrl = `https://static-assets.tesla.com/v1/compositor/?model=${teslaModel}&view=${teslaView}&size=${teslaImageWidth}&options=${teslaOptions}&bkba_opt=1`;
    const imageOpacity = this.config.carImageOptions?.imageOpacity ?? 0.7;

    // Battery progress calculation
    const batteryPct = Math.max(0, Math.min(100, (this.config.rangeDisplay === '%' ? batteryUsable : idealRange)));
    const circumference = 2 * Math.PI * (radius - ringThickness / 2);
    const totalArc = circumference * (360 - gapDegrees) / 360;
    const progressArc = (batteryPct / 100) * totalArc;
    const remainingArc = totalArc - progressArc;

    // Battery level styling
    const levelClass = (batteryUsable <= 20) ? 'battery--low' : (batteryUsable <= 50 ? 'battery--medium' : 'battery--high');

    // Icons for the curved band
    const stateIcons = [];
    if (state == "asleep" || state == "suspended") stateIcons.push("power-sleep");
    if (pluggedIn == "true") stateIcons.push("power-plug");
    if (locked == "false") stateIcons.push("lock-open-variant");
    if (sentry == "true") stateIcons.push("cctv");
    if (windowsOpen == "true") stateIcons.push("window-open");
    if (isUserPresent == "true") stateIcons.push("account");
    if (doorsOpen == "true" || trunkOpen == "true" || frunkOpen == "true") stateIcons.push("car-door");
    if (isClimateOn == "true" || isPreconditioning == "true") stateIcons.push("air-conditioner");

    const networkIcons = [];
    if (state == "updating") networkIcons.push("cog-clockwise");
    else if (isUpdateAvailable == "true") networkIcons.push("gift");
    if (isHealthy != "true") networkIcons.push("alert-box");
    networkIcons.push((state == "offline") ? "signal-off" : "signal");

    const allIcons = [...stateIcons, ...networkIcons];
    const renderedIcons = allIcons.map((icon) => `<span class="mdi mdi-${icon} ${icon == "alert-box" ? "alert" : ""}"></span>`).join(' ');

    const showPercentage = this.config.radialOptions?.showPercentage !== false;
    const batteryUnit = this.config.rangeDisplay === "%" ? "%" : (this.config.imperial ? "mi" : "km");
    const batteryBigNumber = this.config.rangeDisplay === "%" ? batteryUsable : idealRange;

    const carOverlay = showCar ? `
      <div class="car-overlay" style="position:absolute; left:0; right:0; bottom:-6px; display:flex; justify-content:center; z-index:2;">
        <div style="background-image:url('${teslaImageUrl}'); background-repeat:no-repeat; background-position:center bottom; background-size:${Math.round(side * 0.6)}px auto; width:${Math.round(side * 0.7)}px; height:${Math.round(side * 0.4)}px; opacity:${imageOpacity};"></div>
      </div>` : '';

    const percentageOverlay = showPercentage ? `
      <div class="percentage-overlay" style="position:absolute; bottom:-28px; left:50%; transform:translateX(-50%); z-index:5; text-align:center;">
        <div class="percentage-text" style="background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); border-radius: 9999px; padding: 4px 10px; display:inline-block;">
          <span class="bright medium light">${batteryBigNumber}</span><span class="normal small">${batteryUnit}</span>
        </div>
      </div>` : '';

    // Calculate curved icon positions
    const iconRadius = radius + (ringThickness / 2) + (iconBandThickness);
    const iconPositions = allIcons.map((icon, index) => {
      const angleStep = 60 / Math.max(1, allIcons.length - 1); // 60 degree arc at top
      const angle = -30 + (index * angleStep); // Start at -30deg, end at +30deg
      const radian = (angle * Math.PI) / 180;
      const x = radius + iconRadius * Math.sin(radian);
      const y = radius - iconRadius * Math.cos(radian);
      return { icon, x, y, angle };
    });

    const curvedIcons = iconPositions.map(({icon, x, y}) => 
      `<div class="curved-icon" style="position:absolute; left:${x - 9}px; top:${y - 9}px; width:18px; height:18px; display:flex; align-items:center; justify-content:center;">
        <span class="mdi mdi-${icon} ${icon == "alert-box" ? "alert" : ""}" style="font-size:12px;"></span>
      </div>`
    ).join('');

    wrapper.innerHTML = `
      <div class="radial-mode" style="width:${side}px; position: relative; padding-bottom: 36px;">
        <link href="https://cdn.materialdesignicons.com/4.8.95/css/materialdesignicons.min.css" rel="stylesheet" type="text/css"> 
        <div class="radial-wrap" style="position: relative; width:${side}px; height:${side}px; overflow: visible;">
          ${mapImg ? `<img class="map-center" src="${mapImg}" style="width:${side}px; height:${side}px; border-radius:50%; object-fit: cover; z-index:1; position: relative;"/>` : `<div class="map-placeholder" style="width:${side}px; height:${side}px; border-radius:50%; background: rgba(100,100,100,0.3); z-index:1; position: relative;"></div>`}
          <svg class="radial-ring ${levelClass}" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}" style="position:absolute; top:0; left:0; z-index:3;">
            <circle class="radial-bg" cx="${radius}" cy="${radius}" r="${radius - ringThickness / 2}" stroke-width="${ringThickness}" fill="none" />
            <circle class="radial-fg" cx="${radius}" cy="${radius}" r="${radius - ringThickness / 2}" stroke-width="${ringThickness}" fill="none" stroke-dasharray="${progressArc} ${remainingArc}" transform="rotate(-90 ${radius} ${radius})" stroke-linecap="round" />
          </svg>
          ${carOverlay}
          ${percentageOverlay}
          <div class="icon-band" style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:4; pointer-events:none;">
            ${curvedIcons}
          </div>
        </div>
      </div>`;
  },

  generateSmartDom: function (wrapper, data) {
    console.log(this.name + ": generateSmartDom called with data: ", data);

    const {
      carName, state, battery, batteryUsable, chargeLimitSOC,
      chargeStart, timeToFull, pluggedIn, energyAdded, locked, sentry,
      idealRange, estRange, speed, outside_temp, inside_temp, odometer,
      windowsOpen, isClimateOn, isHealthy, charging,
      doorsOpen, trunkOpen, frunkOpen, isUserPresent, isUpdateAvailable,
      isPreconditioning, geofence, tpms_pressure_fl, tpms_pressure_fr, tpms_pressure_rl, tpms_pressure_rr
    } = data;

    // iOS 26 Design System
    const smartWidth = this.config.sizeOptions?.width ?? 400;
    const smartHeight = this.config.sizeOptions?.height ?? 280;
    const topOffset = this.config.sizeOptions?.topOffset ?? -20;
    
    const batteryBigNumber = this.config.rangeDisplay === "%" ? batteryUsable : idealRange;
    const batteryUnit = this.config.rangeDisplay === "%" ? "%" : (this.config.imperial ? "mi" : "km");

    // Intelligence section (primary focus)
    const renderIntelligenceHero = () => {
      const topLevelEnabled = (this.config.intelligence !== false);
      if (!topLevelEnabled) return '';
      
      const id = this.intelState && this.intelState.currentId;
      let heroContent = '';
      let heroIcon = '';
      let priority = 'normal';

      if (id === 'tempHot') {
        const c = this.config.imperial ? ((inside_temp - 32) * 5 / 9) : inside_temp;
        const disp = this.config.imperial ? `${Math.round(inside_temp)}°` : `${Math.round(c)}°`;
        heroContent = `Cabin temperature is high at ${disp}`;
        heroIcon = 'mdi-thermometer-alert';
        priority = 'critical';
      } else if (id === 'tempCold') {
        const c = this.config.imperial ? ((inside_temp - 32) * 5 / 9) : inside_temp;
        const disp = this.config.imperial ? `${Math.round(inside_temp)}°` : `${Math.round(c)}°`;
        heroContent = `Cabin temperature is low at ${disp}`;
        heroIcon = 'mdi-snowflake-alert';
        priority = 'critical';
      } else if (id === 'chargingEta') {
        const totalMins = Math.max(0, Math.round(timeToFull * 60));
        const hrs = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        const hPart = hrs > 0 ? `${hrs}h ` : '';
        heroContent = `${hPart}${mins}m until fully charged`;
        heroIcon = 'mdi-lightning-bolt';
        priority = 'active';
      } else if (id === 'chargeScheduled') {
        const d = new Date(chargeStart);
        if (!isNaN(d.getTime())) {
          let hrs = d.getHours();
          const mins = d.getMinutes();
          const ampm = hrs >= 12 ? 'PM' : 'AM';
          hrs = hrs % 12; if (hrs === 0) hrs = 12;
          const mm = (mins < 10 ? '0' : '') + mins;
          heroContent = `Scheduled to start charging at ${hrs}:${mm}${ampm}`;
          heroIcon = 'mdi-clock-outline';
          priority = 'scheduled';
        }
      } else {
        // Default state when no intelligence is active
        heroContent = state === 'online' ? 'Vehicle is ready' : 
                     state === 'asleep' ? 'Vehicle is sleeping' :
                     state === 'driving' ? 'Currently driving' : 'Vehicle offline';
        heroIcon = state === 'online' ? 'mdi-check-circle' :
                   state === 'asleep' ? 'mdi-sleep' :
                   state === 'driving' ? 'mdi-steering' : 'mdi-wifi-off';
        priority = 'normal';
      }

      const priorityColors = {
        critical: '#FF453A',
        active: '#30D158', 
        scheduled: '#007AFF',
        normal: '#8E8E93'
      };

      const priorityBgs = {
        critical: 'rgba(255, 69, 58, 0.1)',
        active: 'rgba(48, 209, 88, 0.1)',
        scheduled: 'rgba(0, 122, 255, 0.1)',
        normal: 'rgba(142, 142, 147, 0.1)'
      };

      return `
        <div class="smart-intelligence-hero" style="
          background: ${priorityBgs[priority]};
          border: 1px solid ${priorityColors[priority]}33;
          border-radius: 16px;
          padding: 20px;
          margin-bottom: 16px;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        ">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span class="mdi ${heroIcon}" style="
              font-size: 24px; 
              color: ${priorityColors[priority]};
            "></span>
            <div style="flex: 1;">
              <div style="
                font-size: 17px;
                font-weight: 600;
                color: rgba(255, 255, 255, 0.95);
                line-height: 1.3;
                margin-bottom: 2px;
              ">${heroContent}</div>
              <div style="
                font-size: 13px;
                color: rgba(255, 255, 255, 0.6);
                font-weight: 500;
              ">${carName || 'Tesla'}</div>
            </div>
          </div>
        </div>
      `;
    };

    // Compact battery display
    const renderSmartBattery = () => {
      const levelClass = (batteryUsable <= 20) ? 'critical' : (batteryUsable <= 50 ? 'warning' : 'normal');
      const levelColors = {
        critical: '#FF453A',
        warning: '#FF9F0A', 
        normal: '#30D158'
      };

      return `
        <div class="smart-battery-card" style="
          background: rgba(28, 28, 30, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 16px;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        ">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <div style="
              font-size: 15px;
              font-weight: 600;
              color: rgba(255, 255, 255, 0.8);
            ">Battery</div>
            <div style="display: flex; align-items: baseline; gap: 2px;">
              <span style="
                font-size: 28px;
                font-weight: 700;
                color: ${levelColors[levelClass]};
                line-height: 1;
              ">${batteryBigNumber}</span>
              <span style="
                font-size: 17px;
                font-weight: 600;
                color: rgba(255, 255, 255, 0.6);
              ">${batteryUnit}</span>
            </div>
          </div>
          <div style="
            width: 100%;
            height: 4px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 2px;
            overflow: hidden;
          ">
            <div style="
              width: ${batteryUsable}%;
              height: 100%;
              background: ${levelColors[levelClass]};
              border-radius: 2px;
              transition: width 0.3s ease;
              ${charging ? `
                background: linear-gradient(90deg, 
                  ${levelColors[levelClass]} 0%, 
                  rgba(255,255,255,0.3) 50%, 
                  ${levelColors[levelClass]} 100%);
                background-size: 200% 100%;
                animation: smartChargingShimmer 2s ease-in-out infinite;
              ` : ''}
            "></div>
          </div>
        </div>
      `;
    };

    // Quick status indicators
    const renderSmartStatus = () => {
      const statusItems = [];
      
      if (pluggedIn === 'true') statusItems.push({ icon: 'mdi-power-plug', label: 'Plugged In', color: '#30D158' });
      if (locked === 'false') statusItems.push({ icon: 'mdi-lock-open-variant', label: 'Unlocked', color: '#FF9F0A' });
      if (sentry === 'true') statusItems.push({ icon: 'mdi-shield-check', label: 'Sentry Mode', color: '#007AFF' });
      if (isClimateOn === 'true') statusItems.push({ icon: 'mdi-air-conditioner', label: 'Climate On', color: '#5AC8FA' });

      if (statusItems.length === 0) return '';

      return `
        <div class="smart-status-grid" style="
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          margin-top: 12px;
        ">
          ${statusItems.slice(0, 4).map(item => `
            <div style="
              display: flex;
              align-items: center;
              gap: 6px;
              padding: 8px 12px;
              background: rgba(${item.color === '#30D158' ? '48, 209, 88' : 
                               item.color === '#FF9F0A' ? '255, 159, 10' :
                               item.color === '#007AFF' ? '0, 122, 255' : '90, 200, 250'}, 0.15);
              border-radius: 8px;
              border: 1px solid ${item.color}33;
            ">
              <span class="mdi ${item.icon}" style="
                font-size: 14px;
                color: ${item.color};
              "></span>
              <span style="
                font-size: 12px;
                font-weight: 500;
                color: rgba(255, 255, 255, 0.8);
              ">${item.label}</span>
            </div>
          `).join('')}
        </div>
      `;
    };

    wrapper.innerHTML = `
      <div class="smart-mode" style="
        width: ${smartWidth}px;
        min-height: ${smartHeight}px;
        margin-top: ${topOffset}px;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif;
      ">
        <link href="https://cdn.materialdesignicons.com/7.4.47/css/materialdesignicons.min.css" rel="stylesheet" type="text/css">
        
        ${renderIntelligenceHero()}
        ${renderSmartBattery()}
        ${renderSmartStatus()}
      </div>
      
      <style>
        @keyframes smartChargingShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        
        .smart-mode * {
          box-sizing: border-box;
        }
      </style>
    `;
  }
});