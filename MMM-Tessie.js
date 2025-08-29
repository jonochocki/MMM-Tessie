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
    displayMode: 'graphic', // 'graphic' | 'map' | 'radial'
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
    if ((this.config.displayMode && this.config.displayMode.toLowerCase() === 'map') || (this.config.mapOptions && this.config.mapOptions.enabled)) {
      this.generateMapDom(wrapper, data);
    } else if (this.config.displayMode && this.config.displayMode.toLowerCase() === 'radial') {
      this.generateRadialDom(wrapper, data);
    } else {
      this.generateGraphicDom(wrapper, data);
    }

    //optionally append the table
    if (this.config.hybridView)
      this.generateTableDom(wrapper, data);

    return wrapper;
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
                <div class=\"percent\" style=\"margin-bottom: 4px;\"><span class=\"bright medium light\">${batteryBigNumber}</span><span class=\"normal small\">${batteryUnit}</span></div>
                ${batteryHtml}
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
  }
});