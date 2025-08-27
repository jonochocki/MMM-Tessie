## Tessie API mapping for MMM-Teslamate

Goal: Map each TeslaMate MQTT data point used by the module to Tessie API fields from the Tessie `/{vin}/state?use_cache=true` payload. Note units and any transformation required for UI compatibility.

Legend:
- MQTT topic prefix: `teslamate/cars/{carID}/...`
- Tessie path examples assume `/{vin}/state` root object, abbreviated as `LS` below.

### Mapping table

| Module key | TeslaMate MQTT topic | Tessie field (path) | Units (TM → Tessie) | Transform needed | Notes |
|---|---|---|---|---|---|
| name | display_name | LS.display_name or LS.vehicle_state.vehicle_name | n/a → n/a | None | Prefer `vehicle_state.vehicle_name` if present; fallback to `display_name` |
| state | state | LS.state | state string → state string | None | Tessie states: online/offline/asleep; driving/suspended/updating derived (see below) |
| health | healthy | No direct | boolean → n/a | Derive | Consider healthy = LS.state != "offline" and `results[i].is_active` |
| lat | latitude | LS.drive_state.latitude | deg → deg | None | |
| lon | longitude | LS.drive_state.longitude | deg → deg | None | |
| shift_state | shift_state | LS.drive_state.shift_state | string → string | None | |
| speed | speed | LS.drive_state.speed | km/h → mph | Convert mph→km/h when metric | Use GUI units `LS.gui_settings.gui_distance_units` to decide |
| locked | locked | LS.vehicle_state.locked | bool → bool | None | |
| sentry | sentry_mode | LS.vehicle_state.sentry_mode | bool → bool | None | |
| windows | windows_open | Derive from LS.vehicle_state.fd_window, fp_window, rd_window, rp_window | bool → numeric flags | Any >0 → true | Any window flag non-zero indicates open |
| doors | doors_open | Derive from LS.vehicle_state.df, dr, pf, pr | bool → numeric flags | Any >0 → true | Any door flag non-zero indicates open |
| trunk | trunk_open | LS.vehicle_state.rt | bool → numeric flag | >0 → true | Rear trunk (rt) non-zero indicates open |
| frunk | frunk_open | LS.vehicle_state.ft | bool → numeric flag | >0 → true | Front trunk (ft) non-zero indicates open |
| user | is_user_present | LS.vehicle_state.is_user_present | bool → bool | None | |
| outside_temp | outside_temp | LS.climate_state.outside_temp | °C → °C | None | Convert to °F in UI if imperial |
| inside_temp | inside_temp | LS.climate_state.inside_temp | °C → °C | None | Convert to °F in UI if imperial |
| climate_on | is_climate_on | LS.climate_state.is_climate_on | bool → bool | None | |
| preconditioning | is_preconditioning | LS.climate_state.is_preconditioning | bool → bool | None | |
| odometer | odometer | LS.vehicle_state.odometer | km → miles | Convert miles→km when metric | Tessie returns miles (float) |
| ideal_range | ideal_battery_range_km | LS.charge_state.ideal_battery_range | km → miles | Convert mi→km when metric | Use as range value when rangeDisplay=="range" |
| est_range | est_battery_range_km | LS.charge_state.est_battery_range | km → miles | Convert mi→km when metric | |
| rated_range | rated_battery_range_km | LS.charge_state.battery_range | km → miles | Convert mi→km when metric | If not present, might derive from GUI setting |
| battery | battery_level | LS.charge_state.battery_level | % → % | None | Total battery percent |
| battery_usable | usable_battery_level | LS.charge_state.usable_battery_level | % → % | None | |
| plugged_in | plugged_in | Derive from LS.charge_state.conn_charge_cable or charge_port_latch/door | bool → string/enum | Non-empty cable or latch Engaged → true | See derivation below |
| charge_added | charge_energy_added | LS.charge_state.charge_energy_added | kWh → kWh | None | Displayed only while charging |
| charge_limit | charge_limit_soc | LS.charge_state.charge_limit_soc | % → % | None | |
| charge_start | scheduled_charging_start_time | LS.charge_state.scheduled_charging_start_time | ISO8601 → epoch seconds | Convert epoch→ISO | UI expects a parsable ISO string |
| charge_time | time_to_full_charge | LS.charge_state.time_to_full_charge | hours → hours | None | Alternatively derive from `minutes_to_full_charge/60` |
| update_available | update_available | Derive from LS.vehicle_state.software_update.status | bool → string | status non-empty → true | Fallback: compare version strings if available |
| geofence | geofence | GET `/{vin}/location`.saved_location (fallback: .address) | string → string | None | Prefer `saved_location`; fallback to human-readable `address` |
| tpms_pressure_fl | tpms_pressure_fl | LS.vehicle_state.tpms_pressure_fl | bar → bar | None | Convert to psi in UI if imperial |
| tpms_pressure_fr | tpms_pressure_fr | LS.vehicle_state.tpms_pressure_fr | bar → bar | None | Convert to psi in UI if imperial |
| tpms_pressure_rl | tpms_pressure_rl | LS.vehicle_state.tpms_pressure_rl | bar → bar | None | Convert to psi in UI if imperial |
| tpms_pressure_rr | tpms_pressure_rr | LS.vehicle_state.tpms_pressure_rr | bar → bar | None | Convert to psi in UI if imperial |

### Derivations and logic

- Driving vs. asleep/suspended/updating:
  - driving: `LS.drive_state.shift_state` in {"D","N","R"} or `LS.drive_state.speed > 0`.
  - asleep: `LS.state == "asleep"`.
  - suspended: may not be exposed by Tessie; can treat as asleep or use energy-saving heuristics.
  - updating: `LS.vehicle_state.software_update.status` in {"installing","downloading"}.

- plugged_in:
  - true when `LS.charge_state.conn_charge_cable` is non-empty/non-"<invalid>" OR `LS.charge_state.charge_port_latch == "Engaged"` OR `LS.charge_state.charge_port_door_open == true`.

- windows_open:
  - true if any of `LS.vehicle_state.fd_window`, `fp_window`, `rd_window`, `rp_window` is non-zero.

- doors_open / trunk_open / frunk_open:
  - doors_open: any of `LS.vehicle_state.df`, `dr`, `pf`, `pr` non-zero.
  - trunk_open: `LS.vehicle_state.rt` non-zero.
  - frunk_open: `LS.vehicle_state.ft` non-zero.

### Unit handling summary

- Speed: Tessie speed is in mph; convert to km/h for metric UI: `kmh = mph * 1.609344`.
- Odometer: Tessie odometer is in miles; convert to km for metric UI.
- Ranges: Tessie range values are in miles; convert to km for metric UI.
- Temperatures: Tessie temps are °C; convert to °F in UI when imperial.
- TPMS: Tessie pressures are in bar; convert to psi in UI when imperial.
- Scheduled times: Tessie `scheduled_charging_start_time` is epoch seconds; convert to ISO string for UI countdown logic.

### Fields without clean Tessie equivalents

- `healthy`: No direct field; suggest deriving from `LS.state` and recency of `timestamp` fields.

### Geofence/location details

- Use Tessie Location API: `GET https://api.tessie.com/{vin}/location` with `Authorization: Bearer <token>`.
  - Response fields: `latitude`, `longitude`, `address`, `saved_location`.
  - Map module `geofence` to `saved_location` when present; otherwise use `address`.
  - Continue using `LS.drive_state.latitude/longitude` for coordinates.

### VIN and vehicle selection

- Tessie identifies vehicles by `vin` (e.g., via `GET /vehicles?access_token=...`). The module should support selecting a vehicle by VIN instead of `carID` when `dataSource == "tessie"`.


