#ifndef SM_CITY_CLIMATE_H
#define SM_CITY_CLIMATE_H

#include <array>
#include <cstdint>
#include <map>
#include <string>
#include <vector>

struct SmCityClimateReading {
    double tmin;
    double tmax;
    double tmoy;
    bool tminThreshold;
    bool tmaxThreshold;
    int month;
    int unit;
};

class SmCityClimate {
public:
    SmCityClimate();

    // savedEpoch < 0 starts the climate clock at cityTime.
    bool initialize(const std::string &cityName, long long cityTime,
                    long long savedEpoch = -1);
    bool update(long long cityTime);

    bool isReady() const;
    long long epochCityTime() const;
    const SmCityClimateReading &current() const;

private:
    struct MonthlyReference {
        double tmin;
        double tmax;
    };

    struct ClimateYear {
        std::array<SmCityClimateReading, 48> readings;
        std::array<double, 12> monthlyMeanTmin;
        std::array<double, 12> monthlyMeanTmax;
    };

    std::map<std::string, std::array<MonthlyReference, 12> > references;
    std::map<std::string, double> cityWarming;
    std::vector<ClimateYear> generatedYears;

    std::string activeCity;
    double anomalyAMin;
    double anomalyAMax;
    double anomalyBMin;
    double anomalyBMax;
    int anomalyPersistenceMin;
    int anomalyPersistenceMax;
    double tminThreshold;
    double tmaxThreshold;
    double tminIncrement;
    double tmaxIncrement;
    double limiterStart;
    double limiterAmplitude;
    long long climateEpoch;
    bool ready;
    SmCityClimateReading currentReading;

    bool loadTables();
    void generateYear(std::size_t yearIndex);
    static std::string normalizeCity(const std::string &name);
    static std::uint32_t stableHash(const std::string &value);
    static double limitHighTemperature(double value, double start,
                                       double amplitude);
};

#endif
