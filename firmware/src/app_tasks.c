#include "app_tasks.h"
#include "alert_logic.h"
#include "queue.h"

#include <stddef.h>

typedef struct {
    uint32_t sequence;
    TickType_t captured_tick;
    uint8_t sensor_data_available;
} SensorHeartbeat;

static QueueHandle_t sensor_queue;
static TaskHandle_t task_handles[5];
volatile MonitorDiagnostics g_monitor_diagnostics;

enum { TASK_SENSOR = 0, TASK_AUDIO, TASK_NETWORK, TASK_LOCAL_UI, TASK_HEALTH };

void monitor_assert_failed(const char *file, unsigned line)
{
    (void)file;
    (void)line;
    __disable_irq();
    for (;;) { __NOP(); }
}

static void SensorTask(void *argument)
{
    (void)argument;
    TickType_t wake_time = xTaskGetTickCount();
    uint32_t sequence = 0U;
    for (;;) {
        const SensorHeartbeat heartbeat = {
            .sequence = sequence++,
            .captured_tick = xTaskGetTickCount(),
            .sensor_data_available = 0U,
        };
        /* Latest-value mailbox only; no fake sensor measurements are emitted. */
        (void)xQueueOverwrite(sensor_queue, &heartbeat);
        g_monitor_diagnostics.sensor_heartbeats++;
        g_monitor_diagnostics.hardware_unverified = 1U;
        vTaskDelayUntil(&wake_time, pdMS_TO_TICKS(1000U));
    }
}

static void AudioTask(void *argument)
{
    (void)argument;
    for (;;) {
        /* ADC/DMA and local activity gating start after microphone and pin verification. */
        vTaskDelay(pdMS_TO_TICKS(250U));
    }
}

static void NetworkTask(void *argument)
{
    (void)argument;
    for (;;) {
        /* No HTTP/TLS packets are sent until the Wi-Fi module and TLS path are verified. */
        vTaskDelay(pdMS_TO_TICKS(5000U));
    }
}

static void LocalUiTask(void *argument)
{
    (void)argument;
    for (;;) {
        /* Display, LEDs, buzzer, and controls remain disabled until board mapping is verified. */
        vTaskDelay(pdMS_TO_TICKS(100U));
    }
}

static void HealthTask(void *argument)
{
    (void)argument;
    for (;;) {
        g_monitor_diagnostics.minimum_free_heap = xPortGetMinimumEverFreeHeapSize();
        for (size_t index = 0U; index < 5U; ++index) {
            if (task_handles[index] != NULL) {
                g_monitor_diagnostics.stack_high_water_words[index] =
                    uxTaskGetStackHighWaterMark(task_handles[index]);
            }
        }
        vTaskDelay(pdMS_TO_TICKS(1000U));
    }
}

void monitor_tasks_start(void)
{
    sensor_queue = xQueueCreate(1U, sizeof(SensorHeartbeat));
    configASSERT(sensor_queue != NULL);
    vQueueAddToRegistry(sensor_queue, "sensor-latest");
    configASSERT(xTaskCreate(SensorTask, "Sensors", 256U, NULL, 4U,
                             &task_handles[TASK_SENSOR]) == pdPASS);
    configASSERT(xTaskCreate(AudioTask, "Audio", 384U, NULL, 5U,
                             &task_handles[TASK_AUDIO]) == pdPASS);
    configASSERT(xTaskCreate(NetworkTask, "Network", 512U, NULL, 2U,
                             &task_handles[TASK_NETWORK]) == pdPASS);
    configASSERT(xTaskCreate(LocalUiTask, "LocalUI", 256U, NULL, 3U,
                             &task_handles[TASK_LOCAL_UI]) == pdPASS);
    configASSERT(xTaskCreate(HealthTask, "Health", 256U, NULL, 1U,
                             &task_handles[TASK_HEALTH]) == pdPASS);
    vTaskStartScheduler();
    monitor_assert_failed(__FILE__, __LINE__);
}
