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

## Thermal weather publications (V1)

The first weather-publication layer reads the same deterministic Tmin/Tmax/Tmean sequence as gameplay. It does not generate a second temperature series and does not change the active climate reading when it looks ahead.

Micropolis advances 16 simulation phases per city-time unit, four units per month and 48 units per year. One climate unit represents approximately 7.6 days. The browser requests up to eight readings ahead, but the forecast stops at the current climate-year boundary: the next year's map-derived city climate contribution is only finalized after the current year has been played.

V1 publishes thermal episodes only:

- **Strong-heat sequence:** Tmax >= 30°C for at least two consecutive units.
- **Warm/tropical nights:** Tmin >= 20°C for at least two consecutive units.
- **Intense cold:** Tmin <= 0°C and Tmax <= 5°C for at least two consecutive units.

An advance message may be published when an episode is forecast to begin within the next two units. A second publication marks the episode as active. The event identity is based on its type and starting city-time, so a phase is not repeated on every simulation callback. Publications and dismissal state are stored separately for each scenario; the most recent 100 publications are retained.

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
   - Snow is possible only when Tmin <= 0°C and Tmax <= 5°C, with a much higher probability in Gap than in Brest.
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

The snow rule deliberately uses both the temperature interval and the city-season snow profile: a cold reading alone does not force snowfall. In particular, Brest has very low snow and thunderstorm probabilities; Gap has a substantially higher winter snow probability.

The same weather fields are exposed to the browser forecast. The bottom information bar displays the current category and the unit's precipitation and sunshine totals; thermal episode alerts remain separate editorial publications.
