# MMM-Tessie
## MagicMirror module using the Tessie API



If you have any feedback or suggestions, feel free to submit a MR with a feature, or log an issue for a feature you'd like to see!

This module uses Tessie directly.

## Installation

Clone this repo into your MagicMirror `modules` directory. No additional dependencies are required.
Add the module to your MagicMirror config with Tessie credentials.

## Sample Configuration

```
{
    module: 'MMM-Tessie',
    position: 'bottom_left',
    config: {
        tessie: {
            accessToken: 'YOUR_TESSIE_ACCESS_TOKEN',
            vin: 'YOUR_VIN_HERE'
        },
        rangeDisplay: "%", // "%" or "range"
        imperial: false, //use imperial units (true = Miles & F) or metric (false = Km & C)

        // set to true to enable both the graphic, and the additional stats 
        // (charge remaining, scheduled charge start, etc)
        hybridView: true,
        // size of the visible area
        sizeOptions: {
            // size of the icons + battery (above text)
            width: 450, // px, default: 450
            height: 203, // px, default: 203
            // the battery images itself
            batWitdh: 250, // px, default: 250
            batHeight: 75, // px, default: 75
            // visual distance reduction to the module above
            topOffset: -40, // px, default: -40
            fontSize: '.9rem', // null (to use default/css) or rem/px
            lineHeight: '1rem', // null (to use default/css) or rem/px
        },
        displayOptions: {
            odometer: {
                visible: true, // bool, default: true (option to hide the odometer)
            },
            batteryBar: {
                visible: true, // bool, default: true (option to hide the battery-bar)
                topMargin: 0, // px, default: 0 (px-value to add space between the battery-bar and the informations above)
            },
            temperatureIcons: {
                topMargin: 0, // px, default: 0 (px-value to add space between the temperature-icons and the informations above)
            },
            tpms: {
                visible: true, // bool, default: true (option to hide the tpms)
            },
            speed: {
                visible: true, // bool, default: true (option to hide the speed)
            },
            geofence: {
                visible: true, // bool, default: true (option to hide the speed)
            }
        },
        carImageOptions: {
            model: "m3", // mx, ms (S pre-refresh), ? (S post-refresh)
            view: "STUD_3QTR", // STUD_SIDE works better for S/X
            // full list of option codes: https://tesla-api.timdorr.com/vehicle/optioncodes.
            // you need at least the color and the wheels. not all combos work.
            // also consult: https://teslaownersonline.com/threads/teslas-image-compositor.7089/
            options: "PPSW,PFP31,W38B,DV4W",
            // play with this until it looks about right.
            // tested values: 0 for m3/STUD_3QTR, 25 for ms/STUD_SIDE
            verticalOffset: 0,
            // scale the image to remove excessive background on the sides
            scale: 1,
            opacity: 0.5
        },
        // show inside and outside temperatures below the car image: when AC or preconditioning is running (default), always, or never
        showTemps: "hvac_on", // "always", "never"
        // time in seconds to wait before re-rendering the module on incoming data. prevents high CPU load due to re-rendering on every new data point during driving
        updatePeriod: 5,
    }
},
```

## Tessie API

Endpoints used:
- `GET /{vin}/state?use_cache=true` for comprehensive vehicle state
- `GET /{vin}/location` for `saved_location`/`address` (used as geofence name)

## Notes
* Some fields (charge added, time to full charge) are currently only enabled if the vehicle is plugged in

## Ongoing work
* Additional Tessie endpoints
* Add support to selectively enable/disable certain lines
* ~~Allow display for multiple Teslas~~
* ~~Add images of module~~
* ~~Selectively enable/disable certain fields based on other state (for example, still show scheduled charge time if plugged in)~~
* ~~Format and display scheduled charge time~~
* ~~Proper Imperial/Metric conversion and formatting~~