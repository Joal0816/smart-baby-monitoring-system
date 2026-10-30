#include "stm32f4xx_hal.h"

static TIM_HandleTypeDef monitor_hal_timer;

HAL_StatusTypeDef HAL_InitTick(uint32_t tick_priority)
{
    __HAL_RCC_TIM6_CLK_ENABLE();
    const uint32_t timer_clock = HAL_RCC_GetPCLK1Freq();
    if (timer_clock < 1000000U || timer_clock % 1000000U != 0U) return HAL_ERROR;

    monitor_hal_timer.Instance = TIM6;
    monitor_hal_timer.Init.Prescaler = (timer_clock / 1000000U) - 1U;
    monitor_hal_timer.Init.CounterMode = TIM_COUNTERMODE_UP;
    monitor_hal_timer.Init.Period = 999U;
    monitor_hal_timer.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;
    if (HAL_TIM_Base_Init(&monitor_hal_timer) != HAL_OK) return HAL_ERROR;
    HAL_NVIC_SetPriority(TIM6_DAC_IRQn, tick_priority, 0U);
    HAL_NVIC_EnableIRQ(TIM6_DAC_IRQn);
    return HAL_TIM_Base_Start_IT(&monitor_hal_timer);
}

void HAL_SuspendTick(void)
{
    __HAL_TIM_DISABLE_IT(&monitor_hal_timer, TIM_IT_UPDATE);
}

void HAL_ResumeTick(void)
{
    __HAL_TIM_ENABLE_IT(&monitor_hal_timer, TIM_IT_UPDATE);
}

void TIM6_DAC_IRQHandler(void)
{
    HAL_TIM_IRQHandler(&monitor_hal_timer);
}

void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *timer)
{
    if (timer->Instance == TIM6) HAL_IncTick();
}
