#ifndef SMART_BABY_APP_TASKS_H
#define SMART_BABY_APP_TASKS_H

#include "FreeRTOS.h"
#include "task.h"

#include <stdint.h>

typedef struct {
    uint32_t sensor_heartbeats;
    uint32_t audio_windows_dropped;
    uint32_t telemetry_posts;
    uint32_t hardware_unverified;
    uint32_t minimum_free_heap;
    uint32_t stack_high_water_words[5];
} MonitorDiagnostics;

extern volatile MonitorDiagnostics g_monitor_diagnostics;

void monitor_tasks_start(void);
void monitor_assert_failed(const char *file, unsigned line);

#endif
