#include "micropolis.h"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <fstream>
#include <random>
#include <sstream>

namespace {

std::vector<std::string> splitCsv(const std::string &line)
{
    std::vector<std::string> fields;
    std::stringstream stream(line);
    std::string field;
    while (std::getline(stream, field, ',')) {
        fields.push_back(field);
    }
    return fields;
}

double parseNumber(const std::string &value, double fallback)
{
    char *end = NULL;
    const double parsed = std::strtod(value.c_str(), &end);
    return (end == value.c_str()) ? fallback : parsed;
}

} // namespace

SmCityClimate::SmCityClimate()
    : baseWarming(0.108),
      anomalyAMin(-3.0),
      anomalyAMax(3.0),
      anomalyBMin(-1.0),
      anomalyBMax(1.0),
      anomalyPersistenceMin(2),
      anomalyPersistenceMax(3),
      tminThreshold(13.0),
      tmaxThreshold(25.1),
      tminIncrement(1.0),
      tmaxIncrement(1.0),
      limiterStart(38.0),
      limiterAmplitude(12.0),
      climateEpoch(0),
      ready(false)
{
    currentReading.tmin = 0.0;
    currentReading.tmax = 0.0;
    currentReading.tmoy = 0.0;
    currentReading.tminThreshold = false;
    currentReading.tmaxThreshold = false;
    currentReading.month = 0;
    currentReading.unit = 0;
    currentReading.weatherCode = 0;
    currentReading.precipitationMm = 0.0;
    currentReading.sunshineHours = 0.0;
}

std::string SmCityClimate::normalizeCity(const std::string &name)
{
    std::string result;
    for (std::size_t i = 0; i < name.size(); ++i) {
        const unsigned char c = static_cast<unsigned char>(name[i]);
        if (c >= 'A' && c <= 'Z') {
            result.push_back(static_cast<char>(c - 'A' + 'a'));
        } else if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
            result.push_back(static_cast<char>(c));
        }
    }
    return result;
}

std::uint32_t SmCityClimate::stableHash(const std::string &value)
{
    std::uint32_t hash = 2166136261u;
    for (std::size_t i = 0; i < value.size(); ++i) {
        hash ^= static_cast<unsigned char>(value[i]);
        hash *= 16777619u;
    }
    return hash;
}

double SmCityClimate::limitHighTemperature(double value, double start,
                                           double amplitude)
{
    if (value <= start) {
        return value;
    }
    return start + amplitude *
        (1.0 - std::exp(-(value - start) / amplitude));
}

bool SmCityClimate::loadTables()
{
    references.clear();
    cityWarmingCoefficient.clear();
    weatherProfiles.clear();
    std::map<std::string, double> expectedAnnualWarming;
    std::map<std::string, int> referenceRows;

    {
        std::ifstream file("climate/climat_reference_smcity.csv");
        if (!file.is_open()) return false;
        std::string line;
        std::getline(file, line); // header
        while (std::getline(file, line)) {
            const std::vector<std::string> f = splitCsv(line);
            if (f.size() < 5) continue;
            const std::string city = normalizeCity(f[0]);
            const int month = static_cast<int>(parseNumber(f[1], 0.0));
            if (month < 1 || month > 12) continue;
            if (references.find(city) == references.end()) {
                std::array<MonthlyReference, 12> values;
                for (int i = 0; i < 12; ++i) {
                    values[i].tmin = 0.0;
                    values[i].tmax = 0.0;
                }
                references[city] = values;
            }
            references[city][month - 1].tmin = parseNumber(f[3], 0.0);
            references[city][month - 1].tmax = parseNumber(f[4], 0.0);
            ++referenceRows[city];
        }
    }

    {
        std::ifstream file("climate/climat_parametres_smcity.csv");
        if (!file.is_open()) return false;
        std::string line;
        std::getline(file, line);
        while (std::getline(file, line)) {
            const std::vector<std::string> f = splitCsv(line);
            if (f.size() < 3) continue;
            const std::string city = normalizeCity(f[0]);
            cityWarmingCoefficient[city] = parseNumber(f[1], 0.0);
            expectedAnnualWarming[city] = parseNumber(f[2], 0.0);
        }
    }

    {
        std::ifstream file("climate/climat_seuils_smcity.csv");
        if (!file.is_open()) return false;
        std::string line;
        std::getline(file, line);
        while (std::getline(file, line)) {
            const std::vector<std::string> f = splitCsv(line);
            if (f.size() < 3) continue;
            const std::string variable = normalizeCity(f[0]);
            if (variable == "tmin") {
                tminThreshold = parseNumber(f[1], tminThreshold);
                tminIncrement = parseNumber(f[2], tminIncrement);
            } else if (variable == "tmax") {
                tmaxThreshold = parseNumber(f[1], tmaxThreshold);
                tmaxIncrement = parseNumber(f[2], tmaxIncrement);
            }
        }
    }

    {
        std::ifstream file("climate/climat_regles_smcity.csv");
        if (!file.is_open()) return false;
        std::string line;
        std::getline(file, line);
        while (std::getline(file, line)) {
            const std::vector<std::string> f = splitCsv(line);
            if (f.size() < 2) continue;
            const std::string key = normalizeCity(f[0]);
            const double value = parseNumber(f[1], 0.0);
            if (key == "anomalieamin") anomalyAMin = value;
            else if (key == "anomalieamax") anomalyAMax = value;
            else if (key == "anomaliebmin") anomalyBMin = value;
            else if (key == "anomaliebmax") anomalyBMax = value;
            else if (key == "anomalieapersistancemin") anomalyPersistenceMin = static_cast<int>(value);
            else if (key == "anomalieapersistancemax") anomalyPersistenceMax = static_cast<int>(value);
            else if (key == "limiteurdebut") limiterStart = value;
            else if (key == "limiteuramplitude") limiterAmplitude = value;
            else if (key == "rechauffementbase") baseWarming = value;
        }
    }

    {
        std::ifstream file("climate/climat_meteo_profils_smcity.csv");
        if (!file.is_open()) return false;
        std::map<std::string, int> profileRows;
        std::string line;
        std::getline(file, line); // header
        while (std::getline(file, line)) {
            const std::vector<std::string> f = splitCsv(line);
            if (f.size() < 7) continue;
            const std::string city = normalizeCity(f[0]);
            const std::string season = normalizeCity(f[1]);
            int seasonIndex = -1;
            if (season == "hiver") seasonIndex = 0;
            else if (season == "printemps") seasonIndex = 1;
            else if (season == "ete") seasonIndex = 2;
            else if (season == "automne") seasonIndex = 3;
            if (seasonIndex < 0) return false;

            WeatherProfile profile;
            profile.wetProbability = parseNumber(f[2], -1.0);
            profile.sunnyWhenDry = parseNumber(f[3], -1.0);
            profile.drizzleWhenWet = parseNumber(f[4], -1.0);
            profile.stormWhenWet = parseNumber(f[5], -1.0);
            profile.snowWhenCold = parseNumber(f[6], -1.0);
            const double values[] = {
                profile.wetProbability, profile.sunnyWhenDry,
                profile.drizzleWhenWet, profile.stormWhenWet,
                profile.snowWhenCold
            };
            for (std::size_t i = 0; i < sizeof(values) / sizeof(values[0]); ++i) {
                if (values[i] < 0.0 || values[i] > 1.0) return false;
            }
            if (references.find(city) == references.end()) return false;
            if ((profileRows[city] & (1 << seasonIndex)) != 0) return false;
            if (weatherProfiles.find(city) == weatherProfiles.end()) {
                std::array<WeatherProfile, 4> profiles = {};
                weatherProfiles[city] = profiles;
            }
            weatherProfiles[city][seasonIndex] = profile;
            profileRows[city] |= (1 << seasonIndex);
        }

        for (std::map<std::string, std::array<MonthlyReference, 12> >::const_iterator it = references.begin();
             it != references.end(); ++it) {
            if (profileRows[it->first] != 15) return false;
        }
    }

    for (std::map<std::string, std::array<MonthlyReference, 12> >::const_iterator it = references.begin();
         it != references.end(); ++it) {
        if (referenceRows[it->first] != 12) return false;
        for (int month = 0; month < 12; ++month) {
            if (it->second[month].tmin > it->second[month].tmax) return false;
        }
    }

    for (std::map<std::string, double>::const_iterator it = cityWarmingCoefficient.begin();
         it != cityWarmingCoefficient.end(); ++it) {
        if (expectedAnnualWarming.find(it->first) == expectedAnnualWarming.end()) return false;
        const double calculated = it->second * baseWarming;
        if (std::fabs(calculated - expectedAnnualWarming[it->first]) > 0.000001) return false;
    }

    return true;
}

bool SmCityClimate::initialize(const std::string &cityName, long long cityTime,
                               long long savedEpoch)
{
    ready = false;
    generatedYears.clear();
    annualCityClimateIndices.clear();
    activeCity = normalizeCity(cityName);
    if (!loadTables()) return false;
    if (references.find(activeCity) == references.end()) return false;
    if (cityWarmingCoefficient.find(activeCity) == cityWarmingCoefficient.end()) return false;
    if (anomalyAMin > anomalyAMax || anomalyBMin > anomalyBMax) return false;
    if (anomalyPersistenceMin < 1 || anomalyPersistenceMax < anomalyPersistenceMin) return false;
    if (tminIncrement < 0.0 || tmaxIncrement < 0.0 || limiterAmplitude <= 0.0) return false;

    climateEpoch = (savedEpoch >= 0) ? savedEpoch : cityTime;
    ready = true;
    return update(cityTime);
}

bool SmCityClimate::setAnnualCityClimateIndex(std::size_t yearIndex, double index)
{
    if (!std::isfinite(index)) return false;
    annualCityClimateIndices[yearIndex] = index;
    if (generatedYears.size() > yearIndex) generatedYears.resize(yearIndex);
    return true;
}

void SmCityClimate::generateYear(std::size_t yearIndex)
{
    ClimateYear year;
    const std::array<MonthlyReference, 12> &historical = references[activeCity];
    const std::map<std::size_t, double>::const_iterator cityIndex = annualCityClimateIndices.find(yearIndex);
    const double cityShift = (cityIndex == annualCityClimateIndices.end()) ? 0.0 : cityIndex->second / 100.0;
    const double warming = cityWarmingCoefficient[activeCity] * baseWarming + cityShift;
    const double denominator = 5.0 + static_cast<double>(yearIndex);

    std::uint32_t seed = stableHash(activeCity);
    seed ^= static_cast<std::uint32_t>(yearIndex * 0x9e3779b9u);
    seed ^= 0x534d4349u; // "SMCI"
    std::mt19937 random(seed);

    std::uniform_real_distribution<double> anomalyA(anomalyAMin, anomalyAMax);
    std::uniform_real_distribution<double> anomalyB(anomalyBMin, anomalyBMax);
    std::uniform_int_distribution<int> persistence(
        anomalyPersistenceMin, anomalyPersistenceMax);

    for (int month = 0; month < 12; ++month) {
        double referenceMin = 5.0 * historical[month].tmin;
        double referenceMax = 5.0 * historical[month].tmax;

        for (std::size_t previous = 0; previous < yearIndex; ++previous) {
            referenceMin += generatedYears[previous].monthlyMeanTmin[month];
            referenceMax += generatedYears[previous].monthlyMeanTmax[month];
        }

        referenceMin /= denominator;
        referenceMax /= denominator;

        double monthlyMinTotal = 0.0;
        double monthlyMaxTotal = 0.0;
        double activeA = 0.0;
        int remainingA = 0;

        for (int unit = 0; unit < 4; ++unit) {
            if (remainingA <= 0) {
                activeA = anomalyA(random);
                remainingA = persistence(random);
            }
            --remainingA;

            const double b = anomalyB(random);
            double tmin = referenceMin + activeA - (b / 2.0) + warming;
            double tmax = referenceMax + activeA + (b / 2.0) + warming;

            const bool minTriggered = (tmin >= tminThreshold);
            const bool maxTriggered = (tmax >= tmaxThreshold);
            if (minTriggered) tmin += tminIncrement;
            if (maxTriggered) tmax += tmaxIncrement;

            tmin = limitHighTemperature(tmin, limiterStart, limiterAmplitude);
            tmax = limitHighTemperature(tmax, limiterStart, limiterAmplitude);

            SmCityClimateReading reading;
            reading.tmin = tmin;
            reading.tmax = tmax;
            reading.tmoy = (tmin + tmax) / 2.0;
            reading.tminThreshold = minTriggered;
            reading.tmaxThreshold = maxTriggered;
            reading.month = month;
            reading.unit = unit;
            year.readings[month * 4 + unit] = reading;

            monthlyMinTotal += tmin;
            monthlyMaxTotal += tmax;
        }

        year.monthlyMeanTmin[month] = monthlyMinTotal / 4.0;
        year.monthlyMeanTmax[month] = monthlyMaxTotal / 4.0;
    }

    // Use an independent random stream so adding weather never changes the
    // validated Tmin/Tmax sequence or its save/load reproducibility.
    generateWeather(year, yearIndex);
    generatedYears.push_back(year);
}

void SmCityClimate::generateWeather(ClimateYear &year, std::size_t yearIndex)
{
    const std::array<WeatherProfile, 4> &profiles = weatherProfiles[activeCity];
    std::uint32_t seed = stableHash(activeCity);
    seed ^= static_cast<std::uint32_t>(yearIndex * 0x85ebca6bu);
    seed ^= 0x57454154u; // "WEAT": independent from the temperature random stream.
    std::mt19937 random(seed);
    std::uniform_real_distribution<double> chance(0.0, 1.0);
    std::uniform_real_distribution<double> amount(0.0, 1.0);
    std::uniform_int_distribution<int> persistence(2, 3);

    for (int month = 0; month < 12; ++month) {
        // Four seasonal regimes: winter, spring, summer, autumn.
        const int season = (month == 11 || month <= 1) ? 0
            : (month <= 4) ? 1
            : (month <= 7) ? 2 : 3;
        const WeatherProfile &profile = profiles[season];
        int remaining = 0;
        bool wetRegime = false;

        for (int unit = 0; unit < 4; ++unit) {
            if (remaining <= 0) {
                wetRegime = chance(random) < profile.wetProbability;
                remaining = persistence(random);
            }
            --remaining;

            SmCityClimateReading &reading = year.readings[month * 4 + unit];
            reading.weatherCode = 1; // cloudy without precipitation by default
            reading.precipitationMm = 0.0;
            reading.sunshineHours = 0.0;

            if (!wetRegime) {
                // A dry spell can still be overcast; the city's seasonal profile
                // determines how often clear skies dominate dry periods.
                reading.weatherCode = chance(random) < profile.sunnyWhenDry ? 0 : 1;
            } else {
                // Snow is possible when the Tmin/Tmax interval crosses
                // 0°C (or remains entirely below freezing), not simply because
                // the daytime maximum is "near cold".
                const bool coldEnoughForSnow =
                    reading.tmin <= 0.0 &&
                    (reading.tmax >= 0.0 || reading.tmax < 0.0);
                if (coldEnoughForSnow && chance(random) < profile.snowWhenCold) {
                    reading.weatherCode = 6;
                } else {
                    double stormChance = profile.stormWhenWet;
                    // Hot, unstable air makes storms more likely, while Brest's
                    // deliberately tiny profile keeps thunderstorms uncommon.
                    if (reading.tmax >= 30.0) stormChance = std::min(0.70, stormChance + 0.18);
                    else if (reading.tmax >= 25.0) stormChance = std::min(0.55, stormChance + 0.08);

                    if (reading.tmax >= 25.0 && chance(random) < stormChance) {
                        reading.weatherCode = 5;
                    } else if (reading.tmin >= 2.0 && reading.tmax <= 19.0 &&
                               chance(random) < profile.drizzleWhenWet) {
                        reading.weatherCode = 3;
                    } else {
                        reading.weatherCode = chance(random) < 0.48 ? 2 : 4;
                    }
                }
            }

            // Amounts are totals over one 7.6-day climate unit, not daily rates.
            // Values are deliberately bounded by category and generated from a
            // separate stream; they are simulated gameplay values, not observations.
            const double r = amount(random);
            switch (reading.weatherCode) {
                case 0: // Grand soleil
                    reading.sunshineHours = 42.0 + r * 38.0;
                    break;
                case 1: // Couvert sans pluie
                    reading.sunshineHours = 3.0 + r * 19.0;
                    break;
                case 2: // Variable soleil / nuages / averses
                    reading.precipitationMm = 1.0 + r * 9.0;
                    reading.sunshineHours = 14.0 + amount(random) * 28.0;
                    break;
                case 3: // Pluie fine / crachin
                    reading.precipitationMm = 0.5 + r * 4.5;
                    reading.sunshineHours = 2.0 + amount(random) * 13.0;
                    break;
                case 4: // Couvert et averses
                    reading.precipitationMm = 4.0 + r * 18.0;
                    reading.sunshineHours = amount(random) * 12.0;
                    break;
                case 5: // Orage
                    reading.precipitationMm = 6.0 + r * 30.0;
                    reading.sunshineHours = amount(random) * 10.0;
                    break;
                case 6: // Temps neigeux (water equivalent)
                    reading.precipitationMm = 1.0 + r * 12.0;
                    reading.sunshineHours = amount(random) * 12.0;
                    break;
                default:
                    reading.weatherCode = 1;
                    reading.precipitationMm = 0.0;
                    reading.sunshineHours = 8.0;
                    break;
            }
        }
    }
}

const SmCityClimateReading *SmCityClimate::readingAt(long long cityTime)
{
    if (!ready) return NULL;

    long long elapsed = cityTime - climateEpoch;
    if (elapsed < 0) elapsed = 0;
    const std::size_t yearIndex = static_cast<std::size_t>(elapsed / 48);
    const int unitIndex = static_cast<int>(elapsed % 48);

    // The full climate year is generated deterministically on first access.
    // Looking ahead therefore reuses the same readings that gameplay will later consume.
    while (generatedYears.size() <= yearIndex) {
        generateYear(generatedYears.size());
    }

    return &generatedYears[yearIndex].readings[unitIndex];
}

bool SmCityClimate::update(long long cityTime)
{
    const SmCityClimateReading *reading = readingAt(cityTime);
    if (reading == NULL) return false;
    currentReading = *reading;
    return true;
}

bool SmCityClimate::isReady() const
{
    return ready;
}

long long SmCityClimate::epochCityTime() const
{
    return climateEpoch;
}

const SmCityClimateReading &SmCityClimate::current() const
{
    return currentReading;
}


bool Micropolis::setZoneLocked(int x, int y, bool locked)
{
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return false;
    const unsigned int key = static_cast<unsigned int>(x * WORLD_H + y);
    if (locked) lockedZoneCenters.insert(key);
    else lockedZoneCenters.erase(key);
    return true;
}

bool Micropolis::isZoneLocked(int x, int y) const
{
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return false;
    return lockedZoneCenters.find(static_cast<unsigned int>(x * WORLD_H + y)) != lockedZoneCenters.end();
}

void Micropolis::clearZoneLocks()
{
    lockedZoneCenters.clear();
}

bool Micropolis::setAnnualCityClimateIndex(int yearIndex, double index)
{
    if (!climateReady || yearIndex < 0) return false;
    if (!climateModel.setAnnualCityClimateIndex(static_cast<std::size_t>(yearIndex), index)) return false;
    updateClimateForTime();
    return true;
}

void Micropolis::initializeClimate(long long savedEpoch)
{
    climateReady = climateModel.initialize(cityName, cityTime, savedEpoch);
    if (!climateReady) {
        climateEpochCityTime = cityTime;
        temperatureMin = 0.0;
        temperatureMax = 0.0;
        temperatureMean = 0.0;
        return;
    }

    climateEpochCityTime = static_cast<Quad>(climateModel.epochCityTime());
    updateClimateForTime();
}

void Micropolis::updateClimateForTime()
{
    if (!climateReady || !climateModel.update(cityTime)) {
        return;
    }

    const SmCityClimateReading &reading = climateModel.current();
    temperatureMin = reading.tmin;
    temperatureMax = reading.tmax;
    temperatureMean = reading.tmoy;

    if (callback != NULL) {
        callback->updateClimate(this, callbackVal,
                                temperatureMin, temperatureMax,
                                temperatureMean, reading.month,
                                reading.unit);
    }
}

emscripten::val Micropolis::getClimateForecast(int maxUnits)
{
#if defined(__EMSCRIPTEN__)
    emscripten::val forecast = emscripten::val::array();
    if (!climateReady || maxUnits <= 0) return forecast;

    long long elapsed = static_cast<long long>(cityTime) -
                        static_cast<long long>(climateEpochCityTime);
    if (elapsed < 0) elapsed = 0;
    const int unitInYear = static_cast<int>(elapsed % 48);
    // Do not invent next year's city-wide warming shift: that annual map index
    // is only finalized after the current year has been played.
    const int available = 48 - unitInYear;
    const int count = std::min(maxUnits, available);

    for (int offset = 0; offset < count; ++offset) {
        const long long forecastTime = static_cast<long long>(cityTime) + offset;
        const SmCityClimateReading *reading = climateModel.readingAt(forecastTime);
        if (reading == NULL) break;

        emscripten::val item = emscripten::val::object();
        item.set("cityTime", static_cast<double>(forecastTime));
        item.set("tmin", reading->tmin);
        item.set("tmax", reading->tmax);
        item.set("tmoy", reading->tmoy);
        item.set("month", reading->month);
        item.set("unit", reading->unit);
        item.set("weatherCode", reading->weatherCode);
        item.set("precipitationMm", reading->precipitationMm);
        item.set("sunshineHours", reading->sunshineHours);
        forecast.call<void>("push", item);
    }

    return forecast;
#else
    // Native tests exercise the climate model itself; only WASM needs the JS
    // forecast payload consumed by the browser publication layer.
    (void)maxUnits;
    return emscripten::val();
#endif
}
