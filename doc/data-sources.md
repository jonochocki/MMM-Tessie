## MMM-Teslamate data sources (TeslaMate MQTT)

This document inventories the TeslaMate MQTT topics the module uses, so we can map them 1:1 to Tessie API fields.

Unless noted otherwise, values are published by TeslaMate under the topic prefix `teslamate/cars/{carID}/` and are consumed as strings by the module. Canonical units shown below are metric; UI converts to imperial when configured.

### Vehicle identity and state
- **display_name**: `teslamate/cars/{carID}/display_name`
  - Type: string
  - Units: n/a
  - Used as `carName`

- **state**: `teslamate/cars/{carID}/state`
  - Type: string (e.g., asleep, suspended, driving, updating, offline)
  - Units: n/a
  - Drives UI state icons and speed visibility

- **healthy**: `teslamate/cars/{carID}/healthy`
  - Type: boolean ("true"/"false")
  - Units: n/a
  - Drives network/health icon

### Location and driving
- **latitude**: `teslamate/cars/{carID}/latitude`
  - Type: number (string-encoded)
  - Units: degrees

- **longitude**: `teslamate/cars/{carID}/longitude`
  - Type: number (string-encoded)
  - Units: degrees

- **shift_state**: `teslamate/cars/{carID}/shift_state`
  - Type: string (not used in UI today)

- **speed**: `teslamate/cars/{carID}/speed`
  - Type: number (string-encoded)
  - Units: km/h (converted to mph if imperial)
  - Displayed only when `state == "driving"`

- **geofence**: `teslamate/cars/{carID}/geofence`
  - Type: string
  - Units: n/a
  - Optional display line (location name)

### Security and presence
- **locked**: `teslamate/cars/{carID}/locked`
  - Type: boolean ("true"/"false")
  - Units: n/a
  - UI icon if unlocked

- **sentry_mode**: `teslamate/cars/{carID}/sentry_mode`
  - Type: boolean ("true"/"false")
  - UI icon when enabled

- **windows_open**: `teslamate/cars/{carID}/windows_open`
  - Type: boolean ("true"/"false")
  - UI icon when open

- **doors_open**: `teslamate/cars/{carID}/doors_open`
  - Type: boolean ("true"/"false")
  - UI icon when any open

- **trunk_open**: `teslamate/cars/{carID}/trunk_open`
  - Type: boolean ("true"/"false")

- **frunk_open**: `teslamate/cars/{carID}/frunk_open`
  - Type: boolean ("true"/"false")

- **is_user_present**: `teslamate/cars/{carID}/is_user_present`
  - Type: boolean ("true"/"false")
  - UI icon when present

### Climate
- **outside_temp**: `teslamate/cars/{carID}/outside_temp`
  - Type: number (string-encoded)
  - Units: °C (converted to °F if imperial)

- **inside_temp**: `teslamate/cars/{carID}/inside_temp`
  - Type: number (string-encoded)
  - Units: °C (converted to °F if imperial)

- **is_climate_on**: `teslamate/cars/{carID}/is_climate_on`
  - Type: boolean ("true"/"false")
  - Controls temp display when `showTemps == "hvac_on"`

- **is_preconditioning**: `teslamate/cars/{carID}/is_preconditioning`
  - Type: boolean ("true"/"false")
  - Treated same as `is_climate_on` for temp display and an icon

### Odometer and range
- **odometer**: `teslamate/cars/{carID}/odometer`
  - Type: number (string-encoded)
  - Units: km (converted to mi if imperial)

- **ideal_battery_range_km**: `teslamate/cars/{carID}/ideal_battery_range_km`
  - Type: number (string-encoded)
  - Units: km (converted to mi if imperial)
  - Used when `rangeDisplay == "range"`

- **est_battery_range_km**: `teslamate/cars/{carID}/est_battery_range_km`
  - Type: number (string-encoded)
  - Units: km (converted to mi if imperial)

- **rated_battery_range_km**: `teslamate/cars/{carID}/rated_battery_range_km`
  - Type: number (string-encoded)
  - Units: km (not currently displayed)

### Battery and charging
- **battery_level**: `teslamate/cars/{carID}/battery_level`
  - Type: number (string-encoded)
  - Units: %
  - Total displayed percentage

- **usable_battery_level**: `teslamate/cars/{carID}/usable_battery_level`
  - Type: number (string-encoded)
  - Units: %
  - Used for battery bar (green portion) and big number when `rangeDisplay == "%"`

- **plugged_in**: `teslamate/cars/{carID}/plugged_in`
  - Type: boolean ("true"/"false")
  - Combined with `time_to_full_charge` to infer `charging`

- **charge_energy_added**: `teslamate/cars/{carID}/charge_energy_added`
  - Type: number (string-encoded)
  - Units: kWh
  - Displayed while charging

- **charge_limit_soc**: `teslamate/cars/{carID}/charge_limit_soc`
  - Type: number (string-encoded)
  - Units: %
  - Rendered as a dashed marker on battery bar

- **scheduled_charging_start_time**: `teslamate/cars/{carID}/scheduled_charging_start_time`
  - Type: ISO8601 timestamp (string)
  - Units: n/a
  - Shown when plugged in and not actively charging

- **time_to_full_charge**: `teslamate/cars/{carID}/time_to_full_charge`
  - Type: number (string-encoded)
  - Units: hours (fractional)
  - Remaining time display while charging

### Software and updates
- **update_available**: `teslamate/cars/{carID}/update_available`
  - Type: boolean ("true"/"false")
  - Drives update icon

### TPMS
- **tpms_pressure_fl**: `teslamate/cars/{carID}/tpms_pressure_fl`
  - Type: number (string-encoded)
  - Units: bar (converted to psi if imperial)

- **tpms_pressure_fr**: `teslamate/cars/{carID}/tpms_pressure_fr`
  - Type: number (string-encoded)
  - Units: bar (converted to psi if imperial)

- **tpms_pressure_rl**: `teslamate/cars/{carID}/tpms_pressure_rl`
  - Type: number (string-encoded)
  - Units: bar (converted to psi if imperial)

- **tpms_pressure_rr**: `teslamate/cars/{carID}/tpms_pressure_rr`
  - Type: number (string-encoded)
  - Units: bar (converted to psi if imperial)

---

### Notes on UI-derived fields (not MQTT topics)
- **charging**: derived in UI as `plugged_in && time_to_full_charge > 0`.
- **batteryReserveVisible**: derived as `(battery_level - usable_battery_level) > 1`.
- **batteryBigNumber/batteryUnit**: selected based on `rangeDisplay` setting.

### Subscription mismatch (current code)
The frontend references these topics, but the helper does not currently subscribe to them:
- `doors_open`, `trunk_open`, `frunk_open`, `is_user_present`, `is_preconditioning`

If TeslaMate publishes them (it does), the helper should be updated to include these topics so the UI receives values.


