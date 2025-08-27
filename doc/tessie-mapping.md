## Tessie API mapping for MMM-Tessie

Goal: Map UI fields to Tessie API `/{vin}/state?use_cache=true` and `/{vin}/location` responses. Note units and any transformation required for UI compatibility.

Legend:
 
- Tessie path examples assume `/{vin}/state` root object, abbreviated as `LS` below.

### Mapping table

| Module key | Tessie field (path) | Units | Transform needed | Notes |
|---|---|---|---|---|
| name | LS.display_name or LS.vehicle_state.vehicle_name | n/a | None | Prefer `vehicle_state.vehicle_name` if present |
| state | LS.state (+drive/software) | string | Derive driving/updating | See derivations below |
| health | Derived from LS.state | n/a | `state != offline` | |
| lat | LS.drive_state.latitude | deg | None | |
| lon | LS.drive_state.longitude | deg | None | |
| shift_state | LS.drive_state.shift_state | string | None | |
| speed | LS.drive_state.speed | mph | Convert mph→km/h | UI expects km/h internally |
| locked | LS.vehicle_state.locked | bool | to "true"/"false" | |
| sentry | LS.vehicle_state.sentry_mode | bool | to "true"/"false" | |
| windows | LS.vehicle_state.fd/fp/rd/rp_window | numeric | any >0 → true | to "true"/"false" |
| doors | LS.vehicle_state.df/dr/pf/pr | numeric | any >0 → true | to "true"/"false" |
| trunk | LS.vehicle_state.rt | numeric | >0 → true | to "true"/"false" |
| frunk | LS.vehicle_state.ft | numeric | >0 → true | to "true"/"false" |
| user | LS.vehicle_state.is_user_present | bool | to "true"/"false" | |
| outside_temp | LS.climate_state.outside_temp | °C | None | |
| inside_temp | LS.climate_state.inside_temp | °C | None | |
| climate_on | LS.climate_state.is_climate_on | bool | to "true"/"false" | |
| preconditioning | LS.climate_state.is_preconditioning | bool | to "true"/"false" | |
| odometer | LS.vehicle_state.odometer | miles | Convert mi→km | |
| ideal_range | LS.charge_state.ideal_battery_range | miles | Convert mi→km | |
| est_range | LS.charge_state.est_battery_range | miles | Convert mi→km | |
| rated_range | LS.charge_state.battery_range | miles | Convert mi→km | |
| battery | LS.charge_state.battery_level | % | None | |
| battery_usable | LS.charge_state.usable_battery_level | % | None | |
| plugged_in | LS.charge_state.conn_charge_cable / latch / door | mixed | derive bool | See derivations below |
| charge_added | LS.charge_state.charge_energy_added | kWh | None | |
| charge_limit | LS.charge_state.charge_limit_soc | % | None | |
| charge_start | LS.charge_state.scheduled_charging_start_time | epoch sec | Convert epoch→ISO | |
| charge_time | LS.charge_state.time_to_full_charge | hours | Use minutes_to_full_charge/60 if present | |
| update_available | LS.vehicle_state.software_update.status | string | non-empty → true | |
| geofence | GET `/{vin}/location`.saved_location or .address | string | None | |
| tpms_pressure_fl | LS.vehicle_state.tpms_pressure_fl | bar | None | |
| tpms_pressure_fr | LS.vehicle_state.tpms_pressure_fr | bar | None | |
| tpms_pressure_rl | LS.vehicle_state.tpms_pressure_rl | bar | None | |
| tpms_pressure_rr | LS.vehicle_state.tpms_pressure_rr | bar | None | |

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


