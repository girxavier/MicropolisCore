# SmCity climate model

The climate data used by the Micropolis engine live in this directory. The C++ implementation is in `packages/micropolis-engine/src/climate.cpp`.

## Reference data

- `climat_reference_smcity.csv`: 12 monthly reference pairs (Tmin/Tmax) for each of Marseille, Gap, Orléans, Brest and Toulouse. These are the 2021–2025 monthly reference averages.
- `climat_parametres_smcity.csv`: city-specific annual warming increments.
- `climat_seuils_smcity.csv`: inclusive Tmin/Tmax thresholds and their increments.
- `climat_regles_smcity.csv`: anomaly ranges, persistence and high-temperature limiter parameters.

## Calculation order for each of the 48 annual units

1. Calculate the monthly reference for the simulated year. For year index (n), where N1 is 0:
   `R_Nn = (5 * R_historical + sum(monthly means of all previous simulated years)) / (5 + n)`.
   Previous-year monthly means are computed from the four corrected units of that month.
2. Pass 1 draws anomaly A uniformly between -3°C and +3°C. A is applied equally to Tmin and Tmax and persists for 2 or 3 consecutive units, then a new A is drawn. Persistence restarts within each month.
3. Pass 2 draws anomaly B independently for each unit between -1°C and +1°C. It changes the amplitude symmetrically: subtract B/2 from Tmin and add B/2 to Tmax.
4. Add the annual baseline warming increment, calculated as the city coefficient in `climat_parametres_smcity.csv` multiplied by the base rate (0.108°C/year) in `climat_regles_smcity.csv`. The precomputed annual value in the city table is checked against this product.
5. Add the previous year's city climate contribution, derived from the mean of its twelve monthly map indices. The conversion is linear: `2 * index / 255 - 1` °C (0 → -1°C; 127.5 → 0°C; 255 → +1°C). This contribution affects the year ahead, not the year used to measure it.
6. Apply both inclusive thresholds independently, in every month: Tmin >= 13°C adds 1°C to Tmin; Tmax >= 25.1°C adds 1°C to Tmax.
7. For a resulting temperature above 38°C, apply the validated asymptotic limiter:
   `L(T) = 38 + 12 * (1 - exp(-(T - 38) / 12))`.
8. Calculate Tmoy as the arithmetic mean of the final Tmin and Tmax.

The random sequence is deterministic for a given city and climate-year index, so a saved city can reconstruct its previous climate years exactly.

## Game clock and persistence

Micropolis has 16 simulation phases per city-time unit, 4 units per month and 48 units per year. The climate advances in phase 0, immediately after Micropolis increments `cityTime`. The climate epoch is saved in reserved `miscHist` words 66–69. Version 2 also saves the partial annual index, the current year's city contribution and the last sampled month in words 70–73. Older city files without the SmCity marker start their climate epoch when first loaded.

The first climate year generated after a city is loaded is N1 (2026); each subsequent group of 48 units advances to the next climate year.

## City climate index

`climat_indices_objets_smcity.csv` is the editable external table for map objects. Each row defines an inclusive tile range, its climate index (0–255), and a footprint weight. Multi-tile buildings are weighted by their footprint (1/9 for 3×3 buildings, 1/16 for 4×4 buildings, 1/36 for the 6×6 airport), so one building contributes approximately once rather than once per tile. Individual trees, water and network tiles have unit weight. Empty zoning tiles are excluded.

The engine samples the weighted mean of classified map objects once per month. At the end of each twelve-month period, it averages those monthly means and converts the result into the temperature contribution for the following climate year. The live map index is displayed in the HUD beneath Tmin and Tmax.

The table is intentionally independent of the C++ calculation code: adjusting a value or footprint weight does not require changing the engine logic.
