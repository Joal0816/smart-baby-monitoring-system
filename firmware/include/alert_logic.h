#ifndef SMART_BABY_ALERT_LOGIC_H
#define SMART_BABY_ALERT_LOGIC_H

#include <stdbool.h>
#include <stdint.h>

typedef enum {
    MONITOR_ALERT_NONE = 0,
    MONITOR_ALERT_CRY = 1,
    MONITOR_ALERT_TEMPERATURE = 2,
    MONITOR_ALERT_HUMIDITY = 3,
    MONITOR_ALERT_SENSOR_FAULT = 4,
    MONITOR_ALERT_NETWORK_FAULT = 5,
    MONITOR_ALERT_INFERENCE_UNAVAILABLE = 6
} MonitorAlertKind;

typedef struct {
    float temperature_c;
    float humidity_pct;
    float cry_score;
    bool temperature_valid;
    bool humidity_valid;
    bool inference_valid;
    bool sensor_fault;
    bool network_fault;
} MonitorAlertInput;

typedef struct {
    MonitorAlertKind active_kind;
    uint8_t temperature_out_count;
    uint8_t humidity_out_count;
    uint8_t temperature_in_count;
    uint8_t humidity_in_count;
    uint8_t cry_positive_streak;
    bool temperature_latched;
    bool humidity_latched;
    bool cry_latched;
} MonitorAlertState;

typedef struct {
    float temperature_min_c;
    float temperature_max_c;
    float humidity_min_pct;
    float humidity_max_pct;
    float cry_threshold;
    uint8_t environment_confirm_samples;
    uint8_t environment_clear_samples;
    uint8_t cry_confirm_windows;
} MonitorAlertConfig;

MonitorAlertConfig monitor_alert_default_config(void);
MonitorAlertKind monitor_alert_update(MonitorAlertState *state,
                                      const MonitorAlertConfig *config,
                                      const MonitorAlertInput *input);

#endif
