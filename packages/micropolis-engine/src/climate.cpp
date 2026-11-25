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
    tileClimateIndices.clear();
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
        std::ifstream file("climate/climat_indices_objets_smcity.csv");
        if (!file.is_open()) return false;
        std::string line;
        std::getline(file, line); // header
        while (std::getline(file, line)) {
            const std::vector<std::string> f = splitCsv(line);
            if (f.size() < 4) continue;
            SmCityTileClimateIndex entry;
            entry.firstTile = static_cast<int>(parseNumber(f[0], -1.0));
            entry.lastTile = static_cast<int>(parseNumber(f[1], -1.0));
            entry.index = parseNumber(f[2], -1.0);
            entry.weight = parseNumber(f[3], -1.0);
            if (entry.firstTile < 0 || entry.lastTile < entry.firstTile ||
                entry.lastTile > 1023 || entry.index < 0.0 || entry.index > 255.0 ||
                entry.weight < 0.0) {
                return false;
            }
            tileClimateIndices.push_back(entry);
        }
        if (tileClimateIndices.empty()) return false;
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
                               long long savedEpoch,
                               double savedCurrentYearWarming,
                               const std::vector<double> &savedWarmingHistory)
{
    ready = false;
    generatedYears.clear();
    cityWarmingByYear.clear();
    for (std::size_t i = 0; i < savedWarmingHistory.size(); ++i) {
        cityWarmingByYear[i] = savedWarmingHistory[i];
    }
    activeCity = normalizeCity(cityName);
    if (!loadTables()) return false;
    if (references.find(activeCity) == references.end()) return false;
    if (cityWarmingCoefficient.find(activeCity) == cityWarmingCoefficient.end()) return false;
    if (anomalyAMin > anomalyAMax || anomalyBMin > anomalyBMax) return false;
    if (anomalyPersistenceMin < 1 || anomalyPersistenceMax < anomalyPersistenceMin) return false;
    if (tminIncrement < 0.0 || tmaxIncrement < 0.0 || limiterAmplitude <= 0.0) return false;

    climateEpoch = (savedEpoch >= 0) ? savedEpoch : cityTime;
    long long elapsed = cityTime - climateEpoch;
    if (elapsed < 0) elapsed = 0;
    cityWarmingByYear[static_cast<std::size_t>(elapsed / 48)] = savedCurrentYearWarming;
    ready = true;
    return update(cityTime);
}

void SmCityClimate::generateYear(std::size_t yearIndex)
{
    ClimateYear year;
    const std::array<MonthlyReference, 12> &historical = references[activeCity];
    double warming = cityWarmingCoefficient[activeCity] * baseWarming;
    std::map<std::size_t, double>::const_iterator cityShift =
        cityWarmingByYear.find(yearIndex);
    if (cityShift != cityWarmingByYear.end()) {
        warming += cityShift->second;
    }
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

    generatedYears.push_back(year);
}

bool SmCityClimate::update(long long cityTime)
{
    if (!ready) return false;

    long long elapsed = cityTime - climateEpoch;
    if (elapsed < 0) elapsed = 0;
    const std::size_t yearIndex = static_cast<std::size_t>(elapsed / 48);
    const int unitIndex = static_cast<int>(elapsed % 48);

    while (generatedYears.size() <= yearIndex) {
        generateYear(generatedYears.size());
    }

    currentReading = generatedYears[yearIndex].readings[unitIndex];
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

void SmCityClimate::setCityWarmingForYear(std::size_t yearIndex,
                                               double contribution)
{
    if (contribution < -1.0) contribution = -1.0;
    if (contribution > 1.0) contribution = 1.0;
    cityWarmingByYear[yearIndex] = contribution;
}

double SmCityClimate::tileClimateIndex(int tile) const
{
    for (std::size_t i = 0; i < tileClimateIndices.size(); ++i) {
        const SmCityTileClimateIndex &entry = tileClimateIndices[i];
        if (tile >= entry.firstTile && tile <= entry.lastTile) {
            return entry.index;
        }
    }
    return -1.0;
}

double SmCityClimate::tileClimateWeight(int tile) const
{
    for (std::size_t i = 0; i < tileClimateIndices.size(); ++i) {
        const SmCityTileClimateIndex &entry = tileClimateIndices[i];
        if (tile >= entry.firstTile && tile <= entry.lastTile) {
            return entry.weight;
        }
    }
    return 0.0;
}

std::vector<double> SmCityClimate::cityWarmingHistory() const
{
    if (cityWarmingByYear.empty()) return std::vector<double>();
    const std::size_t lastYear = cityWarmingByYear.rbegin()->first;
    std::vector<double> history(lastYear + 1, 0.0);
    for (std::map<std::size_t, double>::const_iterator it = cityWarmingByYear.begin();
         it != cityWarmingByYear.end(); ++it) {
        history[it->first] = it->second;
    }
    return history;
}


void Micropolis::initializeClimate(long long savedEpoch)
{
    climateReady = climateModel.initialize(
        cityName, cityTime, savedEpoch, climateCurrentYearWarming,
        climateSavedWarmingHistory);
    if (!climateReady) {
        climateEpochCityTime = cityTime;
        climateIndex = 127.5;
        temperatureMin = 0.0;
        temperatureMax = 0.0;
        temperatureMean = 0.0;
        return;
    }

    climateEpochCityTime = static_cast<Quad>(climateModel.epochCityTime());
    // The tile table is loaded by climateModel.initialize(), so only now can
    // the live map be classified and its current index calculated.
    climateIndex = computeCityClimateIndex();
    updateClimateForTime();
}

double Micropolis::computeCityClimateIndex()
{
    double weightedTotal = 0.0;
    double totalWeight = 0.0;

    for (int x = 0; x < WORLD_W; ++x) {
        for (int y = 0; y < WORLD_H; ++y) {
            const int tile = map[x][y] & LOMASK;
            const double weight = climateModel.tileClimateWeight(tile);
            if (weight <= 0.0) continue;
            const double index = climateModel.tileClimateIndex(tile);
            if (index < 0.0) continue;
            weightedTotal += index * weight;
            totalWeight += weight;
        }
    }

    // A map with no classified objects is neutral: it has no warming effect.
    climateIndex = totalWeight > 0.0 ? weightedTotal / totalWeight : 127.5;
    return climateIndex;
}

void Micropolis::updateClimateForTime()
{
    if (!climateReady) return;

    long long elapsed = cityTime - climateEpochCityTime;
    if (elapsed < 0) elapsed = 0;
    const long long monthIndex = elapsed / 4;

    if (monthIndex != climateLastSampleMonth) {
        // At the start of a new year, convert the previous twelve monthly
        // map averages into the warming contribution for the year ahead.
        if (monthIndex > 0 && (monthIndex % 12) == 0) {
            if (climateMonthlySamples > 0) {
                const double annualIndex =
                    climateAnnualIndexSum / static_cast<double>(climateMonthlySamples);
                climateCurrentYearWarming = (2.0 * annualIndex / 255.0) - 1.0;
                climateModel.setCityWarmingForYear(
                    static_cast<std::size_t>(monthIndex / 12),
                    climateCurrentYearWarming);
            }
            climateAnnualIndexSum = 0.0;
            climateMonthlySamples = 0;
        }

        climateIndex = computeCityClimateIndex();
        climateAnnualIndexSum += climateIndex;
        ++climateMonthlySamples;
        climateLastSampleMonth = monthIndex;
    }

    if (!climateModel.update(cityTime)) return;

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
