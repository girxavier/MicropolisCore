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
4. Add the city-specific annual warming increment from `climat_parametres_smcity.csv`.
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
