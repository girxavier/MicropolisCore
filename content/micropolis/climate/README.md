# SmCity climate model

The climate data used by the Micropolis engine live in this directory. The C++ implementation is in `packages/micropolis-engine/src/climate.cpp`.

## Reference data

- `climat_reference_smcity.csv`: 12 monthly reference pairs (Tmin/Tmax) for each of Marseille, Gap, Orléans, Brest and Toulouse. These are the 2021–2025 monthly reference averages.
- `climat_parametres_smcity.csv`: city-specific annual warming increments.
- `climat_seuils_smcity.csv`: inclusive Tmin/Tmax thresholds and their increments.
- `climat_regles_smcity.csv`: anomaly ranges, persistence and high-temperature limiter parameters.
- `climat_meteo_profils_smcity.csv`: initial seasonal weather-profile parameters for the five reference cities. These are explicit gameplay calibration values, not measured precipitation normals.

## Calculation order for each of the 48 annual units

1. Calculate the monthly reference for the simulated year. For year index (n), where N1 is 0:
   `R_Nn = (5 * R_historical + sum(monthly means of all previous simulated years)) / (5 + n)`.
   Previous-year monthly means are computed from the four corrected units of that month.
2. Pass 1 draws anomaly A uniformly between -3°C and +3°C. A is applied equally to Tmin and Tmax and persists for 2 or 3 consecutive units, then a new A is drawn. Persistence restarts within each month.
3. Pass 2 draws anomaly B independently for each unit between -1°C and +1°C. It changes the amplitude symmetrically: subtract B/2 from Tmin and add B/2 to Tmax.
4. Add the annual warming increment, calculated as the city coefficient in `climat_parametres_smcity.csv` multiplied by the base rate (0.108°C/year) in `climat_regles_smcity.csv`. The precomputed annual value in the city table is checked against this product.
5. Apply both inclusive thresholds independently, in every month: Tmin >= 13°C adds 1°C to Tmin; Tmax >= 25.1°C adds 1°C to Tmax.
6. For a resulting temperature above 38°C, apply the validated asymptotic limiter:
   `L(T) = 38 + 12 * (1 - exp(-(T - 38) / 12))`.
7. Calculate Tmoy as the arithmetic mean of the final Tmin and Tmax.

The random sequence is deterministic for a given city and climate-year index, so a saved city can reconstruct its previous climate years exactly.

## Game clock and persistence

Micropolis has 16 simulation phases per city-time unit, 4 units per month and 48 units per year. The climate advances in phase 0, immediately after Micropolis increments `cityTime`. The climate epoch is saved in reserved `miscHist` words 66–69; older city files without the SmCity marker start their climate epoch when first loaded.

The first climate year generated after a city is loaded is N1 (2026); each subsequent group of 48 units advances to the next climate year.

## Remaining extension

The map-dependent local thermal coefficients and their aggregation into a city-wide effect are deliberately kept separate from these baseline climate rules. Their values must be established before that layer is activated.

## Weather publications and municipal news (V2)

Weather publications use the same deterministic forecast as the city weather display. Their editorial voice is that of a local newspaper or municipal bulletin: no references to engine internals, simulation units or technical thresholds in the public-facing text.

Only one message is displayed at a time. A newly published event replaces the previous message; the player can dismiss it immediately with the close control. If no new event replaces it, the message disappears after four simulated weeks. There is no on-screen history and no archive is retained for display.

A heatwave has exactly two possible publications for the same episode:
- **Advance warning:** published when a sequence of at least two consecutive weeks with Tmax >= 30°C is forecast to begin within the next two weeks.
- **City-life report:** published once the heatwave begins, with a short local-news angle (evening activity, parks, attention to isolated residents).
No additional heatwave updates or end-of-episode publication are generated for that same event.

Other editorial events use the same one-warning / one-active-report pattern:
- **Warm nights:** Tmin >= 20°C for at least two consecutive weeks.
- **Intense cold:** Tmin <= 0°C and Tmax <= 5°C for at least two consecutive weeks; active copy refers to shelters and outreach to people sleeping rough.
- **Prolonged rain:** at least 8 mm in each of two consecutive weeks.
- **Flood warning:** at least 60 mm accumulated over two consecutive weeks. The first message warns of danger in low-lying neighbourhoods; the active report covers evacuation and temporary rehousing.
- **Snow:** a snowy weather category with at least 1 mm water equivalent in a week.
- **Snow-related traffic disruption:** a snowy week with at least 4 mm water equivalent; this report takes priority over a generic snowfall report.
- **Agricultural drought:** less than 0.5 mm in each of four consecutive weeks (approximately one month), with copy about soil drying and concern for harvests.

These rainfall, flood and drought thresholds are initial gameplay thresholds, not hydrological or agronomic standards. The flood threshold is a citywide alert signal; it does not yet represent a detailed river-basin, drainage-network or building-level flood simulation. Likewise, evacuation and rehousing are currently represented in the editorial layer and do not yet change resident placement or housing capacity in the simulation. The same applies to the cold-weather shelter reports: they are news events, not yet a modeled shelter-capacity system.

Event identities prevent repeated publications for the same phase of the same episode. A later event may replace the currently visible message, but an already published phase is not replayed on every climate update.

## Simulated weather categories (V1)

The weather model uses the same deterministic climate-year readings as the temperature model. It adds a weather category, precipitation total and sunshine duration to each 7.6-day unit. It does not create another temperature series and uses an independent random stream, so enabling weather cannot alter Tmin/Tmax or their historical reproducibility.

The seven categories are:

| Code | Category |
|---:|---|
| 0 | Grand soleil |
| 1 | Couvert sans pluie |
| 2 | Variable, soleil / nuages / averses |
| 3 | Pluie fine / crachin |
| 4 | Couvert et averses |
| 5 | Orage |
| 6 | Temps neigeux |

### Calculation order

1. Select the city's seasonal profile from `climat_meteo_profils_smcity.csv`: probability of a wet regime, sunshine probability during a dry regime, drizzle share, thunderstorm share and snow share.
2. Draw a dry or wet regime. The regime persists for 2 or 3 consecutive units, then is drawn again. This creates multi-week weather sequences rather than changing the weather independently every simulation tick.
3. In a dry regime, select grand soleil or cloudy without rain using the seasonal city profile.
4. In a wet regime, apply temperature constraints:
   - Snow is possible when the Tmin/Tmax interval crosses 0°C (Tmin <= 0°C <= Tmax), or remains below freezing. The city-season snow probability is much higher in Gap than in Brest.
   - Thunderstorms require Tmax >= 25°C. Their probability increases above 30°C; Brest's profile keeps them rare.
   - Drizzle is eligible when Tmin >= 2°C and Tmax <= 19°C.
   - Other wet situations become variable showers or overcast with showers.
5. Generate precipitation totals and sunshine duration within category-specific ranges.

### Quantities and interpretation

Precipitation is expressed in millimetres **over the whole 7.6-day unit**, not per day. Sunshine is expressed in hours over the same period. Initial category ranges are:

- Grand soleil: 42–80 h of sunshine, no precipitation.
- Couvert sans pluie: 3–22 h, no precipitation.
- Variable / averses: 1–10 mm and 14–42 h.
- Pluie fine / crachin: 0.5–5 mm and 2–15 h.
- Couvert et averses: 4–22 mm and 0–12 h.
- Orage: 6–36 mm and 0–10 h.
- Temps neigeux: 1–13 mm water equivalent and 0–12 h.

These are initial simulation ranges for gameplay, not claims about observed weather measurements. The temperature reference CSVs do not contain historical rainfall or sunshine observations. The city-season probabilities therefore remain transparent, editable calibration parameters and should be compared with the intended city climatology before being treated as a scientific reconstruction.

The snow rule combines a crossing of the freezing point (or temperatures entirely below it) with the city-season snow profile: a cold reading alone does not force snowfall. In particular, Brest has very low snow and thunderstorm probabilities; Gap has a substantially higher winter snow probability.

The same weather fields are exposed to the browser forecast. The top city HUD displays the current weather category, weekly precipitation and sunshine totals alongside minimum and maximum temperatures. Editorial publications appear separately in the single bottom message strip.
