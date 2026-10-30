#include "stm32f4xx_hal.h"
#include "app_tasks.h"

static void clock_init_hsi(void)
{
    RCC_OscInitTypeDef oscillator = {0};
    RCC_ClkInitTypeDef clocks = {0};
    oscillator.OscillatorType = RCC_OSCILLATORTYPE_HSI;
    oscillator.HSIState = RCC_HSI_ON;
    oscillator.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
    oscillator.PLL.PLLState = RCC_PLL_NONE;
    configASSERT(HAL_RCC_OscConfig(&oscillator) == HAL_OK);
    clocks.ClockType = RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_HCLK |
                       RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;
    clocks.SYSCLKSource = RCC_SYSCLKSOURCE_HSI;
    clocks.AHBCLKDivider = RCC_SYSCLK_DIV1;
    clocks.APB1CLKDivider = RCC_HCLK_DIV1;
    clocks.APB2CLKDivider = RCC_HCLK_DIV1;
    configASSERT(HAL_RCC_ClockConfig(&clocks, FLASH_LATENCY_0) == HAL_OK);
    SystemCoreClockUpdate();
    configASSERT(SystemCoreClock == 16000000U);
}

int main(void)
{
    configASSERT(HAL_Init() == HAL_OK);
    clock_init_hsi();
    monitor_tasks_start();
    return 0;
}
