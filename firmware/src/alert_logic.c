#include "alert_logic.h"

#include <math.h>
#include <string.h>

MonitorAlertConfig monitor_alert_default_config(void)
{
    return (MonitorAlertConfig){
        .temperature_min_c = 18.0f,
        .temperature_max_c = 30.0f,
        .humidity_min_pct = 30.0f,
        .humidity_max_pct = 70.0f,
        .cry_threshold = 0.35f,
        .environment_confirm_samples = 3U,
        .environment_clear_samples = 3U,
        .cry_confirm_windows = 2U,
    };
}

static uint8_t saturating_increment(uint8_t value)
{
    return value == UINT8_MAX ? value : (uint8_t)(value + 1U);
}

static void update_environment(bool valid, float value, float low, float high,
                               uint8_t confirm, uint8_t clear,
                               uint8_t *outside_count, uint8_t *inside_count,
                               bool *latched)
{
    if (!valid || !isfinite(value)) {
        *outside_count = 0U;
        *inside_count = 0U;
        return;
    }
    if (value < low || value > high) {
        *outside_count = saturating_increment(*outside_count);
        *inside_count = 0U;
        if (*outside_count >= confirm) *latched = true;
    } else {
        *inside_count = saturating_increment(*inside_count);
        *outside_count = 0U;
        if (*inside_count >= clear) *latched = false;
    }
}

MonitorAlertKind monitor_alert_update(MonitorAlertState *state,
                                      const MonitorAlertConfig *config,
                                      const MonitorAlertInput *input)
{
    if (state == NULL || config == NULL || input == NULL ||
        config->environment_confirm_samples == 0U ||
        config->environment_clear_samples == 0U || config->cry_confirm_windows == 0U) {
        return MONITOR_ALERT_INFERENCE_UNAVAILABLE;
    }
    update_environment(input->temperature_valid, input->temperature_c,
                       config->temperature_min_c, config->temperature_max_c,
                       config->environment_confirm_samples, config->environment_clear_samples,
                       &state->temperature_out_count, &state->temperature_in_count,
                       &state->temperature_latched);
    update_environment(input->humidity_valid, input->humidity_pct,
                       config->humidity_min_pct, config->humidity_max_pct,
                       config->environment_confirm_samples, config->environment_clear_samples,
                       &state->humidity_out_count, &state->humidity_in_count,
                       &state->humidity_latched);

    if (input->inference_valid && isfinite(input->cry_score) && input->cry_score >= config->cry_threshold) {
        state->cry_positive_streak = saturating_increment(state->cry_positive_streak);
        if (state->cry_positive_streak >= config->cry_confirm_windows) state->cry_latched = true;
    } else if (input->inference_valid) {
        state->cry_positive_streak = 0U;
        state->cry_latched = false;
    }

    if (input->sensor_fault) state->active_kind = MONITOR_ALERT_SENSOR_FAULT;
    else if (input->network_fault) state->active_kind = MONITOR_ALERT_NETWORK_FAULT;
    else if (!input->inference_valid) state->active_kind = MONITOR_ALERT_INFERENCE_UNAVAILABLE;
    else if (state->cry_latched) state->active_kind = MONITOR_ALERT_CRY;
    else if (state->temperature_latched) state->active_kind = MONITOR_ALERT_TEMPERATURE;
    else if (state->humidity_latched) state->active_kind = MONITOR_ALERT_HUMIDITY;
    else state->active_kind = MONITOR_ALERT_NONE;
    return state->active_kind;
}
